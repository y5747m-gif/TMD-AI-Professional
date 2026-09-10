"use strict";

/**
 * mishkat/lib/retrieve.js
 * ---------------------------------------------------------------
 * محرك الاسترجاع الهجين:
 *   1) بحث FTS5 بمجموعات كلمات موسّعة (مرادفات + سوابق/لواحق).
 *   2) بحث احتياطي بـ LIKE عند ضعف النتائج (لمعالجة الأخطاء الإملائية).
 *   3) إعادة ترتيب ذكي: تغطية كلمات السؤال + صلة الفئة + مطابقة العنوان.
 *   4) دمج المقاطع المتجاورة زمنيًا من نفس الفيديو في مقتطف واحد.
 * ---------------------------------------------------------------
 */

const config = require("./config");
const {
  normalizeArabic,
  contentTokens,
  lightStem,
  stripPrefix,
  expandQuery,
  classifyQuery,
  questionIntent,
  keywordsOf
} = require("./arabic");
const { videoLink, formatTime } = require("./db");
const { excerpt } = require("./text");

/** رابط الفيديو: البيانات التجريبية تشير إلى القناة المصدر بدل رابط وهمي */
function linkFor(sourceKind, videoId, startMs) {
  if (sourceKind === "demo") return config.CHANNEL_URL;
  return videoLink(videoId, startMs);
}

/* ==============================================================
 *  أدوات مساعدة
 * ============================================================== */

function buildGroups(question, maxSynonyms) {
  return expandQuery(question, { maxSynonyms: maxSynonyms || 6 }).filter((g) => g.length);
}

function primaryTokens(question) {
  return contentTokens(question).map((t) => stripPrefix(t)).filter((t) => t.length >= 2);
}

/** نسبة تغطية كلمات السؤال داخل المقطع */
function coverageOf(text, tokens) {
  if (!tokens.length) return 0;
  const norm = normalizeArabic(text);
  const stemmedText = new Set(contentTokens(norm).map(lightStem));
  let hit = 0;
  for (const t of tokens) {
    if (norm.includes(t) || stemmedText.has(lightStem(t))) hit++;
  }
  return hit / tokens.length;
}

/* ==============================================================
 *  البحث الأساسي
 * ============================================================== */

/**
 * @param {object} store متجر البيانات
 * @param {string} question سؤال المستخدم
 * @param {{topK?:number, minScore?:number, extraBoost?:string[]}} opts
 */
function search(store, question, opts = {}) {
  const topK = Number(opts.topK || config.RETRIEVAL.topK);
  const candidates = Number(opts.candidates || config.RETRIEVAL.candidates);
  const maxPerVideo = Number(opts.maxPerVideo || config.RETRIEVAL.maxPerVideo);
  const minScore = Number(opts.minScore != null ? opts.minScore : config.RETRIEVAL.minScore);

  const classification = classifyQuery(question);
  const intent = questionIntent(question);
  const tokens = primaryTokens(question);
  const groups = buildGroups(question);

  if (!groups.length) {
    return {
      question,
      results: [],
      docs: [],
      classification,
      intent,
      keywords: [],
      coverage: 0,
      mode: "empty"
    };
  }

  // المحاولة 1: AND (دقة أعلى) — المحاولة 2: OR (استرجاع أوسع)
  let raw = store.searchSegments(groups, { limit: candidates, mode: "and" });
  let mode = "and";
  if (raw.length < Math.max(3, topK / 2)) {
    const broad = store.searchSegments(groups, { limit: candidates, mode: "or" });
    if (broad.length > raw.length) {
      raw = broad;
      mode = "or";
    }
  }

  // المحاولة 3: بحث LIKE — لإصلاح الأخطاء الإملائية واختلاف الرسم
  if (raw.length < 3) {
    const like = store.likeSearch(
      tokens.map((t) => t).concat(tokens.map(lightStem)),
      { limit: candidates }
    );
    const byId = new Map(raw.map((r) => [`${r.videoId}:${r.startMs}`, r]));
    for (const r of like) {
      const key = `${r.videoId}:${r.startMs}`;
      if (!byId.has(key)) byId.set(key, r);
    }
    raw = [...byId.values()];
    if (!raw.length) mode = "none";
  }

  if (!raw.length) {
    return {
      question,
      results: [],
      docs: [],
      classification,
      intent,
      keywords: keywordsOf(question, 6),
      coverage: 0,
      mode: "none"
    };
  }

  /* ---------- إعادة الترتيب ---------- */
  const ranks = raw.map((r) => Number(r.score || 0));
  const maxRank = Math.max(...ranks, 0.000001);
  const minRank = Math.min(...ranks);
  const span = maxRank - minRank || 1;

  const categoryTerms = (classification.all || []).flatMap((c) => c.hits || []).map(normalizeArabic);
  const boost = (opts.extraBoost || []).map(normalizeArabic);

  const scored = raw.map((r) => {
    const normRank = (Number(r.score || 0) - minRank) / span; // 0..1
    const cov = coverageOf(r.text, tokens);
    const titleCov = coverageOf(r.title || "", tokens);
    let catBonus = 0;
    const textNorm = normalizeArabic(r.text);
    for (const term of categoryTerms) if (term && textNorm.includes(term)) catBonus += 0.5;
    catBonus = Math.min(1, catBonus / Math.max(2, categoryTerms.length));
    let boostBonus = 0;
    for (const b of boost) if (b && textNorm.includes(b)) boostBonus = Math.min(1, boostBonus + 0.5);

    const final =
      0.45 * normRank + 0.35 * cov + 0.12 * titleCov + 0.05 * catBonus + 0.03 * boostBonus;

    return {
      ...r,
      normRank,
      coverage: cov,
      titleCoverage: titleCov,
      categoryBonus: catBonus,
      finalScore: final,
      link: linkFor(r.sourceKind, r.videoId, r.startMs)
    };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);

  /* ---------- الدمج الزمني داخل نفس الفيديو ---------- */
  const byVideo = new Map();
  for (const r of scored) {
    const list = byVideo.get(r.videoId) || [];
    list.push(r);
    byVideo.set(r.videoId, list);
  }

  const merged = [];
  for (const [videoId, list] of byVideo) {
    list.sort((a, b) => a.startMs - b.startMs);
    let current = null;
    for (const r of list) {
      if (current && r.startMs - current.endMs <= 8000 && current.text.length < 2000) {
        current.endMs = Math.max(current.endMs, r.endMs);
        current.text = `${current.text} ${r.text}`.replace(/\s+/g, " ").trim();
        current.finalScore = Math.max(current.finalScore, r.finalScore);
        current.coverage = Math.max(current.coverage, r.coverage);
        current.parts.push(r);
      } else {
        if (current) merged.push(current);
        current = { ...r, parts: [r] };
      }
    }
    if (current) merged.push(current);
  }

  merged.sort((a, b) => b.finalScore - a.finalScore);

  // حد أقصى لكل فيديو + حد أدنى للدرجة
  const perVideo = new Map();
  const results = [];
  for (const r of merged) {
    if (r.finalScore < minScore) continue;
    const count = perVideo.get(r.videoId) || 0;
    if (count >= maxPerVideo) continue;
    perVideo.set(r.videoId, count + 1);
    results.push({
      videoId: r.videoId,
      title: r.title,
      url: r.sourceKind === 'demo' ? config.CHANNEL_URL : r.url || videoLink(r.videoId, 0),
      link: r.link,
      startMs: r.startMs,
      endMs: r.endMs,
      time: formatTime(r.startMs),
      endTime: formatTime(r.endMs),
      text: r.text,
      excerpt: excerpt(r.text, 320),
      score: Math.round(r.finalScore * 1000) / 1000,
      coverage: Math.round(r.coverage * 100) / 100,
      publishedAt: r.publishedAt,
      sourceKind: r.sourceKind,
      segments: (r.parts || []).length
    });
    if (results.length >= topK) break;
  }

  /* ---------- المستندات المرجعية (إن وُجدت) ---------- */
  let docs = [];
  try {
    docs = store.searchDocs(groups, { limit: 5 }).map((d) => ({
      title: d.title,
      ref: d.ref,
      url: d.url,
      kind: d.kind,
      text: excerpt(d.text, 400),
      score: d.score
    }));
  } catch (_) {
    docs = [];
  }

  const coverage = results.length
    ? Math.round((results.slice(0, 4).reduce((a, r) => a + r.coverage, 0) / Math.min(4, results.length)) * 100) / 100
    : 0;

  return {
    question,
    results,
    docs,
    classification,
    intent,
    keywords: keywordsOf(question, 8),
    coverage,
    mode,
    searchedGroups: groups.length
  };
}

/* ==============================================================
 *  عرض زمني لفيديو (لعرض النص الكامل)
 * ============================================================== */

function getVideoTimeline(store, videoId) {
  const video = store.getVideo(videoId);
  if (!video) return null;
  const segments = store.getVideoSegments(videoId);
  return {
    video: {
      id: video.id,
      title: video.title,
      description: video.description,
      url: video.source_kind === 'demo' || video.sourceKind === 'demo' ? config.CHANNEL_URL : video.url || videoLink(video.id, 0),
      publishedAt: video.published_at || video.publishedAt,
      durationS: video.duration_s || video.durationS,
      views: video.views,
      thumbnail: video.thumbnail,
      sourceKind: video.source_kind || video.sourceKind,
      transcriptLang: video.transcript_lang || video.transcriptLang,
      chars: video.chars,
      fetchedAt: video.fetched_at || video.fetchedAt,
      error: video.error
    },
    segments: segments.map((s) => ({
      idx: s.idx,
      startMs: s.start_ms != null ? s.start_ms : s.startMs,
      endMs: s.end_ms != null ? s.end_ms : s.endMs,
      text: s.text,
      time: formatTime(s.start_ms != null ? s.start_ms : s.startMs),
      link: linkFor(video.source_kind || video.sourceKind, videoId, s.start_ms != null ? s.start_ms : s.startMs)
    }))
  };
}

/** بحث داخل نص فيديو واحد (لتفريغ/تصفح الفيديو) */
function searchInVideo(store, videoId, query, limit = 50) {
  const timeline = getVideoTimeline(store, videoId);
  if (!timeline) return null;
  const q = normalizeArabic(query || "");
  if (!q) return timeline;
  const tokens = contentTokens(q);
  const segments = timeline.segments.filter((s) => {
    const norm = normalizeArabic(s.text);
    return tokens.some((t) => norm.includes(t) || norm.includes(lightStem(t)));
  });
  return { ...timeline, segments, matches: segments.length };
}

/** خدمة الصحة: هل القاعدة جاهزة؟ */
function readiness(store) {
  const stats = store.stats();
  const ready = stats.segments > 0;
  return {
    ready,
    stats,
    message: ready
      ? `القاعدة جاهزة: ${stats.videosWithTranscript} فيديو مفهرس و${stats.segments} مقطع نصي.`
      : "القاعدة فارغة. شغّل: npm run ingest لسحب نصوص القناة."
  };
}

module.exports = { search, getVideoTimeline, searchInVideo, readiness, coverageOf };
