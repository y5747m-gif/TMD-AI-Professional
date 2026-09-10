"use strict";

/**
 * mishkat/lib/vehand.js
 * ---------------------------------------------------------------
 * معالج Vercel (Serverless) لأداة «مشكاة».
 * يعمل على نسخة القاعدة المصدَّرة (mishkat/data/index.json) لأن بيئة
 * Vercel للقراءة فقط — أما السحب (Ingest) فيتم محليًا.
 *
 * يُستخدم عبر ملفات المسارات الصغيرة في api/ هكذا:
 *   module.exports = require("../mishkat/lib/vehand").routeHandler("ask");
 *
 * المسارات: health | config | stats | videos | video/:id | suggest
 *           ask | search | summarize | ingest | purge-demo
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

process.env.MISHKAT_STORE = process.env.MISHKAT_STORE || "json";

const config = require("./config");
const { openStore } = require("./db");
const retrieve = require("./retrieve");
const ai = require("./ai");
const arabic = require("./arabic");
const importer = require("./import");

/* ---------------- متجر البيانات (يُخزَّن بين الطلبات) ---------------- */

let store = null;

/** ملف الفهرس: المضمَّن في الحزمة أولًا، ثم البحث في المسارات المعتادة */
function loadIndexFile() {
  const candidates = [
    path.join(process.cwd(), "mishkat", "data", "index.json"),
    path.join(__dirname, "..", "data", "index.json")
  ];
  return candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch (_) {
      return false;
    }
  }) || candidates[1];
}

function getStore() {
  if (store) return store;

  // محاولة تضمين الملف في الحزمة (يُتبعها مُحزِّم Vercel تلقائيًا)
  let embedded = null;
  try {
    // مسار ثابت ليتمكن المُحزِّم من تتبعه
    embedded = require("../data/index.json");
  } catch (_) {
    embedded = null;
  }

  const file = loadIndexFile();
  store = openStore({ forceJson: true, jsonPath: file, jsonData: embedded || null });
  return store;
}

/* ---------------- أدوات الاستجابة ---------------- */

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(body);
}

function sseStart(res) {
  res.statusCode = 200;
  res.setHeader("content-type", "text/event-stream; charset=utf-8");
  res.setHeader("cache-control", "no-cache, no-transform");
  res.setHeader("connection", "keep-alive");
  res.setHeader("x-accel-buffering", "no");
  res.write(": مشكاة — بدء البث\n\n");
}

function sseSend(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (_) {
    /* انتهى الاتصال */
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    if (typeof req.body === "string") {
      try {
        return resolve(JSON.parse(req.body));
      } catch (_) {
        return resolve({});
      }
    }
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 2 * 1024 * 1024) raw = raw.slice(0, 2 * 1024 * 1024);
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

/** يستخرج اسم المسار من الطلب أو من المسار المُعاد كتابته */
function resolveRoute(req, fallback) {
  if (fallback) return fallback;
  const query = req.query || {};
  if (query.path) return String(query.path).replace(/^\/+/, "").replace(/\.js$/, "");

  const raw = String(req.url || "/api/health").split("?")[0];
  let p = raw.replace(/^\/api\/?/, "");
  p = p.replace(/^mishkat\/?/, "").replace(/\.js$/, "");
  return p || "health";
}

/* ---------------- المعالجات ---------------- */

const ADMIN_HEADER = "x-admin-token";

function tokenOk(req, body) {
  const secret = config.SERVER.adminToken;
  if (!secret) return true;
  const header = req.headers ? req.headers[ADMIN_HEADER] : "";
  const bearer =
    req.headers && String(req.headers.authorization || "").startsWith("Bearer ")
      ? String(req.headers.authorization).slice(7).trim()
      : "";
  return header === secret || bearer === secret || (body && (body.token === secret || body.adminToken === secret));
}

async function handleAsk(req, res, body) {
  const question = String(body.message || body.question || "").trim();
  const mode = ["strict", "balanced", "open"].includes(body.mode) ? body.mode : config.APP.defaultMode;
  const history = Array.isArray(body.history) ? body.history : [];
  const wantStream = body.stream !== false;

  if (!question) return sendJson(res, 400, { ok: false, error: "اكتب سؤالك أولًا." });
  if (question.length > 2000) return sendJson(res, 400, { ok: false, error: "السؤال طويل جدًا (الحد 2000 حرف)." });

  const db = getStore();
  const retrieval = retrieve.search(db, question, {});
  const provider = ai.providerInfo();
  const channelTitle = db.getMeta ? db.getMeta("channelTitle") || "" : "";

  const meta = {
    provider,
    mode,
    classification: retrieval.classification,
    intent: retrieval.intent,
    keywords: retrieval.keywords,
    coverage: retrieval.coverage,
    retrievalMode: retrieval.mode,
    counts: { sources: retrieval.results.length, docs: retrieval.docs.length }
  };

  if (!wantStream) {
    const out = await ai.answerQuestion({ question, retrieval, mode, history, channelTitle });
    return sendJson(res, 200, {
      ok: true,
      answer: out.answer,
      sources: retrieval.results,
      docs: retrieval.docs,
      meta: { ...meta, usedFallback: out.usedFallback, error: out.error || null, streamed: false }
    });
  }

  sseStart(res);
  sseSend(res, "sources", { sources: retrieval.results, docs: retrieval.docs, meta });
  try {
    const out = await ai.answerQuestion({
      question,
      retrieval,
      mode,
      history,
      channelTitle,
      onToken: (t) => sseSend(res, "token", { t })
    });
    sseSend(res, "done", {
      ok: true,
      usedFallback: out.usedFallback,
      provider: out.provider,
      error: out.error || null
    });
  } catch (err) {
    sseSend(res, "error", { ok: false, error: String(err.message || err) });
  } finally {
    res.end();
  }
}

async function handleSummarize(req, res, body) {
  const videoId = String(body.videoId || body.id || "").trim();
  if (!videoId) return sendJson(res, 400, { ok: false, error: "معرّف الفيديو مطلوب." });

  const timeline = retrieve.getVideoTimeline(getStore(), videoId);
  if (!timeline) return sendJson(res, 404, { ok: false, error: "الفيديو غير موجود في القاعدة." });
  if (!timeline.segments.length) return sendJson(res, 200, { ok: false, error: "لا يوجد نص مفهرس لهذا الفيديو." });

  if (body.stream === false) {
    const out = await ai.summarizeVideo({ video: timeline.video, segments: timeline.segments });
    return sendJson(res, 200, { ok: true, summary: out.summary, provider: out.provider, usedFallback: out.usedFallback });
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

function handleConfig(res) {
  const db = getStore();
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
      title: db.getMeta ? db.getMeta("channelTitle") || "" : ""
    },
    ai: ai.providerInfo(),
    stores: { kind: db.kind, dbPath: loadIndexFile() },
    stats: db.stats(),
    categories: arabic.CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
    adminProtected: !!config.SERVER.adminToken,
    readOnly: true
  });
}

function handleVideos(res, query) {
  const db = getStore();
  const videos = db.listVideos({
    q: query.q || "",
    limit: Math.min(Number(query.limit || 50), 300),
    offset: Number(query.offset || 0)
  });
  return sendJson(res, 200, {
    ok: true,
    videos,
    total: db.stats().videos,
    channel: { id: config.CHANNEL_ID, url: config.CHANNEL_URL, title: db.getMeta("channelTitle") || "" }
  });
}

/* ---------------- الموجّه ---------------- */

/**
 * ينشئ معالج Vercel (req, res).
 * @param {string} [forcedRoute] المسار الثابت لهذا الملف (مثل "ask")
 */
function createVercelHandler(forcedRoute) {
  return async function handler(req, res) {
    const route = resolveRoute(req, forcedRoute);
    const query = Object.assign({}, req.query || {});
    delete query.path;

    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "content-type, x-admin-token, authorization");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }

    try {
      if (route === "health") {
        const db = getStore();
        return sendJson(res, 200, {
          ok: true,
          service: "مشكاة — Mishkat (Vercel)",
          store: db.kind,
          segments: db.stats().segments,
          time: new Date().toISOString()
        });
      }

      if (route === "config") return handleConfig(res);

      if (route === "stats") {
        const db = getStore();
        return sendJson(res, 200, { ok: true, ...retrieve.readiness(db), readOnly: true });
      }

      if (route === "videos") return handleVideos(res, query);

      if (route === "video" || route.startsWith("video/")) {
        const db = getStore();
        let videoId = route.slice("video".length).replace(/^\/+/, "");
        if (!videoId) videoId = query.id || query.videoId || "";
        videoId = decodeURIComponent(String(videoId));
        if (!videoId) return sendJson(res, 400, { ok: false, error: "معرّف الفيديو مطلوب." });
        const data = query.q
          ? retrieve.searchInVideo(db, videoId, query.q, 200)
          : retrieve.getVideoTimeline(db, videoId);
        if (!data) return sendJson(res, 404, { ok: false, error: "الفيديو غير موجود في القاعدة." });
        return sendJson(res, 200, { ok: true, ...data });
      }

      if (route === "suggest") {
        const tokens = query.q ? arabic.keywordsOf(query.q, 3) : ["الصلاة", "الزكاة", "الحديث"];
        const suggestions = tokens.flatMap((t) => [
          `ما حكم ${t} بالتحديد وما أدلته من القناة؟`,
          `ما أقوال أهل العلم في ${t} وما الراجح؟`
        ]);
        return sendJson(res, 200, { ok: true, suggestions: suggestions.slice(0, 6) });
      }

      if (route === "search") {
        if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "استخدم POST." });
        const body = await readBody(req);
        const q = String(body.query || body.message || "").trim();
        if (!q) return sendJson(res, 400, { ok: false, error: "أدخل كلمات البحث." });
        const retrieval = retrieve.search(getStore(), q, { topK: Number(body.topK || 12) });
        return sendJson(res, 200, {
          ok: true,
          results: retrieval.results,
          docs: retrieval.docs,
          meta: { classification: retrieval.classification, coverage: retrieval.coverage, mode: retrieval.mode }
        });
      }

      if (route === "ask") {
        if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "استخدم POST." });
        return handleAsk(req, res, await readBody(req));
      }

      if (route === "summarize") {
        if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "استخدم POST." });
        return handleSummarize(req, res, await readBody(req));
      }

      if (route === "missing") {
        return sendJson(res, 200, { ok: true, ...importer.missingTranscripts(getStore(), { limit: Number(query.limit || 200) }) });
      }

      if (route === "import") {
        // النسخة المنشورة للقراءة فقط: لا يمكن تعديل البيانات على Vercel
        return sendJson(res, 501, {
          ok: false,
          readOnly: true,
          error:
            "إدخال النصوص يعمل محليًا: افتح الفيديو ثم «＋ أضف نصًا» على http://localhost:3000، " +
            "أو استخدم node mishkat/cli.js import، ثم انسخ mishkat/data/index.json وأعد النشر."
        });
      }

      if (route === "ingest" || route === "purge-demo") {
        const body = await readBody(req);
        if (!tokenOk(req, body)) {
          return sendJson(res, 401, { ok: false, error: "هذه العملية تتطلب كلمة مرور المدير." });
        }
        return sendJson(res, 501, {
          ok: false,
          readOnly: true,
          error:
            "سحب النصوص يعمل محليًا فقط (npm run ingest). ثم انسخ mishkat/data/index.json وأعد النشر على Vercel."
        });
      }

      return sendJson(res, 404, { ok: false, error: `مسار غير معروف: ${route}` });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: String(err.message || err) });
    }
  };
}

/** معالج مثبَّت على مسار واحد — تستخدمه ملفات api/*.js */
function routeHandler(route) {
  return createVercelHandler(route);
}

module.exports = { createVercelHandler, routeHandler, getStore, loadIndexFile };
