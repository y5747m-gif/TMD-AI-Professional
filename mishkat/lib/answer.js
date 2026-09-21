"use strict";

/**
 * mishkat/lib/answer.js
 * ---------------------------------------------------------------
 * منسّق الإجابة:
 *   1) يبحث في موقع إسلام ويب (فتاوى + استشارات + مقالات).
 *   2) يرتّب النتائج (وبالذكاء الاصطناعي إن توفّر مفتاح).
 *   3) يجلب نصّ الجواب الكامل من المصدر.
 *   4) يضيف روابط الفيديوهات المرتبطة بالسؤال.
 *   5) يبني الرد: منقولًا بأمانة (أو مُصاغًا عند تفعيل المحرك الذكي).
 * ---------------------------------------------------------------
 */

const config = require("./config");
const islamweb = require("./islamweb");
const videosLib = require("./videos");
const ai = require("./ai");
const rank = require("./rank");

const MODE_ALIASES = {
  strict: "sources",
  exact: "sources",
  sources: "sources",
  raw: "sources",
  balanced: "composed",
  composed: "composed",
  organized: "composed",
  open: "composed"
};

function normalizeMode(mode) {
  const key = String(mode || config.APP.defaultMode || "composed").toLowerCase();
  return MODE_ALIASES[key] || "composed";
}

/* ==============================================================
 *  البحث فقط (يُستخدم في /api/search)
 * ============================================================== */

/**
 * @returns {Promise<{sources:Array, videos:Array, notes:Array, errors:Array, via:string}>}
 */
async function lookup(question, opts = {}) {
  const notes = [];
  const errors = [];

  const videoResult = videosLib.search(question, { limit: opts.videosLimit || config.VIDEOS.topK });
  if (!videoResult.hasCatalog) {
    notes.push(
      "لائحة الفيديوهات فارغة: أضِف روابط الفيديوهات (العنوان + الرابط) من لوحة الإدارة أو بالأمر: npm run video:add"
    );
  }

  let sources = [];
  let via = "none";
  let islamwebEnabled = config.ISLAMWEB.enabled;

  if (islamwebEnabled) {
    const found = await islamweb.search(question, {
      limit: opts.limit || config.ISLAMWEB.topK,
      queries: opts.queries,
      kinds: opts.kinds
    });
    sources = found.items;
    via = found.via;
    for (const err of found.errors) {
      errors.push(err);
    }
    if (!sources.length && found.errors.length) {
      notes.push(
        "تعذّر الوصول إلى موقع إسلام ويب من هذا الخادم الآن، فلم يُجلب ردّ من الموقع. تحقّق من الاتصال أو جرّب لاحقًا."
      );
    }
  } else {
    notes.push("موصّل إسلام ويب معطّل في إعدادات الخادم (ISLAMWEB_ENABLED=false).");
  }

  /* ترتيب ذكي عند توفّر مفتاح */
  if (islamwebEnabled && sources.length >= 3 && opts.rerank !== false) {
    const ranked = await ai.rankCandidates({ question, candidates: sources });
    if (ranked.used) {
      const byId = new Map(sources.map((s) => [`${s.kind}:${s.id}`, s]));
      const ordered = ranked.order.map((o) => byId.get(o.id)).filter(Boolean);
      const rest = sources.filter((s) => !ordered.includes(s));
      sources = [...ordered, ...rest].map((s, i) => ({ ...s, rank: i + 1 }));
    }
  }

  return { sources, videos: videoResult.videos, notes, errors, via, videoResult };
}

/* ==============================================================
 *  الإجابة الكاملة
 * ============================================================== */

/**
 * يجلب النصوص الكاملة لأعلى المرشّحين.
 */
async function fetchFullDocs(sources, { count = config.ISLAMWEB.fullDocs, signal } = {}) {
  const docs = [];
  const failures = [];
  const attempted = new Set();
  let index = 0;
  const maxAttempts = Math.min(sources.length, Math.max(count + 1, count));

  const pickNext = () => {
    while (index < sources.length && attempted.size < maxAttempts) {
      const candidate = sources[index++];
      const key = `${candidate.kind}:${candidate.id}`;
      if (attempted.has(key)) continue;
      attempted.add(key);
      return candidate;
    }
    return null;
  };

  const runners = [];
  for (let i = 0; i < count; i += 1) {
    const candidate = pickNext();
    if (!candidate) break;
    runners.push(
      islamweb
        .fetchDocument(candidate)
        .then((doc) => {
          docs.push(doc);
          return doc;
        })
        .catch((err) => {
          failures.push({ source: candidate, error: String(err.message || err) });
          return null;
        })
    );
  }

  if (runners.length) await Promise.all(runners);
  if (signal && signal.aborted) throw new Error("تم إلغاء الطلب");

  // إن فشل الأوّل، نجرّب التالي من القائمة
  if (!docs.length && sources.length > count) {
    const extra = pickNext();
    if (extra) {
      try {
        docs.push(await islamweb.fetchDocument(extra));
      } catch (err) {
        failures.push({ source: extra, error: String(err.message || err) });
      }
    }
  }

  docs.sort((a, b) => {
    const ai_ = sources.findIndex((s) => s.kind === a.kind && s.id === a.id);
    const bi = sources.findIndex((s) => s.kind === b.kind && s.id === b.id);
    return ai_ - bi;
  });

  return { docs, failures };
}

/**
 * يبني الإجابة الكاملة ويرسلها (بثًّا إن طُلب).
 * @returns {Promise<object>}
 */
async function answer({ question, mode, history = [], onToken, onMeta, signal, options = {} }) {
  const started = Date.now();
  const finalMode = normalizeMode(mode);
  const notes = [];

  const found = await lookup(question, {
    limit: options.limit,
    videosLimit: options.videosLimit,
    kinds: options.kinds,
    queries: options.queries,
    rerank: options.rerank
  });
  notes.push(...found.notes);

  let docs = [];
  let failures = [];

  if (found.sources.length) {
    const full = await fetchFullDocs(found.sources, {
      count: Math.max(0, Number(options.fullDocs != null ? options.fullDocs : config.ISLAMWEB.fullDocs)),
      signal
    });
    docs = full.docs;
    failures = full.failures;
  }

  const partial = [];
  if (!docs.length && found.sources.length) {
    // تعذّر جلب النص الكامل: نعرض المقتطف المتاح مع الرابط
    for (const source of found.sources.slice(0, 3)) {
      partial.push({
        kind: source.kind,
        kindLabel: islamweb.kindMeta(source.kind).label,
        id: source.id,
        number: source.id,
        title: source.title,
        url: source.url,
        question: "",
        answer: source.snippet || "",
        date: "",
        answerer: "",
        partial: true
      });
    }
    docs = partial;
    notes.push(
      "تعذّر جلب النصّ الكامل لبعض الصفحات من إسلام ويب، فالمعروض مقتطفٌ من نتائج البحث — افتح الرابط للمطالعة الكاملة."
    );
  }

  const sources = found.sources.map((s) => {
    const doc = docs.find((d) => d.kind === s.kind && d.id === s.id);
    return {
      kind: s.kind,
      kindLabel: islamweb.kindMeta(s.kind).label,
      id: s.id,
      number: (doc && doc.number) || s.id,
      title: (doc && doc.title) || s.title,
      url: (doc && doc.url) || s.url,
      snippet: s.snippet,
      score: s.score,
      date: (doc && doc.date) || "",
      answerer: (doc && doc.answerer) || "",
      fetched: !!(doc && doc.answer && !doc.partial),
      via: doc ? doc.via || "" : ""
    };
  });

  if (failures.length) {
    notes.push(
      `لم يُجلب نصّ ${failures.length} مصدر من إسلام ويب (${String(failures[0].error).slice(0, 80)}).`
    );
  }

  if (onMeta) {
    onMeta({
      question,
      mode: finalMode,
      sources,
      videos: found.videos,
      notes,
      provider: ai.providerInfo(),
      islamweb: { enabled: config.ISLAMWEB.enabled, via: found.via }
    });
  }

  const composed = await ai.composeAnswer({
    question,
    docs,
    videos: found.videos,
    mode: finalMode,
    history,
    onToken,
    signal
  });

  return {
    question,
    mode: finalMode,
    answer: composed.answer,
    provider: composed.provider,
    usedFallback: !!composed.usedFallback,
    error: composed.error || "",
    sources,
    videos: found.videos,
    notes,
    islamweb: { enabled: config.ISLAMWEB.enabled, via: found.via, errors: found.errors },
    timing: { ms: Date.now() - started },
    providerInfo: ai.providerInfo()
  };
}

/** بحث سريع بلا صياغة (للواجهة ولواجهة API) */
async function search(question, opts = {}) {
  const found = await lookup(question, opts);
  return {
    question,
    sources: found.sources,
    videos: found.videos,
    notes: found.notes,
    errors: found.errors,
    keywords: rank.shortKeywords(question, 8)
  };
}

/** حالة الجاهزية */
function readiness() {
  const videoStats = videosLib.stats();
  const provider = ai.providerInfo();
  return {
    islamweb: {
      enabled: config.ISLAMWEB.enabled,
      mode: config.ISLAMWEB.mode,
      base: config.ISLAMWEB.base,
      readerFallback: config.ISLAMWEB.useReaderFallback,
      cache: islamweb.cacheStats()
    },
    videos: videoStats,
    ai: provider,
    ready: config.ISLAMWEB.enabled
  };
}

module.exports = { answer, search, lookup, fetchFullDocs, readiness, normalizeMode };
