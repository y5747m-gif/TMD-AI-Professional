"use strict";

/* بيئة الاختبار: بلا شبكة وبلا مزوّد ذكاء اصطناعي */
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.MISHKAT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mishkat-iw-"));
process.env.MISHKAT_AI_MODE = "off";
process.env.ISLAMWEB_MODE = "direct";
process.env.ISLAMWEB_READER_FALLBACK = "false";
process.env.ISLAMWEB_CACHE_TTL_MINUTES = "0";
process.env.ISLAMWEB_ENABLED = "true";

const test = require("node:test");
const assert = require("node:assert/strict");

const islamweb = require("../lib/islamweb");
const config = require("../lib/config");
const { fixture, stubFetch, isReaderUrl } = require("./helpers");

const FATWA_URL = `${config.ISLAMWEB.base}/ar/fatwa/999001/`;
const CONSULT_URL = `${config.ISLAMWEB.base}/ar/consult/999500/`;
const SEARCH_URL = islamweb.searchUrl("fatwa", "الوضوء بماء البحر");

test("تحليل صفحة نتائج البحث (HTML) يستخرج الفتاوى مع مقتطفاتها", () => {
  const items = islamweb.parseSearchPage(fixture("search.html"), { kinds: ["fatwa"] });
  assert.equal(items.length, 2);
  assert.equal(items[0].kind, "fatwa");
  assert.equal(items[0].id, "999001");
  assert.ok(items[0].title.includes("الوضوء من ماء البحر"));
  assert.equal(items[0].url, `${config.ISLAMWEB.base}/ar/fatwa/999001/`);
  assert.ok(items[0].snippet.includes("سؤال تجريبي"));
  assert.equal(items[1].id, "999010");

  // البحث العام يجمع الأنواع كلها (فتوى + استشارة + مقال) بلا تصنيفات
  const all = islamweb.parseSearchPage(fixture("search.html"));
  assert.ok(all.some((item) => item.kind === "consult"));
  assert.ok(all.some((item) => item.kind === "article"));
  assert.ok(!all.some((item) => item.kindLabel === "تصنيف"));
});

test("تحليل صفحة الفتوى (HTML): السؤال والإجابــة والرقم والتصنيفات", () => {
  const doc = islamweb.parseDocPage(fixture("fatwa.html"), { url: FATWA_URL });
  assert.ok(doc, "يجب أن يُحلَّل المستند");
  assert.equal(doc.kind, "fatwa");
  assert.equal(doc.id, "999001");
  assert.ok(doc.title.includes("الوضوء من ماء البحر"));
  assert.ok(doc.question.includes("هل يصح الوضوء بماء البحر"));
  assert.ok(doc.answer.includes("نصّ تجريبي"));
  assert.ok(doc.answer.includes("والله أعلم"));
  assert.ok(!doc.answer.includes("مواد ذات صلة"));
  assert.ok(doc.date.includes("2026") || doc.hijriDate.includes("1448"));
  assert.ok(doc.categories.includes("الطهارة"));
});

test("تحليل صفحة الاستشارة (HTML): المجيب ورقم الاستشارة", () => {
  const doc = islamweb.parseDocPage(fixture("consult.html"), { url: CONSULT_URL });
  assert.ok(doc);
  assert.equal(doc.kind, "consult");
  assert.equal(doc.id, "999500");
  assert.ok(doc.answer.includes("نصّ تجريبي"));
  assert.ok(doc.answerer.includes("فلان"));
  assert.equal(doc.date, "2026-01-05");
});

test("تحليل مخرجات قارئ الصفحات (Markdown) بنفس المنطق", () => {
  const doc = islamweb.parseDocPage(fixture("reader-fatwa.md"), { url: FATWA_URL });
  assert.ok(doc);
  assert.equal(doc.id, "999001");
  assert.ok(doc.title.includes("الوضوء من ماء البحر"));
  assert.ok(doc.question.includes("هل يصح الوضوء"));
  assert.ok(doc.answer.includes("نصّ تجريبي"));
  assert.ok(!doc.answer.includes("مواد ذات صلة"));
});

test("تحليل نتائج القارئ (Markdown): عناوين + مقتطفات بلا بقايا واجهة", () => {
  const items = islamweb.parseSearchPage(fixture("search-reader.md"));
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.kind), ["fatwa", "consult", "article"]);
  assert.equal(items[0].id, "999001");
  assert.ok(items[0].title.includes("زكاة الفطر"));
  assert.ok(items[0].snippet.includes("مقدارها"));
  assert.ok(!items[0].snippet.includes("فقه العبادات"), "لا يُخلط مسار التصنيف بالمقتطف");
  assert.ok(items[1].snippet.includes("أنظّم وقتي"));
  assert.ok(items[2].snippet.includes("مقال تجريبي"));
});

test("search يجمع النتائج ويرتّبها حسب الصلة", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("page=websearch")) return { body: fixture("search.html") };
    return { status: 404, ok: false, body: "not found" };
  });
  try {
    const found = await islamweb.search("ما حكم الوضوء من ماء البحر", { limit: 5 });
    assert.ok(found.items.length >= 2);
    assert.equal(found.items[0].id, "999001", "الأقرب للسؤال يجب أن يتقدّم");
    assert.equal(found.via, "direct");
    assert.equal(found.errors.length, 0);
  } finally {
    restore();
  }
});

test("fetchDocument يجلب نصّ الجواب كاملًا", async () => {
  const restore = stubFetch((url) => {
    if (url.endsWith("/ar/fatwa/999001/")) return { body: fixture("fatwa.html") };
    return { status: 404, ok: false, body: "no" };
  });
  try {
    const doc = await islamweb.fetchDocument({ kind: "fatwa", id: "999001", url: FATWA_URL });
    assert.equal(doc.kind, "fatwa");
    assert.ok(doc.answer.length > 40);
    assert.equal(doc.via, "direct");
  } finally {
    restore();
  }
});

test("عند فشل الاتصال المباشر ينتقل تلقائيًا إلى قارئ الصفحات", async () => {
  process.env.ISLAMWEB_MODE = "auto";
  process.env.ISLAMWEB_READER_FALLBACK = "true";
  const cfg = require("../lib/config");
  cfg.ISLAMWEB.mode = "auto";
  cfg.ISLAMWEB.useReaderFallback = true;

  let readerCalled = 0;
  const restore = stubFetch((url) => {
    if (isReaderUrl(url)) {
      readerCalled += 1;
      return { body: fixture("reader-fatwa.md"), contentType: "text/plain" };
    }
    throw new Error("connection reset"); // محاكاة حجب الموقع للاتصال المباشر
  });

  try {
    const page = await islamweb.fetchPage(`${config.ISLAMWEB.base}/ar/fatwa/888777/`, { noCache: true });
    assert.equal(page.via, "reader");
    assert.equal(readerCalled, 1);
    const doc = islamweb.parseDocPage(page.text, { url: `${config.ISLAMWEB.base}/ar/fatwa/888777/` });
    assert.ok(doc.answer.includes("نصّ تجريبي"));
  } finally {
    restore();
    cfg.ISLAMWEB.mode = "direct";
    cfg.ISLAMWEB.useReaderFallback = false;
    process.env.ISLAMWEB_MODE = "direct";
    process.env.ISLAMWEB_READER_FALLBACK = "false";
  }
});

test("صدّر مرجعًا صحيحًا من روابط الموقع", () => {
  assert.deepEqual(islamweb.parseRef("/ar/fatwa/536365/عنوان"), {
    kind: "fatwa",
    id: "536365",
    url: `${config.ISLAMWEB.base}/ar/fatwa/536365/`
  });
  assert.equal(islamweb.parseRef("https://www.islamweb.net/ar/article/248290/x").kind, "article");
  assert.equal(islamweb.parseRef("/ar/library/content/1/2/3"), null);
});

test("بناء عبارات البحث من السؤال", () => {
  const queries = islamweb.searchQueries("ما حكم زكاة الفطر وهل تجب على الصغير؟");
  assert.ok(queries.length >= 1 && queries.length <= 2);
  assert.ok(!/^ما\s/.test(queries[0]), "تُزال كلمات الاستفهام من العبارة الأساسية");
  assert.ok(queries[0].includes("زكاة"));
});
