"use strict";

/**
 * api/health.js — مسار Vercel لأداة «مشكاة».
 * المنطق الكامل في mishkat/lib/vehand.js (نسخة قراءة فقط تعمل على mishkat/data/index.json).
 */

module.exports = require("../mishkat/lib/vehand").routeHandler("health");
