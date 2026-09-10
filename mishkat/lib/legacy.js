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

const RELOAD_HINT = "أعد تحميل الصفحة لتظهر واجهة «مشكاة» الجديدة (Ctrl + F5 أو Cmd + Shift + R).";
const UPGRADE_MESSAGE =
  `تم تحديث الأداة إلى «مشكاة» ✨ — أداة جديدة تجيب من نصوص قناة يوتيوب المعتمدة مع التوثيق بالتوقيت والرابط.\n\n` +
  `${RELOAD_HINT}\n\n` +
  `القناة المصدر: ${config.CHANNEL_URL}`;

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
    // تُتجاهل آليًا بعد إعادة تحميل الصفحة؛ وجودها يمنع شاشة الخطأ فقط
    settings: {
      siteName: config.APP.name,
      siteDescription: config.APP.tagline,
      developerName: config.APP.developer || "",
      showWelcome: true,
      showSuggestions: true,
      enableImageTools: false,
      suggestions: [
        { title: "سؤال فقهي", icon: "⚖️", prompt: "ما حكم صلاة الجماعة وما أدلتها؟" },
        { title: "سؤال عن الحديث", icon: "📜", prompt: "ما الفرق بين الصحيح والحسن؟" },
        { title: "سؤال عن الزكاة", icon: "🪙", prompt: "ما مقدار زكاة الفطر ووقتها؟" }
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
      error: `المسار /api/${name} أُزيل في النسخة الجديدة «مشكاة». ${RELOAD_HINT}`
    });
  };
}

module.exports = { chatShim, settingsShim, retiredShim, UPGRADE_MESSAGE, RELOAD_HINT };
