"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("../lib/htmlx");

test("فك رموز HTML وتحويلها إلى نص", () => {
  assert.equal(H.decodeEntities("&amp;&lt;&gt;&quot;&#39;&nbsp;"), "&<>\"' ");
  assert.equal(H.decodeEntities("&#x62;&#x63;"), "bc");
  const text = H.htmlToText("<div>مرحبا<br>بك</div><script>var x=1;</script><p>سطر ثانٍ</p>");
  assert.ok(text.includes("مرحبا"));
  assert.ok(text.includes("سطر ثانٍ"));
  assert.ok(!text.includes("var x"));
});

test("تقطيع العنصر المتوازن يعمل مع التداخل", () => {
  const html = '<div id="a">خارج <div>داخل</div> نهاية</div><p>بعد</p>';
  const start = html.indexOf("<div");
  const slice = H.sliceElement(html, start, "div");
  assert.equal(H.htmlToText(slice.inner).replace(/\s+/g, " ").trim(), "خارج داخل نهاية");
  assert.equal(H.htmlToText(html.slice(slice.end)), "بعد");
});

test("استخراج العناوين والمقاطع بينها", () => {
  const html = `
    <h3>السؤال</h3><div><p>نص السؤال</p></div>
    <h3>الإجابــة</h3><div><p>نص الجواب</p><p>سطر آخر</p></div>
    <h3>مواد ذات صلة</h3><div>روابط</div>`;
  const question = H.sectionAfterHeading(html, ["السؤال"]);
  const answer = H.sectionAfterHeading(html, ["الإجابــة", "الإجابة"]);
  assert.equal(question.text, "نص السؤال");
  assert.ok(answer.text.includes("نص الجواب"));
  assert.ok(answer.text.includes("سطر آخر"));
  assert.ok(!answer.text.includes("روابط"));
});

test("تحويل Markdown إلى HTML مبسّط (مسار القارئ الاحتياطي)", () => {
  const md = "Title: تجربة\n\n### الإجابــة\n\nنص الجواب هنا.\n\n### مواد ذات صلة\n\n- [عنوان](https://www.islamweb.net/ar/fatwa/123/)";
  const html = H.toUnifiedHtml(md);
  const answer = H.sectionAfterHeading(html, ["الإجابــة"]);
  assert.equal(answer.text, "نص الجواب هنا.");
  const links = H.links(html);
  assert.ok(links.some((l) => l.href.includes("/ar/fatwa/123/")));
});

test("استخراج الروابط ومقتطفاتها", () => {
  const html = `
    <a href="/ar/fatwa/111/عنوان-أول">عنوان أول</a>
    <p>مقتطف أول</p>
    <a href="/ar/consult/222/عنوان-ثان">عنوان ثان</a>
    <p>مقتطف ثان</p>`;
  const links = H.links(html);
  assert.equal(links.length, 2);
  assert.equal(links[0].text, "عنوان أول");
  assert.equal(links[1].href, "/ar/consult/222/عنوان-ثان");
});

test("المقتطف يُقصّ عند حدّ كلمة", () => {
  const long = "كلمة ".repeat(120);
  const out = H.excerpt(long, 50);
  assert.ok(out.length <= 60);
  assert.ok(out.endsWith("…"));
});
