"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../lib/arabic");

test("تطبيع النص العربي: همزات وتشكيل وتاء مربوطة", () => {
  assert.equal(A.normalizeArabic("أَإِنَّ الأَمْرَ سَهْلٌ؟"), "اان الامر سهل");
  assert.equal(A.normalizeArabic("إسماعيل"), "اسماعيل");
  assert.equal(A.normalizeArabic("صلاة"), "صلاه");
  assert.equal(A.normalizeArabic("عبد الرحمن بن عوف"), "عبد الرحمن بن عوف");
});

test("تحويل الأرقام العربية إلى لاتينية", () => {
  assert.equal(A.normalizeArabic("١٢٣٤"), "1234");
  assert.equal(A.normalizeArabic("۵۶"), "56");
});

test("إزالة الرموز مع إبقاء الحروف", () => {
  assert.equal(A.normalizeArabic("الصلاةُ؟! (مهمة)"), "الصلاه مهمه");
});

test("التقطيع وإسقاط كلمات التوقف", () => {
  const tokens = A.contentTokens("ما حكم صلاة الجماعة في المسجد مع الإمام؟");
  assert.ok(tokens.includes("حكم"));
  assert.ok(tokens.includes("صلاه") || tokens.includes("صلاة"));
  assert.ok(!tokens.includes("ما"));
  assert.ok(!tokens.includes("في"));
});

test("المرادفات الشرعية تُوسّع البحث", () => {
  const syns = A.synonymsOf("ربا");
  assert.ok(syns.includes("بنك") || syns.includes("فوائد"), "يجب أن تُرجع مرادفات الربا");
  const syns2 = A.synonymsOf("صلاة");
  assert.ok(syns2.length > 3, "للصلاة مرادفات كثيرة");
});

test("تصنيف الأسئلة يعيد بابًا مناسبًا", () => {
  assert.equal(A.classifyQuery("ما حكم زكاة الفطر؟").primary.id, "zakat");
  assert.equal(A.classifyQuery("هل يجوز بيع الذهب بالتقسيط؟").primary.id, "muamalat");
  assert.equal(A.classifyQuery("ما معنى أسماء الله الحسنى؟").primary.id, "aqeedah");
  assert.equal(A.classifyQuery("ما درجة حديث كذا وهل هو صحيح؟").primary.id, "hadith");
});

test("نوع المطلوب في السؤال", () => {
  assert.equal(A.questionIntent("ما حكم صلاة الجماعة؟").id, "hukm");
  assert.equal(A.questionIntent("كم مقدار زكاة الفطر؟").id, "count");
  assert.equal(A.questionIntent("ما تفسير هذه الآية؟").id, "meaning");
  assert.equal(A.questionIntent("لماذا حرم الربا؟").id, "why");
});

test("توسيع الاستعلام ينتج مجموعات صحيحة", () => {
  const groups = A.expandQuery("حكم صلاة الجماعة");
  assert.ok(groups.length >= 2);
  for (const g of groups) {
    assert.ok(Array.isArray(g) && g.length >= 1);
    for (const term of g) assert.equal(typeof term, "string");
  }
  const flat = groups.flat();
  assert.ok(flat.includes("صلاه") || flat.includes("صلاة"));
});

test("الكلمات المفتاحية والجمل", () => {
  const kws = A.keywordsOf("الصلاة على النبي والصلاة في المسجد");
  assert.ok(kws.length > 0);
  const sentences = A.splitSentences("الجملة الأولى. الجملة الثانية؟ والثالثة");
  assert.equal(sentences.length, 3);
});
