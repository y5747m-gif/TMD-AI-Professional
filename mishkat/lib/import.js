"use strict";

/**
 * mishkat/lib/import.js
 * ---------------------------------------------------------------
 * إدخال النصوص يدويًا إلى قاعدة «مشكاة»:
 *   • لصق نص أو رفع ملف ترجمة (SRT / VTT / JSON / نص موقّت / نص عادي)
 *   • استيراد مجمّع من مجلد (مطابقة تلقائية باسم الملف = معرّف الفيديو)
 *   • تقرير بالفيديوهات التي لا يوجد لها نص لتعبئتها
 * ---------------------------------------------------------------
 * سبب وجوده: كثير من فيديوهات القنوات لا تتضمن ترجمة على يوتيوب،
 * وهذه الوحدة تتيح تعبئتها يدويًا فيصبح المحرك قادرًا على الاستشهاد بها.
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const config = require("./config");
const youtube = require("./youtube");
const { parseSubtitles } = require("./subtitles");
const { buildChunks } = require("./text");
const { normalizeArabic } = require("./arabic");
const { videoLink } = require("./db");

/* ==============================================================
 *  أدوات
 * ============================================================== */

/**
 * يستخرج معرّف الفيديو من:
 *   • رابط يوتيوب كامل (watch?v= / youtu.be / shorts / embed / live)
 *   • معرّف مجرّد (11 حرفًا كما في يوتيوب)
 *   • اسم ملف يحتوي المعرّف (بمفرده، أو بين قوسين، أو مسبوقًا بنقطة)
 */
function extractVideoId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  // 1) رابط كامل
  const urlMatch = raw.match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
  if (urlMatch) return urlMatch[1];

  // 2) معرّف مجرّد بطول 11 حرفًا (الطول القياسي ليوتيوب)
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

  const stem = path.basename(raw).replace(/\.[^.]+$/, "");

  // 3) معرّف بين قوسين: [vidXXX] أو (vidXXX)
  const bracketed = stem.match(/[[(]([A-Za-z0-9_-]{6,})[\])]/);
  if (bracketed) return bracketed[1];

  // 4) مقاطع محاطة بمحارف غير معرّف (مسافات/أقواس/نقاط)
  const candidates = [];
  const re = /(?:^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{6,})(?=$|[^A-Za-z0-9_-])/g;
  let m;
  while ((m = re.exec(stem))) candidates.push(m[1]);

  // 4-أ) معرّف قياسي بطول 11
  const exact = candidates.find((c) => c.length === 11);
  if (exact) return exact;

  // 4-ب) تقسيم المرشّحين على الفواصل (download-2024-ID) والبحث عن طول 11
  for (const c of candidates) {
    for (const part of c.split(/[-_]/)) {
      if (/^[A-Za-z0-9]{11}$/.test(part)) return part;
    }
  }

  // 5) أطول مرشّح معقول (يسمح بمعرّفات تجريبية/داخلية)
  const usable = candidates.filter((c) => c.length >= 6 && c.length <= 24).sort((a, b) => b.length - a.length);
  if (usable.length) return usable[0];

  return "";
}

/** يجلب بيانات الفيديو إن أمكن، ويتحمّل فشل الشبكة */
async function resolveMeta(videoId, opts = {}) {
  const result = {
    id: videoId,
    title: opts.title || "",
    description: opts.description || "",
    publishedAt: opts.publishedAt || "",
    durationS: Number(opts.durationS || 0),
    views: 0,
    thumbnail: "",
    sourceKind: opts.sourceKind || "manual",
    channelVerified: null,
    warning: ""
  };

  const finalize = () => {
    if (!result.title) result.title = `نص مُدخل يدويًا — ${videoId}`;
    return result;
  };

  if (opts.fetchMeta === false) {
    if (!result.title) result.warning = "لم تُجلب بيانات الفيديو من يوتيوب (fetchMeta: false) — العنوان من النص المُدخل فقط.";
    return finalize();
  }

  try {
    const meta = await youtube.fetchVideoMeta(videoId);
    result.title = result.title || meta.title || "";
    result.description = result.description || meta.description || "";
    result.publishedAt = result.publishedAt || meta.publishedAt || "";
    result.durationS = result.durationS || meta.durationS || 0;
    result.views = meta.views || 0;
    result.thumbnail = meta.thumbnail || "";
    if (meta.channelId) {
      result.channelVerified = meta.channelId === config.CHANNEL_ID;
      if (!result.channelVerified) {
        result.warning = "تنبيه: هذا الفيديو ليس من القناة المعتمدة (أُضيف كمرجع خارجي).";
        result.sourceKind = "manual-external";
      }
    }
  } catch (err) {
    result.warning = `تعذّر جلب بيانات الفيديو من يوتيوب (${String(err.message || err).slice(0, 120)}). تم استخدام بيانات النص فقط.`;
  }

  return finalize();
}

/* ==============================================================
 *  استيراد نص واحد
 * ============================================================== */

/**
 * يستورد نصًا لفيديو واحد ويخزّنه مفهرسًا.
 * @param {object} store متجر البيانات
 * @param {string} videoId معرّف الفيديو
 * @param {string} content محتوى النص/الترجمة
 * @param {{format?:string, filename?:string, replace?:boolean, title?:string, durationS?:number, fetchMeta?:boolean}} opts
 */
async function importTranscript(store, videoId, content, opts = {}) {
  const id = extractVideoId(videoId) || String(videoId || "").trim();
  if (!id) throw new Error("معرّف الفيديو غير صالح.");
  if (!content || !String(content).trim()) throw new Error("محتوى النص فارغ.");

  const existing = store.hasVideo(id);
  if (existing && existing.has_transcript && opts.replace === false) {
    throw new Error("هذا الفيديو له نص مفهرس مسبقًا. استخدم replace: true للاستبدال.");
  }

  const meta = await resolveMeta(id, opts);
  const parsed = parseSubtitles(content, {
    filename: opts.filename,
    format: opts.format,
    durationS: opts.durationS || meta.durationS
  });

  if (!parsed.segments.length) {
    throw new Error("لم يتم استخراج أي نص من المحتوى المُدخل (تحقق من صيغة الملف).");
  }

  const chunks = buildChunks(parsed.segments, { chunkChars: config.INGEST.chunkChars });
  if (!chunks.length) throw new Error("تعذّر تقسيم النص إلى مقاطع.");

  const chars = chunks.reduce((a, c) => a + c.text.length, 0);
  const durationS =
    meta.durationS ||
    Math.max(0, Math.round(parsed.segments.reduce((a, s) => Math.max(a, s.endMs), 0) / 1000));

  store.upsertVideo({
    id,
    title: meta.title,
    description: meta.description,
    publishedAt: meta.publishedAt,
    durationS,
    views: meta.views,
    url: videoLink(id, 0),
    thumbnail: meta.thumbnail,
    sourceKind: meta.sourceKind,
    hasTranscript: true,
    transcriptLang: opts.lang || "ar",
    segmentsCount: chunks.length,
    chars,
    fetchedAt: new Date().toISOString(),
    error: ""
  });

  store.clearVideoSegments(id);
  store.addSegments(
    id,
    chunks.map((c) => ({
      idx: c.idx,
      startMs: c.startMs,
      endMs: c.endMs,
      text: c.text,
      norm: normalizeArabic(c.text)
    }))
  );

  store.setMeta("updatedAt", new Date().toISOString());
  try {
    store.logEvent("info", "import", `${id} — ${chunks.length} مقطع (${parsed.format})`);
  } catch (_) {
    /* اختياري */
  }

  return {
    videoId: id,
    title: meta.title,
    format: parsed.format,
    segments: parsed.segments.length,
    chunks: chunks.length,
    chars,
    durationS,
    sourceKind: meta.sourceKind,
    channelVerified: meta.channelVerified,
    warnings: [meta.warning, ...parsed.warnings].filter(Boolean)
  };
}

/* ==============================================================
 *  استيراد مجمّع من قائمة ملفات
 * ============================================================== */

/**
 * @param {Array<{name:string, content:string}>} files
 * @param {{replace?:boolean, fetchMeta?:boolean, onProgress?:Function}} opts
 */
async function importFiles(store, files, opts = {}) {
  const summary = { total: files.length, ok: 0, failed: 0, skipped: 0, chunks: 0, chars: 0, results: [], failures: [] };

  for (const file of files) {
    const videoId = extractVideoId(file.name);
    if (!videoId) {
      summary.skipped++;
      summary.failures.push({ file: file.name, reason: "لم يتم التعرّف على معرّف الفيديو من اسم الملف" });
      if (opts.onProgress) opts.onProgress({ file: file.name, status: "skipped" });
      continue;
    }
    try {
      const res = await importTranscript(store, videoId, file.content, {
        filename: file.name,
        replace: opts.replace !== false,
        fetchMeta: opts.fetchMeta,
        durationS: opts.durationS
      });
      summary.ok++;
      summary.chunks += res.chunks;
      summary.chars += res.chars;
      summary.results.push({ file: file.name, ...res });
      if (opts.onProgress) opts.onProgress({ file: file.name, status: "ok", ...res });
    } catch (err) {
      summary.failed++;
      summary.failures.push({ file: file.name, videoId, reason: err.message });
      if (opts.onProgress) opts.onProgress({ file: file.name, status: "failed", reason: err.message });
    }
  }

  try {
    store.exportJsonIndex();
  } catch (_) {
    /* اختياري */
  }
  return summary;
}

const SUPPORTED_EXT = [".srt", ".vtt", ".txt", ".json", ".sbv", ".tsv"];

/** يقرأ كل ملفات الترجمة من مجلد ويستوردها */
async function importDirectory(store, dir, opts = {}) {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(`المجلد غير موجود: ${abs}`);
  }
  const files = fs
    .readdirSync(abs)
    .filter((f) => SUPPORTED_EXT.includes(path.extname(f).toLowerCase()))
    .map((f) => ({ name: f, content: fs.readFileSync(path.join(abs, f), "utf8") }));

  if (!files.length) {
    throw new Error(`لا توجد ملفات نصية مدعومة (${SUPPORTED_EXT.join(" / ")}) في المجلد.`);
  }
  return importFiles(store, files, opts);
}

/* ==============================================================
 *  تقرير: الفيديوهات التي تحتاج نصًا
 * ============================================================== */

/**
 * @param {object} store
 * @param {{limit?:number, onlyChannel?:boolean}} opts
 */
function missingTranscripts(store, opts = {}) {
  const limit = Number(opts.limit || 200);
  const videos = store.listVideos({ limit: 100000, offset: 0 });
  const missing = videos
    .filter((v) => !v.hasTranscript)
    .map((v) => ({
      id: v.id,
      title: v.title,
      url: v.url || videoLink(v.id, 0),
      publishedAt: v.publishedAt,
      sourceKind: v.sourceKind,
      reason: v.error || "لا توجد ترجمة على يوتيوب"
    }));

  return {
    total: videos.length,
    indexed: videos.length - missing.length,
    missing: missing.length,
    videos: missing.slice(0, limit),
    hint:
      "لإضافة النص: افتح الفيديو من «مكتبة النصوص» ثم «＋ أضف نصًا»، أو استخدم:\n" +
      "  node mishkat/cli.js import --video <ID> --file <ملف.srt>\n" +
      "  node mishkat/cli.js import --dir <مجلد ملفات الترجمة>"
  };
}

module.exports = {
  importTranscript,
  importFiles,
  importDirectory,
  missingTranscripts,
  extractVideoId,
  resolveMeta
};
