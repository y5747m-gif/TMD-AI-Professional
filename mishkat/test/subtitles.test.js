"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../lib/subtitles");

/* ==============================================================
 *  SRT
 * ============================================================== */

const SRT_SAMPLE = `1
00:00:01,000 --> 00:00:04,500
بسم الله الرحمن الرحيم

2
00:00:04,500 --> 00:00:09,000
الحمد لله والصلاة والسلام
على رسول الله

3
00:01:15,250 --> 00:01:20,000
<i>وأما بعد</i> فهذا درس في الفقه
`;

test("قراءة SRT: التوقيتات والفقرات متعددة الأسطر", () => {
  const segments = S.parseSrt(SRT_SAMPLE);
  assert.equal(segments.length, 3);
  assert.equal(segments[0].startMs, 1000);
  assert.equal(segments[0].endMs, 4500);
  assert.equal(segments[0].text, "بسم الله الرحمن الرحيم");
  // الأسطر المتعددة تُدمج في مقطع واحد
  assert.equal(segments[1].text, "الحمد لله والصلاة والسلام على رسول الله");
  // وسوم HTML تُزال
  assert.equal(segments[2].text, "وأما بعد فهذا درس في الفقه");
  assert.equal(segments[2].startMs, 75250);
});

test("قراءة SRT مع BOM وأسطر ويندوز (CRLF) وترقيم أنماط بديلة", () => {
  const crlf = "\uFEFF1\r\n00:00:00.500 --> 00:00:02.000\r\nنص أول\r\n\r\n2\r\n00:00:02.000 --> 00:00:03.000\r\nنص ثانٍ\r\n";
  const segments = S.parseSrt(crlf);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].startMs, 500);
  assert.equal(segments[1].text, "نص ثانٍ");
});

test("قراءة SRT مع أنماط ASS/SSA والمؤثرات الصوتية", () => {
  const srt = `1
00:00:01,000 --> 00:00:03,000
{\\an8}السلام عليكم [موسيقى] {\\i1}أهلًا{\\i0}
`;
  const segments = S.parseSrt(srt);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].text, "السلام عليكم [موسيقى] أهلًا");
});

test("SRT تالف تمامًا لا يُسقط النظام", () => {
  assert.deepEqual(S.parseSrt("نص بلا أي توقيت\nسطر آخر"), []);
  assert.deepEqual(S.parseSrt(""), []);
});

/* ==============================================================
 *  WebVTT
 * ============================================================== */

const VTT_SAMPLE = `WEBVTT
Kind: captions
Language: ar

NOTE هذا تعليق يجب تجاهله

00:00:01.000 --> 00:00:04.000 align:start position:10%
<v الشيخ>الحمد لله</v>

cue-2
00:00:04.000 --> 00:00:08.500
وهذا درس في أحكام الزكاة

NOTE
تعليق آخر
`;

test("قراءة WebVTT: الترويسة والتعليقات وإعدادات الموضع", () => {
  const segments = S.parseVtt(VTT_SAMPLE);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].text, "الحمد لله");
  assert.equal(segments[0].startMs, 1000);
  assert.equal(segments[1].text, "وهذا درس في أحكام الزكاة");
  assert.equal(segments[1].endMs, 8500);
});

test("اكتشاف الصيغة تلقائيًا", () => {
  assert.equal(S.detectFormat(SRT_SAMPLE), "srt");
  assert.equal(S.detectFormat(VTT_SAMPLE), "vtt");
  assert.equal(S.detectFormat(VTT_SAMPLE, "x.vtt"), "vtt");
  assert.equal(S.detectFormat(SRT_SAMPLE, "ملف.srt"), "srt");
  assert.equal(S.detectFormat('{"events":[{"tStartMs":0,"segs":[{"utf8":"ن"}]}]}'), "json");
  assert.equal(S.detectFormat("[00:12] نص موقّت"), "timed");
  assert.equal(S.detectFormat("نص عادي بلا توقيتات"), "text");
});

/* ==============================================================
 *  ٣) نص موقّت يدويًا
 * ============================================================== */

test("قراءة نص موقّت بكتابات مختلفة", () => {
  const content = `[00:00] مقدمة الدرس
[01:30] المقدمة الثانية
(03:15) المحور الثالث
05:00 - المسألة الرابعة
00:07:10 بعد سبع دقائق`;
  const segments = S.parseTimestampedText(content);
  assert.equal(segments.length, 5);
  assert.equal(segments[0].startMs, 0);
  assert.equal(segments[1].startMs, 90000);
  assert.equal(segments[2].startMs, 195000);
  assert.equal(segments[3].startMs, 300000);
  assert.equal(segments[4].startMs, 430000);
  assert.equal(segments[0].text, "مقدمة الدرس");
  // نهاية المقطع الأول تُشتق من بداية الثاني
  assert.equal(segments[0].endMs, 90000);
  // المقطع الأخير يأخذ مدة تقديرية من طول نصه
  assert.ok(segments[4].endMs > segments[4].startMs);
});

/* ==============================================================
 *  ٤) نص عادي
 * ============================================================== */

test("توزيع النص العادي على مدة الفيديو", () => {
  const content = "الفقرة الأولى من الدرس العلمي.\n\nالفقرة الثانية وهي أطول قليلًا من الأولى.\n\nالفقرة الثالثة.";
  const segments = S.parsePlainText(content, { durationS: 300 });
  assert.equal(segments.length, 3);
  assert.equal(segments[0].startMs, 0);
  assert.equal(segments[2].endMs, 300000);
  // المقاطع متتابعة بلا فراغ أو تراكب
  for (let i = 1; i < segments.length; i++) {
    assert.equal(segments[i].startMs, segments[i - 1].endMs);
  }
  // الفقرة الأطول تأخذ زمنًا أكبر
  const d = segments.map((s) => s.endMs - s.startMs);
  assert.ok(d[1] > d[2]);
});

test("نص عادي بلا مدة معروفة يعطي توقيتات تقديرية متزايدة", () => {
  const segments = S.parsePlainText("فقرة أولى.\n\nفقرة ثانية.", {});
  assert.equal(segments.length, 2);
  assert.ok(segments[1].startMs >= segments[0].endMs - 1);
  assert.ok(segments[0].endMs > segments[0].startMs);
});

test("نص عادي طويل جدًا يُقسَّم تلقائيًا على الجُمل", () => {
  const long = Array.from({ length: 40 }, (_, i) => `هذه جملة رقم ${i} في الدرس الشرعي.`).join(" ");
  const segments = S.parsePlainText(long, { durationS: 600 });
  assert.ok(segments.length >= 3, `عدد المقاطع: ${segments.length}`);
  assert.ok(segments.every((s) => s.text.length < 900), "كل مقطع يجب أن يكون معقول الحجم");
});

/* ==============================================================
 *  ٥) الواجهة الموحّدة
 * ============================================================== */

test("parseSubtitles يحدّد الصيغة ويُرجع تحذيرات مفهومة", () => {
  const srt = S.parseSubtitles(SRT_SAMPLE);
  assert.equal(srt.format, "srt");
  assert.equal(srt.segments.length, 3);
  assert.deepEqual(srt.warnings, []);

  const vtt = S.parseSubtitles(VTT_SAMPLE, { filename: "lesson.vtt" });
  assert.equal(vtt.format, "vtt");
  assert.equal(vtt.segments.length, 2);

  const plain = S.parseSubtitles("فقرة أولى من الدرس.\n\nفقرة ثانية.", { durationS: 120 });
  assert.equal(plain.format, "text");
  assert.ok(plain.warnings[0].includes("تقديري"));

  const empty = S.parseSubtitles("   \n  ");
  assert.equal(empty.format, "empty");
  assert.equal(empty.segments.length, 0);
});

test("يقرأ JSON بصيغة json3 (مخرجات yt-dlp)", () => {
  const json3 = JSON.stringify({
    events: [
      { tStartMs: 0, dDurationMs: 4000, segs: [{ utf8: "المقدمة الأولى في الدرس المبارك" }] },
      { tStartMs: 30000, dDurationMs: 5000, segs: [{ utf8: "المحور الثاني وهو مقصود الدرس" }] }
    ]
  });
  const res = S.parseSubtitles(json3, { filename: "vid.json" });
  assert.equal(res.format, "json");
  assert.equal(res.segments.length, 2);
  assert.equal(res.segments[0].text, "المقدمة الأولى في الدرس المبارك");
});

test("التسامح: محتوى VTT يُقرأ حتى لو أُعلنت صيغته srt", () => {
  const res = S.parseSubtitles(VTT_SAMPLE, { format: "srt", filename: "wrong.srt" });
  assert.equal(res.segments.length, 2);
  assert.equal(res.segments[0].text, "الحمد لله");
});

test("التراجع التدريجي: نص موقّت أُعلنت صيغته srt فتقرأه الصيغة الصحيحة", () => {
  const content = `[00:30] أول مسألة في الدرس
[01:20] المسألة الثانية`;
  const res = S.parseSubtitles(content, { format: "srt", filename: "wrong.srt" });
  assert.equal(res.segments.length, 2);
  assert.ok(res.warnings.some((w) => w.includes("بدل")), `التحذيرات: ${JSON.stringify(res.warnings)}`);
  assert.equal(res.segments[1].startMs, 80000);
});

test("parseTimecode يقرأ كل الأشكال", () => {
  assert.equal(S.parseTimecode("00:00:01,500"), 1500);
  assert.equal(S.parseTimecode("00:00:01.500"), 1500);
  assert.equal(S.parseTimecode("01:30"), 90000);
  assert.equal(S.parseTimecode("1:02:03"), 3723000);
  assert.equal(S.parseTimecode("00:05"), 5000);
  assert.equal(S.parseTimecode("غير صالح"), null);
  assert.equal(S.parseTimecode(""), null);
});

test("المقاطع تُرتَّب زمنيًا وتُستبعد الفارغة", () => {
  const mixed = `1
00:00:10,000 --> 00:00:12,000
النص الثاني فعلًا

2
00:00:01,000 --> 00:00:03,000
   [موسيقى]   

3
00:00:05,000 --> 00:00:07,000
النص الأول فعلًا`;
  const res = S.parseSubtitles(mixed, { format: "srt" });
  assert.equal(res.segments.length, 2);
  assert.equal(res.segments[0].startMs, 5000);
  assert.equal(res.segments[1].startMs, 10000);
});
