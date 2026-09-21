"use strict";

/**
 * mishkat/lib/videos.js
 * ---------------------------------------------------------------
 * لائحة الفيديوهات (عنوان + رابط فقط):
 *   • لا نصوص ولا تفريغات ولا نسخ كاملة — روابط للفيديوهات فقط.
 *   • البحث داخل العناوين والوصف والوسوم لتقديم روابط مرتبطة بالسؤال.
 *   • إضافة/حذف/استيراد من سطر الأوامر أو من لوحة الواجهة.
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const config = require("./config");
const rank = require("./rank");
const { normalizeArabic, contentTokens, lightStem } = require("./arabic");

const EMPTY_CATALOG = () => ({
  format: "mishkat-videos/v1",
  updatedAt: new Date().toISOString(),
  channel: { id: config.CHANNEL_ID, url: config.CHANNEL_URL, title: "" },
  note: "لائحة روابط الفيديوهات فقط: لا تُخزَّن نصوص الفيديوهات ولا تفريغاتها داخل الأداة.",
  videos: []
});

let cache = null;
let cacheSignature = "";

/* ==============================================================
 *  قراءة/كتابة اللائحة
 * ============================================================== */

function filePath() {
  return config.VIDEOS_PATH;
}

function fileSignature() {
  try {
    const stat = fs.statSync(filePath());
    return `${stat.mtimeMs}:${stat.size}`;
  } catch (_) {
    return "";
  }
}

function readCatalog({ force = false } = {}) {
  const signature = fileSignature();

  if (!force && cache && cacheSignature === signature && signature) return cache;

  let data = null;
  try {
    data = JSON.parse(fs.readFileSync(filePath(), "utf8"));
  } catch (_) {
    data = EMPTY_CATALOG();
  }

  const catalog = {
    format: data.format || "mishkat-videos/v1",
    updatedAt: data.updatedAt || "",
    channel: { ...EMPTY_CATALOG().channel, ...(data.channel || {}) },
    note: data.note || "",
    videos: Array.isArray(data.videos) ? data.videos.map(normalizeVideo).filter((v) => v.id) : []
  };

  cache = catalog;
  cacheSignature = signature;
  return catalog;
}

function writeCatalog(catalog) {
  const file = filePath();
  const payload = {
    ...catalog,
    format: "mishkat-videos/v1",
    updatedAt: new Date().toISOString()
  };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(tmp, file);
  } catch (err) {
    const error = new Error(
      "تعذّر الكتابة على ملف اللائحة (بيئة للقراءة فقط؟) — استخدم سطر الأوامر محليًا أو عدّل الملف يدويًا."
    );
    error.code = "readonly";
    error.cause = err;
    throw error;
  }
  cache = null;
  cacheSignature = "";
  return payload;
}

function normalizeVideo(video) {
  const id = String(video.id || extractVideoId(video.url) || "").trim();
  const url = video.url || (id ? `https://www.youtube.com/watch?v=${id}` : "");
  return {
    id,
    title: String(video.title || "").trim(),
    url: String(url || "").trim(),
    description: String(video.description || "").trim(),
    tags: Array.isArray(video.tags)
      ? video.tags.map((t) => String(t).trim()).filter(Boolean)
      : String(video.tags || "")
          .split(/[,،|]/)
          .map((t) => t.trim())
          .filter(Boolean),
    publishedAt: String(video.publishedAt || video.published_at || "").trim(),
    addedAt: String(video.addedAt || "").trim()
  };
}

/* ==============================================================
 *  معرّفات يوتيوب
 * ============================================================== */

function extractVideoId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
    /\/live\/([A-Za-z0-9_-]{11})/,
    /\/v\/([A-Za-z0-9_-]{11})/
  ];
  for (const re of patterns) {
    const m = re.exec(raw);
    if (m) return m[1];
  }
  return "";
}

/** محاولة جلب عنوان الفيديو من خدمة oEmbed (اختيارية وبلا مفتاح) */
async function fetchVideoTitle(videoId, { timeoutMs = 6000 } = {}) {
  if (!videoId) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return { title: String(data.title || ""), author: String(data.author_name || "") };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ==============================================================
 *  البحث
 * ============================================================== */

function searchableText(video) {
  return [video.title, video.description, (video.tags || []).join(" ")].join(" \n ");
}

/**
 * يبحث عن فيديوهات مرتبطة بالسؤال ويعيد روابطها.
 * @param {string} question
 * @param {{limit?:number, minScore?:number}} opts
 */
function search(question, opts = {}) {
  const catalog = readCatalog();
  const limit = Number(opts.limit || config.VIDEOS.topK);
  const minScore = opts.minScore != null ? Number(opts.minScore) : config.VIDEOS.minScore;
  const tokens = rank.queryTokens(question);
  const weight = rank.weightFn(catalog.videos.map((video) => new Set(rank.queryTokens(searchableText(video)))));

  const scored = catalog.videos.map((video) => {
    const text = searchableText(video);
    const score = rank.scoreCandidate(
      tokens,
      {
        title: video.title,
        snippet: video.description,
        tags: video.tags
      },
      { weight }
    );
    return {
      ...video,
      score: Math.round(score * 1000) / 1000,
      matched: matchedTerms(tokens, text)
    };
  });

  const hits = scored
    .filter((v) => v.score >= minScore && v.matched.length)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ar"))
    .slice(0, limit)
    .map((v) => ({
      id: v.id,
      title: v.title || `فيديو ${v.id}`,
      url: v.url,
      tags: v.tags,
      score: v.score,
      matched: v.matched
    }));

  return {
    videos: hits,
    total: catalog.videos.length,
    channel: catalog.channel,
    hasCatalog: catalog.videos.length > 0
  };
}

function matchedTerms(tokens, text) {
  const norm = normalizeArabic(text);
  const stems = new Set(contentTokens(norm).map(lightStem));
  const out = [];
  for (const token of tokens) {
    if (norm.includes(token) || stems.has(lightStem(token))) out.push(token);
  }
  return [...new Set(out)].slice(0, 8);
}

/** سرد اللائحة (مع بحث اختياري في العنوان) */
function list({ q = "", limit = 0, offset = 0 } = {}) {
  const catalog = readCatalog();
  let items = catalog.videos;
  const query = String(q || "").trim();
  if (query) {
    const tokens = rank.queryTokens(query);
    const norm = normalizeArabic(query);
    items = items.filter((v) => {
      const text = normalizeArabic(searchableText(v));
      return text.includes(norm) || tokens.some((t) => text.includes(t) || text.includes(lightStem(t)));
    });
  }
  const total = items.length;
  const sliced = items.slice(Number(offset) || 0, limit ? (Number(offset) || 0) + Number(limit) : undefined);
  return { items: sliced, total, channel: catalog.channel, updatedAt: catalog.updatedAt };
}

function get(id) {
  const videoId = extractVideoId(id) || String(id || "");
  const catalog = readCatalog();
  return catalog.videos.find((v) => v.id === videoId) || null;
}

/* ==============================================================
 *  التعديل
 * ============================================================== */

async function add({ url = "", id = "", title = "", description = "", tags = [], publishedAt = "" } = {}) {
  const videoId = extractVideoId(url || id) || String(id || "").trim();
  if (!videoId) throw new Error("رابط/معرّف الفيديو غير صالح");

  const catalog = readCatalog({ force: true });
  const existing = catalog.videos.find((v) => v.id === videoId);
  let finalTitle = String(title || "").trim();

  if (!finalTitle && config.VIDEOS.oembed) {
    const fetched = await fetchVideoTitle(videoId);
    if (fetched && fetched.title) finalTitle = fetched.title;
  }
  if (!finalTitle && existing) finalTitle = existing.title;

  const entry = normalizeVideo({
    id: videoId,
    url: url || `https://www.youtube.com/watch?v=${videoId}`,
    title: finalTitle || `فيديو ${videoId}`,
    description: description || (existing ? existing.description : ""),
    tags: tags && tags.length ? tags : existing ? existing.tags : [],
    publishedAt: publishedAt || (existing ? existing.publishedAt : ""),
    addedAt: existing ? existing.addedAt : new Date().toISOString()
  });

  const videos = existing
    ? catalog.videos.map((v) => (v.id === videoId ? { ...v, ...entry } : v))
    : [entry, ...catalog.videos];

  const saved = writeCatalog({ ...catalog, videos });
  return { video: entry, total: saved.videos.length, updated: !!existing };
}

function remove(idOrUrl) {
  const videoId = extractVideoId(idOrUrl) || String(idOrUrl || "").trim();
  const catalog = readCatalog({ force: true });
  const before = catalog.videos.length;
  const videos = catalog.videos.filter((v) => v.id !== videoId);
  if (videos.length === before) return { removed: false, total: before };
  const saved = writeCatalog({ ...catalog, videos });
  return { removed: true, total: saved.videos.length };
}

/**
 * استيراد لائحة روابط: كل سطر إمّا رابط، أو "العنوان | الرابط"،
 * أو "الرابط | العنوان"، أو JSON أولائحة نصوص.
 */
function importList(raw, { replace = false, tags = [] } = {}) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("لا يوجد محتوى للاستيراد");

  let incoming = [];

  if (text.startsWith("{") || text.startsWith("[")) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data.videos || [];
    incoming = list.map((item) =>
      typeof item === "string"
        ? { url: item, title: "" }
        : {
            id: item.id,
            url: item.url || "",
            title: item.title || "",
            description: item.description || "",
            tags: item.tags || tags
          }
    );
  } else {
    incoming = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const parts = line.split(/\s*[|,،]\s*/).filter(Boolean);
        if (parts.length === 1) return { url: parts[0], title: "" };
        const firstIsUrl = !!extractVideoId(parts[0]);
        return firstIsUrl
          ? { url: parts[0], title: parts.slice(1).join(" | ") }
          : { url: parts[parts.length - 1], title: parts.slice(0, -1).join(" | ") };
      });
  }

  const catalog = readCatalog({ force: true });
  let videos = replace ? [] : [...catalog.videos];
  let added = 0;
  let updated = 0;

  for (const item of incoming) {
    const videoId = extractVideoId(item.url || item.id) || "";
    if (!videoId) continue;
    const entry = normalizeVideo({
      ...item,
      id: videoId,
      url: item.url || `https://www.youtube.com/watch?v=${videoId}`,
      title: item.title || `فيديو ${videoId}`,
      tags: item.tags && item.tags.length ? item.tags : tags,
      addedAt: new Date().toISOString()
    });
    const idx = videos.findIndex((v) => v.id === videoId);
    if (idx >= 0) {
      videos[idx] = { ...videos[idx], ...entry, addedAt: videos[idx].addedAt || entry.addedAt };
      updated += 1;
    } else {
      videos.push(entry);
      added += 1;
    }
  }

  const saved = writeCatalog({ ...catalog, videos });
  return { added, updated, total: saved.videos.length };
}

function stats() {
  const catalog = readCatalog();
  const withTags = catalog.videos.filter((v) => (v.tags || []).length).length;
  return {
    total: catalog.videos.length,
    withTags,
    channel: catalog.channel,
    updatedAt: catalog.updatedAt,
    file: filePath(),
    exists: fs.existsSync(filePath())
  };
}

/** إن لم تكن اللائحة موجودة، نُنشئ ملفًا افتراضيًا (أفضل جهد) */
function ensureCatalogFile() {
  if (fs.existsSync(filePath())) return false;
  try {
    writeCatalog(EMPTY_CATALOG());
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  readCatalog,
  writeCatalog,
  ensureCatalogFile,
  extractVideoId,
  fetchVideoTitle,
  search,
  list,
  get,
  add,
  remove,
  importList,
  stats,
  filePath
};
