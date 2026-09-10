#!/usr/bin/env node
"use strict";

/**
 * مشغّل الاختبارات — يعمل على كل الأنظمة دون الاعتماد على توسيع الصدفة (glob).
 * الاستخدام: npm test
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "test");
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".test.js"))
  .sort()
  .map((f) => path.join(dir, f));

if (!files.length) {
  console.error("لا توجد ملفات اختبار في mishkat/test");
  process.exit(1);
}

console.log(`تشغيل ${files.length} ملف اختبار…\n`);
const res = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  env: { ...process.env, MISHKAT_DEBUG: "" }
});

process.exit(res.status == null ? 1 : res.status);
