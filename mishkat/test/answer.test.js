"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mishkat-answer-"));
process.env.MISHKAT_DATA_DIR = DATA_DIR;
process.env.MISHKAT_AI_MODE = "off";
process.env.ISLAMWEB_MODE = "direct";
process.env.ISLAMWEB_READER_FALLBACK = "false";
process.env.ISLAMWEB_CACHE_TTL_MINUTES = "0";
process.env.MISHKAT_VIDEO_OEMBED = "false";

const test = require("node:test");
const assert = require("node:assert/strict");

const config = require("../lib/config");
const answerLib = require("../lib/answer");
const { fixture, stubFetch } = require("./helpers");

function prepareCatalog() {
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
            title: "الطهارة والمياه: أحكام الوضوء",
            url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
            description: "درس في فقه الطهارة",
            tags: ["طهارة", "وضوء", "فقه"]
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );
}

function stubIslamweb() {
  return stubFetch((url) => {
    if (url.includes("page=websearch")) return { body: fixture("search.html") };
    if (url.includes("/ar/fatwa/999001/")) return { body: fixture("fatwa.html") };
    if (url.includes("/ar/fatwa/999010/")) return { body: fixture("search.html") };
    return { status: 404, ok: false, body: "not found" };
  });
}

test("الإجابة تجمع: نصّ الجواب من إسلام ويب + روابط الفيديوهات", async () => {
  prepareCatalog();
  const restore = stubIslamweb();
  try {
    const result = await answerLib.answer({ question: "ما حكم الوضوء من ماء البحر؟" });
    assert.equal(result.sources.length >= 2, true);
    assert.equal(result.sources[0].kind, "fatwa");
    assert.equal(result.sources[0].url, `${config.ISLAMWEB.base}/ar/fatwa/999001/`);
    assert.equal(result.sources[0].fetched, true, "النصّ الكامل جُلب للمصدر الأول");
    assert.ok(result.answer.includes("نصّ تجريبي"), "الرد ينقل جواب المصدر");
    assert.ok(result.answer.includes("999001"), "الرد يوثّق رقم الفتوى");
    assert.ok(result.answer.includes(`${config.ISLAMWEB.base}/ar/fatwa/999001/`), "الرد يوثّق الرابط");
    assert.equal(result.videos.length, 1);
    assert.equal(result.videos[0].id, "aaaaaaaaaaa");
    assert.ok(result.answer.includes("فيديوهات ذات صلة بالسؤال"), "الرد يعرض روابط الفيديوهات");
    assert.ok(result.answer.includes("https://www.youtube.com/watch?v=aaaaaaaaaaa"));
    assert.equal(result.provider, "quoted", "بلا مفتاح: نقل حرفي");
  } finally {
    restore();
  }
});

test("بثّ الرموز يعمل (onToken) ويُرسل meta قبل النص", async () => {
  prepareCatalog();
  const restore = stubIslamweb();
  try {
    let streamed = "";
    const meta = {};
    await answerLib.answer({
      question: "ما حكم الوضوء بماء البحر؟",
      onToken: (chunk) => {
        streamed += chunk;
      },
      onMeta: (info) => Object.assign(meta, info)
    });
    assert.ok(streamed.length > 100);
    assert.ok(streamed.includes("نصّ تجريبي"));
    assert.ok(Array.isArray(meta.sources) && meta.sources.length >= 2);
    assert.ok(Array.isArray(meta.videos));
  } finally {
    restore();
  }
});

test("حين تتعذّر الصفحات: لا نصوص كاملة، ويُعرض مقتطف مع التنبيه", async () => {
  prepareCatalog();
  const restore = stubFetch((url) => {
    if (url.includes("page=websearch")) return { body: fixture("search.html") };
    return { status: 404, ok: false, body: "blocked" };
  });
  try {
    const result = await answerLib.answer({ question: "الوضوء بماء البحر" });
    assert.ok(result.sources.length >= 1);
    assert.equal(result.sources[0].fetched, false);
    assert.ok(result.notes.some((n) => n.includes("مقتطف")));
    assert.ok(result.answer.length > 50);
  } finally {
    restore();
  }
});

test("حين يتعذّر الوصول إلى إسلام ويب: رسالة واضحة وروابط الفيديوهات تبقى", async () => {
  prepareCatalog();
  const restore = stubFetch(() => {
    throw new Error("network down");
  });
  try {
    const result = await answerLib.answer({ question: "ما حكم صلاة الجماعة؟" });
    assert.equal(result.sources.length, 0);
    assert.ok(result.notes.some((n) => n.includes("تعذّر الوصول")));
    assert.ok(result.answer.includes("لم أجد ردًّا في إسلام ويب"));
    assert.ok(result.answer.includes("مركز الفتوى"));
  } finally {
    restore();
  }
});

test("وضع «منقول كما هو» لا يستدعي أي صياغة", async () => {
  prepareCatalog();
  const restore = stubIslamweb();
  try {
    const result = await answerLib.answer({ question: "الوضوء بماء البحر", mode: "sources" });
    assert.equal(result.mode, "sources");
    assert.equal(result.provider, "quoted");
  } finally {
    restore();
  }
});

test("lookup يعيد النتائج والفيديوهات بلا جلب نصوص كاملة", async () => {
  prepareCatalog();
  const restore = stubIslamweb();
  try {
    const found = await answerLib.lookup("الوضوء بماء البحر");
    assert.ok(found.sources.length >= 2);
    assert.equal(found.videos.length, 1);
    assert.equal(found.sources[0].score > 0, true);
  } finally {
    restore();
  }
});

test("readiness يبيّن مصدر الردود وحالة اللائحة", () => {
  prepareCatalog();
  const ready = answerLib.readiness();
  assert.equal(ready.islamweb.enabled, true);
  assert.ok(ready.islamweb.base.includes("islamweb.net"));
  assert.equal(ready.videos.total, 1);
  assert.equal(ready.ready, true);
});
