"use strict";

/**
 * mishkat/lib/htmlx.js
 * ---------------------------------------------------------------
 * أدوات تحليل HTML/Markdown مكتوبة يدويًا بلا أي مكتبة خارجية:
 *   • فك رموز HTML (Entities) وإزالة الوسوم.
 *   • تقطيع عنصر متوازن (Balanced slice) لوسم معيّن.
 *   • العثور على العناوين (h1..h6) ومقاطعها النصية.
 *   • استخراج الروابط.
 *   • تحويل Markdown إلى HTML مبسّط حتى نتعامل مع مخرجات
 *     قارئ الصفحات (Reader) وقارئ الموقع بالمنطق نفسه.
 * ---------------------------------------------------------------
 */

/* ==============================================================
 *  فك الرموز وإزالة الوسوم
 * ============================================================== */

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  shy: "",
  zwj: "\u200d",
  zwnj: "\u200c",
  rlm: "\u200f",
  lrm: "\u200e"
};

function decodeEntities(input) {
  return String(input == null ? "" : input).replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,10});/g,
    (match, body) => {
      if (body[0] === "#") {
        const isHex = body[1] === "x" || body[1] === "X";
        const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
        if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
          try {
            return String.fromCodePoint(code);
          } catch (_) {
            return match;
          }
        }
        return match;
      }
      const key = body.toLowerCase();
      return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : match;
    }
  );
}

/** يحذف كتل script/style/التعليقات */
function stripNoiseBlocks(html) {
  return String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ");
}

const BLOCK_TAGS =
  /<\/?(?:p|div|br|li|ul|ol|tr|td|th|table|h[1-6]|section|article|header|footer|nav|aside|blockquote|pre|figure|hr|form|label|option|dt|dd|dl|main|details|summary)\b[^>]*>/gi;

/** يحوّل HTML إلى نص عادي (يحافظ على أسطر الفواصل) */
function htmlToText(html) {
  let s = stripNoiseBlocks(html);
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(BLOCK_TAGS, "\n");
  s = s.replace(/<[^>]*>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/\u00a0/g, " ");
  return squeezeLines(s);
}

/** يقلّص المسافات والأسطر الفارغة */
function squeezeLines(text) {
  return String(text || "")
    .replace(/[ \t\u200f\u200e]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** ينظّف نصًا عربيًا آتيًا من صفحة (أسطر/مسافات/علامات مكرّرة) */
function cleanText(text) {
  let s = squeezeLines(text);
  s = s.replace(/\.{3,}/g, "…");
  s = s.replace(/([،.!؟])\1{2,}/g, "$1");
  s = s.replace(/\s+([،.!؟:;])/g, "$1");
  return s.trim();
}

/** مقتطف بحدّ أحرف معيّن ينتهي عند حدّ كلمة */
function excerpt(text, maxChars = 300) {
  const s = cleanText(text).replace(/\s+/g, " ");
  if (s.length <= maxChars) return s;
  const cut = s.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/* ==============================================================
 *  تقطيع العناصر المتوازنة
 * ============================================================== */

/** يبحث عن أول وسم مفتوح لاسم معيّن بعد فهرس معيّن */
function findOpenTag(html, tagName, from = 0) {
  const re = new RegExp(`<${tagName}\\b`, "gi");
  re.lastIndex = from;
  const m = re.exec(html);
  return m ? m.index : -1;
}

/**
 * يقتطع محتوى العنصر المتوازن بدءًا من موضع الوسم المفتوح.
 * @returns {{inner:string, start:number, end:number}|null}
 */
function sliceElement(html, openIndex, tagName) {
  if (openIndex < 0) return null;
  const openRe = new RegExp(`<${tagName}\\b[^>]*?(/?)>`, "gi");
  openRe.lastIndex = openIndex;
  const openMatch = openRe.exec(html);
  if (!openMatch) return null;
  if (openMatch[1] === "/") {
    return { inner: "", start: openIndex, end: openMatch.index + openMatch[0].length };
  }

  const contentStart = openMatch.index + openMatch[0].length;
  const tagRe = new RegExp(`<${tagName}\\b[^>]*?(/?)>|</${tagName}\\s*>`, "gi");
  tagRe.lastIndex = contentStart;

  let depth = 1;
  let m;
  while ((m = tagRe.exec(html))) {
    const isClose = m[0].startsWith("</");
    const selfClosed = !isClose && m[1] === "/";
    if (isClose) {
      depth -= 1;
      if (depth === 0) {
        return { inner: html.slice(contentStart, m.index), start: openIndex, end: tagRe.lastIndex };
      }
    } else if (!selfClosed) {
      depth += 1;
    }
  }
  return { inner: html.slice(contentStart), start: openIndex, end: html.length };
}

/** يقتطع محتوى أول عنصر يحمل سمة معيّنة (مثال: itemprop="text") */
function sliceElementByAttr(html, tagName, attrSource, from = 0) {
  const re = new RegExp(`<${tagName}\\b[^>]*${attrSource}[^>]*>`, "i");
  const rest = html.slice(from);
  const m = re.exec(rest);
  if (!m) return null;
  const openIndex = from + m.index;
  return sliceElement(html, openIndex, tagName);
}

/* ==============================================================
 *  العناوين والمقاطع
 * ============================================================== */

const HEADING_RE = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;

/** يسرد كل العناوين: [{level, text, start, end, innerStart}] */
function headings(html) {
  const out = [];
  HEADING_RE.lastIndex = 0;
  let m;
  while ((m = HEADING_RE.exec(html))) {
    out.push({
      level: Number(m[1]),
      text: cleanText(htmlToText(m[2])),
      start: m.index,
      end: HEADING_RE.lastIndex,
      innerStart: m.index + m[0].indexOf(">") + 1
    });
  }
  return out;
}

function normalizeLabel(text) {
  return cleanText(text)
    .replace(/[\u0640\u064b-\u0652\u0670\u06d6-\u06ed]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[^\u0621-\u064a\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** هل نصّ العنوان يطابق أحد الألقاب المعطاة؟ */
function labelMatches(text, labels) {
  const norm = normalizeLabel(text);
  if (!norm) return false;
  return labels.some((label) => {
    const l = normalizeLabel(label);
    if (!l) return false;
    return norm === l || norm.startsWith(l) || norm.includes(l);
  });
}

/**
 * يعيد نصًّا يقع بعد عنوان يحمل أحد الألقاب، ويتوقف عند العنوان التالي
 * (أو عند أحد عناوين الوقف إن حُدّدت).
 */
function sectionAfterHeading(html, labels, { from = 0, stopLabels = [] } = {}) {
  const list = headings(html);
  const startIdx = list.findIndex((h) => h.start >= from && labelMatches(h.text, labels));
  if (startIdx === -1) return { text: "", html: "", found: false };

  const start = list[startIdx];
  let end = html.length;
  for (let i = startIdx + 1; i < list.length; i++) {
    const next = list[i];
    // نتوقف عند أول عنوان لا يقلّ مستواه عن عنوان البداية،
    // أو عند أحد عناوين الوقف المحدَّدة صراحةً.
    if (next.level <= start.level || labelMatches(next.text, stopLabels)) {
      end = next.start;
      break;
    }
  }

  const inner = html.slice(start.end, end);
  return { text: cleanText(htmlToText(inner)), html: inner, found: true };
}

/* ==============================================================
 *  الروابط
 * ============================================================== */

const ANCHOR_RE = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/i;

function attrValue(attrs, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s">]+))`, "i");
  const m = re.exec(attrs || "");
  return m ? decodeEntities(m[1] || m[2] || m[3] || "") : "";
}

/** يسرد كل الروابط: [{href, text, start, end, attrs}] */
function links(html) {
  const out = [];
  ANCHOR_RE.lastIndex = 0;
  let m;
  while ((m = ANCHOR_RE.exec(html))) {
    const hrefMatch = HREF_RE.exec(m[1] || "");
    const href = hrefMatch ? decodeEntities(hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || "") : "";
    if (!href) continue;
    out.push({
      href: href.trim(),
      text: cleanText(htmlToText(m[2])),
      start: m.index,
      end: ANCHOR_RE.lastIndex,
      attrs: m[1] || ""
    });
  }
  return out;
}

/** يزيل روابط عناصر التنقّل (شارات التصنيف) من مقتطف */
function stripLinksFromText(html) {
  return cleanText(htmlToText(String(html || "").replace(/<a\b[\s\S]*?<\/a\s*>/gi, " ")));
}

/* ==============================================================
 *  تحويل Markdown (مخرجات قارئ الصفحات) إلى HTML مبسّط
 * ============================================================== */

function escapeHtml(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** يحوّل الروابط داخل النص: [نص](رابط) */
function inlineMarkdown(text) {
  return String(text || "").replace(
    /\[([^\]\n]{0,300})\]\(\s*(https?:\/\/[^\s)]+|\/[^\s)]*)\s*\)/g,
    (_m, label, href) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
  );
}

/** تحويل مبسّط: عناوين، قوائم، اقتباسات، روابط، تأكيد */
function markdownToHtml(md) {
  const lines = String(md || "").split(/\r?\n/);
  const out = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineMarkdown(escapeHtml(heading[2].trim()))}</h${level}>`);
      continue;
    }

    const bullet = /^\s*(?:[*+-]|\d{1,3}[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inlineMarkdown(escapeHtml(bullet[1].trim()))}</li>`);
      continue;
    }

    const quote = /^\s*>\s+(.*)$/.exec(line);
    if (quote) {
      closeList();
      out.push(`<blockquote>${inlineMarkdown(escapeHtml(quote[1].trim()))}</blockquote>`);
      continue;
    }

    closeList();
    out.push(`<p>${inlineMarkdown(escapeHtml(line.trim()))}</p>`);
  }

  closeList();
  return out.join("\n");
}

/** هل النص القادم Markdown (من قارئ صفحات) أم HTML؟ */
function looksLikeHtml(text) {
  return /<\s*(?:!doctype|html|body|div|p|h[1-6]|a)\b/i.test(String(text || "").slice(0, 4000));
}

/** يعيد HTML موحّدًا (يحوّل Markdown إن لزم) */
function toUnifiedHtml(text) {
  return looksLikeHtml(text) ? String(text) : markdownToHtml(text);
}

module.exports = {
  decodeEntities,
  stripNoiseBlocks,
  htmlToText,
  squeezeLines,
  cleanText,
  excerpt,
  findOpenTag,
  sliceElement,
  sliceElementByAttr,
  headings,
  labelMatches,
  normalizeLabel,
  sectionAfterHeading,
  links,
  attrValue,
  stripLinksFromText,
  escapeHtml,
  markdownToHtml,
  inlineMarkdown,
  looksLikeHtml,
  toUnifiedHtml
};
