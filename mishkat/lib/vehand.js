"use strict";

/**
 * mishkat/lib/vehand.js
 * ---------------------------------------------------------------
 * معالج Vercel (Serverless) لأداة «مشكاة».
 *
 * يعتمد على الطبقة المشتركة mishkat/lib/routes.js نفسها التي يعتمد عليها
 * الخادم المحلي، فلا يختلف السلوك بين البيئتين.
 *
 * ملاحظات بيئة Vercel:
 *   • نظام الملفات للقراءة فقط: لا تُكتب لائحة الفيديوهات ولا الذاكرة المؤقتة،
 *     فتُتجاهل الكتابة بصمت وتعمل الأداة من الملف المضمَّن في الحزمة.
 *   • مدة الدالة محدودة (maxDuration في vercel.json)، ولذلك مهل الجلب مضبوطة.
 * ---------------------------------------------------------------
 */

const routes = require("./routes");
const config = require("./config");
const videosLib = require("./videos");

/** يبني كائن URL من طلب Vercel */
function requestUrl(req) {
  const raw = String(req.url || "/api");
  try {
    return new URL(raw, "http://vercel.local");
  } catch (_) {
    return new URL("/api/health", "http://vercel.local");
  }
}

/**
 * يعالج طلبًا (Node-style) ويُرجع استجابة.
 */
async function handle(req, res) {
  const url = requestUrl(req);

  // ملف اللائحة للقراءة فقط على Vercel — نتأكد أن القراءة تنجح بلا كتابة
  if (url.pathname.startsWith("/api/")) {
    const handled = await routes.handle(req, res, url);
    if (!handled) {
      routes.sendJson(res, 404, {
        ok: false,
        error: `المسار غير موجود: ${url.pathname}`,
        hint: "المسارات المتاحة: /api/health /api/config /api/stats /api/ask /api/search /api/videos"
      });
    }
    return res;
  }

  if (url.pathname === "/api") {
    routes.sendJson(res, 200, {
      ok: true,
      name: config.APP.name,
      version: routes.VERSION,
      message: "واجهة مشكاة تعمل. استخدم /api/health أو الواجهة الرسومية."
    });
    return res;
  }

  routes.sendJson(res, 404, { ok: false, error: "not_found", path: url.pathname });
  return res;
}

/** مُنشئ المعالج لدالة Vercel الواحدة */
function createVercelHandler() {
  return async function vercelHandler(req, res) {
    try {
      videosLib.ensureCatalogFile();
    } catch (_) {
      /* بيئة للقراءة فقط */
    }
    try {
      await handle(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json; charset=utf-8");
      }
      res.end(
        JSON.stringify({
          ok: false,
          error: String((err && err.message) || err),
          hint: "حدث خطأ في الخادم — راجع /api/diagnose للتشخيص."
        })
      );
    }
  };
}

module.exports = { handle, createVercelHandler, requestUrl };
