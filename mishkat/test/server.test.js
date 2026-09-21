"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mishkat-server-"));
process.env.MISHKAT_DATA_DIR = DATA_DIR;
process.env.MISHKAT_AI_MODE = "off";
process.env.ISLAMWEB_MODE = "direct";
process.env.ISLAMWEB_READER_FALLBACK = "false";
process.env.ISLAMWEB_CACHE_TTL_MINUTES = "0";
process.env.MISHKAT_VIDEO_OEMBED = "false";
process.env.PORT = "0";

const test = require("node:test");
const assert = require("node:assert/strict");

const config = require("../lib/config");
const { server } = require("../server");
const { fixture, stubFetch, request } = require("./helpers");

let port = 0;

function catalogSeed() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    config.VIDEOS_PATH,
    JSON.stringify(
      {
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
      },
      null,
      2
    ),
    "utf8"
  );
}

test.before(async () => {
  catalogSeed();
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      port = server.address().port;
      resolve();
    });
  });
});

test.after(() => {
  server.close();
});

test("GET /api/health يبيّن مصدر الردود وأنه لا تُخزَّن نصوص للفيديوهات", async () => {
  const res = await request(port, { path: "/api/health" });
  assert.equal(res.status, 200);
  const data = res.json();
  assert.equal(data.ok, true);
  assert.equal(data.answersFrom, "islamweb.net");
  assert.equal(data.storesTranscripts, false);
  assert.equal(data.islamweb.enabled, true);
});

test("GET /api/config يعرض الأوضاع والاقتراحات ولائحة الفيديوهات", async () => {
  const data = (await request(port, { path: "/api/config" })).json();
  assert.equal(data.ok, true);
  assert.equal(data.videos.linkOnly, true);
  assert.ok(data.modes.some((m) => m.id === "sources"));
  assert.ok(data.modes.some((m) => m.id === "composed"));
  assert.ok(data.suggestions.length > 3);
});

test("GET /api/videos يسرد الروابط، وPOST يضيف فيديو", async () => {
  const list = (await request(port, { path: "/api/videos" })).json();
  assert.equal(list.ok, true);
  assert.equal(list.total, 1);
  assert.equal(list.linkOnly, true);

  const added = (
    await request(port, {
      method: "POST",
      path: "/api/videos",
      body: { url: "https://youtu.be/bbbbbbbbbbb", title: "درس ثانٍ", tags: ["صلاة"] }
    })
  ).json();
  assert.equal(added.ok, true);
  assert.equal(added.video.id, "bbbbbbbbbbb");
  assert.equal(added.total, 2);

  const one = (await request(port, { path: "/api/video?id=bbbbbbbbbbb" })).json();
  assert.equal(one.ok, true);
  assert.equal(one.video.title, "درس ثانٍ");

  const removed = (await request(port, { method: "DELETE", path: "/api/videos?id=bbbbbbbbbbb" })).json();
  assert.equal(removed.ok, true);
  assert.equal(removed.total, 1);
});

test("POST /api/ask (JSON) يجيب من إسلام ويب ويُرفق روابط الفيديوهات", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("page=websearch")) return { body: fixture("search.html") };
    if (url.includes("/ar/fatwa/999001/")) return { body: fixture("fatwa.html") };
    if (url.includes("/ar/fatwa/999010/")) return { body: fixture("fatwa.html") };
    return { status: 404, ok: false, body: "no" };
  });
  try {
    const res = await request(port, {
      method: "POST",
      path: "/api/ask",
      body: { question: "ما حكم الوضوء من ماء البحر؟", stream: false, mode: "sources" }
    });
    assert.equal(res.status, 200);
    const data = res.json();
    assert.equal(data.ok, true);
    assert.ok(data.answer.includes("نصّ تجريبي"));
    assert.ok(data.sources.length >= 1);
    assert.ok(data.sources[0].url.includes("islamweb.net"));
    assert.equal(data.videos[0].id, "aaaaaaaaaaa");
  } finally {
    restore();
  }
});

test("POST /api/ask ببثّ SSE يُرسل meta ثم token ثم done", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("page=websearch")) return { body: fixture("search.html") };
    if (url.includes("/ar/fatwa/999001/")) return { body: fixture("fatwa.html") };
    return { status: 404, ok: false, body: "no" };
  });
  try {
    const res = await request(port, {
      method: "POST",
      path: "/api/ask",
      headers: { accept: "text/event-stream" },
      body: { question: "الوضوء بماء البحر", mode: "sources", stream: true }
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers["content-type"].includes("text/event-stream"));
    assert.ok(res.text.includes("event: meta"));
    assert.ok(res.text.includes("event: token"));
    assert.ok(res.text.includes("event: done"));
    assert.ok(res.text.includes("نصّ تجريبي"));
  } finally {
    restore();
  }
});

test("POST /api/ask بلا سؤال يعيد خطأً عربيًا واضحًا", async () => {
  const res = await request(port, { method: "POST", path: "/api/ask", body: {} });
  assert.equal(res.status, 400);
  assert.ok(res.json().error.includes("السؤال"));
});

test("POST /api/search يعيد مصادر وفيديوهات بلا صياغة", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("page=websearch")) return { body: fixture("search.html") };
    return { status: 404, ok: false, body: "no" };
  });
  try {
    const data = (
      await request(port, { method: "POST", path: "/api/search", body: { query: "الوضوء بماء البحر" } })
    ).json();
    assert.equal(data.ok, true);
    assert.ok(data.sources.length >= 2);
    assert.ok(data.videos.length >= 1);
  } finally {
    restore();
  }
});

test("GET /api/diagnose يُرجع فحوصًا كاملة وحكمًا واضحًا (بلا فحص شبكة افتراضيًا)", async () => {
  const data = (await request(port, { path: "/api/diagnose" })).json();
  assert.equal(typeof data.ok, "boolean");
  assert.ok(data.summary.length > 5);
  assert.ok(Array.isArray(data.checks) && data.checks.length >= 5);
  for (const check of data.checks) {
    assert.ok(["ok", "warn", "fail"].includes(check.level), `مستوى غير معروف: ${check.level}`);
    assert.ok(check.name && check.name.length > 0);
  }
  const storage = data.checks.find((c) => c.name.includes("حفظ النصوص"));
  assert.ok(storage.detail.includes("لا تُخزَّن"));
});

test("POST /api/cache/clear يفرّغ الذاكرة المؤقتة (ويُحمى عند ضبط رمز الإدارة)", async () => {
  const openInDev = await request(port, { method: "POST", path: "/api/cache/clear" });
  assert.equal(openInDev.status, 200, "بلا رمز إدارة (تطوير محلي) يكون المسار مفتوحًا");

  const oldToken = config.SERVER.adminToken;
  config.SERVER.adminToken = "test-secret-token";
  try {
    const denied = await request(port, { method: "POST", path: "/api/cache/clear" });
    assert.equal(denied.status, 401, "مع ضبط الرمز يجب رفض الطلب بلا رمز");

    const ok = await request(port, {
      method: "POST",
      path: "/api/cache/clear",
      headers: { "x-admin-token": "test-secret-token" }
    });
    assert.equal(ok.status, 200);
    const data = ok.json();
    assert.equal(data.ok, true);
    assert.ok(data.message.includes("الذاكرة المؤقتة"));
  } finally {
    config.SERVER.adminToken = oldToken;
  }
});

test("POST /api/videos باستيراد جماعي (text) يضيف اللائحة مرة واحدة", async () => {
  const res = await request(port, {
    method: "POST",
    path: "/api/videos",
    body: {
      text: "عنوان مستورد | https://youtu.be/ccccccccccc\nhttps://www.youtube.com/watch?v=ddddddddddd",
      tags: ["فقه"]
    }
  });
  assert.equal(res.status, 200);
  const data = res.json();
  assert.equal(data.ok, true);
  assert.equal(data.imported, true);
  assert.equal(data.added, 2);

  const list = (await request(port, { path: "/api/videos" })).json();
  assert.equal(list.total, 3, "لم تُمسح العناصر السابقة بلا replace");

  const replace = await request(port, {
    method: "POST",
    path: "/api/videos",
    body: { items: ["https://youtu.be/eeeeeeeeeee"], replace: true }
  });
  assert.equal(replace.json().total, 1, "الاستبدال يمسح اللائحة ثم يضيف");

  // نُعيد لائحة الاختبار الأصلية
  await request(port, { method: "DELETE", path: "/api/videos?id=eeeeeeeeeee" });
  await request(port, {
    method: "POST",
    path: "/api/videos",
    body: { text: "الطهارة والمياه | https://www.youtube.com/watch?v=aaaaaaaaaaa" }
  });
});

test("المسارات القديمة تُعاد إليها رسالة تحديث بدل 500", async () => {
  const res = await request(port, { path: "/api/ingest" });
  assert.equal(res.status, 200);
  const data = res.json();
  assert.equal(data.upgraded, true);
  assert.ok(data.error.includes("ingest"));

  const chat = (await request(port, { path: "/api/chat" })).json();
  assert.equal(chat.upgraded, true);
  assert.ok(chat.message.includes("إسلام ويب"));
});

test("الواجهة الرسومية تُخدَم من الجذر", async () => {
  const page = await request(port, { path: "/" });
  assert.equal(page.status, 200);
  assert.ok(page.headers["content-type"].includes("text/html"));
  assert.ok(page.text.includes("مشكاة"));
  assert.ok(!page.text.includes("نص الفيديو"), "لا يوجد عرض لنصوص الفيديوهات");

  const app = await request(port, { path: "/app.js" });
  assert.equal(app.status, 200);
  assert.ok(app.text.includes("/api/ask"));
});

test("المسار /videos.json يعرض لائحة الروابط فقط", async () => {
  const data = (await request(port, { path: "/videos.json" })).json();
  assert.equal(data.videos.length, 1);
  assert.ok(data.note.includes("روابط"));
  assert.ok(!JSON.stringify(data).includes("transcript"));
});
