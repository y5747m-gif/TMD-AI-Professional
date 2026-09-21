"use strict";

/**
 * mishkat/lib/routes.js
 * ---------------------------------------------------------------
 * موجّه واجهة API المشترك بين خادم Node المحلي (mishkat/server.js)
 * ودالة Vercel (api/index.js عبر mishkat/lib/vehand.js).
 *
 * المسارات:
 *   GET  /api/health      حالة الخدمة
 *   GET  /api/config      إعدادات الواجهة والمحرك
 *   GET  /api/stats       إحصاءات اللائحة والذاكرة المؤقتة
 *   GET  /api/diagnose    فحص شامل (probe=1 لفحص الوصول إلى إسلام ويب)
 *   POST /api/ask         سؤال → ردّ من إسلام ويب + روابط فيديوهات (SSE أو JSON)
 *   POST /api/search      بحث بلا صياغة
 *   GET  /api/suggest     اقتراحات أسئلة
 *   GET  /api/videos      لائحة الفيديوهات (عنوان + رابط)
 *   POST /api/videos      إضافة فيديو (يتطلب رمز الإدارة إن كان مضبوطًا)
 *   DELETE /api/videos    حذف فيديو (يتطلب رمز الإدارة إن كان مضبوطًا)
 *   GET  /api/video?id=   بيانات فيديو واحد (بلا أي نصوص)
 *   GET  /api/chat        توافق النسخة القديمة
 *   GET  /api/settings    توافق النسخة القديمة
 * ---------------------------------------------------------------
 */

const config = require("./config");
const answerLib = require("./answer");
const islamweb = require("./islamweb");
const videosLib = require("./videos");
const ai = require("./ai");
const legacy = require("./legacy");

const VERSION = "2.0.0";

/* ==============================================================
 *  أدوات الطلب والاستجابة
 * ============================================================== */

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": contentType, "cache-control": "no-store" });
  res.end(text);
}

function readBody(req, limitBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("حجم الطلب كبير جدًا"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
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

function rateLimited(key, max = 40, windowMs = 60000) {
  const now = Date.now();
  const entry = rate.get(key) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + windowMs;
  }
  entry.count += 1;
  rate.set(key, entry);
  return entry.count > max;
}

if (typeof setInterval === "function") {
  const cleaner = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rate) if (now > entry.reset) rate.delete(key);
  }, 120000);
  if (cleaner.unref) cleaner.unref();
}

function clientKey(req) {
  return (
    (req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"])) ||
    (req.socket && req.socket.remoteAddress) ||
    "unknown"
  ).toString().split(",")[0];
}

/* ---------- صلاحية الإدارة ---------- */

function isAdmin(req, url) {
  if (!config.SERVER.adminToken) return true; // بلا رمز: مفتوح للتشغيل المحلي
  const header = (req.headers && (req.headers["x-admin-token"] || req.headers["authorization"])) || "";
  const token = String(header).replace(/^Bearer\s+/i, "");
  const query = url.searchParams.get("token") || "";
  return token === config.SERVER.adminToken || query === config.SERVER.adminToken;
}

/* ==============================================================
 *  المعالجات
 * ============================================================== */

const SUGGESTIONS = [
  "ما حكم صلاة الجماعة؟",
  "زكاة الفطر: مقدارها ووقتها",
  "حكم ترك صيام رمضان بلا عذر",
  "أحكام اليمين والكفارة",
  "ما يفسد الصلاة وما لا يفسدها",
  "آداب الدعاء وأوقات الإجابة",
  "حقوق الزوجة في الإسلام",
  "حكم التعامل بالربا والقروض",
  "أحكام الطهارة والوضوء",
  "فضل صلة الرحم وبر الوالدين",
  "أحكام الصيام في السفر والمرض",
  "حكم الغيبة والنميمة والتوبة منها"
];

function handleHealth(res) {
  const videoStats = videosLib.stats();
  sendJson(res, 200, {
    ok: true,
    name: config.APP.name,
    version: VERSION,
    ready: config.ISLAMWEB.enabled,
    islamweb: {
      enabled: config.ISLAMWEB.enabled,
      mode: config.ISLAMWEB.mode,
      base: config.ISLAMWEB.base,
      readerFallback: config.ISLAMWEB.useReaderFallback
    },
    ai: ai.providerInfo(),
    videos: { total: videoStats.total, withTags: videoStats.withTags },
    answersFrom: "islamweb.net",
    storesTranscripts: false
  });
}

function handleConfig(res) {
  const stats = videosLib.stats();
  sendJson(res, 200, {
    ok: true,
    app: {
      name: config.APP.name,
      tagline: config.APP.tagline,
      defaultMode: config.APP.defaultMode,
      developer: config.APP.developer,
      version: VERSION,
      islamwebHome: config.APP.islamwebHome
    },
    channel: { id: config.CHANNEL_ID, url: config.CHANNEL_URL, title: stats.channel.title || "" },
    islamweb: {
      enabled: config.ISLAMWEB.enabled,
      mode: config.ISLAMWEB.mode,
      sections: config.ISLAMWEB.sections,
      topK: config.ISLAMWEB.topK,
      fullDocs: config.ISLAMWEB.fullDocs
    },
    ai: ai.providerInfo(),
    videos: { total: stats.total, withTags: stats.withTags, linkOnly: true },
    modes: [
      { id: "composed", label: "مُصاغ ومنظّم", hint: "نقل نصّ الجواب وتنظيمه بالذكاء الاصطناعي (إن توفّر مفتاح)" },
      { id: "sources", label: "منقول كما هو", hint: "عرض نصّ الجواب من إسلام ويب بلا أي صياغة" }
    ],
    suggestions: SUGGESTIONS
  });
}

function handleStats(res) {
  const stats = videosLib.stats();
  sendJson(res, 200, {
    ok: true,
    videos: stats,
    islamwebCache: islamweb.cacheStats(),
    ai: ai.providerInfo(),
    answersFrom: "islamweb.net",
    transcripts: { stored: false, note: "لا تُخزَّن نصوص الفيديوهات ولا تُعرض — روابط فقط." }
  });
}

async function handleDiagnose(res, url) {
  const checks = [];
  const add = (name, level, detail = "") => checks.push({ name, level, detail });

  add("إصدار Node.js", "ok", process.version);
  add(
    "بيئة Vercel",
    process.env.VERCEL ? "ok" : "warn",
    process.env.VERCEL
      ? `النشر: ${process.env.VERCEL_ENV || "unknown"} — ${process.env.VERCEL_GIT_COMMIT_REF || "—"}`
      : "ليست بيئة Vercel (تشغيل محلي)"
  );

  const videoStats = videosLib.stats();
  add(
    "لائحة الفيديوهات",
    videoStats.total ? "ok" : "warn",
    videoStats.total
      ? `${videoStats.total} رابط فيديو (${videoStats.withTags} موسوم) — ${videoStats.file}`
      : "اللائحة فارغة: أضِف روابط الفيديوهات بالأمر npm run video:add أو من لوحة الإدارة."
  );

  add(
    "مصدر الردود",
    config.ISLAMWEB.enabled ? "ok" : "warn",
    config.ISLAMWEB.enabled
      ? `إسلام ويب — الوضع: ${config.ISLAMWEB.mode}${config.ISLAMWEB.useReaderFallback ? " + قارئ احتياطي" : ""}`
      : "موصّل إسلام ويب مُعطَّل (ISLAMWEB_ENABLED=false)"
  );

  const provider = ai.providerInfo();
  add(
    "محرك الذكاء الاصطناعي",
    provider.enabled ? "ok" : "warn",
    provider.enabled
      ? `${provider.label} — ${provider.model}`
      : "لا يوجد مفتاح: الأداة تعمل بالمحرك الناقل (نقل نصّ الجواب كما هو)."
  );

  add("حفظ النصوص", "ok", "لا تُخزَّن نصوص الفيديوهات ولا تفريغاتها؛ الروابط فقط.");

  if (url.searchParams.get("probe") === "1") {
    const probe = await islamweb.selfTest();
    add("الاتصال بإسلام ويب", probe.level, probe.detail);
  } else {
    add(
      "الاتصال بإسلام ويب",
      "warn",
      "لم يُفحص بعد (أضف ?probe=1 لفحص الاتصال الفعلي بموقع إسلام ويب)."
    );
  }

  const order = { fail: 0, warn: 1, ok: 2 };
  const worst = checks.reduce((acc, c) => (order[c.level] < order[acc] ? c.level : acc), "ok");
  const summary =
    worst === "ok"
      ? "الوضع سليم: الأداة تجيب من موقع إسلام ويب وتعرض روابط الفيديوهات."
      : worst === "warn"
        ? "الأداة تعمل مع بعض التنبيهات المذكورة أعلاه."
        : "هناك مشكلة تمنع العمل، راجع الفحوص أعلاه.";

  sendJson(res, 200, { ok: worst !== "fail", summary, worst, checks, version: VERSION });
}

async function handleAsk(req, res, url, body) {
  const payload = body || (await readBody(req));
  const question = String(payload.question || payload.message || payload.q || "").trim();
  if (!question) return sendJson(res, 400, { ok: false, error: "الرجاء كتابة السؤال." });
  if (question.length > 2000) return sendJson(res, 400, { ok: false, error: "السؤال طويل جدًا." });

  const wantsStream = payload.stream !== false && String(req.headers.accept || "").includes("text/event-stream");
  const mode = answerLib.normalizeMode(payload.mode);
  const history = Array.isArray(payload.history) ? payload.history.slice(-6) : [];

  if (rateLimited(clientKey(req))) {
    return sendJson(res, 429, { ok: false, error: "طلبات كثيرة جدًا، انتظر قليلًا ثم أعد المحاولة." });
  }

  if (!wantsStream) {
    const result = await answerLib.answer({ question, mode, history });
    return sendJson(res, 200, { ok: true, ...result });
  }

  sseStart(res);
  try {
    const result = await answerLib.answer({
      question,
      mode,
      history,
      onMeta: (meta) => sseSend(res, "meta", meta),
      onToken: (token) => sseSend(res, "token", { text: token })
    });
    sseSend(res, "done", {
      ok: true,
      provider: result.provider,
      usedFallback: result.usedFallback,
      error: result.error,
      mode: result.mode,
      sources: result.sources,
      videos: result.videos,
      notes: result.notes,
      islamweb: result.islamweb,
      timing: result.timing
    });
    res.end();
  } catch (err) {
    sseSend(res, "error", { ok: false, error: String(err.message || err) });
    res.end();
  }
}

async function handleSearch(req, res, url, body) {
  const payload = body || (await readBody(req));
  const query = String(payload.query || payload.q || url.searchParams.get("q") || "").trim();
  if (!query) return sendJson(res, 400, { ok: false, error: "اكتب كلمات البحث." });
  const limit = Number(payload.limit || url.searchParams.get("limit") || config.ISLAMWEB.topK);
  const result = await answerLib.search(query, { limit, videosLimit: config.VIDEOS.topK });
  sendJson(res, 200, { ok: true, ...result });
}

function handleSuggest(res, url) {
  const q = String(url.searchParams.get("q") || "").trim();
  const items = q
    ? SUGGESTIONS.filter((s) => s.includes(q)).slice(0, 6)
    : SUGGESTIONS.slice(0, 6);
  sendJson(res, 200, { ok: true, suggestions: items.length ? items : SUGGESTIONS.slice(0, 6) });
}

function handleVideos(res, url) {
  const q = String(url.searchParams.get("q") || "").trim();
  const limit = Number(url.searchParams.get("limit") || 0);
  const offset = Number(url.searchParams.get("offset") || 0);
  const result = videosLib.list({ q, limit, offset });
  sendJson(res, 200, {
    ok: true,
    videos: result.items,
    total: result.total,
    channel: result.channel,
    linkOnly: true
  });
}

async function handleVideoAdd(req, res, url, body) {
  if (!isAdmin(req, url)) {
    return sendJson(res, 401, { ok: false, error: "يتطلب رمز الإدارة (MISHKAT_ADMIN_TOKEN)." });
  }
  const payload = body || (await readBody(req));

  // استيراد جماعي: نصّ لائحة أو مصفوفة عناصر (مع دعم الاستبدال الكامل)
  if (Array.isArray(payload.items) || typeof payload.text === "string") {
    try {
      const result = videosLib.importList(
        Array.isArray(payload.items) ? JSON.stringify({ videos: payload.items }) : payload.text,
        { replace: !!payload.replace, tags: payload.tags || [] }
      );
      return sendJson(res, 200, { ok: true, imported: true, ...result });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: String(err.message || err) });
    }
  }

  const ref = String(payload.url || payload.id || "").trim();
  if (!ref) return sendJson(res, 400, { ok: false, error: "ألصق رابط الفيديو أو معرّفه." });
  try {
    const result = await videosLib.add({
      url: ref,
      id: payload.id || "",
      title: payload.title || "",
      description: payload.description || "",
      tags: payload.tags || [],
      publishedAt: payload.publishedAt || ""
    });
    sendJson(res, 200, { ok: true, ...result });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err.message || err) });
  }
}

function handleVideoRemove(req, res, url, body) {
  if (!isAdmin(req, url)) {
    return sendJson(res, 401, { ok: false, error: "يتطلب رمز الإدارة (MISHKAT_ADMIN_TOKEN)." });
  }
  const payload = body || {};
  const target = String(payload.id || payload.url || url.searchParams.get("id") || "").trim();
  if (!target) return sendJson(res, 400, { ok: false, error: "حدّد الفيديو (id) للحذف." });
  try {
    const result = videosLib.remove(target);
    sendJson(res, 200, { ok: true, ...result });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err.message || err) });
  }
}

function handleVideoOne(res, url) {
  const id = String(url.searchParams.get("id") || "").trim();
  if (!id) return sendJson(res, 400, { ok: false, error: "حدّد معرّف الفيديو (?id=)" });
  const video = videosLib.get(id);
  if (!video) return sendJson(res, 404, { ok: false, error: "الفيديو غير موجود في اللائحة." });
  sendJson(res, 200, {
    ok: true,
    video,
    note: "تُعرض بيانات الفيديو ورابطه فقط — لا تُخزَّن نصوص الفيديوهات داخل الأداة."
  });
}

/* ==============================================================
 *  الموجّه
 * ============================================================== */

const RETIRED = [
  "image",
  "upload",
  "owner-login",
  "owner-logout",
  "references-search",
  "islamweb-search",
  "sharia-search",
  "sharia-classify",
  "sharia-summary",
  "ingest",
  "import",
  "missing",
  "purge-demo",
  "summarize",
  "seed-demo",
  "export"
];

/**
 * يعالج طلب API.
 * @returns {Promise<boolean>} هل عُولج الطلب؟
 */
async function handle(req, res, url) {
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const method = String(req.method || "GET").toUpperCase();

  if (pathname === "/api/health") {
    handleHealth(res);
    return true;
  }
  if (pathname === "/api/config" && method === "GET") {
    handleConfig(res);
    return true;
  }
  if (pathname === "/api/stats" && method === "GET") {
    handleStats(res);
    return true;
  }
  if (pathname === "/api/diagnose" && method === "GET") {
    await handleDiagnose(res, url);
    return true;
  }
  if (pathname === "/api/suggest" && method === "GET") {
    handleSuggest(res, url);
    return true;
  }
  if (pathname === "/api/ask" && method === "POST") {
    await handleAsk(req, res, url);
    return true;
  }
  if (pathname === "/api/search" && (method === "POST" || method === "GET")) {
    await handleSearch(req, res, url);
    return true;
  }
  if (pathname === "/api/videos" && method === "GET") {
    handleVideos(res, url);
    return true;
  }
  if (pathname === "/api/videos" && method === "POST") {
    await handleVideoAdd(req, res, url);
    return true;
  }
  if (pathname === "/api/videos" && (method === "DELETE" || method === "PATCH")) {
    await handleVideoRemove(req, res, url, await readBody(req).catch(() => ({})));
    return true;
  }
  if (pathname === "/api/video" && method === "GET") {
    handleVideoOne(res, url);
    return true;
  }
  if (pathname === "/api/cache/clear" && (method === "POST" || method === "DELETE")) {
    if (!isAdmin(req, url)) {
      return sendJson(res, 401, { ok: false, error: "يتطلب رمز الإدارة (MISHKAT_ADMIN_TOKEN)." });
    }
    const cleared = islamweb.cacheClearAll();
    return sendJson(res, 200, {
      ok: true,
      cleared,
      message: `تم تفريغ الذاكرة المؤقتة (${cleared.memory} في الذاكرة، ${cleared.files} ملفًا).`
    });
  }

  if (pathname === "/api/chat") {
    legacy.chatShim(req, res);
    return true;
  }
  if (pathname === "/api/settings" && method === "GET") {
    legacy.settingsShim(req, res);
    return true;
  }

  const retired = RETIRED.find((name) => pathname === `/api/${name}`);
  if (retired) {
    legacy.retiredShim(retired)(req, res);
    return true;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(res, 404, {
      ok: false,
      error: `المسار غير موجود: ${pathname}`,
      availableRoutes: [
        "/api/health",
        "/api/config",
        "/api/stats",
        "/api/diagnose",
        "/api/ask",
        "/api/search",
        "/api/videos",
        "/api/video?id=",
        "/api/suggest",
        "/api/cache/clear"
      ]
    });
    return true;
  }

  return false;
}

module.exports = {
  handle,
  sendJson,
  sendText,
  readBody,
  sseStart,
  sseSend,
  VERSION,
  SUGGESTIONS
};
