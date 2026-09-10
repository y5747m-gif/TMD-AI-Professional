"use strict";

/**
 * mishkat/test/import.test.js
 * ---------------------------------------------------------------
 * اختبارات إدخال النصوص يدويًا: من ملف SRT/VTT، ومن نص ملصوق،
 * والاستيراد المجمّع من مجلد، وتقرير الفيديوهات التي تحتاج نصًا،
 * ثم التحقق من أن الاسترجاع يعرض النص المُدخل بالتوقيت والرابط.
 * ---------------------------------------------------------------
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mishkat-import-"));
process.env.MISHKAT_DATA_DIR = TMP;
process.env.MISHKAT_DB_PATH = path.join(TMP, "import.db");
process.env.MISHKAT_JSON_INDEX = path.join(TMP, "index.json");
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.MISHKAT_LLM_API_KEY;

const { openStore } = require("../lib/db");
const retrieve = require("../lib/retrieve");
const importer = require("../lib/import");

const SRT = `1
00:00:02,000 --> 00:00:08,000
أحكام الصيام تبدأ ببيان شروط وجوبه على المسلم البالغ العاقل القادر

2
00:01:10,000 --> 00:01:20,000
ويبطل الصيام بالأكل والشرب عمدًا مع العلم والاختيار عند جمهور أهل العلم

3
00:02:30,000 --> 00:02:40,000
ومن المفطرات كذلك القيء المتعمد والحجامة على قول كثير من الفقهاء`;

const VTT = `WEBVTT

00:00:03.000 --> 00:00:09.000
زكاة الفطر فريضة على كل مسلم صغيرًا كان أو كبيرًا

00:00:45.000 --> 00:00:55.000
ومقدارها صاع عن كل نفس والصاع أربعة أمداد والمد ربع الصاع`;

const PLAIN = `هذا درس في العقيدة يبدأ ببيان معنى التوحيد وأنواعه الثلاثة.

ثم بيان الشرك الأكبر والأصغر والفرق بينهما بضوابط واضحة.

وأخيرًا مسائل في الأسماء والصفات على منهج أهل السنة.`;

const store = openStore({ reload: true });

test.before(() => {
  // فيديوهات موجودة في القاعدة لكن بلا نص (كما يحدث فعليًا مع القناة)
  for (const id of ["vidSiyam0001", "vidZakat0002", "vidAqeedah03", "vidFaraid004"]) {
    store.upsertVideo({
      id,
      title: `درس ${id}`,
      url: `https://www.youtube.com/watch?v=${id}`,
      sourceKind: "channel",
      hasTranscript: false,
      error: "",
      durationS: 600
    });
  }
});

test("استخراج معرّف الفيديو من الروابط وأسماء الملفات", () => {
  assert.equal(importer.extractVideoId("https://www.youtube.com/watch?v=vidSiyam0001"), "vidSiyam0001");
  assert.equal(importer.extractVideoId("https://youtu.be/abcdefghijk"), "abcdefghijk");
  assert.equal(importer.extractVideoId("vidSiyam0001"), "vidSiyam0001");
  assert.equal(importer.extractVideoId("vidSiyam0001.ar.srt"), "vidSiyam0001");
  assert.equal(importer.extractVideoId("/tmp/subs/درس في الصيام [vidSiyam0001].srt"), "vidSiyam0001");
  assert.equal(importer.extractVideoId("ملف بلا معرّف.srt"), "");
  assert.equal(importer.extractVideoId(""), "");
});

test("إدخال نص من ملف SRT يُفهرس ويُربط بالتوقيت والرابط", async () => {
  const res = await importer.importTranscript(store, "vidSiyam0001", SRT, {
    filename: "vidSiyam0001.srt",
    fetchMeta: false,
    title: "أحكام الصيام"
  });

  assert.equal(res.videoId, "vidSiyam0001");
  assert.equal(res.format, "srt");
  assert.equal(res.segments, 3);
  assert.ok(res.chunks >= 2, `المقاطع: ${res.chunks}`);
  assert.ok(res.chars > 150);
  assert.equal(res.title, "أحكام الصيام");

  const video = store.getVideo("vidSiyam0001");
  assert.equal(video.has_transcript, 1);
  assert.equal(video.source_kind, "manual");
  assert.ok(video.segments_count > 0);

  // الاسترجاع: النص يعود بتوقيته ورابط الفيديو عند اللحظة نفسها
  const found = retrieve.search(store, "ما الذي يبطل الصيام؟");
  assert.ok(found.results.length > 0, "يجب أن يعيد النص المُدخل نتائج");
  const hits = found.results.filter((r) => r.videoId === "vidSiyam0001");
  assert.ok(hits.length > 0);
  assert.match(hits[0].link, /^https:\/\/www\.youtube\.com\/watch\?v=vidSiyam0001/);
  assert.equal(hits[0].sourceKind, "manual");
  assert.ok(/^\d{2}:\d{2}/.test(hits[0].time));

  // النص المتعلق بالمفطرات يُستشهد به في موضعه الزمني الصحيح (بعد الدقيقة الأولى)
  const detail = hits.find((r) => r.text.includes("الأكل والشرب") || r.text.includes("القيء"));
  assert.ok(detail, "يجب أن يظهر نص المفطرات في النتائج");
  const seconds = Number((detail.link.match(/t=(\d+)s/) || [])[1] || 0);
  assert.ok(seconds >= 60, `التوقيت المستخرج: ${seconds} ثانية (المتوقع 65 على الأقل)`);
  assert.ok(hits.every((r) => r.text.length > 20));
});

test("التفريغ الكامل يعرض مقاطع النص المُدخل بتوقيتات صحيحة", () => {
  const timeline = retrieve.getVideoTimeline(store, "vidSiyam0001");
  assert.ok(timeline);
  assert.ok(timeline.segments.length >= 2);
  assert.equal(timeline.segments[0].time, "00:02");
  const total = timeline.segments.map((s) => s.text).join(" ");
  assert.ok(total.includes("الحجامة"));

  // البحث داخل الفيديو
  const inside = retrieve.searchInVideo(store, "vidSiyam0001", "الحجامة");
  assert.ok(inside.matches > 0);
});

test("إدخال نص WebVTT لفيديو آخر", async () => {
  const res = await importer.importTranscript(store, "https://www.youtube.com/watch?v=vidZakat0002", VTT, {
    filename: "vidZakat0002.vtt",
    fetchMeta: false
  });
  assert.equal(res.videoId, "vidZakat0002");
  assert.equal(res.format, "vtt");
  assert.equal(res.segments, 2);

  const found = retrieve.search(store, "كم مقدار زكاة الفطر؟");
  const hits = found.results.filter((r) => r.videoId === "vidZakat0002");
  assert.ok(hits.length > 0, "يجب أن يعيد نص الزكاة نتائج");
  assert.ok(
    hits.some((r) => r.text.includes("صاع") || r.text.includes("أمداد")),
    "يجب أن يظهر نص المقدار (الصاع/الأمداد) في النتائج"
  );
});

test("إدخال نص عادي بلا توقيتات: يعمل بتوقيتات تقديرية مع تحذير واضح", async () => {
  const res = await importer.importTranscript(store, "vidAqeedah03", PLAIN, {
    fetchMeta: false,
    durationS: 300
  });
  assert.equal(res.format, "text");
  assert.ok(res.warnings.some((w) => w.includes("تقديري")));
  const found = retrieve.search(store, "ما أنواع التوحيد؟");
  assert.ok(found.results.some((r) => r.videoId === "vidAqeedah03"));
});

test("رفض المحتوى الفارغ ورفض الاستبدال عند طلبه", async () => {
  await assert.rejects(
    () => importer.importTranscript(store, "vidFaraid004", "   ", { fetchMeta: false }),
    /فارغ/
  );
  await assert.rejects(
    () => importer.importTranscript(store, "vidSiyam0001", SRT, { fetchMeta: false, replace: false }),
    /مسبقًا/
  );
  await assert.rejects(
    () => importer.importTranscript(store, "", SRT, { fetchMeta: false }),
    /غير صالح/
  );
});

test("الاستبدال يُحدّث النص ولا يُكرّر المقاطع", async () => {
  const short = `1
00:00:01,000 --> 00:00:05,000
نص مختصر بديل للاختبار`;
  const before = store.getVideo("vidZakat0002").chars;
  const res = await importer.importTranscript(store, "vidZakat0002", short, { fetchMeta: false, replace: true });
  const video = store.getVideo("vidZakat0002");
  assert.equal(res.segments, 1);
  assert.ok(video.chars < before, `الأحرف يجب أن تنقص: قبل ${before} — بعد ${video.chars}`);
  // لا تكرار ولا بقايا من النص القديم
  const timeline = retrieve.getVideoTimeline(store, "vidZakat0002");
  assert.equal(timeline.segments.length, 1);
  assert.ok(timeline.segments[0].text.includes("نص مختصر بديل"));
  assert.ok(!timeline.segments.some((s) => s.text.includes("صاع عن كل نفس")));
  // إعادة البحث لا تُرجع النص المحذوف
  const stale = retrieve.search(store, "كم مقدار صاع زكاة الفطر؟");
  assert.ok(!stale.results.some((r) => r.videoId === "vidZakat0002" && r.text.includes("أربعة أمداد")));
});

test("عند تعطيل جلب البيانات: عنوان افتراضي واضح بدل عنوان فارغ", async () => {
  const res = await importer.importTranscript(store, "vidTitle00001", SRT, { fetchMeta: false });
  assert.ok(res.title && res.title.length > 5, `العنوان: "${res.title}"`);
  assert.ok(res.title.includes("vidTitle00001"));
  assert.ok(res.warnings.some((w) => w.includes("fetchMeta") || w.includes("يدوي")));
  const video = store.getVideo("vidTitle00001");
  assert.ok(video.title.includes("vidTitle00001"));
});

test("عنوان يُمرَّر يدويًا يُحترم كما هو", async () => {
  const res = await importer.importTranscript(store, "vidTitle00002", SRT, {
    fetchMeta: false,
    title: "شرح عمدة الأحكام — الدرس الأول"
  });
  assert.equal(res.title, "شرح عمدة الأحكام — الدرس الأول");
  assert.equal(store.getVideo("vidTitle00002").title, "شرح عمدة الأحكام — الدرس الأول");
});

test("الاستيراد المجمّع من مجلد بمطابقة اسم الملف", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mishkat-subs-"));
  fs.writeFileSync(path.join(dir, "vidAqeedah03.srt"), SRT, "utf8");
  fs.writeFileSync(path.join(dir, "vidFaraid004.ar.vtt"), VTT, "utf8");
  fs.writeFileSync(path.join(dir, "ملف بلا معرّف.srt"), SRT, "utf8");
  fs.writeFileSync(path.join(dir, "ignore.md"), "# ليس ملف ترجمة", "utf8");

  const logs = [];
  const summary = await importer.importDirectory(store, dir, {
    fetchMeta: false,
    onProgress: (p) => logs.push(p)
  });

  assert.equal(summary.total, 3, `عدد الملفات المدعومة: ${summary.total}`);
  assert.equal(summary.ok, 2);
  assert.equal(summary.skipped + summary.failed, 1);
  assert.ok(summary.failures.some((f) => f.file.includes("بلا معرّف")));

  // كلا الفيديوين صار لهما نص
  assert.equal(store.getVideo("vidFaraid004").has_transcript, 1);
  assert.equal(store.getVideo("vidAqeedah03").has_transcript, 1);

  // ملفات غير مدعومة تُتجاهل
  assert.ok(!logs.some((l) => String(l.file).endsWith(".md")));
});

test("مجلد غير موجود أو فارغ يعطي رسالة واضحة", async () => {
  await assert.rejects(() => importer.importDirectory(store, "/no/such/dir"), /غير موجود/);
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "mishkat-empty-"));
  await assert.rejects(() => importer.importDirectory(store, emptyDir), /لا توجد ملفات/);
});

test("تقرير الفيديوهات التي تحتاج نصًا", () => {
  const report = importer.missingTranscripts(store);
  const allVideos = store.listVideos({ limit: 1000 });
  assert.equal(report.total, allVideos.length);
  assert.equal(report.indexed, allVideos.filter((v) => v.hasTranscript).length);
  assert.equal(report.missing, 0, "كل الفيديوهات صار لها نص بعد الاستيراد");

  // فيديو جديد بلا نص يظهر في التقرير
  store.upsertVideo({
    id: "vidNew000005",
    title: "درس جديد بلا نص",
    url: "https://www.youtube.com/watch?v=vidNew000005",
    sourceKind: "channel",
    hasTranscript: false,
    error: "لا يوجد نص: لا توجد ترجمة متاحة"
  });
  const after = importer.missingTranscripts(store);
  assert.equal(after.missing, 1);
  assert.equal(after.videos[0].id, "vidNew000005");
  assert.ok(after.videos[0].url.includes("watch?v=vidNew000005"));
  assert.ok(after.hint.includes("cli.js import"));
});

test("النصوص المُدخلة تُصدَّر إلى index.json وتُقرأ منه", () => {
  const out = store.exportJsonIndex();
  assert.ok(fs.existsSync(out.file));
  const { JsonStore } = require("../lib/db");
  const jsonStore = new JsonStore(out.file);
  const res = retrieve.search(jsonStore, "ما الذي يبطل الصيام؟");
  assert.ok(res.results.length > 0);
  assert.ok(res.results[0].link.includes("youtube.com/watch?v="));
});
