"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const yt = require("../lib/youtube");
const { buildChunks, dedupeRepeats, cleanSegment, excerpt } = require("../lib/text");

test("تحليل مدة الفيديو بصيغتين", () => {
  assert.equal(yt.parseDurationText("PT1H2M3S"), 3723);
  assert.equal(yt.parseDurationText("12:34"), 754);
  assert.equal(yt.parseDurationText("1:02:03"), 3723);
  assert.equal(yt.parseDurationText(""), 0);
});

test("تحليل عدد المشاهدات بالعربية والإنجليزية", () => {
  assert.equal(yt.parseCountText("1,234 views"), 1234);
  assert.equal(yt.parseCountText("12ألف مشاهدة"), 12000);
  assert.equal(yt.parseCountText("3.5M views"), 3500000);
  assert.equal(yt.parseCountText(""), 0);
});

test("تحليل ترجمة json3", () => {
  const data = {
    events: [
      { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "بسم الله" }] },
      { tStartMs: 2000, dDurationMs: 3000, segs: [{ utf8: "الرحمن" }, { utf8: " الرحيم" }] }
    ]
  };
  const segments = yt.parseJson3(data);
  // المقاطع القصيرة المتلاصقة تُدمج في مقطع واحد متماسك
  assert.equal(segments.length, 1);
  assert.equal(segments[0].text, "بسم الله الرحمن الرحيم");
  assert.equal(segments[0].startMs, 0);
  assert.equal(segments[0].endMs, 5000);
});

test("تحليل ترجمة json3 مع فواصل زمنية كبيرة", () => {
  const data = {
    events: [
      { tStartMs: 0, dDurationMs: 4000, segs: [{ utf8: "المقدمة الأولى في هذا الدرس المبارك بإذن الله تعالى" }] },
      { tStartMs: 60000, dDurationMs: 5000, segs: [{ utf8: "المحور الثاني وهو مقصود الدرس الأكبر في هذه المسألة" }] }
    ]
  };
  const segments = yt.parseJson3(data);
  assert.equal(segments.length, 2);
  assert.ok(segments[1].startMs >= 60000);
});

test("تحليل ترجمة XML بصيغة srv3 والكلاسيكية", () => {
  const srv3 = `<transcript><body><p t="1200" d="3000"><s>الحمد</s><s> لله</s></p><p t="4200" d="2000">رب العالمين</p></body></transcript>`;
  const a = yt.parseCaptionXml(srv3);
  assert.equal(a.length, 2);
  assert.equal(a[0].text, "الحمد لله");
  assert.equal(a[1].startMs, 4200);

  const classic = `<transcript><text start="1.5" dur="2.5">أولًا</text><text start="4.0" dur="1">ثانيًا</text></transcript>`;
  const b = yt.parseCaptionXml(classic);
  assert.equal(b.length, 2);
  assert.equal(b[0].startMs, 1500);
  assert.equal(b[1].text, "ثانيًا");
});

test("استخراج JSON المتوازن من HTML", () => {
  const html = `<!doctype html><script>var ytInitialData = {"a":{"b":[1,2,{"c":"}"}]},"d":"]"};</script>`;
  const data = yt.extractVarJson(html, ["ytInitialData"]);
  assert.equal(data.a.b[2].c, "}");
  assert.equal(data.d, "]");
});

test("استخراج فيديوهات من شكل lockupViewModel الحديث", () => {
  const data = {
    contents: [
      {
        lockupViewModel: {
          contentId: "abc123",
          contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
          metadata: {
            lockupMetadataViewModel: {
              title: { content: "درس في الفقه" },
              metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: "12K views" } }] }] } }
            }
          },
          contentImage: {
            thumbnailViewModel: {
              image: { sources: [{ url: "https://img/1.jpg" }] },
              overlays: [
                { thumbnailOverlayBadgeViewModel: { thumbnailBadges: [{ thumbnailBadgeViewModel: { text: "25:10" } }] } }
              ]
            }
          }
        }
      }
    ]
  };
  const videos = require("../lib/youtube");
  // نستخدم دالة السرد الداخلية عبر بيانات مُحاكاة
  const found = yt.collectByKey(data, "lockupViewModel");
  assert.equal(found.length, 1);
  assert.equal(found[0].contentId, "abc123");
  assert.ok(videos.parseDurationText("25:10") === 1510);
});

test("تنظيف النص وإزالة التكرار المتدحرج", () => {
  assert.equal(cleanSegment("[موسيقى] السلام عليكم   ورحمة الله"), "السلام عليكم ورحمة الله");
  assert.equal(dedupeRepeats("قال قال رسول رسول الله"), "قال رسول الله");
  assert.ok(excerpt("ا".repeat(300), 100).length <= 101);
});

test("تقسيم النص إلى مقاطع مع توقيتات", () => {
  const segments = [];
  for (let i = 0; i < 40; i++) {
    segments.push({
      startMs: i * 3000,
      endMs: i * 3000 + 2800,
      text: `هذه فقرة رقم ${i} من الدرس الشرعي وفيها كلمات متعددة للاختبار`
    });
  }
  const chunks = buildChunks(segments, { chunkChars: 300 });
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(c.text.length > 0);
    assert.ok(c.endMs >= c.startMs);
    assert.equal(typeof c.idx, "number");
  }
  // التأكد من تزايد الأزمنة
  for (let i = 1; i < chunks.length; i++) {
    assert.ok(chunks[i].startMs >= chunks[i - 1].startMs - 1);
  }
});
