"use strict";

/**
 * api/mishkat.js
 * ---------------------------------------------------------------
 * مسار Vercel لأداة «مشكاة».
 * يعمل على نسخة قاعدة البيانات المصدَّرة إلى JSON (mishkat/data/index.json)
 * لأن بيئة Vercel للقراءة فقط — أما السحب (Ingest) فيتم محليًا.
 *
 * مسارات مدعومة:
 *   GET  /api/health
 *   GET  /api/config
 *   GET  /api/stats
 *   GET  /api/videos?q=&limit=
 *   GET  /api/video/:id?q=
 *   GET  /api/suggest?q=
 *   POST /api/ask        { message, mode, history, stream }
 *   POST /api/search     { query }
 *   POST /api/summarize  { videoId }
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

process.env.MISHKAT_STORE = process.env.MISHKAT_STORE || "json";

const config = require("../mishkat/lib/config");
const { openStore } = require("../mishkat/lib/db");
const retrieve = require("../mishkat/lib/retrieve");
const ai = require("../mishkat/lib/ai");
const arabic = require("../mishkat/lib/arabic");

/* ---------------- متجر البيانات (يُخزَّن بين الطلبات) ---------------- */

let store = null;

function indexFilePath() {
  const candidates = [
    path.join(process.cwd(), "mishkat", "data", "index.json"),
    path.join(__dirname, "..", "mishkat", "data", "index.json")
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function getStore() {
  if (!store) {
    store = openStore({ forceJson: true, jsonPath: indexFilePath() });
  }
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

function routeFrom(req) {
  const raw = String(req.url || "/api/health").split("?")[0];
  let p = raw.replace(/^\/api\/?/, "");
  p = p.replace(/^mishkat\/?/, "");
  return p || "health";
}

/* ---------------- المعالجات ---------------- */

async function handleAsk(req, res, body) {
  const question = String(body.message || body.question || "").trim();
  const mode = ["strict", "balanced", "open"].includes(body.mode) ? body.mode : config.APP.defaultMode;
  const history = Array.isArray(body.history) ? body.history : [];
  const wantStream = body.stream !== false;

  if (!question) return sendJson(res, 400, { ok: false, error: "اكتب سؤالك أولًا." });
  if (question.length > 2000) return sendJson(res, 400, { ok: false, error: "السؤال طويل جدًا." });

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
  const videoId = String(body.videoId || "").trim();
  if (!videoId) return sendJson(res, 400, { ok: false, error: "معرّف الفيديو مطلوب." });
  const timeline = retrieve.getVideoTimeline(getStore(), videoId);
  if (!timeline) return sendJson(res, 404, { ok: false, error: "الفيديو غير موجود في القاعدة." });

  if (body.stream === false) {
    const out = await ai.summarizeVideo({ video: timeline.video, segments: timeline.segments });
    return sendJson(res, 200, { ok: true, summary: out.summary, provider: out.provider });
  }

  sseStart(res);
  try {
    const out = await ai.summarizeVideo({
      video: timeline.video,
      segments: timeline.segments,
      onToken: (t) => sseSend(res, "token", { t })
    });
    sseSend(res, "done", { ok: true, provider: out.provider, usedFallback: out.usedFallback });
  } catch (err) {
    sseSend(res, "error", { ok: false, error: String(err.message || err) });
  } finally {
    res.end();
  }
}

/* ---------------- الموجّه ---------------- */

module.exports = async function handler(req, res) {
  const route = routeFrom(req);
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type, x-admin-token, authorization");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  try {
    const db = getStore();
    const query = Object.assign({}, req.query || {});
    delete query.path;

    if (route === "health") {
      return sendJson(res, 200, {
        ok: true,
        service: "مشكاة — Mishkat (Vercel)",
        store: db.kind,
        segments: db.stats().segments,
        time: new Date().toISOString()
      });
    }

    if (route === "config") {
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
          title: db.getMeta("channelTitle") || ""
        },
        ai: ai.providerInfo(),
        stores: { kind: db.kind, dbPath: indexFilePath() },
        stats: db.stats(),
        categories: arabic.CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
        adminProtected: true,
        readOnly: true
      });
    }

    if (route === "stats") {
      return sendJson(res, 200, { ok: true, ...retrieve.readiness(db), readOnly: true });
    }

    if (route === "videos") {
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

    if (route.startsWith("video/")) {
      const videoId = decodeURIComponent(route.slice("video/".length));
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

    if (route === "search" && req.method === "POST") {
      const body = await readBody(req);
      const q = String(body.query || "").trim();
      if (!q) return sendJson(res, 400, { ok: false, error: "أدخل كلمات البحث." });
      const retrieval = retrieve.search(db, q, { topK: Number(body.topK || 12) });
      return sendJson(res, 200, {
        ok: true,
        results: retrieval.results,
        docs: retrieval.docs,
        meta: { classification: retrieval.classification, coverage: retrieval.coverage, mode: retrieval.mode }
      });
    }

    if (route === "ask" && req.method === "POST") {
      return handleAsk(req, res, await readBody(req));
    }

    if (route === "summarize" && req.method === "POST") {
      return handleSummarize(req, res, await readBody(req));
    }

    if (route === "ingest" || route === "purge-demo") {
      return sendJson(res, 501, {
        ok: false,
        error:
          "سحب النصوص يعمل محليًا فقط (npm run ingest). على Vercel انسخ ملف mishkat/data/index.json بعد السحب ثم أعد النشر.",
        readOnly: true
      });
    }

    return sendJson(res, 404, { ok: false, error: `مسار غير معروف: ${route}` });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: String(err.message || err) });
  }
};
