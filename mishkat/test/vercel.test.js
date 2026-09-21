"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mishkat-vercel-"));
process.env.MISHKAT_DATA_DIR = DATA_DIR;
process.env.MISHKAT_AI_MODE = "off";
process.env.ISLAMWEB_MODE = "direct";
process.env.ISLAMWEB_READER_FALLBACK = "false";
process.env.ISLAMWEB_CACHE_TTL_MINUTES = "0";
process.env.MISHKAT_VIDEO_OEMBED = "false";

const test = require("node:test");
const assert = require("node:assert/strict");

const config = require("../lib/config");
const vercelHandler = require("../../api/index.js");
const { fixture, stubFetch } = require("./helpers");

/* ==============================================================
 *  محاكاة طلب/استجابة Vercel
 * ============================================================== */

function mockRequest(url, { method = "GET", body = null, headers = {} } = {}) {
  const listeners = {};
  const payload = body == null ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const req = {
    url,
    method,
    headers,
    query: {},
    socket: { remoteAddress: "127.0.0.1" },
    on(event, handler) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
      return req;
    },
    destroy() {},
    async run() {
      await new Promise((resolve) => setImmediate(resolve));
      if (payload) {
        for (const handler of listeners.data || []) handler(Buffer.from(payload));
      }
      for (const handler of listeners.end || []) handler();
    }
  };
  return req;
}

function mockResponse() {
  const chunks = [];
  const res = {
    statusCode: 200,
    headers: {},
    headersSent: false,
    setHeader(key, value) {
      this.headers[String(key).toLowerCase()] = value;
    },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headersSent = true;
      for (const [key, value] of Object.entries(headers)) this.headers[String(key).toLowerCase()] = value;
      return this;
    },
    write(chunk) {
      chunks.push(String(chunk == null ? "" : chunk));
      return true;
    },
    end(chunk) {
      if (chunk != null) chunks.push(String(chunk));
      this.finished = true;
      return this;
    },
    get body() {
      return chunks.join("");
    },
    json() {
      return JSON.parse(this.body || "{}");
    }
  };
  return res;
}

async function call(url, options = {}) {
  const req = mockRequest(url, options);
  const res = mockResponse();
  const pending = vercelHandler(req, res);
  await req.run();
  await pending;
  return res;
}

function seedCatalog() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    config.VIDEOS_PATH,
    JSON.stringify({
      format: "mishkat-videos/v1",
      channel: { id: config.CHANNEL_ID, url: config.CHANNEL_URL, title: "قناة تجريبية" },
      videos: [
        {
          id: "aaaaaaaaaaa",
          title: "الطهارة والمياه",
          url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
          tags: ["طهارة", "وضوء"]
        }
      ]
    }),
    "utf8"
  );
}

test("إعادة كتابة المسار: /api/index?path=health تعمل", async () => {
  const res = await call("/api/index?path=health");
  assert.equal(res.statusCode, 200);
  const data = res.json();
  assert.equal(data.ok, true);
  assert.equal(data.answersFrom, "islamweb.net");
});

test("المسار المباشر /api/config يعمل أيضًا", async () => {
  seedCatalog();
  const data = (await call("/api/config")).json();
  assert.equal(data.ok, true);
  assert.equal(data.videos.linkOnly, true);
});

test("تمرير بقية معاملات الاستعلام مع path", async () => {
  seedCatalog();
  const data = (await call("/api/index?path=videos&q=الطهارة&limit=5")).json();
  assert.equal(data.ok, true);
  assert.equal(data.total, 1);
  assert.equal(data.videos[0].id, "aaaaaaaaaaa");
});

test("API/ask عبر إعادة الكتابة يجيب من إسلام ويب (JSON)", async () => {
  seedCatalog();
  const restore = stubFetch((url) => {
    if (url.includes("page=websearch")) return { body: fixture("search.html") };
    if (url.includes("/ar/fatwa/999001/")) return { body: fixture("fatwa.html") };
    return { status: 404, ok: false, body: "no" };
  });
  try {
    const res = await call("/api/index?path=ask", {
      method: "POST",
      body: { question: "الوضوء بماء البحر", stream: false, mode: "sources" }
    });
    const data = res.json();
    assert.equal(data.ok, true);
    assert.ok(data.answer.includes("نصّ تجريبي"));
    assert.ok(data.sources[0].url.includes("islamweb.net"));
  } finally {
    restore();
  }
});

test("المسارات القديمة تُرجع طبقة التوافق لا خطأ 500", async () => {
  for (const retired of [
    "image",
    "upload",
    "owner-login",
    "owner-logout",
    "references-search",
    "islamweb-search",
    "sharia-search",
    "sharia-classify",
    "sharia-summary",
    "ingest",
    "import",
    "missing",
    "purge-demo",
    "summarize"
  ]) {
    const res = await call(`/api/index?path=${retired}`);
    assert.equal(res.statusCode, 200, `api/${retired}`);
    const data = res.json();
    assert.equal(data.upgraded, true, `api/${retired}`);
    assert.ok(String(data.error).includes(retired), `api/${retired}`);
  }
});

test("مسار API غير معروف يعيد 404 بصيغة JSON واضحة", async () => {
  const res = await call("/api/index?path=unknown-route");
  assert.equal(res.statusCode, 404);
  const data = res.json();
  assert.equal(data.ok, false);
  assert.ok(data.error.includes("unknown-route"));
  assert.ok(Array.isArray(data.availableRoutes));
});

test("مسارات الملفات الثابتة تعيد 404 JSON (تُخدَم من Vercel مباشرة)", async () => {
  const res = await call("/favicon.ico");
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "not_found");
});
