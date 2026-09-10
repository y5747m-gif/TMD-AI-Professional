"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mishkat-server-"));
process.env.MISHKAT_DATA_DIR = TMP;
process.env.MISHKAT_DB_PATH = path.join(TMP, "server.db");
process.env.MISHKAT_JSON_INDEX = path.join(TMP, "index.json");
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.MISHKAT_LLM_API_KEY;
process.env.MISHKAT_ADMIN_TOKEN = "test-secret";

const { server, store } = require("../server");
const { seedDemo } = require("../lib/demo");

let base = "";

test.before(async () => {
  seedDemo(store);
  // فيديو حقيقي (غير تجريبي) للتحقق من بناء روابط التوقيت
  store.upsertVideo({
    id: "realVid01",
    title: "درس حقيقي للاختبار — أحكام الصيام",
    publishedAt: "2025-05-01T00:00:00.000Z",
    durationS: 600,
    url: "https://www.youtube.com/watch?v=realVid01",
    sourceKind: "channel",
    hasTranscript: true,
    transcriptLang: "ar",
    segmentsCount: 2,
    chars: 200
  });
  store.addSegments("realVid01", [
    { idx: 0, startMs: 12000, endMs: 30000, text: "الصيام يجب على المسلم البالغ العاقل القادر" },
    { idx: 1, startMs: 40000, endMs: 60000, text: "ويبطل الصيام بالأكل والشرب عمدًا مع العلم والاختيار" }
  ]);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  try {
    store.close();
  } catch (_) {}
});

test("GET /api/health يرجّع حالة سليمة", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.segments > 0);
});

test("GET /api/config يعرض اسم الأداة والقناة", async () => {
  const data = await (await fetch(`${base}/api/config`)).json();
  assert.equal(data.ok, true);
  assert.equal(data.app.name, "مشكاة");
  assert.equal(data.channel.id, "UCv0g_v1C6JcZALvrkDu98AQ");
  assert.ok(Array.isArray(data.categories));
  assert.equal(typeof data.ai.enabled, "boolean");
});

test("GET / يعرض واجهة «مشكاة»", async () => {
  const res = await fetch(`${base}/`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.ok(html.includes("مشكاة"));
  assert.ok(html.includes("app.js"));
});

test("GET /style.css و/app.js يُخدمان بنوع صحيح", async () => {
  const css = await fetch(`${base}/style.css`);
  assert.ok(String(css.headers.get("content-type")).includes("text/css"));
  const js = await fetch(`${base}/app.js`);
  assert.ok(String(js.headers.get("content-type")).includes("javascript"));
});

test("حماية المسارات: منع الخروج من مجلد الواجهة", async () => {
  const res = await fetch(`${base}/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd`);
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.ok, false);
});

test("POST /api/search يرجّع نصوصًا مع روابط", async () => {
  const res = await fetch(`${base}/api/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "زكاة الفطر" })
  });
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.results.length > 0);
  assert.ok(data.results[0].link.startsWith("https://www.youtube.com/"));
  assert.ok(typeof data.results[0].time === "string" && data.results[0].time.length >= 4);
});

test("POST /api/ask بدون بث يرجّع إجابة وهيكلًا ومصادر", async () => {
  const res = await fetch(`${base}/api/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "ما حكم صلاة الجماعة؟", stream: false, mode: "balanced" })
  });
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.answer.includes("## الخلاصة"));
  assert.ok(data.sources.length > 0);
  assert.ok(data.sources[0].link.startsWith("https://www.youtube.com/"));

  // البحث عن نص الفيديو الحقيقي يعطي رابطًا بتوقيت
  const real = await (
    await fetch(`${base}/api/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "ما الذي يبطل الصيام؟" })
    })
  ).json();
  const realHit = real.results.find((r) => r.videoId === "realVid01");
  assert.ok(realHit, "يجب أن يظهر الفيديو الحقيقي في النتائج");
  assert.ok(realHit.link.includes("&t="), `الرابط يجب أن يحمل توقيتًا: ${realHit.link}`);
  assert.equal(realHit.time, "00:40");
  assert.equal(data.meta.provider.enabled, false);
});

test("POST /api/ask ببث يرسل أحداث SSE كاملة", async () => {
  const res = await fetch(`${base}/api/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "ما الفرق بين الصحيح والحسن من الحديث؟", stream: true })
  });
  assert.ok(String(res.headers.get("content-type")).includes("text/event-stream"));
  const text = await res.text();
  assert.ok(text.includes("event: sources"));
  assert.ok(text.includes("event: token"));
  assert.ok(text.includes("event: done"));
});

test("POST /api/ask يرفض سؤالًا فارغًا", async () => {
  const res = await fetch(`${base}/api/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "   " })
  });
  assert.equal(res.status, 400);
});

test("GET /api/videos و/api/video/:id يعملان", async () => {
  const list = await (await fetch(`${base}/api/videos?limit=10`)).json();
  assert.ok(list.videos.length > 0);
  const id = list.videos[0].id;
  const one = await (await fetch(`${base}/api/video/${id}`)).json();
  assert.equal(one.ok, true);
  assert.ok(one.segments.length > 0);
  const missing = await fetch(`${base}/api/video/does-not-exist`);
  assert.equal(missing.status, 404);
});

test("POST /api/summarize يلخّص فيديو (محرك استخراجي)", async () => {
  const list = await (await fetch(`${base}/api/videos?limit=1`)).json();
  const id = list.videos[0].id;
  const data = await (
    await fetch(`${base}/api/summarize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId: id, stream: false })
    })
  ).json();
  assert.equal(data.ok, true);
  assert.ok(data.summary.length > 50);
});

test("التغذية تتطلب كلمة مرور المدير", async () => {
  const res = await fetch(`${base}/api/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit: 1, stream: false })
  });
  assert.equal(res.status, 401);
});

test("حذف البيانات التجريبية يعمل مع كلمة المرور", async () => {
  const res = await fetch(`${base}/api/purge-demo`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": "test-secret" },
    body: JSON.stringify({})
  });
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.removed >= 4);
  const after = await (await fetch(`${base}/api/stats`)).json();
  assert.equal(after.stats.demoVideos, 0);
});

test("مسار API غير معروف يرجّع 404 بصيغة JSON", async () => {
  const res = await fetch(`${base}/api/unknown-endpoint`);
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.ok, false);
});

test("الطلب بـ OPTIONS يرجّع 204 (CORS)", async () => {
  const res = await fetch(`${base}/api/ask`, { method: "OPTIONS" });
  assert.equal(res.status, 204);
});
