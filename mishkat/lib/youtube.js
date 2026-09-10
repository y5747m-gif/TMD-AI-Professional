"use strict";

/**
 * mishkat/lib/youtube.js
 * ---------------------------------------------------------------
 * التعامل مع قناة يوتيوب المعتمدة:
 *   1) سرد فيديوهات القناة: عبر YouTube Data API (إن وُجد مفتاح)
 *      أو عبر استخراج صفحة القناة (بدون مفتاح).
 *   2) جلب النص/الترجمة (Transcript) لكل فيديو عبر واجهة المشغّل الداخلية
 *      (InnerTube) مع بدائل متعددة، ويدعم srv3 و json3 والترجمات التلقائية.
 *   3) خيار yt-dlp لسحب الترجمة عند الحاجة.
 * ---------------------------------------------------------------
 * لا يستخدم أي مكتبة خارجية. يعمل على Node.js 18+.
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const config = require("./config");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const WEB_CLIENT_VERSION = "2.20240701.00.00";
const ANDROID_CLIENT = { clientName: "ANDROID", clientVersion: "19.09.37" };

/* ==============================================================
 *  أدوات HTTP
 * ============================================================== */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpText(url, options = {}) {
  const retries = options.retries != null ? options.retries : 2;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 25000);
    try {
      const res = await fetch(url, {
        method: options.method || "GET",
        headers: {
          "user-agent": USER_AGENT,
          "accept-language": "ar,en;q=0.8",
          ...(options.headers || {})
        },
        body: options.body,
        signal: controller.signal,
        redirect: "follow"
      });
      clearTimeout(timer);
      const text = await res.text();
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} — ${url.slice(0, 120)}`);
        err.status = res.status;
        err.body = text.slice(0, 500);
        throw err;
      }
      return text;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) await sleep(600 * (attempt + 1));
    }
  }
  throw lastErr;
}

/** يحوّل أخطاء الشبكة إلى رسالة عربية واضحة قابلة للتنفيذ */
function friendlyError(err, context = "الاتصال بيوتيوب") {
  const msg = String((err && err.message) || err);
  if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNRESET|aborted|network|socket/i.test(msg)) {
    return new Error(
      `تعذّر ${context} من هذه البيئة (${msg}). تأكد من الاتصال بالإنترنت، أو نفّذ أمر السحب على جهاز متصل بالشبكة، أو اضبط YOUTUBE_API_KEY.`
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

async function httpJson(url, options = {}) {
  const text = await httpText(url, options);
  try {
    return JSON.parse(text);
  } catch (_) {
    // بعض الصفحات تُرجِع JSON داخل HTML
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_e) {
        /* تجاهل */
      }
    }
    throw new Error("تعذّر تحليل استجابة JSON من يوتيوب");
  }
}

/* ==============================================================
 *  استخراج JSON من صفحات يوتيوب
 * ============================================================== */

/** يستخرج كائن JSON المتوازن الذي يبدأ عند موضع معيّن */
function extractBalancedJson(text, startIndex) {
  const open = text.indexOf("{", startIndex);
  if (open === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return null;
}

function extractVarJson(html, varNames) {
  for (const name of varNames) {
    const patterns = [
      new RegExp(`var\\s+${name}\\s*=\\s*`),
      new RegExp(`window\\[["']${name}["']\\]\\s*=\\s*`),
      new RegExp(`"${name}"\\s*:\\s*`)
    ];
    for (const re of patterns) {
      const m = re.exec(html);
      if (m) {
        const json = extractBalancedJson(html, m.index + m[0].length);
        if (json) {
          try {
            return JSON.parse(json);
          } catch (_) {
            /* جرّب النمط التالي */
          }
        }
      }
    }
  }
  return null;
}

/** بحث عميق عن مفاتيح معيّنة داخل كائن JSON */
function collectByKey(obj, key, out = [], depth = 0) {
  if (!obj || depth > 12) return out;
  if (Array.isArray(obj)) {
    for (const item of obj) collectByKey(item, key, out, depth + 1);
    return out;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (k === key) out.push(v);
      collectByKey(v, key, out, depth + 1);
    }
  }
  return out;
}

function firstByKey(obj, key) {
  const all = collectByKey(obj, key, []);
  return all.length ? all[0] : null;
}

/* ==============================================================
 *  تحويل قيم نصية
 * ============================================================== */

function parseDurationText(text) {
  if (!text) return 0;
  const clean = String(text).trim();
  const iso = clean.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (iso) {
    return (
      Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0)
    );
  }
  const parts = clean
    .replace(/[^\d:]/g, "")
    .split(":")
    .filter((p) => p !== "")
    .map((n) => Number(n));
  if (!parts.length) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function parseCountText(text) {
  if (text == null) return 0;
  const raw = String(text).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const hasArabicThousand = /ألف|الف|آلاف/.test(raw);
  const hasArabicMillion = /مليون|ملايين/.test(raw);
  const hasLatinThousand = /\d\s*[Kk]\b/.test(raw);
  const hasLatinMillion = /\d\s*[Mm]\b/.test(raw);

  const multiplier = hasArabicMillion || hasLatinMillion ? 1e6 : hasArabicThousand || hasLatinThousand ? 1e3 : 1;

  const match = raw.match(/\d+(?:[.,]\d+)?/);
  if (!match) return 0;
  // الفاصلة/النقطة عشريّة عند وجود مضاعف (3.5M)، وإلا فهي فاصل آلاف (1,234)
  const numeric = multiplier > 1 ? match[0].replace(",", ".") : match[0].replace(/[.,]/g, "");
  const num = Number(numeric);
  return Number.isFinite(num) ? Math.round(num * multiplier) : 0;
}

function cleanText(value) {
  return String(value == null ? "" : value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ==============================================================
 *  1) سرد فيديوهات القناة — عبر YouTube Data API
 * ============================================================== */

async function apiFetch(pathname, params) {
  const url = new URL(`${config.YT_API_BASE}/${pathname}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v != null && v !== "") url.searchParams.set(k, v);
  }
  url.searchParams.set("key", config.YOUTUBE_API_KEY);
  const data = await httpJson(url.toString(), { retries: 2, timeoutMs: 25000 });
  if (data.error) {
    throw new Error(`YouTube API: ${data.error.message || "خطأ غير معروف"}`);
  }
  return data;
}

async function listViaApi({ max = 0, onProgress, known = new Set() } = {}) {
  // 1) معلومات القناة + قائمة الرفع
  const channel = await apiFetch("channels", {
    part: "contentDetails,snippet",
    id: config.CHANNEL_ID
  });
  const item = (channel.items || [])[0];
  if (!item) throw new Error("لم يتم العثور على القناة عبر YouTube API (تحقق من YOUTUBE_CHANNEL_ID)");
  const uploads = item.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("تعذّر العثور على قائمة رفع الفيديوهات للقناة");
  const channelTitle = item.snippet?.title || "";
  const channelThumb = item.snippet?.thumbnails?.default?.url || "";

  const ids = [];
  let pageToken = "";
  do {
    const page = await apiFetch("playlistItems", {
      part: "contentDetails",
      playlistId: uploads,
      maxResults: 50,
      pageToken
    });
    for (const it of page.items || []) {
      const vid = it.contentDetails?.videoId;
      if (vid) ids.push(vid);
    }
    pageToken = page.nextPageToken || "";
    if (onProgress) onProgress({ phase: "list", count: ids.length, channelTitle, channelThumb });
  } while (pageToken && (max === 0 || ids.length < max));

  const limited = max > 0 ? ids.slice(0, max) : ids;

  // 2) التفاصيل (العنوان، المدة، المشاهدات)
  const videos = [];
  for (let i = 0; i < limited.length; i += 50) {
    const chunk = limited.slice(i, i + 50);
    const details = await apiFetch("videos", {
      part: "snippet,contentDetails,statistics",
      id: chunk.join(","),
      maxResults: 50
    });
    for (const v of details.items || []) {
      videos.push({
        id: v.id,
        title: cleanText(v.snippet?.title),
        description: cleanText(v.snippet?.description).slice(0, 4000),
        publishedAt: v.snippet?.publishedAt || "",
        durationS: parseDurationText(v.contentDetails?.duration || ""),
        views: Number(v.statistics?.viewCount || 0),
        thumbnail:
          v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || "",
        url: `https://www.youtube.com/watch?v=${v.id}`,
        sourceKind: known.has(v.id) ? "cache" : "channel"
      });
    }
    if (onProgress) onProgress({ phase: "details", count: videos.length, total: limited.length });
  }

  return { videos, channelTitle, channelThumb, via: "api" };
}

/* ==============================================================
 *  2) سرد فيديوهات القناة — عبر استخراج الصفحة (بدون مفتاح)
 * ============================================================== */

function videosFromInitialData(data) {
  const out = [];
  const push = (v) => {
    if (v && v.id && !out.some((x) => x.id === v.id)) out.push(v);
  };

  // الشكل القديم: gridVideoRenderer / videoRenderer
  for (const r of collectByKey(data, "gridVideoRenderer")) {
    push(mapRenderer(r));
  }
  for (const r of collectByKey(data, "videoRenderer")) {
    push(mapRenderer(r));
  }
  // الشكل الحديث: lockupViewModel
  for (const l of collectByKey(data, "lockupViewModel")) {
    push(mapLockup(l));
  }
  return out.filter(Boolean);
}

function mapRenderer(r) {
  const id = r.videoId;
  if (!id) return null;
  const thumbs = r.thumbnail?.thumbnails || [];
  return {
    id,
    title: cleanText(r.title?.runs?.[0]?.text || r.title?.simpleText || ""),
    description: cleanText(
      r.descriptionSnippet?.runs?.map((x) => x.text).join(" ") ||
        r.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((x) => x.text).join(" ") ||
        ""
    ).slice(0, 4000),
    publishedAt: "",
    durationS: parseDurationText(
      r.lengthText?.simpleText || r.thumbnailOverlays?.find?.((o) => o.thumbnailOverlayTimeStatusRenderer)
        ?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText ||
        ""
    ),
    views: parseCountText(r.viewCountText?.simpleText || r.shortViewCountText?.simpleText || ""),
    thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : "",
    url: `https://www.youtube.com/watch?v=${id}`,
    sourceKind: "channel"
  };
}

function mapLockup(l) {
  const id = l.contentId;
  if (!id || (l.contentType && l.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO")) return null;
  const meta = l.metadata?.lockupMetadataViewModel;
  const title = meta?.title?.content || "";
  const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows || [];
  const parts = rows.flatMap((row) => (row.metadataParts || []).map((p) => p.text?.content || ""));

  let duration = "";
  let views = 0;
  const badges = collectByKey(l.contentImage?.thumbnailViewModel?.overlays || [], "thumbnailBadgeViewModel");
  for (const b of badges) if (b.text && /\d/.test(b.text)) duration = b.text;

  const stamps = [];
  for (const p of parts) {
    if (/\d+\s*:/.test(p)) duration = duration || p;
    else if (/مشاهدة|views?|ألف|مليون|K\b|M\b/i.test(p)) views = parseCountText(p);
    else if (/منذ|ago|قبل/i.test(p)) stamps.push(p);
  }
  const sources = collectByKey(l.contentImage?.thumbnailViewModel?.image?.sources || [], "url");
  return {
    id,
    title: cleanText(title),
    description: "",
    publishedAt: "",
    durationS: parseDurationText(duration),
    views,
    thumbnail: sources.length ? sources[sources.length - 1] : "",
    url: `https://www.youtube.com/watch?v=${id}`,
    sourceKind: "channel"
  };
}

async function getInnertubeContext() {
  if (getInnertubeContext._cache) return getInnertubeContext._cache;
  const ctx = { apiKey: "", clientVersion: WEB_CLIENT_VERSION };
  try {
    const html = await httpText(`${config.YT_BASE}/watch?v=dQw4w9WgXcQ`, {
      retries: 1,
      timeoutMs: 20000
    });
    const keyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    const verMatch = html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/);
    if (keyMatch) ctx.apiKey = keyMatch[1];
    if (verMatch) ctx.clientVersion = verMatch[1];
  } catch (_) {
    /* نستخدم القيم الافتراضية */
  }
  getInnertubeContext._cache = ctx;
  return ctx;
}

async function innertubePost(endpoint, body) {
  const ctx = await getInnertubeContext();
  const url = `${config.YT_BASE}/youtubei/v1/${endpoint}${ctx.apiKey ? `?key=${ctx.apiKey}` : ""}`;
  return httpJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    retries: 2,
    timeoutMs: 30000
  });
}

async function listViaScrape({ max = 0, onProgress } = {}) {
  const videosUrl = `${config.YT_BASE}/channel/${config.CHANNEL_ID}/videos`;
  let html = await httpText(videosUrl, { retries: 2, timeoutMs: 30000 });

  let initial = extractVarJson(html, ["ytInitialData"]);
  let channelTitle = "";
  let channelThumb = "";
  try {
    const header = firstByKey(initial, "pageHeaderViewModel");
    const contentVal = firstByKey(header, "content");
    // قد يكون العنوان نصًا مباشرًا أو كائنًا يحمل خاصية content
    channelTitle = cleanText(typeof contentVal === "string" ? contentVal : contentVal?.content || "");
    const avatars = collectByKey(initial?.header || {}, "avatarViewModel");
    if (avatars[0]) {
      const s = firstByKey(avatars[0], "sources");
      if (Array.isArray(s) && s.length) channelThumb = s[s.length - 1].url || "";
    }
  } catch (_) {
    /* تجاهل */
  }

  const seen = new Map();
  let collected = videosFromInitialData(initial);
  for (const v of collected) seen.set(v.id, v);
  if (onProgress) onProgress({ phase: "scrape", count: seen.size, channelTitle, channelThumb });

  // متابعة التحميل (continuation)
  let token = null;
  const contItems = collectByKey(initial, "continuationItemRenderer");
  for (const c of contItems) {
    const t = c?.continuationEndpoint?.continuationCommand?.token;
    if (t) token = t;
  }
  if (!token) {
    const browse = collectByKey(initial, "continuationCommand");
    for (const b of browse) if (b.token) token = b.token;
  }

  let guard = 0;
  while (token && (max === 0 || seen.size < max) && guard < 40) {
    guard++;
    let data;
    try {
      data = await innertubePost("browse", {
        context: {
          client: {
            clientName: "WEB",
            clientVersion: (await getInnertubeContext()).clientVersion,
            hl: "ar",
            gl: "EG"
          }
        },
        continuation: token
      });
    } catch (err) {
      break;
    }
    const more = videosFromInitialData(data);
    let added = 0;
    for (const v of more) {
      if (!seen.has(v.id)) {
        seen.set(v.id, v);
        added++;
      }
    }
    if (onProgress) onProgress({ phase: "scrape", count: seen.size, channelTitle, channelThumb });

    let nextToken = null;
    for (const c of collectByKey(data, "continuationItemRenderer")) {
      const t = c?.continuationEndpoint?.continuationCommand?.token;
      if (t) nextToken = t;
    }
    if (!nextToken) {
      for (const c of collectByKey(data, "continuationCommand")) if (c.token) nextToken = c.token;
    }
    token = nextToken;
    if (!added && !token) break;
    if (!added && guard > 3) break;
    await sleep(250);
  }

  let videos = [...seen.values()];
  videos.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  if (max > 0) videos = videos.slice(0, max);

  if (!videos.length) {
    throw new Error(
      "لم يتم العثور على فيديوهات في صفحة القناة. تأكد من رابط القناة، أو استخدم YOUTUBE_API_KEY."
    );
  }
  return { videos, channelTitle, channelThumb, via: "scrape" };
}

/**
 * يسرد فيديوهات القناة (تلقائيًا: API إن وُجد مفتاح، وإلا استخراج الصفحة).
 */
async function listChannelVideos(opts = {}) {
  const known = opts.known || new Set();
  if (config.YOUTUBE_API_KEY) {
    try {
      return await listViaApi(opts);
    } catch (err) {
      if (opts.onProgress)
        opts.onProgress({
          phase: "warn",
          message: `تعذّر استخدام YouTube API: ${err.message} — سيتم استخدام الاستخراج المباشر.`
        });
      try {
        return await listViaScrape(opts);
      } catch (err2) {
        throw friendlyError(err2, "سرد فيديوهات القناة");
      }
    }
  }
  try {
    return await listViaScrape(opts);
  } catch (err) {
    throw friendlyError(err, "سرد فيديوهات القناة");
  }
}

/** يحلّ معرّف القناة من رابط/معرّف (@handle أو channelId) */
async function resolveChannelId(input) {
  const raw = String(input || "").trim();
  if (/^UC[\w-]{20,}$/.test(raw)) return raw;
  const url = raw || config.CHANNEL_URL;
  const html = await httpText(url, { retries: 1, timeoutMs: 25000 });
  const m =
    html.match(/"channelId":"(UC[\w-]+)"/) ||
    html.match(/channel\/(UC[\w-]+)/) ||
    html.match(/"externalId":"(UC[\w-]+)"/);
  if (m) return m[1];
  throw new Error("تعذّر استخراج معرّف القناة من الرابط المحدد");
}

/* ==============================================================
 *  3) جلب النص/الترجمة لفيديو
 * ============================================================== */

function pickArabicTrack(tracks) {
  if (!Array.isArray(tracks) || !tracks.length) return null;
  const isAr = (t) => /^ar/i.test(String(t.languageCode || ""));
  return (
    tracks.find((t) => isAr(t) && !t.kind) ||
    tracks.find(isAr) ||
    tracks.find((t) => !t.kind) ||
    tracks[0]
  );
}

function parseJson3(data) {
  const events = data?.events || [];
  const segments = [];
  for (const ev of events) {
    if (!ev.segs) continue;
    const text = ev.segs.map((s) => s.utf8 || "").join("").replace(/\s+/g, " ").trim();
    if (!text) continue;
    segments.push({
      startMs: Number(ev.tStartMs || 0),
      endMs: Number(ev.tStartMs || 0) + Number(ev.dDurationMs || 0),
      text
    });
  }
  return mergeSegments(segments);
}

function parseCaptionXml(xml) {
  const segments = [];

  // srv3: <p t="1230" d="4500"><s>كلمة</s>...</p>
  const pRe = /<p\b[^>]*\bt="(\d+)"[^>]*?(?:\bd="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = pRe.exec(xml))) {
    const text = cleanText(m[3].replace(/<s[^>]*>/g, " ").replace(/<\/s>/g, ""));
    if (!text) continue;
    segments.push({
      startMs: Number(m[1]),
      endMs: Number(m[1]) + Number(m[2] || 0),
      text
    });
  }
  if (segments.length) return mergeSegments(segments);

  // classic: <text start="1.2" dur="3.4">نص</text>
  const tRe = /<text\b[^>]*\bstart="([\d.]+)"[^>]*?(?:\bdur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;
  while ((m = tRe.exec(xml))) {
    const text = cleanText(m[3]);
    if (!text) continue;
    const start = Math.round(Number(m[1]) * 1000);
    segments.push({ startMs: start, endMs: start + Math.round(Number(m[2] || 0) * 1000), text });
  }
  return mergeSegments(segments);
}

/** يدمج المقاطع القصيرة جدًا/المتكررة ويوحّد المسافات */
function mergeSegments(segments) {
  const out = [];
  for (const seg of segments) {
    const text = String(seg.text || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.text === text) continue;
    if (last && seg.startMs - last.endMs < 400 && text.length < 25 && last.text.length < 200) {
      last.text = `${last.text} ${text}`.replace(/\s+/g, " ").trim();
      last.endMs = Math.max(last.endMs, seg.endMs);
      continue;
    }
    out.push({ startMs: seg.startMs, endMs: seg.endMs || seg.startMs, text });
  }
  return out;
}

async function tracksFromInnertube(videoId) {
  const attempts = [
    {
      context: {
        client: {
          clientName: "WEB",
          clientVersion: WEB_CLIENT_VERSION,
          hl: "ar",
          gl: "EG"
        }
      }
    },
    { context: { client: { ...ANDROID_CLIENT, hl: "ar", gl: "EG" } } },
    {
      context: {
        client: {
          clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
          clientVersion: "2.0",
          hl: "ar"
        }
      }
    }
  ];

  for (const body of attempts) {
    try {
      const data = await innertubePost("player", { ...body, videoId, contentCheckOk: true, racyCheckOk: true });
      const tracks =
        data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ||
        [];
      if (tracks.length) return { tracks, player: data };
    } catch (_) {
      /* جرّب العميل التالي */
    }
  }
  return { tracks: [], player: null };
}

async function tracksFromWatchPage(videoId) {
  try {
    const html = await httpText(`${config.YT_BASE}/watch?v=${videoId}`, {
      retries: 1,
      timeoutMs: 25000
    });
    const player = extractVarJson(html, ["ytInitialPlayerResponse"]);
    const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    return { tracks, player };
  } catch (_) {
    return { tracks: [], player: null };
  }
}

async function subtitlesViaYtDlp(videoId) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mishkat-yt-"));
  const outTemplate = path.join(tmp, "%(id)s");
  const args = [
    "--skip-download",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs",
    "ar.*,ar,en.*",
    "--sub-format",
    "json3",
    "-o",
    outTemplate,
    `https://www.youtube.com/watch?v=${videoId}`
  ];
  await new Promise((resolve, reject) => {
    execFile("yt-dlp", args, { timeout: 120000 }, (err) => (err ? reject(err) : resolve()));
  });
  const files = fs.readdirSync(tmp).filter((f) => f.endsWith(".json3"));
  if (!files.length) throw new Error("yt-dlp لم يُنتج ملف ترجمة");
  const file = files.find((f) => f.includes(".ar")) || files[0];
  const lang = file.match(/\.([a-zA-Z-]+)\.json3$/)?.[1] || "ar";
  const data = JSON.parse(fs.readFileSync(path.join(tmp, file), "utf8"));
  const segments = parseJson3(data);
  fs.rmSync(tmp, { recursive: true, force: true });
  return { segments, lang, source: "yt-dlp", isAuto: file.includes("auto") || !file.includes(".ar.") };
}

/**
 * يجلب نص فيديو واحد.
 * @returns {Promise<{segments:Array,lang:string,source:string,isAuto:boolean}>}
 */
async function fetchTranscript(videoId) {
  const errors = [];

  // 1) InnerTube
  try {
    const { tracks } = await tracksFromInnertube(videoId);
    const track = pickArabicTrack(tracks);
    if (track?.baseUrl) {
      const url = new URL(track.baseUrl);
      url.searchParams.set("fmt", "json3");
      let segments = [];
      try {
        const data = await httpJson(url.toString(), { retries: 1, timeoutMs: 25000 });
        segments = parseJson3(data);
      } catch (_) {
        /* جرّب XML */
      }
      if (!segments.length) {
        const url2 = new URL(track.baseUrl);
        url2.searchParams.set("fmt", "srv3");
        const xml = await httpText(url2.toString(), { retries: 1, timeoutMs: 30000 });
        segments = parseCaptionXml(xml);
      }
      if (segments.length) {
        return {
          segments,
          lang: track.languageCode || "ar",
          source: "innertube",
          isAuto: track.kind === "asr"
        };
      }
    } else {
      errors.push("لا توجد مسارات ترجمة في InnerTube");
    }
  } catch (err) {
    errors.push(`InnerTube: ${err.message}`);
  }

  // 2) صفحة المشاهدة
  try {
    const { tracks } = await tracksFromWatchPage(videoId);
    const track = pickArabicTrack(tracks);
    if (track?.baseUrl) {
      const url = new URL(track.baseUrl);
      url.searchParams.set("fmt", "json3");
      const data = await httpJson(url.toString(), { retries: 1, timeoutMs: 25000 });
      const segments = parseJson3(data);
      if (segments.length) {
        return {
          segments,
          lang: track.languageCode || "ar",
          source: "watch-page",
          isAuto: track.kind === "asr"
        };
      }
    } else {
      errors.push("لا توجد ترجمة في صفحة المشاهدة");
    }
  } catch (err) {
    errors.push(`watch: ${err.message}`);
  }

  // 3) yt-dlp (اختياري)
  if (config.INGEST.preferYtDlp || config.bool("MISHKAT_YTDLP_FALLBACK", true)) {
    try {
      const res = await subtitlesViaYtDlp(videoId);
      if (res.segments.length) return res;
    } catch (err) {
      errors.push(`yt-dlp: ${err.message}`);
    }
  }

  const error = new Error(`تعذّر جلب النص: ${errors.join(" | ")}`);
  error.reasons = errors;
  throw error;
}

/** بيانات مختصرة لفيديو واحد (للتحقق/العرض) */
async function fetchVideoMeta(videoId) {
  if (config.YOUTUBE_API_KEY) {
    try {
      const data = await apiFetch("videos", { part: "snippet,contentDetails,statistics", id: videoId });
      const v = (data.items || [])[0];
      if (v) {
        return {
          id: v.id,
          title: cleanText(v.snippet?.title),
          description: cleanText(v.snippet?.description).slice(0, 4000),
          publishedAt: v.snippet?.publishedAt || "",
          durationS: parseDurationText(v.contentDetails?.duration || ""),
          views: Number(v.statistics?.viewCount || 0),
          channelId: v.snippet?.channelId || "",
          thumbnail: v.snippet?.thumbnails?.medium?.url || "",
          url: `https://www.youtube.com/watch?v=${v.id}`,
          sourceKind: "user"
        };
      }
    } catch (_) {
      /* أكمل بالاستخراج */
    }
  }
  try {
    const oembed = await httpJson(
      `${config.YT_BASE}/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`,
      { retries: 1, timeoutMs: 15000 }
    );
    return {
      id: videoId,
      title: cleanText(oembed.title),
      description: "",
      publishedAt: "",
      durationS: 0,
      views: 0,
      channelId: "",
      thumbnail: oembed.thumbnail_url || "",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      sourceKind: "user"
    };
  } catch (err) {
    throw new Error(`تعذّر التحقق من الفيديو ${videoId}: ${err.message}`);
  }
}

/** يتحقق أن الفيديو ينتمي للقناة المعتمدة */
async function assertBelongsToChannel(videoId) {
  if (!config.YOUTUBE_API_KEY) return { verified: false, reason: "no_api_key" };
  const meta = await fetchVideoMeta(videoId);
  if (meta.channelId && meta.channelId !== config.CHANNEL_ID) {
    throw new Error("هذا الفيديو لا ينتمي للقناة المعتمدة");
  }
  return { verified: meta.channelId === config.CHANNEL_ID, meta };
}

module.exports = {
  listChannelVideos,
  resolveChannelId,
  fetchTranscript,
  fetchVideoMeta,
  assertBelongsToChannel,
  parseJson3,
  parseCaptionXml,
  parseDurationText,
  parseCountText,
  cleanText,
  extractBalancedJson,
  extractVarJson,
  collectByKey,
  httpText,
  httpJson,
  friendlyError,
  sleep,
  USER_AGENT
};
