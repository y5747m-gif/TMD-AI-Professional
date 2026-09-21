"use strict";

/**
 * mishkat/lib/legacy.js
 * ---------------------------------------------------------------
 * طبقة توافق للمسارات القديمة (T.M.D AI v1).
 *
 * لماذا؟ بعض المتصفحات تحتفظ بنسخة قديمة من الواجهة (app.js) في الذاكرة
 * المؤقتة، فتستدعي مسارات لم تعد موجودة مثل /api/chat. بدل أن تتلقى
 * انهيارًا غامضًا (HTTP 500)، تُعيد هذه الطبقة رسالة عربية واضحة
 * تطلب إعادة تحميل الصفحة — ويُوجَّه المستخدم إلى الواجهة الجديدة.
 *
 * ملاحظة مهمة: سبب خطأ 500 في النسخة القديمة كان ملف api/chat.js يستخدم
 * صيغة ESM (export default) داخل مشروع CommonJS، فينهار عند التحميل
 * وتُعيد المنصة 500 غير JSON. هذه الملفات كلها CommonJS بحت.
 * ---------------------------------------------------------------
 */

const config = require("./config");

const RELOAD_HINT = "أعد تحميل الصفحة لتظهر الواجهة الجديدة (Ctrl + F5 أو Cmd + Shift + R).";
const UPGRADE_MESSAGE =
  `تم تحديث الأداة ✨ — النسخة الجديدة تجيب بـ«ردود موقع إسلام ويب» مع توثيق رقم الفتوى ورابطها، ` +
  `وتعرض روابط الفيديوهات المتعلقة بالسؤال — بلا أي نسخ كامل لنصوص الفيديوهات.\n\n` +
  `${RELOAD_HINT}\n\n` +
  `مصدر الردود: ${config.APP.islamwebHome}`;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(body);
}

/** /api/chat القديم: نُعيد رسالة واضحة بصيغة يفهمها العميل القديم */
function chatShim(req, res) {
  return sendJson(res, 200, {
    ok: true,
    upgraded: true,
    message: UPGRADE_MESSAGE,
    sources: [],
    error: null
  });
}

/** /api/settings القديم: إعدادات بسيطة حتى تُفتح الواجهة القديمة بلا انهيار */
function settingsShim(req, res) {
  return sendJson(res, 200, {
    ok: true,
    upgraded: true,
    settings: {
      siteName: config.APP.name,
      siteDescription: config.APP.tagline,
      developerName: config.APP.developer || "",
      showWelcome: true,
      showSuggestions: true,
      enableImageTools: false,
      suggestions: [
        { title: "سؤال فقهي", icon: "⚖️", prompt: "ما حكم صلاة الجماعة؟" },
        { title: "سؤال عن الزكاة", icon: "🪙", prompt: "ما مقدار زكاة الفطر ووقتها؟" },
        { title: "آداب وأخلاق", icon: "🌿", prompt: "ما حكم الغيبة والتوبة منها؟" }
      ]
    }
  });
}

/** بقية المسارات القديمة: رسالة واضحة بدل 500 */
function retiredShim(name) {
  return function handler(req, res) {
    return sendJson(res, 200, {
      ok: false,
      upgraded: true,
      error: `المسار /api/${name} أُزيل في النسخة الجديدة. ${RELOAD_HINT}`
    });
  };
}

module.exports = { chatShim, settingsShim, retiredShim, UPGRADE_MESSAGE, RELOAD_HINT };
