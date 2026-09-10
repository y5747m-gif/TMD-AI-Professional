"use strict";

/**
 * mishkat/lib/text.js
 * ---------------------------------------------------------------
 * تنظيف النصوص المستخرجة من يوتيوب وتقسيمها إلى مقاطع قابلة للبحث
 * (Chunks) مع الحفاظ على التوقيت الزمني لكل مقطع.
 * ---------------------------------------------------------------
 */

/* ==============================================================
 *  تنظيف
 * ============================================================== */

const NOISE_PATTERNS = [
  /\[[^\]]{0,60}(موسيقى|موسيقا|تصفيق|ضحك|أصوات|صوت|نغمة|music|applause|laughter)[^\]]{0,60}\]/gi,
  /\((?:موسيقى|تصفيق|ضحك|music|applause)\)/gi,
  /\[[^\]]{0,40}\]/g
];

function cleanSegment(text) {
  let s = String(text == null ? "" : text);
  for (const re of NOISE_PATTERNS) s = s.replace(re, " ");
  s = s
    .replace(/[♪♫♬]+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  s = s.replace(/\s+/g, " ").trim();
  // إزالة علامات الترقيم المتكررة
  s = s.replace(/([.,!؟?]){2,}/g, "$1");
  return s;
}

/** يزيل التكرار الناتج عن الترجمة التلقائية المتدحرجة */
function dedupeRepeats(text) {
  const words = String(text || "").split(/\s+/);
  const out = [];
  for (let i = 0; i < words.length; i++) {
    // تكرار كلمة واحدة مباشرة
    if (out.length && out[out.length - 1] === words[i]) continue;

    // تكرار عبارة من كلمتين أو ثلاث
    let repeated = false;
    for (const n of [3, 2]) {
      if (out.length >= n && i + n <= words.length) {
        const prev = out.slice(-n).join(" ");
        const next = words.slice(i, i + n).join(" ");
        if (prev === next) {
          i += n - 1;
          repeated = true;
          break;
        }
      }
    }
    if (repeated) continue;
    out.push(words[i]);
  }
  return out.join(" ");
}

/* ==============================================================
 *  تقسيم إلى مقاطع (Chunks)
 * ============================================================== */

/**
 * يحوّل مقاطع الترجمة الزمنية إلى مقاطع نصية متماسكة.
 * @param {Array<{startMs:number,endMs:number,text:string}>} segments
 * @param {{chunkChars?:number, maxMs?:number, overlapChars?:number}} opts
 */
function buildChunks(segments, opts = {}) {
  const chunkChars = Number(opts.chunkChars || 300);
  const maxMs = Number(opts.maxMs || 45000);
  const overlapChars = Number(opts.overlapChars || 0);

  const cleaned = [];
  for (const seg of segments || []) {
    const text = dedupeRepeats(cleanSegment(seg.text));
    if (!text) continue;
    cleaned.push({
      startMs: Number(seg.startMs || 0),
      endMs: Number(seg.endMs || seg.startMs || 0),
      text
    });
  }
  if (!cleaned.length) return [];

  const chunks = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    const text = current.parts.join(" ").replace(/\s+/g, " ").trim();
    if (text.length > 1) {
      chunks.push({
        idx: chunks.length,
        startMs: current.startMs,
        endMs: current.endMs,
        text
      });
    }
    if (overlapChars > 0) {
      const tail = text.slice(-overlapChars);
      const cut = tail.indexOf(" ");
      const overlapText = cut > 0 ? tail.slice(cut + 1).trim() : "";
      current = overlapText
        ? {
            startMs: current.endMs,
            endMs: current.endMs,
            parts: [overlapText],
            length: overlapText.length
          }
        : null;
    } else {
      current = null;
    }
  };

  for (const seg of cleaned) {
    if (!current) {
      current = { startMs: seg.startMs, endMs: seg.endMs, parts: [seg.text], length: seg.text.length };
      continue;
    }
    const gap = seg.startMs - current.endMs;
    const wouldExceed = current.length + seg.text.length + 1 > chunkChars;
    const tooLong = seg.endMs - current.startMs > maxMs;
    const longPause = gap > 3500;
    if ((wouldExceed || tooLong || longPause) && current.length >= 120) {
      flush();
      if (!current) {
        current = { startMs: seg.startMs, endMs: seg.endMs, parts: [seg.text], length: seg.text.length };
        continue;
      }
    }
    current.parts.push(seg.text);
    current.length += seg.text.length + 1;
    current.endMs = Math.max(current.endMs, seg.endMs);
  }
  flush();

  // إعادة ترقيم نهائية
  return chunks.map((c, i) => ({ ...c, idx: i }));
}

/** مقتطف نصي لطيف للعرض */
function excerpt(text, maxChars = 220) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= maxChars) return s;
  const cut = s.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** يستخرج عناوين/عبارات مفتاحية من نص (للفهرسة أو للتلميحات) */
function topPhrases(text, limit = 5) {
  const words = String(text || "")
    .replace(/[^\u0621-\u064Aa-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

module.exports = {
  cleanSegment,
  dedupeRepeats,
  buildChunks,
  excerpt,
  topPhrases
};
