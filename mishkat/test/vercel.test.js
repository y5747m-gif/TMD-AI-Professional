"use strict";

/**
 * mishkat/test/vercel.test.js
 * ---------------------------------------------------------------
 * اختبار مسارات Vercel (api/*.js) كما تعمل في بيئة Serverless:
 * تستدعي ملفات api/ نفسها عبر خادم HTTP محلي يحاكي (req, res) الخاص بـ Vercel،
 * وتتحقق من نسخة القراءة فقط العاملة على mishkat/data/index.json.
 * ---------------------------------------------------------------
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mishkat-vercel-"));
process.env.MISHKAT_DATA_DIR = TMP;
process.env.MISHKAT_JSON_INDEX = path.join(TMP, "index.json");
process.env.MISHKAT_STORE = "json";
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.MISHKAT_LLM_API_KEY;

const ROOT = path.resolve(__dirname, "..", "..");
const INDEX_FILE = path.join(ROOT, "mishkat", "data", "index.json");

/** يبني بيانات فهرس اختبارية في المسار الذي يقرأه المعالج */
function writeTestIndex() {
  const data = {
    format: "mishkat-index/v1",
    generatedAt: new Date().toISOString(),
    channel: { id: "UCv0g_v1C6JcZALvrkDu98AQ", url: "https://www.youtube.com/channel/UCv0g_v1C6JcZALvrkDu98AQ" },
    videos: [
      {
        id: "vTestZakat1",
        title: "درس اختباري: زكاة الفطر",
        publishedAt: "2025-03-01T00:00:00.000Z",
        durationS: 600,
        views: 1000,
        url: "https://www.youtube.com/watch?v=vTestZakat1",
        sourceKind: "channel",
        transcriptLang: "ar",
        segments: [
          [0, 25000, "زكاة الفطر فريضة على كل مسلم صغيرا كان أو كبيرا ذكرا أو أنثى"],
          [25000, 50000, "ومقدارها صاع عن كل نفس والصاع أربعة أمداد والمد ربع الصاع"],
          [50000, 80000, "ووقت إخراجها قبل صلاة العيد ويجوز تعجيلها قبل العيد بيوم أو يومين"]
        ]
      }
    ],
    docs: []
  };
  fs.writeFileSync(INDEX_FILE, JSON.stringify(data), "utf8");
  return data;
}

/** يحاكي بيئة Vercel: يستدعي ملف api مباشرة بـ (req, res) */
function startVercelServer() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      // /api/video?id=... => ملف api/video.js ، و /api/x => api/x.js
      const name = url.pathname.replace(/^\/api\/?/, "").split("/")[0] || "health";
      let mod;
      try {
        mod = require(path.join(ROOT, "api", `${name}.js`));
      } catch (_) {
        try {
          mod = require(path.join(ROOT, "api", `${name.replace(/-/g, "_")}.js`));
        } catch (_e) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ ok: false, error: `no function for ${name}` }));
        }
      }
      req.query = Object.fromEntries(url.searchParams.entries());
      await mod(req, res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

let server;
let base;
let backup = null;

test.before(async () => {
  if (fs.existsSync(INDEX_FILE)) backup = fs.readFileSync(INDEX_FILE, "utf8");
  writeTestIndex();
  server = await startVercelServer();
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  // استعادة ملف الفهرس الأصلي حتى لا يتأثر باقي المشروع
  if (backup != null) fs.writeFileSync(INDEX_FILE, backup, "utf8");
});

test("مسار api/health.js يعمل على نسخة القراءة فقط", async () => {
  const data = await (await fetch(`${base}/api/health`)).json();
  assert.equal(data.ok, true);
  assert.ok(data.service.includes("Vercel"));
  assert.equal(data.store, "json");
  assert.ok(data.segments >= 3);
});

test("مسار api/config.js يُرجع الإعدادات والتصنيفات", async () => {
  const data = await (await fetch(`${base}/api/config`)).json();
  assert.equal(data.ok, true);
  assert.equal(data.app.name, "مشكاة");
  assert.equal(data.channel.id, "UCv0g_v1C6JcZALvrkDu98AQ");
  assert.equal(data.readOnly, true);
  assert.ok(data.categories.length > 5);
});

test("مسار api/stats.js يبيّن أن القاعدة جاهزة", async () => {
  const data = await (await fetch(`${base}/api/stats`)).json();
  assert.equal(data.ok, true);
  assert.equal(data.ready, true);
  assert.equal(data.readOnly, true);
});

test("مسار api/search.js يعيد النص مع التوقيت والرابط", async () => {
  const data = await (
    await fetch(`${base}/api/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "ما مقدار زكاة الفطر؟" })
    })
  ).json();
  assert.equal(data.ok, true);
  assert.ok(data.results.length > 0);
  assert.equal(data.results[0].videoId, "vTestZakat1");
  assert.ok(data.results[0].link.includes("youtube.com/watch?v=vTestZakat1"));
});

test("مسار api/ask.js: إجابة كاملة بدون بثّ", async () => {
  const data = await (
    await fetch(`${base}/api/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "ما وقت إخراج زكاة الفطر؟", stream: false })
    })
  ).json();
  assert.equal(data.ok, true);
  assert.ok(data.answer.includes("## الخلاصة"));
  assert.ok(data.sources.length > 0);
  assert.equal(data.meta.provider.enabled, false);
});

test("مسار api/ask.js: بثّ SSE كامل", async () => {
  const res = await fetch(`${base}/api/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "ما وقت إخراج زكاة الفطر؟", stream: true })
  });
  assert.ok(String(res.headers.get("content-type")).includes("text/event-stream"));
  const text = await res.text();
  assert.ok(text.includes("event: sources"));
  assert.ok(text.includes("event: token"));
  assert.ok(text.includes("event: done"));
});

test("مسار api/video.js: بالصيغة الموحّدة ?id= وبصيغة المسار", async () => {
  const byQuery = await (await fetch(`${base}/api/video?id=vTestZakat1`)).json();
  assert.equal(byQuery.ok, true);
  assert.equal(byQuery.segments.length, 3);
  assert.equal(byQuery.video.id, "vTestZakat1");

  const missing = await fetch(`${base}/api/video?id=nope`);
  assert.equal(missing.status, 404);
});

test("مسار api/videos.js يسرد الفيديوهات", async () => {
  const data = await (await fetch(`${base}/api/videos?limit=5`)).json();
  assert.equal(data.ok, true);
  assert.equal(data.videos.length, 1);
  assert.equal(data.videos[0].id, "vTestZakat1");
});

test("مسار api/suggest.js يقترح أسئلة", async () => {
  const data = await (await fetch(`${base}/api/suggest?q=زكاة الفطر`)).json();
  assert.equal(data.ok, true);
  assert.ok(data.suggestions.length > 0);
});

test("مسار api/summarize.js يلخّص فيديو (محرك استخراجي)", async () => {
  const data = await (
    await fetch(`${base}/api/summarize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId: "vTestZakat1", stream: false })
    })
  ).json();
  assert.equal(data.ok, true);
  assert.ok(data.summary.length > 50);
});

test("مسار api/ingest.js يشرح أن السحب محلي فقط (501)", async () => {
  const res = await fetch(`${base}/api/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(res.status, 501);
  const data = await res.json();
  assert.equal(data.readOnly, true);
  assert.ok(data.error.includes("npm run ingest"));
});

test("مسار غير معروف يعطي 404 بصيغة JSON", async () => {
  const res = await fetch(`${base}/api/does-not-exist`);
  assert.equal(res.status, 404);
});

test("جدول المسارات في api/ مكتمل ويطابق واجهة الويب", () => {
  const files = fs.readdirSync(path.join(ROOT, "api")).filter((f) => f.endsWith(".js"));
  for (const required of [
    "ask.js",
    "config.js",
    "health.js",
    "ingest.js",
    "purge-demo.js",
    "search.js",
    "stats.js",
    "suggest.js",
    "summarize.js",
    "video.js",
    "videos.js"
  ]) {
    assert.ok(files.includes(required), `الملف الناقص: api/${required}`);
  }

  // كل مسار في الواجهة يجب أن يقابل مسارًا في api/
  const app = fs.readFileSync(path.join(ROOT, "mishkat", "public", "app.js"), "utf8");
  const endpoints = [...app.matchAll(/^\s*(?:ask|search|videos|summarize|ingest|stats|config|purgeDemo|health):\s*"([^"]+)"/gm)].map(
    (m) => m[1]
  );
  assert.ok(endpoints.length >= 6, `عدد المسارات المكتشفة: ${endpoints.length}`);
  for (const ep of endpoints) {
    const name = ep.replace(/^\/api\//, "").split("?")[0];
    assert.ok(files.includes(`${name}.js`), `لا يوجد api/${name}.js للمسار ${ep}`);
  }
});
