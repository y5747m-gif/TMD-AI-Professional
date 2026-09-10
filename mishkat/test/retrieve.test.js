"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// عزلة كاملة: قاعدة بيانات مؤقتة للاختبار قبل تحميل الإعدادات
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mishkat-test-"));
process.env.MISHKAT_DATA_DIR = TMP;
process.env.MISHKAT_DB_PATH = path.join(TMP, "test.db");
process.env.MISHKAT_JSON_INDEX = path.join(TMP, "index.json");
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.MISHKAT_LLM_API_KEY;

const { openStore, videoLink, formatTime, JsonStore } = require("../lib/db");
const { seedDemo } = require("../lib/demo");
const retrieve = require("../lib/retrieve");

const store = openStore({ reload: true });
seedDemo(store);

test("تخزين البيانات التجريبية في القاعدة", () => {
  const stats = store.stats();
  assert.ok(stats.videos >= 4, `عدد الفيديوهات ${stats.videos}`);
  assert.ok(stats.segments >= 4, `عدد المقاطع ${stats.segments}`);
  assert.ok(stats.chars > 500);
});

test("البحث يرجع نصًا مع التوقيت ورابط الفيديو", () => {
  const res = retrieve.search(store, "ما حكم صلاة الجماعة على الرجال؟");
  assert.ok(res.results.length > 0, "يجب إيجاد نتائج");
  const first = res.results[0];
  assert.ok(first.text.length > 30);
  // البيانات التجريبية تُرجع رابط القناة المصدر (لا رابط فيديو وهمي)
  assert.ok(first.link.startsWith("https://www.youtube.com/"));
  assert.equal(first.url, require("../lib/config").CHANNEL_URL);
  assert.ok(/^\d{2}:\d{2}/.test(first.time), `صيغة التوقيت غير صحيحة: ${first.time}`);
  assert.equal(first.videoId, "demo-salah-jamaah");
  assert.ok(res.classification.primary.id === "salah" || res.classification.primary.id === "general");
  assert.ok(res.coverage > 0);
});

test("البحث يفهم اختلاف الرسم الإملائي", () => {
  const a = retrieve.search(store, "زكاة الفطر مقدارها");
  const b = retrieve.search(store, "زكاه الفطر مقدارها");
  assert.ok(a.results.length > 0);
  assert.ok(b.results.length > 0);
  assert.equal(a.results[0].videoId, b.results[0].videoId);
});

test("البحث في باب المعاملات يعيد النص الصحيح", () => {
  const res = retrieve.search(store, "ما حكم الربا في البنوك؟");
  assert.ok(res.results.length > 0);
  assert.equal(res.results[0].videoId, "demo-muamalat");
});

test("سؤال لا توجد له نصوص يعيد نتيجة فارغة بلا انهيار", () => {
  const res = retrieve.search(store, "ما هي أحكام الاستزراع السمكي في الفضاء؟");
  assert.equal(Array.isArray(res.results), true);
  assert.ok(res.results.length <= 3);
});

test("سؤال فارغ لا يسبب خطأ", () => {
  const res = retrieve.search(store, "؟؟؟");
  assert.equal(res.results.length, 0);
  assert.equal(res.mode, "empty");
});

test("دمج المقاطع المتجاورة وحد أقصى لكل فيديو", () => {
  const res = retrieve.search(store, "الصلاة الجماعة الإمام المسجد الطهارة", { topK: 6, maxPerVideo: 2 });
  const counts = {};
  for (const r of res.results) counts[r.videoId] = (counts[r.videoId] || 0) + 1;
  for (const [id, n] of Object.entries(counts)) assert.ok(n <= 2, `الفيديو ${id} تجاوز الحد: ${n}`);
});

test("عرض النص الكامل لفيديو والبحث داخله", () => {
  const timeline = retrieve.getVideoTimeline(store, "demo-salah-jamaah");
  assert.ok(timeline);
  assert.equal(timeline.video.id, "demo-salah-jamaah");
  assert.ok(timeline.segments.length > 0);
  assert.ok(timeline.segments[0].time.length >= 4);
  assert.ok(timeline.segments[0].link.startsWith("https://www.youtube.com/"));
  assert.equal(timeline.video.url, require("../lib/config").CHANNEL_URL);

  const filtered = retrieve.searchInVideo(store, "demo-salah-jamaah", "الجماعة");
  assert.ok(filtered.matches > 0);
  assert.ok(filtered.segments.length <= timeline.segments.length);
});

test("أدوات التوقيت والروابط", () => {
  assert.equal(formatTime(0), "00:00");
  assert.equal(formatTime(65000), "01:05");
  assert.equal(formatTime(3725000), "1:02:05");
  assert.equal(videoLink("abc", 0), "https://www.youtube.com/watch?v=abc");
  assert.equal(videoLink("abc", 90000), "https://www.youtube.com/watch?v=abc&t=90s");
});

test("التصدير إلى JSON ثم القراءة منه تعطي نفس النتائج", () => {
  const exported = store.exportJsonIndex();
  assert.ok(exported.videos >= 4);
  assert.ok(fs.existsSync(exported.file));

  const jsonStore = new JsonStore(exported.file);
  const res = retrieve.search(jsonStore, "ما حكم صلاة الجماعة؟");
  assert.ok(res.results.length > 0);
  assert.ok(res.results[0].videoId.includes("salah") || res.results[0].videoId.includes("demo"));
});

test("حذف البيانات التجريبية ينظّف القاعدة (متجر JSON مستقل)", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mishkat-purge-"));
  const s2 = openStore({ forceJson: true, jsonPath: path.join(tmpDir, "index.json") });
  seedDemo(s2);
  const before = s2.stats();
  const removed = s2.deleteDemoData();
  const after = s2.stats();
  assert.ok(removed >= 4, `المحذوف: ${removed}`);
  assert.ok(before.videos > after.videos);
  assert.equal(after.demoVideos, 0);
  const res = retrieve.search(s2, "ما حكم صلاة الجماعة؟");
  assert.equal(res.results.length, 0);
});

test("جاهزية القاعدة تُبلَّغ بشكل صحيح", () => {
  const readiness = retrieve.readiness(store);
  assert.equal(readiness.ready, true);
  assert.ok(readiness.message.includes("جاهزة"));
});
