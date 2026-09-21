"use strict";

/**
 * mishkat/server.js
 * ---------------------------------------------------------------
 * خادم أداة «مشكاة» (النسخة الجديدة):
 *   • يقدّم الواجهة من mishkat/public.
 *   • واجهة API مشتركة عبر mishkat/lib/routes.js:
 *       ردود من موقع إسلام ويب + روابط الفيديوهات المتعلقة بالسؤال.
 *   • لا سحب من يوتيوب، ولا تخزين لنصوص الفيديوهات إطلاقًا.
 *
 * التشغيل: node mishkat/server.js   أو   npm start
 * ---------------------------------------------------------------
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const config = require("./lib/config");
const routes = require("./lib/routes");
const videosLib = require("./lib/videos");

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
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json"
};

/* ==============================================================
 *  الملفات الثابتة
 * ============================================================== */

const ROUTES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/app.js": "app.js",
  "/style.css": "style.css",
  "/favicon.ico": "favicon.ico"
};

function serveStatic(req, res, pathname) {
  const publicDir = config.SERVER.publicDir;
  const relative = ROUTES[pathname] || pathname.replace(/^\/+/, "");
  const target = path.resolve(publicDir, relative);

  if (!target.startsWith(publicDir)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("ممنوع");
    return true;
  }

  let stat = null;
  try {
    stat = fs.statSync(target);
  } catch (_) {
    stat = null;
  }

  if (!stat || !stat.isFile()) {
    if (pathname === "/" || ROUTES[pathname]) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("ملف الواجهة غير موجود");
      return true;
    }
    return false;
  }

  const ext = path.extname(target).toLowerCase();
  const headers = {
    "content-type": MIME[ext] || "application/octet-stream",
    "cache-control": ext === ".html" ? "no-cache" : "public, max-age=300",
    "content-length": stat.size,
    "x-content-type-options": "nosniff"
  };
  res.writeHead(200, headers);
  if (String(req.method).toUpperCase() === "HEAD") {
    res.end();
    return true;
  }
  fs.createReadStream(target).pipe(res);
  return true;
}

/* ==============================================================
 *  الخادم
 * ============================================================== */

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  } catch (_) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("طلب غير صالح");
    return;
  }

  res.setHeader("x-powered-by", `mishkat/${routes.VERSION}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await routes.handle(req, res, url);
      if (!handled) routes.sendJson(res, 404, { ok: false, error: "مسار غير معروف" });
      return;
    }

    if (url.pathname === "/videos.json") {
      const catalog = videosLib.readCatalog();
      routes.sendJson(res, 200, {
        ...catalog,
        note: catalog.note || "لائحة روابط الفيديوهات فقط — بلا نصوص."
      });
      return;
    }

    if (serveStatic(req, res, url.pathname)) return;

    // صفحة غير موجودة → أعِد الواجهة (تطبيق أحادي الصفحة)
    if (!path.extname(url.pathname)) {
      if (serveStatic(req, res, "/")) return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("غير موجود");
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    }
    res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
  }
});

function start() {
  const { port, host } = config.SERVER;
  videosLib.ensureCatalogFile();
  server.listen(port, host, () => {
    const stats = videosLib.stats();
    const lines = [
      "",
      `  ${config.APP.name} — ${config.APP.tagline}`,
      "  ------------------------------------------------",
      `  الواجهة:      http://localhost:${port}`,
      `  مصدر الردود:  ${config.ISLAMWEB.base} (${config.ISLAMWEB.enabled ? "مُفعَّل" : "معطّل"})`,
      `  الفيديوهات:   ${stats.total} رابط${stats.total ? "" : " — أضِف روابط بالأمر: npm run video:add -- --url <رابط>"}`,
      `  المحرك الذكي: ${require("./lib/ai").providerInfo().label}`,
      "  (لا تُخزَّن نصوص الفيديوهات — روابط فقط)",
      ""
    ];
    console.log(lines.join("\n"));
  });
}

if (require.main === module) start();

module.exports = { server, start };
