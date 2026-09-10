"use strict";

/**
 * mishkat/lib/subtitles.js
 * ---------------------------------------------------------------
 * قراءة ملفات الترجمة والنصوص الموقّتة وتحويلها إلى مقاطع زمنية:
 *   • SRT   (00:00:01,000 --> 00:00:04,000)
 *   • WebVTT (00:00:01.000 --> 00:00:04.000 + إعدادات الموضع + NOTE)
 *   • JSON (json3 من yt-dlp/يوتيوب)
 *   • نص موقّت مكتوب يدويًا: [00:12] … / (00:12) … / 00:12 - …
 *   • نص عادي بلا توقيتات: يُقسَّم بالتساوي على مدة الفيديو
 * ---------------------------------------------------------------
 */

const { parseJson3 } = require("./youtube");

/* ==============================================================
 *  أدوات مساعدة
 * ============================================================== */

function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** يزيل الوسوم والتنسيقات الشائعة في ملفات الترجمة */
function stripCueMarkup(text) {
  return decodeEntities(text)
    .replace(/\{\\[^}]*\}/g, " ") // أنماط ASS/SSA
    .replace(/<\/?(?:b|i|u|s|font|c|v|ruby|rt|span|em|strong)[^>]*>/gi, " ")
    .replace(/<[^>]{1,40}>/g, " ")
    .replace(/[♪♫♬]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * هل المقطع مجرّد علامة صوتية/رمزية بلا نص حقيقي؟
 * (مثل: [موسيقى] ، (تصفيق) ، ♪♪ ، --- ، ١٢٣)
 * يُحتفظ بالنص الذي فيه أي حرف عربي أو لاتيني حتى لو صاحبه وسم صوتي.
 */
function isNoiseOnly(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  const stripped = t
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[♪♫♬\s.,،؛;:\-–—_*0-9\u0660-\u0669]/g, " ");
  return !/[\u0621-\u064Aa-zA-Z]/.test(stripped);
}

/** يحوّل "00:00:01,000" / "00:00:01.000" / "01:02" إلى ملّي ثانية */
function parseTimecode(value) {
  const raw = String(value || "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .trim()
    .replace(",", ".");
  const m = raw.match(/^(?:(\d+):)?(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const [, a, b, c, ms] = m;
  const hours = a != null && b != null ? Number(a) : 0;
  const minutes = a != null && b != null ? Number(b) : a != null ? Number(a) : 0;
  const seconds = Number(c);
  const milliseconds = ms ? Number(String(ms).padEnd(3, "0")) : 0;
  const total = ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
  return Number.isFinite(total) ? total : null;
}

/* ==============================================================
 *  ١) SRT
 * ============================================================== */

function parseSrt(input) {
  const text = stripBom(input).replace(/\r\n?/g, "\n");
  const segments = [];

  // نقسّم على الأسطر الفارغة لاستخراج كل «cue»
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    const timeIndex = lines.findIndex((l) => l.includes("-->"));
    if (timeIndex === -1) continue;

    const [startRaw, endRaw] = lines[timeIndex].split("-->").map((s) => s.trim().split(/\s+/)[0]);
    const startMs = parseTimecode(startRaw);
    if (startMs == null) continue;
    const endMs = parseTimecode(endRaw) ?? startMs;

    const body = lines
      .slice(timeIndex + 1)
      .map(stripCueMarkup)
      .filter((l) => l && !isNoiseOnly(l))
      .join(" ")
      .trim();
    if (!body || isNoiseOnly(body)) continue;

    segments.push({ startMs, endMs: Math.max(endMs, startMs), text: body });
  }
  return segments;
}

/* ==============================================================
 *  ٢) WebVTT
 * ============================================================== */

function parseVtt(input) {
  const text = stripBom(input).replace(/\r\n?/g, "\n").replace(/^WEBVTT[^\n]*\n/, "");
  const segments = [];

  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    // تجاهل تعليقات وبيانات الأنماط
    if (/^(NOTE|STYLE|REGION)\b/i.test(lines[0])) continue;

    const timeIndex = lines.findIndex((l) => l.includes("-->"));
    if (timeIndex === -1) continue;

    const parts = lines[timeIndex].split("-->");
    const startMs = parseTimecode(parts[0].trim().split(/\s+/)[0]);
    // نُبقي على الجزء الأول من نهاية التوقيت ونتجاهل إعدادات الموضع (align:start …)
    const endMs = parseTimecode((parts[1] || "").trim().split(/\s+/)[0]);
    if (startMs == null) continue;

    const body = lines
      .slice(timeIndex + 1)
      .filter((l) => !/^(NOTE|STYLE|REGION)\b/i.test(l))
      .map(stripCueMarkup)
      .filter((l) => l && !isNoiseOnly(l))
      .join(" ")
      .trim();
    if (!body || isNoiseOnly(body)) continue;

    segments.push({ startMs, endMs: Math.max(endMs ?? startMs, startMs), text: body });
  }
  return segments;
}

/* ==============================================================
 *  ٣) نص موقّت مكتوب يدويًا
 * ============================================================== */

const TIMED_LINE_RE =
  /^\s*(?:[-•*]\s*)?(?:\[|\()?\s*((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*(?:\]|\))?\s*(?:[-–—:]\s*)?(.+)$/;

function parseTimestampedText(input) {
  const text = stripBom(input).replace(/\r\n?/g, "\n");
  const segments = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = TIMED_LINE_RE.exec(trimmed);
    if (!m) continue;
    const startMs = parseTimecode(m[1]);
    if (startMs == null) continue;
    const body = stripCueMarkup(m[2]);
    if (!body || isNoiseOnly(body)) continue;
    segments.push({ startMs, endMs: startMs, text: body });
  }

  // نُكمل نهايات المقاطع من بداية المقطع التالي
  for (let i = 0; i < segments.length; i++) {
    const next = segments[i + 1];
    segments[i].endMs =
      next && next.startMs > segments[i].startMs
        ? next.startMs
        : segments[i].startMs + Math.max(4000, Math.round(segments[i].text.length * 60));
  }
  return segments;
}

/* ==============================================================
 *  ٤) نص عادي بلا توقيتات
 * ============================================================== */

/**
 * يقسّم النص إلى فقرات ويوزّعها زمنيًا.
 * إن عُرفت مدة الفيديو تُوزَّع المقاطع بالتساوي بحسب عدد الأحرف،
 * وإلا فكل مقطع يأخذ مدة تقديرية من طوله.
 */
function parsePlainText(input, opts = {}) {
  const text = stripBom(input).replace(/\r\n?/g, "\n").trim();
  if (!text) return [];

  let parts = text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // إن كان النص فقرة واحدة طويلة: نقسّمه على الجُمل
  if (parts.length === 1 && parts[0].length > 1200) {
    const sentences = parts[0].match(/[^.!؟?]+[.!؟?]?/g) || [parts[0]];
    parts = [];
    let buffer = "";
    for (const s of sentences) {
      if ((buffer + s).length > 600 && buffer) {
        parts.push(buffer.trim());
        buffer = "";
      }
      buffer += s;
    }
    if (buffer.trim()) parts.push(buffer.trim());
  }

  const durationMs = Number(opts.durationS || 0) * 1000;
  const totalChars = parts.reduce((a, p) => a + p.length, 0) || 1;

  let cursor = 0;
  return parts.map((p) => {
    const share = durationMs > 0 ? Math.round((p.length / totalChars) * durationMs) : Math.max(6000, p.length * 70);
    const startMs = cursor;
    const endMs = cursor + share;
    cursor = endMs;
    return { startMs, endMs, text: p };
  });
}

/* ==============================================================
 *  ٥) اكتشاف الصيغة والتحليل الموحّد
 * ============================================================== */

function detectFormat(input, filename = "") {
  const name = String(filename || "").toLowerCase();
  const text = stripBom(input).trim();
  const head = text.slice(0, 2000);

  if (name.endsWith(".vtt") || /^WEBVTT\b/m.test(head)) return "vtt";
  if (name.endsWith(".srt")) return "srt";
  if (name.endsWith(".json") || /^[[{]/.test(text)) {
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data?.events) || Array.isArray(data?.cues)) return "json";
      if (Array.isArray(data?.segments)) return "json";
    } catch (_) {
      /* ليس JSON */
    }
  }
  if (/-->/.test(head)) return name.endsWith(".vtt") ? "vtt" : "srt";
  if (TIMED_LINE_RE.test(head.split("\n").find((l) => l.trim()) || "")) return "timed";

  return "text";
}

/**
 * يحلّل أي نوع من المحتوى ويُرجع مقاطع موحّدة.
 * @returns {{format:string, segments:Array<{startMs:number,endMs:number,text:string}>, warnings:string[]}}
 */
function parseSubtitles(input, opts = {}) {
  const content = stripBom(input);
  const warnings = [];
  const format = opts.format && opts.format !== "auto" ? opts.format : detectFormat(content, opts.filename);

  let segments = [];

  const attempt = (fn, name) => {
    try {
      return fn() || [];
    } catch (err) {
      warnings.push(`تعذّر تحليل الصيغة ${name}: ${err.message}`);
      return [];
    }
  };

  switch (format) {
    case "srt":
      segments = attempt(() => parseSrt(content), "SRT");
      break;
    case "vtt":
      segments = attempt(() => parseVtt(content), "WebVTT");
      break;
    case "json": {
      const data = attempt(() => JSON.parse(content), "JSON") || null;
      if (data) {
        if (Array.isArray(data.events)) segments = parseJson3(data);
        else if (Array.isArray(data.cues)) segments = parseJson3({ events: data.cues.map((c) => ({ tStartMs: c.startMs ?? c.start, dDurationMs: (c.endMs ?? c.end ?? 0) - (c.startMs ?? c.start ?? 0), segs: [{ utf8: c.text || "" }] })) });
        else if (Array.isArray(data.segments)) {
          segments = data.segments.map((s) => ({
            startMs: Number(s.startMs ?? s.start ?? 0),
            endMs: Number(s.endMs ?? s.end ?? 0),
            text: String(s.text || "")
          }));
        }
      }
      if (!segments.length) warnings.push("ملف JSON لا يحتوي مقاطع معروفة (events/segments).");
      break;
    }
    case "timed":
      segments = attempt(() => parseTimestampedText(content), "نص موقّت");
      break;
    default:
      break;
  }

  // التراجع التدريجي عند فشل الصيغة
  if (!segments.length && format !== "text") {
    const fallbacks = [
      ["srt", () => parseSrt(content)],
      ["vtt", () => parseVtt(content)],
      ["timed", () => parseTimestampedText(content)]
    ];
    for (const [name, fn] of fallbacks) {
      if (name === format) continue;
      const got = attempt(fn, name);
      if (got.length) {
        warnings.push(`تم قراءة المحتوى بصيغة ${name} بدل ${format}.`);
        segments = got;
        break;
      }
    }
  }

  let usedFormat = format;
  if (!segments.length) {
    segments = attempt(() => parsePlainText(content, opts), "نص عادي");
    usedFormat = segments.length ? "text" : "empty";
    if (segments.length) {
      warnings.push(
        opts.durationS
          ? "النص بلا توقيتات: تم توزيع المقاطع على مدة الفيديو تقديريًا (التوقيتات تقريبية)."
          : "النص بلا توقيتات ولا مدة معروفة: التوقيتات تقديرية من طول النص."
      );
    }
  } else {
    usedFormat = format;
  }

  const clean = segments
    .map((s) => ({
      startMs: Math.max(0, Math.round(Number(s.startMs) || 0)),
      endMs: Math.max(0, Math.round(Number(s.endMs) || 0)),
      text: String(s.text || "").replace(/\s+/g, " ").trim()
    }))
    .filter((s) => s.text.length > 0 && !isNoiseOnly(s.text))
    .sort((a, b) => a.startMs - b.startMs);

  return { format: usedFormat, segments: clean, warnings };
}

module.exports = {
  parseSrt,
  parseVtt,
  parseTimestampedText,
  parsePlainText,
  parseSubtitles,
  detectFormat,
  parseTimecode,
  stripCueMarkup,
  isNoiseOnly
};
