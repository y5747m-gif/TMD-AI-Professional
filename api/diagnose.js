"use strict";

/**
 * api/diagnose.js — فحص تشغيل النسخة المنشورة (Vercel).
 * يُرجع قائمة فحوص بصيغة JSON لتشخيص أي مشكلة في النشر بسرعة.
 */

module.exports = require("../mishkat/lib/vehand").routeHandler("diagnose");
