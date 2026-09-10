"use strict";

/**
 * api/index.js — نقطة الدخول الوحيدة لدوال Vercel (Serverless Function واحدة).
 * ---------------------------------------------------------------
 * لماذا دالة واحدة؟
 *   خطة Vercel المجانية (Hobby) تسمح بـ 12 دالة Serverless لكل نشر فقط.
 *   كان المشروع يحتوي 21 ملفًا داخل api/ ⟹ يفشل النشر بخطأ:
 *   "No more than 12 Serverless Functions can be added to a Deployment on the
 *    Hobby plan" ⟹ يبقى الموقع يعرض النسخة القديمة (وهي سبب خطأ HTTP 500).
 *
 * كيف تعمل؟
 *   vercel.json يعيد كتابة كل مسارات /api/* إلى هذه الدالة:
 *     { "source": "/api/(.*)", "destination": "/api/index?path=$1" }
 *   فتصبح /api/ask?x=1 ⟶ /api/index?path=ask&x=1 (مع بقاء بقية المعاملات)،
 *   وهنا نُعيد بناء المسار الأصلي ثم نُسلّمه للموجّه في mishkat/lib/vehand.js.
 *
 * ملاحظات:
 *   • CommonJS فقط: صيغة ESM داخل مشروع بلا "type": "module" تُسقط الدالة عند
 *     التحميل وتُنتج خطأ 500 غامضًا — وهذا ما حدث في النسخة القديمة.
 *   • لا مفاتيح سرية هنا، ولا تُكتب أي قيمة سرية في السجلات.
 * ---------------------------------------------------------------
 */

const { createVercelHandler } = require("../mishkat/lib/vehand");

const handle = createVercelHandler(null);

/**
 * يستعيد المسار الأصلي من المعامل path الذي أضافته إعادة الكتابة،
 * ويضمن وصول كل معاملات الطلب (q, id, limit, ...) إلى المعالجات.
 */
function restore(req) {
  const raw = String(req.url || "/api");
  const qi = raw.indexOf("?");
  const params = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : "");

  const route = (params.get("path") || "").replace(/^\/+/, "");
  params.delete("path");

  if (!route) {
    // لا توجد إعادة كتابة (طلب مباشر إلى /api أو /api/index) ⟹ نُبقي المسار كما هو
    return req;
  }

  const rest = params.toString();
  req.url = `/api/${route}${rest ? `?${rest}` : ""}`;

  // نُدمج المعاملات المستخرجة من الرابط مع req.query التي تُنشئها المنصة،
  // حتى تعمل المسارات التي تقرأ الاستعلام (video?id=، suggest?q=، videos?limit=).
  const query = req.query && typeof req.query === "object" ? req.query : {};
  for (const [key, value] of params.entries()) {
    if (query[key] === undefined) query[key] = value;
  }
  delete query.path;
  req.query = query;

  return req;
}

module.exports = (req, res) => handle(restore(req), res);
