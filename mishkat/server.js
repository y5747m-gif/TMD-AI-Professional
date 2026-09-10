"use strict";

/**
 * mishkat/server.js
 * ---------------------------------------------------------------
 * خادم أداة «مشكاة»:
 *   - يقدّم الواجهة (mishkat/public)
 *   - مسارات API: السؤال، البحث، الفيديوهات، الإحصاءات، التغذية (Ingest)
 *   - بثّ مباشر (SSE) للإجابات وخطوات التغذية
 * ---------------------------------------------------------------
 * التشغيل: node mishkat/server.js   أو   npm start
 * ---------------------------------------------------------------
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const config = require("./lib/config");
const { openStore } = require("./lib/db");
const retrieve = require("./lib/retrieve");
const ai = require("./lib/ai");
const { ingestChannel, ingestOneVideo } = require("./lib/ingest");
const youtube = require("./lib/youtube");

const store = openStore();

/* ==============================================================
 *  أدوات مساعدة
 * ============================================================== */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readBody(req, limitBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error("حجم الطلب كبير جدًا"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        resolve({ _raw: raw });
      }
    });
    req.on("error", reject);
  });
}

/* ---------- بث SSE ---------- */

function sseStart(res) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
  res.write(": مشكاة — بدء البث\n\n");
}

function sseSend(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (_) {
    /* العميل أغلق الاتصال */
  }
}

/* ---------- تحديد المعدل ---------- */

const rate = new Map();
function rateLimited(key, max = 60, windowMs = 60000) {
  const now = Date.now();
  const entry = rate.get(key) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + windowMs;
  }
  entry.count++;
  rate.set(key, entry);
  return entry.count > max;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rate) if (now > v.reset + 60000) rate.delete(k);
}, 120000).unref();

/* ---------- تحقق صلاحية المدير ---------- */

function isAdmin(req, body) {
  const token = config.SERVER.adminToken;
  if (!token) return true; // غير مضبوط => مفتوح (مع تسجيل تحذير)
  const header =
    req.headers["x-admin-token"] ||
    (String(req.headers.authorization || "").startsWith("Bearer ")
      ? String(req.headers.authorization).slice(7).trim()
      : "");
  const fromBody = body && (body.token || body.adminToken);
  return header === token || fromBody === token;
}

/* ==============================================================
 *  المسارات
 * ============================================================== */

async function handleAsk(req, res) {
  const body = await readBody(req);
  const question = String(body.message || body.question || "").trim();
  const mode = ["strict", "balanced", "open"].includes(body.mode) ? body.mode : config.APP.defaultMode;
  const useAi = body.useAi !== false;
  const history = Array.isArray(body.history) ? body.history : [];
  const wantStream = body.stream !== false;

  if (!question) return sendJson(res, 400, { ok: false, error: "اكتب سؤالك أولًا." });
  if (question.length > 2000)
    return sendJson(res, 400, { ok: false, error: "السؤال طويل جدًا (الحد 2000 حرف)." });

  const ip = req.socket.remoteAddress || "unknown";
  if (rateLimited(`ask:${ip}`, 60, 60000)) {
    return sendJson(res, 429, { ok: false, error: "عدد الطلبات كبير. انتظر قليلًا ثم أعد المحاولة." });
  }

  const retrieval = retrieve.search(store, question, {});
  try {
    store.saveQuery(question);
  } catch (_) {
    /* اختياري */
  }

  const channelTitle = store.getMeta ? store.getMeta("channelTitle") || "" : "";
  const provider = ai.providerInfo();
  const meta = {
    provider: provider.enabled && useAi ? provider : { ...provider, enabled: false, label: "المحرك الاستخراجي" },
    mode,
    classification: retrieval.classification,
    intent: retrieval.intent,
    keywords: retrieval.keywords,
    coverage: retrieval.coverage,
    retrievalMode: retrieval.mode,
    counts: { sources: retrieval.results.length, docs: retrieval.docs.length }
  };

  if (!wantStream) {
    const result = await ai.answerQuestion({
      question,
      retrieval,
      mode,
      history,
      channelTitle: useAi ? channelTitle : channelTitle,
      signal: undefined
    });
    return sendJson(res, 200, {
      ok: true,
      answer: result.answer,
      sources: retrieval.results,
      docs: retrieval.docs,
      meta: { ...meta, usedFallback: result.usedFallback, error: result.error || null, streamed: false }
    });
  }

  sseStart(res);
  sseSend(res, "sources", { sources: retrieval.results, docs: retrieval.docs, meta });

  let answer = "";
  try {
    const result = await ai.answerQuestion({
      question,
      retrieval,
      mode,
      history,
      channelTitle,
      onToken: (t) => {
        answer += t;
        sseSend(res, "token", { t });
      },
      signal: undefined
    });
    answer = result.answer || answer;
    sseSend(res, "done", {
      ok: true,
      usedFallback: result.usedFallback,
      provider: result.provider,
      error: result.error || null,
      chars: answer.length
    });
  } catch (err) {
    sseSend(res, "error", { ok: false, error: String(err.message || err) });
  } finally {
    res.end();
  }
}

async function handleSearch(req, res) {
  const body = await readBody(req);
  const question = String(body.query || body.message || "").trim();
  if (!question) return sendJson(res, 400, { ok: false, error: "أدخل كلمات البحث." });
  const retrieval = retrieve.search(store, question, {
    topK: Number(body.topK || 12)
  });
  return sendJson(res, 200, {
    ok: true,
    results: retrieval.results,
    docs: retrieval.docs,
    meta: {
      classification: retrieval.classification,
      intent: retrieval.intent,
      coverage: retrieval.coverage,
      mode: retrieval.mode
    }
  });
}

async function handleVideos(req, res, url) {
  const q = url.searchParams.get("q") || "";
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 500);
  const offset = Number(url.searchParams.get("offset") || 0);
  const videos = store.listVideos({ q, limit, offset });
  return sendJson(res, 200, {
    ok: true,
    videos,
    total: store.stats().videos,
    channel: {
      id: config.CHANNEL_ID,
      url: config.CHANNEL_URL,
      title: store.getMeta ? store.getMeta("channelTitle") || "" : ""
    }
  });
}

async function handleVideo(req, res, videoId, url) {
  const q = url.searchParams.get("q") || "";
  const data = q
    ? retrieve.searchInVideo(store, videoId, q, 200)
    : retrieve.getVideoTimeline(store, videoId);
  if (!data) return sendJson(res, 404, { ok: false, error: "الفيديو غير موجود في القاعدة." });
  return sendJson(res, 200, { ok: true, ...data });
}

async function handleIngest(req, res) {
  const body = await readBody(req);
  if (!isAdmin(req, body)) {
    return sendJson(res, 401, { ok: false, error: "التغذية تتطلب كلمة مرور المدير (MISHKAT_ADMIN_TOKEN)." });
  }

  const limit = Number(body.limit || 0);
  const force = !!body.force;
  const videoId = body.videoId ? String(body.videoId).trim() : "";
  const wantStream = body.stream !== false;

  const run = async (onProgress) => {
    if (videoId) {
      const meta = await youtube.fetchVideoMeta(videoId).catch(() => null);
      const result = await ingestOneVideo(store, videoId, { force: true, meta, onProgress });
      store.setMeta("updatedAt", new Date().toISOString());
      try {
        store.exportJsonIndex();
      } catch (_) {
        /* اختياري */
      }
      const done = {
        listed: 1,
        ok: result.status === "ok" ? 1 : 0,
        skipped: result.status === "skipped" ? 1 : 0,
        failed: result.status === "failed" ? 1 : 0,
        chunks: result.chunks || 0,
        chars: result.chars || 0,
        failures: result.status === "failed" ? [{ id: videoId, reason: result.reason }] : []
      };
      onProgress({ phase: "done", summary: done });
      return done;
    }
    return ingestChannel(store, {
      max: limit,
      force,
      onProgress
    });
  };

  if (!wantStream) {
    const summary = await run(() => {});
    return sendJson(res, 200, { ok: true, summary });
  }

  sseStart(res);
  try {
    const summary = await run((p) => {
      if (p.phase === "video" && !p.message) return;
      sseSend(res, "progress", p);
    });
    sseSend(res, "done", { ok: true, summary });
  } catch (err) {
    sseSend(res, "error", { ok: false, error: String(err.message || err) });
  } finally {
    res.end();
  }
}

async function handleSummarize(req, res) {
  const body = await readBody(req);
  const videoId = String(body.videoId || body.id || "").trim();
  if (!videoId) return sendJson(res, 400, { ok: false, error: "معرّف الفيديو مطلوب." });

  const timeline = retrieve.getVideoTimeline(store, videoId);
  if (!timeline) return sendJson(res, 404, { ok: false, error: "الفيديو غير موجود في القاعدة." });
  if (!timeline.segments.length)
    return sendJson(res, 200, { ok: false, error: "لا يوجد نص مفهرس لهذا الفيديو." });

  const wantStream = body.stream !== false;
  if (!wantStream) {
    const out = await ai.summarizeVideo({ video: timeline.video, segments: timeline.segments });
    return sendJson(res, 200, {
      ok: true,
      summary: out.summary,
      provider: out.provider,
      usedFallback: out.usedFallback
    });
  }

  sseStart(res);
  try {
    const out = await ai.summarizeVideo({
      video: timeline.video,
      segments: timeline.segments,
      onToken: (t) => sseSend(res, "token", { t })
    });
    sseSend(res, "done", { ok: true, provider: out.provider, usedFallback: out.usedFallback, error: out.error || null });
  } catch (err) {
    sseSend(res, "error", { ok: false, error: String(err.message || err) });
  } finally {
    res.end();
  }
}

async function handlePurgeDemo(req, res) {
  const body = await readBody(req);
  if (!isAdmin(req, body)) {
    return sendJson(res, 401, { ok: false, error: "هذه العملية تتطلب كلمة مرور المدير." });
  }
  const removed = store.deleteDemoData();
  try {
    store.exportJsonIndex();
  } catch (_) {
    /* اختياري */
  }
  return sendJson(res, 200, { ok: true, removed });
}

function handleConfig(res) {
  const provider = ai.providerInfo();
  const stats = store.stats();
  return sendJson(res, 200, {
    ok: true,
    app: {
      name: config.APP.name,
      tagline: config.APP.tagline,
      developer: config.APP.developer,
      defaultMode: config.APP.defaultMode
    },
    channel: {
      id: config.CHANNEL_ID,
      url: config.CHANNEL_URL,
      title: store.getMeta ? store.getMeta("channelTitle") || "" : ""
    },
    ai: provider,
    stores: {
      kind: store.kind,
      dbPath: config.DB_PATH
    },
    stats,
    categories: require("./lib/arabic").CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
    adminProtected: !!config.SERVER.adminToken
  });
}

function handleStats(res) {
  const readiness = retrieve.readiness(store);
  return sendJson(res, 200, {
    ok: true,
    ...readiness,
    topQueries: store.topQueries ? store.topQueries(8) : [],
    logs: store.getLogs ? store.getLogs(10) : []
  });
}

function handleSuggest(req, res, url) {
  const q = url.searchParams.get("q") || "";
  const tokens = q ? require("./lib/arabic").keywordsOf(q, 3) : [];
  const base = tokens.length ? tokens : ["الصلاة", "الزكاة", "الحديث"];
  const suggestions = [];
  for (const t of base) {
    suggestions.push(`ما حكم ${t} بالتحديد وما أدلته من القناة؟`);
    suggestions.push(`ما أقوال أهل العلم في ${t} وما الراجح؟`);
  }
  return sendJson(res, 200, { ok: true, suggestions: suggestions.slice(0, 6) });
}

/* ==============================================================
 *  خدمة الملفات الثابتة
 * ============================================================== */

function serveStatic(req, res, urlPath) {
  const publicDir = config.SERVER.publicDir;
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/" || rel === "") rel = "/index.html";

  const filePath = path.normalize(path.join(publicDir, rel));
  if (!filePath.startsWith(publicDir)) {
    return sendJson(res, 403, { ok: false, error: "مسار غير مسموح" });
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // دعم SPA: أعد index.html للطلبات غير المعروفة
    const indexFile = path.join(publicDir, "index.html");
    if (fs.existsSync(indexFile) && !rel.includes(".")) {
      return sendFile(res, indexFile);
    }
    return sendJson(res, 404, { ok: false, error: "غير موجود" });
  }
  return sendFile(res, filePath);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    "content-type": MIME[ext] || "application/octet-stream",
    "content-length": stat.size,
    "cache-control": ext === ".html" ? "no-store" : "public, max-age=300"
  });
  fs.createReadStream(filePath).pipe(res);
}

/* ==============================================================
 *  الخادم
 * ============================================================== */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  // رؤوس CORS (للسماح باستخدام الواجهة من نطاقات أخرى إن لزم)
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type, authorization, x-admin-token");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  try {
    if (pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "مشكاة — Mishkat",
        status: "healthy",
        store: store.kind,
        segments: store.stats().segments,
        time: new Date().toISOString()
      });
    }

    if (pathname === "/api/config" && req.method === "GET") return handleConfig(res);
    if (pathname === "/api/stats" && req.method === "GET") return handleStats(res);
    if (pathname === "/api/suggest" && req.method === "GET") return handleSuggest(req, res, url);

    if (pathname === "/api/ask" && req.method === "POST") {
      const ip = req.socket.remoteAddress || "unknown";
      if (rateLimited(`ip:${ip}`, 180, 60000)) {
        return sendJson(res, 429, { ok: false, error: "طلبات كثيرة جدًا." });
      }
      return handleAsk(req, res);
    }

    if (pathname === "/api/search" && req.method === "POST") return handleSearch(req, res);
    if (pathname === "/api/videos" && req.method === "GET") return handleVideos(req, res, url);

    if (pathname === "/api/video" && req.method === "GET") {
      // الصيغة الموحّدة (تعمل محليًا وعلى Vercel): /api/video?id=VIDEO_ID
      const videoId = decodeURIComponent(url.searchParams.get("id") || url.searchParams.get("v") || "");
      if (!videoId) return sendJson(res, 400, { ok: false, error: "معرّف الفيديو مطلوب (id)." });
      return handleVideo(req, res, videoId, url);
    }

    if (pathname.startsWith("/api/video/") && req.method === "GET") {
      const videoId = decodeURIComponent(pathname.replace("/api/video/", ""));
      return handleVideo(req, res, videoId, url);
    }

    if (pathname === "/api/ingest" && req.method === "POST") return handleIngest(req, res);
    if (pathname === "/api/summarize" && req.method === "POST") return handleSummarize(req, res);
    if (pathname === "/api/purge-demo" && req.method === "POST") return handlePurgeDemo(req, res);

    if (pathname.startsWith("/api/")) {
      return sendJson(res, 404, { ok: false, error: "مسار API غير معروف" });
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendJson(res, 405, { ok: false, error: "طريقة غير مسموحة" });
    }

    return serveStatic(req, res, pathname);
  } catch (err) {
    const message = String(err.message || err);
    try {
      store.logEvent("error", "server", message);
    } catch (_) {
      /* تجاهل */
    }
    return sendJson(res, 500, { ok: false, error: message });
  }
});

server.requestTimeout = 0;
server.headersTimeout = 65000;

function start() {
  const { port, host } = config.SERVER;
  server.listen(port, host, () => {
    const stats = store.stats();
    const provider = ai.providerInfo();
    /* eslint-disable no-console */
    console.log("──────────────────────────────────────────────");
    console.log(`  ${config.APP.name} — ${config.APP.tagline}`);
    console.log(`  الواجهة:      http://localhost:${port}`);
    console.log(`  القناة:       ${config.CHANNEL_URL}`);
    console.log(`  قاعدة البيانات: ${store.kind} — ${stats.videos} فيديو / ${stats.segments} مقطع`);
    console.log(`  محرك الذكاء:  ${provider.enabled ? `${provider.label} (${provider.model})` : "استخراجي (بدون مفتاح API)"}`);
    if (!stats.segments) console.log("  تنبيه: القاعدة فارغة — شغّل: npm run ingest");
    if (!config.SERVER.adminToken && process.env.NODE_ENV === "production")
      console.log("  تحذير: MISHKAT_ADMIN_TOKEN غير مضبوط — نقاط التغذية مفتوحة.");
    console.log("──────────────────────────────────────────────");
  });
}

function shutdown() {
  console.log("\nإيقاف «مشكاة»…");
  try {
    store.close();
  } catch (_) {
    /* تجاهل */
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (require.main === module) start();

module.exports = { server, start, store };
