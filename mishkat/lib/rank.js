"use strict";

/**
 * mishkat/lib/rank.js
 * ---------------------------------------------------------------
 * ترتيب النتائج (فيديوهات + فتاوى/مقالات/استشارات) بتطبيع عربي واحد.
 *
 * الفكرة: لا نطلب تغطية كاملة لكلمات السؤال (وهذا مستحيل في الواقع)،
 * بل نحسب قوة التقاطع مع حقول النتيجة الثلاثة:
 *   العنوان (الأقوى) ← الوسوم ← المقتطف/الوصف،
 * مع تجنّب اعتبار المطابقة الواحدة على كلمة عامة قصيرة صلةً كافية.
 * ---------------------------------------------------------------
 */

const {
  normalizeArabic,
  contentTokens,
  lightStem,
  stripPrefix,
  keywordsOf,
  STOPWORDS
} = require("./arabic");

/** كلمات السؤال الجوهرية (بلا حروف جر، وبجذع خفيف) */
function queryTokens(question) {
  const raw = contentTokens(question).map((t) => stripPrefix(t));
  const out = new Set();
  for (const token of raw) {
    if (!token || token.length < 2) continue;
    out.add(token);
    const stem = lightStem(token);
    if (stem && stem.length >= 2) out.add(stem);
  }
  return [...out].filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** هل النص يحتوي الكلمة (نصًّا أو جذعًا)؟ */
function containsToken(normalizedText, tokensSet, token) {
  if (normalizedText.includes(token)) return true;
  const stem = lightStem(token);
  return stem.length >= 3 && tokensSet.has(stem);
}

function fieldHits(tokens, text) {
  const norm = normalizeArabic(text || "");
  if (!norm) return [];
  const stems = new Set(contentTokens(norm).map(lightStem));
  const hits = [];
  for (const token of tokens) {
    if (containsToken(norm, stems, token)) hits.push(token);
  }
  return [...new Set(hits)];
}

/**
 * أوزان الكلمات بحسب شيوعها في المجموعة:
 * الكلمة التي تتكرر في معظم العناصر (مثل «أحكام»، «شرح») لا تكفي وحدها للربط،
 * والكلمة النادرة (مثل «جمارك»، «تيمم») تحمل دلالة أعلى.
 * @param {Array<Set<string>>} tokenSets
 * @returns {(token:string) => number} وزن في المدى (0..1]
 */
function weightFn(tokenSets) {
  const df = new Map();
  for (const set of tokenSets) {
    for (const token of set) df.set(token, (df.get(token) || 0) + 1);
  }
  return (token) => {
    const stem = lightStem(token);
    const count = Math.max(df.get(token) || 0, df.get(stem) || 0);
    return 1 / Math.pow(1 + count, 0.8);
  };
}

/** نسبة تغطية الكلمات داخل نص (تُستخدم للعرض والتشخيص) */
function coverage(tokens, text) {
  if (!tokens.length) return 0;
  return fieldHits(tokens, text).length / tokens.length;
}

/**
 * درجة الملاءمة (0..1).
 * @param {string[]} tokens كلمات السؤال
 * @param {{title?:string, snippet?:string, tags?:string[]|string, kindBoost?:number}} fields
 * @param {{weight?:(token:string)=>number}} [opts] أوزان اختيارية (شيوع الكلمة في المجموعة)
 */
function scoreCandidate(tokens, { title = "", snippet = "", tags = [], kindBoost = 0 } = {}, opts = {}) {
  const weight = typeof opts.weight === "function" ? opts.weight : () => 1;
  const unique = [...new Set(tokens)].filter(Boolean);
  if (!unique.length) return 0;

  const tagText = Array.isArray(tags) ? tags.join(" ") : String(tags || "");
  const titleHits = fieldHits(unique, title);
  const tagHits = fieldHits(unique, tagText);
  const snippetHits = fieldHits(unique, snippet);

  const matched = [...new Set([...titleHits, ...tagHits, ...snippetHits])];
  if (!matched.length) return 0;

  const sum = (list) => list.reduce((total, token) => total + weight(token), 0);
  const matchedWeight = sum(matched);

  // الأوزان دون النصف تعني مطابقة كلمة شائعة لا تكفي لاعتبار النتيجة مرتبطة
  if (matchedWeight < 0.5) return Math.max(0, 0.05 + kindBoost);

  const denominator = sum(unique) || 1;
  const strength = (sum(titleHits) + sum(tagHits) * 0.85 + sum(snippetHits) * 0.45) / denominator;
  const score = Math.min(1, strength * 1.2 + Math.min(matchedWeight, 3) * 0.05 + kindBoost);
  return Math.max(0, Math.round(score * 1000) / 1000);
}

/** كلمات مفتاحية مختصرة للعرض أو للبحث */
function shortKeywords(question, limit = 6) {
  return keywordsOf(question, limit);
}

module.exports = { queryTokens, coverage, scoreCandidate, shortKeywords, fieldHits, weightFn };
