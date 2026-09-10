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

/**
 * يحاكي بيئة Vercel بدقة:
 *   دالة واحدة api/index.js + إعادة كتابة vercel.json
 *   /api/x?y=1  ⟶  /api/index?path=x&y=1
 * (نفس ما تفعله المنصة: المعاملات الأصلية تبقى ويُضاف path)
 */
function startVercelServer() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      const name = url.pathname.replace(/^\/api\/?/, "");
      const mod = require(path.join(ROOT, "api", "index.js"));
      const params = new URLSearchParams(url.searchParams);
      if (name) params.set("path", name);
      req.url = `/api/index${params.toString() ? `?${params.toString()}` : ""}`;
      req.query = Object.fromEntries(params.entries());
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

test("دالة نشر واحدة فقط داخل api/ (حد Vercel المجاني = 12 دالة)", () => {
  const files = fs.readdirSync(path.join(ROOT, "api")).filter((f) => f.endsWith(".js"));
  const limit = 12; // Hobby plan: أقصى عدد دوال Serverless لكل نشر
  assert.ok(
    files.length <= limit,
    `عدد دوال النشر ${files.length} يتجاوز حد الخطة المجانية (${limit}) ⟹ يفشل النشر كاملًا`
  );
  assert.deepEqual(files, ["index.js"], "يجب أن تكون كل المسارات في دالة واحدة api/index.js");

  // إعادة الكتابة التي تُوصل كل /api/* إلى الدالة الواحدة
  const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  const apiRewrite = (vj.rewrites || []).find((r) => r.source === "/api/(.*)");
  assert.ok(apiRewrite, "vercel.json يجب أن يعيد كتابة /api/(.*)");
  assert.equal(apiRewrite.destination, "/api/index?path=$1");
  assert.ok(vj.functions["api/index.js"], "إعداد الدالة يجب أن يشير إلى api/index.js");
  assert.equal(vj.functions["api/*.js"], undefined, "لا يُسمح بإعداد يطابق ملفات متعددة (كان يضاعف الدوال)");
});

test("كل مسار تستدعيه الواجهة موجود فعلًا في الموجّه", async () => {
  const files = fs.readdirSync(path.join(ROOT, "api")).filter((f) => f.endsWith(".js"));
  assert.ok(files.length > 0);

  // مسارات الواجهة الحالية
  const app = fs.readFileSync(path.join(ROOT, "mishkat", "public", "app.js"), "utf8");
  const endpoints = [...app.matchAll(/^\s*(?:ask|search|videos|summarize|ingest|stats|config|purgeDemo|health|import|missing|diagnose|video):\s*"([^"]+)"/gm)].map(
    (m) => m[1]
  );
  assert.ok(endpoints.length >= 6, `عدد المسارات المكتشفة: ${endpoints.length}`);

  // كل مسار يستجيب فعليًا عبر الدالة الواحدة (لا 404 من المنصة)
  for (const ep of endpoints) {
    const res = await fetch(`${base}${ep.startsWith("/") ? ep : `/${ep}`}`, { method: ep.includes("/search") ? "POST" : "GET" });
    assert.notEqual(res.status, 404, `المسار ${ep} غير موجود في الموجّه`);
  }

  // وفهرس المسارات نفسه يشرح كل شيء
  const routes = await (await fetch(`${base}/api/`)).json();
  assert.equal(routes.ok, true);
  assert.ok(routes.routes.includes("/api/ask"));
  assert.ok(routes.compat.includes("/api/chat"));
});

/* ==============================================================
 *  حماية من خطأ 500 الحقيقي: ESM داخل مشروع CommonJS
 * ============================================================== */

test("لا يوجد أي ملف api/*.js يستخدم صيغة ESM (سبب خطأ 500 سابقًا)", () => {
  const dir = path.join(ROOT, "api");
  const offenders = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const code = fs.readFileSync(path.join(dir, file), "utf8");
    if (/^\s*(export\s+(default|const|function|async)|import\s+[\w*{])/m.test(code)) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, [], `ملفات تستخدم ESM داخل مشروع CommonJS: ${offenders.join(", ")}`);

  // ولا يوجد type:module يخدع المطوّر
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.notEqual(pkg.type, "module", "المشروع CommonJS؛ لا تضع type:module بدون تحويل كل الملفات");
});

test("كل ملفات api/*.js تُحمَّل فعليًا بلا انهيار (CommonJS)", () => {
  const dir = path.join(ROOT, "api");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const loaded = require(path.join(dir, file));
    assert.equal(typeof loaded, "function", `api/${file} يجب أن يُصدّر دالة معالج`);
  }
});

test("كل ملفات mishkat/lib/*.js تُحمَّل بلا أخطاء صيغة", () => {
  const dir = path.join(ROOT, "mishkat", "lib");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    assert.doesNotThrow(() => require(path.join(dir, file)), `فشل تحميل mishkat/lib/${file}`);
  }
});

/* ==============================================================
 *  طبقة التوافق للمسارات القديمة + التشخيص
 * ============================================================== */

test("المسارات القديمة تُرجع رسالة واضحة (لا 500 ولا انهيار)", async () => {
  const chat = await (
    await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "مرحبا" }] })
    })
  ).json();
  assert.equal(chat.ok, true);
  assert.equal(chat.upgraded, true);
  assert.ok(chat.message.includes("مشكاة"));
  assert.ok(chat.message.includes("أعد تحميل"));

  const settings = await (await fetch(`${base}/api/settings`)).json();
  assert.equal(settings.ok, true);
  assert.ok(settings.settings.siteName.length > 0);

  for (const retired of [
    "image",
    "upload",
    "owner-login",
    "owner-logout",
    "references-search",
    "islamweb-search",
    "sharia-search",
    "sharia-classify",
    "sharia-summary"
  ]) {
    const data = await (await fetch(`${base}/api/${retired}`)).json();
    assert.equal(data.upgraded, true, `api/${retired}`);
    assert.ok(data.error.includes(retired));
  }
});

test("GET /api/diagnose يُرجع فحوصًا كاملة وحكمًا واضحًا", async () => {
  const data = await (await fetch(`${base}/api/diagnose`)).json();
  assert.equal(typeof data.ok, "boolean");
  assert.ok(data.summary.length > 5);
  assert.ok(Array.isArray(data.checks) && data.checks.length >= 5);
  for (const c of data.checks) {
    assert.ok(["ok", "warn", "fail"].includes(c.level), `مستوى غير معروف: ${c.level}`);
    assert.ok(c.name && c.name.length > 0);
  }
  // الفحص يشمل: ملف الفهرس، القاعدة، محرك الذكاء، اختبار استرجاع حقيقي
  const names = data.checks.map((c) => c.name).join(" | ");
  assert.ok(names.includes("ملف الفهرس"));
  assert.ok(names.includes("محرك الذكاء"));
  assert.ok(names.includes("استرجاع"));
  // فحص حد الدوال (الخطة المجانية = 12) يجب أن يظهر بحالة سليمة
  const fnCheck = data.checks.find((c) => c.name.includes("دوال النشر"));
  assert.ok(fnCheck, "فحص عدد دوال النشر مطلوب في التشخيص");
  assert.equal(fnCheck.level, "ok", fnCheck.detail);
  // لا يُكشف أي قيمة مفتاح سرّي
  assert.ok(!JSON.stringify(data).includes("test-key"));
});

test("التشخيص يكتشف غياب ملف الفهرس ويشرح الحل", () => {
  const vehand = require(path.join(ROOT, "mishkat", "lib", "vehand.js"));
  const diagnosis = vehand.buildDiagnosis();
  assert.ok(Array.isArray(diagnosis.checks));
  const indexCheck = diagnosis.checks.find((c) => c.name.includes("ملف الفهرس"));
  assert.ok(indexCheck);
  assert.ok(["ok", "fail"].includes(indexCheck.level));
  if (indexCheck.level === "fail") {
    assert.ok(indexCheck.detail.includes("npm run ingest"));
  }
});
