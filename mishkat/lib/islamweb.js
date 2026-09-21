"use strict";

/**
 * mishkat/lib/islamweb.js
 * ---------------------------------------------------------------
 * موصّل موقع «إسلام ويب» (islamweb.net):
 *   • البحث في: الفتاوى، الاستشارات، المقالات (محرك البحث العام).
 *   • جلب نصّ الوثيقة: السؤال + الإجابــة + الرقم + التاريخ + الرابط.
 *   • استراتيجيتان للجلب: الاتصال المباشر، ثم قارئ صفحات (Reader)
 *     عند الحجب أو انتهاء المهلة — مع ذاكرة مؤقتة للنتائج.
 *
 * لا نُخزّن نسخًا دائمة من محتوى الموقع: كل نداء يُجلب لحظيًا ويُوثَّق
 * برابط المصدر، والذاكرة المؤقتة اختيارية ومحدودة المدة.
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const config = require("./config");
const htmlx = require("./htmlx");
const rank = require("./rank");
const { normalizeArabic } = require("./arabic");

const IW = config.ISLAMWEB;

/* ==============================================================
 *  ثوابت الموقع
 * ============================================================== */

const KINDS = {
  fatwa: {
    id: "fatwa",
    label: "فتوى",
    sectionLabel: "الفتاوى",
    searchPath: "/ar/fatwa/?page=websearch&stxt=",
    docPath: "/ar/fatwa/",
    listPath: "/ar/fatwa/",
    boost: 0.06
  },
  consult: {
    id: "consult",
    label: "استشارة",
    sectionLabel: "الاستشارات",
    searchPath: "/ar/consult/?page=websearch&stxt=",
    docPath: "/ar/consult/",
    listPath: "/ar/consult/",
    boost: 0
  },
  article: {
    id: "article",
    label: "مقال",
    sectionLabel: "المقالات",
    searchPath: null, // المقالات تُبحَث عبر محرك البحث العام
    docPath: "/ar/article/",
    listPath: "/ar/articles/",
    boost: -0.04
  }
};

const GENERAL_SEARCH_PATH = "/ar/articles/index.php?page=websearch&stxt=";

const REF_RE = /\/ar\/(fatwa|consult|article)\/(\d{1,9})(?:[/?#]|$)/i;
const ANY_LINK_REF_RE = /\/(fatwa|consult|article)\/(\d{1,9})/i;

class IslamWebError extends Error {
  constructor(message, code = "islamweb_error") {
    super(message);
    this.name = "IslamWebError";
    this.code = code;
  }
}

/* ==============================================================
 *  الذاكرة المؤقتة (RAM + ملفات اختيارية)
 * ============================================================== */

const memory = new Map();
let diskCacheBroken = false;

function cacheKey(url) {
  return crypto.createHash("sha1").update(url).digest("hex");
}

function cacheGet(url) {
  const entry = memory.get(url);
  if (!entry) return null;
  if (Date.now() - entry.at > IW.cacheTtlMinutes * 60000) {
    memory.delete(url);
    return null;
  }
  return entry.value;
}

function cacheSet(url, value) {
  memory.set(url, { at: Date.now(), value });
  if (memory.size > 200) {
    const oldest = [...memory.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) memory.delete(oldest[0]);
  }
  // ملفات اختيارية: تُتجاهل بصمت في البيئات للقراءة فقط (مثل Vercel)
  if (diskCacheBroken) return;
  try {
    fs.mkdirSync(config.CACHE_DIR, { recursive: true });
    const file = path.join(config.CACHE_DIR, `${cacheKey(url)}.json`);
    fs.writeFileSync(file, JSON.stringify({ url, at: Date.now(), value }));
  } catch (_) {
    diskCacheBroken = true;
  }
}

function cacheClear() {
  memory.clear();
}

/** تفريغ كامل: الذاكرة + ملفات القرص (أفضل جهد) */
function cacheClearAll() {
  const memoryCount = memory.size;
  memory.clear();
  let files = 0;
  try {
    for (const name of fs.readdirSync(config.CACHE_DIR)) {
      if (!name.endsWith(".json")) continue;
      try {
        fs.rmSync(path.join(config.CACHE_DIR, name), { force: true });
        files += 1;
      } catch (_) {
        /* ملف مقفل — نتجاهله */
      }
    }
  } catch (_) {
    /* لا مجلد ذاكرة بعد */
  }
  return { memory: memoryCount, files };
}

function cacheStats() {
  return { entries: memory.size, dir: config.CACHE_DIR, disk: !diskCacheBroken };
}

/* ==============================================================
 *  الجلب (مباشر ثم قارئ صفحات)
 * ============================================================== */

async function fetchRaw(url, { timeoutMs, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": IW.userAgent,
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "accept-language": "ar,en;q=0.6",
        ...headers
      },
      redirect: "follow",
      signal: controller.signal
    });
    const body = await res.text();
    if (!res.ok) throw new IslamWebError(`HTTP ${res.status}`, "http");
    if (!body || body.length < 500) throw new IslamWebError("صفحة فارغة أو قصيرة", "empty");
    if (/Just a moment|cf-browser-verification|Attention Required|Access Denied/i.test(body.slice(0, 3000))) {
      throw new IslamWebError("حجب من حماية الموقع", "blocked");
    }
    return body;
  } catch (err) {
    if (err instanceof IslamWebError) throw err;
    if (err && err.name === "AbortError") throw new IslamWebError("انتهت مهلة الاتصال", "timeout");
    throw new IslamWebError(String((err && err.message) || err), "network");
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDirect(url, opts = {}) {
  const body = await fetchRaw(url, { timeoutMs: opts.timeoutMs || IW.timeoutMs });
  return { text: body, via: "direct", format: htmlx.looksLikeHtml(body) ? "html" : "markdown" };
}

async function fetchViaReader(url, opts = {}) {
  if (!IW.readerBase) throw new IslamWebError("قارئ الصفحات غير مُفعَّل", "reader_off");
  const target = IW.readerBase + encodeURIComponent(url);
  const body = await fetchRaw(target, {
    timeoutMs: opts.timeoutMs || IW.readerTimeoutMs,
    headers: { "x-respond-with": "markdown" }
  });
  return {
    text: body,
    via: "reader",
    format: htmlx.looksLikeHtml(body) ? "html" : "markdown"
  };
}

/**
 * يجلب صفحة من الموقع مع تجربة الاستراتيجيات الممكنة.
 * @returns {Promise<{text:string, via:string, format:string, url:string}>}
 */
async function fetchPage(url, opts = {}) {
  if (!IW.enabled) throw new IslamWebError("موصّل إسلام ويب مُعطَّل (ISLAMWEB_ENABLED=off)", "off");

  const cached = opts.noCache ? null : cacheGet(url);
  if (cached) return { ...cached, cached: true };

  const attempts =
    IW.mode === "off"
      ? []
      : IW.mode === "direct"
        ? [fetchDirect]
        : IW.mode === "reader"
          ? [fetchViaReader]
          : IW.useReaderFallback
            ? [fetchDirect, fetchViaReader]
            : [fetchDirect];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const out = await attempt(url, opts);
      const result = { ...out, url };
      if (!opts.noCache) cacheSet(url, result);
      return result;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new IslamWebError("تعذّر جلب الصفحة", "unreachable");
}

/* ==============================================================
 *  تحليل المراجع (الروابط)
 * ============================================================== */

function parseRef(href, fallbackKind = "") {
  const m = REF_RE.exec(String(href || ""));
  if (m) {
    const kind = m[1].toLowerCase();
    return { kind, id: m[2], url: docUrl(kind, m[2]) };
  }
  const loose = ANY_LINK_REF_RE.exec(String(href || ""));
  if (loose) {
    const kind = loose[1].toLowerCase();
    return { kind, id: loose[2], url: docUrl(kind, loose[2]) };
  }
  if (fallbackKind && /^\d+$/.test(String(href))) {
    return { kind: fallbackKind, id: String(href), url: docUrl(fallbackKind, String(href)) };
  }
  return null;
}

function docUrl(kind, id) {
  const meta = KINDS[kind] || KINDS.fatwa;
  return `${IW.base}${meta.docPath}${id}/`;
}

function searchUrl(kind, query) {
  const meta = KINDS[kind];
  const pathPart = (meta && meta.searchPath) || GENERAL_SEARCH_PATH;
  return `${IW.base}${pathPart}${encodeURIComponent(query)}`;
}

function kindMeta(kind) {
  return KINDS[kind] || { id: kind, label: "مادة", sectionLabel: "المواد" };
}

/* ==============================================================
 *  تحليل صفحات البحث
 * ============================================================== */

const RELEVANT_KINDS = ["fatwa", "consult", "article"];

/**
 * يحلّل صفحة نتائج بحث (HTML أو Markdown) إلى قائمة نتائج.
 * @returns {Array<{kind,id,title,url,snippet,categories}>}
 */
function parseSearchPage(raw, { kinds = RELEVANT_KINDS } = {}) {
  const html = htmlx.toUnifiedHtml(raw);
  const all = htmlx.links(html);
  const found = [];

  all.forEach((link, index) => {
    if (/^\s*(?:javascript:|#|mailto:)/i.test(link.href)) return;
    const ref = parseRef(link.href, "");
    if (!ref || !kinds.includes(ref.kind)) return;
    if (!link.text || link.text.length < 3) return;
    // نستبعد روابط التصنيفات (fatawa/consults/articles بصيغة الجمع)
    if (/\/(fatawa|consults|articles)\//i.test(link.href)) return;

    const nextLink = all.slice(index + 1).find((l) => {
      const r = parseRef(l.href, "");
      return r && kinds.includes(r.kind) && l.text && l.text.length >= 3;
    });
    const between = html.slice(link.end, nextLink ? nextLink.start : Math.min(html.length, link.end + 2500));
    const snippet = cleanSnippet(htmlx.stripLinksFromText(between));

    found.push({
      kind: ref.kind,
      id: ref.id,
      title: htmlx.cleanText(link.text),
      url: ref.url,
      snippet: htmlx.excerpt(snippet, 260),
      categories: []
    });
  });

  // إزالة التكرار مع الحفاظ على الترتيب
  const seen = new Set();
  const unique = [];
  for (const item of found) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

/** يستخرج التصنيفات (شجرة الموضوع) من صفحة البحث أو الفتوى */
/**
 * تنظيف مقتطف النتيجة: يزيل آثار ترميز القارئ (\>) وعناوين التصنيف
 * وبقايا واجهة الموقع، ويُرجع "" إن لم يبقَ نصّ مفيد.
 */
function cleanSnippet(text) {
  let s = htmlx.cleanText(String(text || ""))
    .replace(/\\>/g, " ")
    .replace(/[>*_#|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/^[\s.…·•]+/, "").replace(/[\s.…·•]+$/, "").trim();
  if (!s) return "";
  if (/\(7002\)|اختيار هذا الخط|سعادة تمتد|البحث التفصيلي/.test(s)) return "";
  if (!/[\u0600-\u06FF]{3}/.test(s)) return "";
  return s;
}

/**
 * تصنيفات الوثيقة = مسار التصنيف (breadcrumbs) أعلى الصفحة،
 * أي روابط الشكل /ar/fatawa/<id>/<slug> قبل نصّ السؤال (لا مواد ذات صلة).
 */
function parseCategories(html, beforeIndex = -1) {
  const links = htmlx.links(html);
  const cats = [];
  for (const link of links) {
    if (beforeIndex >= 0 && link.start > beforeIndex) break;
    if (!/\/(fatawa|consults|articles)\/\d+/i.test(link.href)) continue;
    const text = htmlx.cleanText(link.text);
    if (text && text.length > 1 && text.length < 60 && !cats.includes(text)) cats.push(text);
  }
  return cats.slice(0, 4);
}

/* ==============================================================
 *  تحليل صفحة الوثيقة (فتوى/استشارة/مقال)
 * ============================================================== */

const GENERIC_TITLES = [
  "الفتوى",
  "الفتاوى",
  "الاستشارة",
  "الاستشارات",
  "المقالات",
  "مقالات",
  "الصوتيات",
  "المكتبة",
  "إسلام ويب",
  "نتائج البحث",
  "بحث"
];

function isGenericTitle(text) {
  const value = htmlx.normalizeLabel(text);
  return !value || GENERIC_TITLES.some((label) => htmlx.normalizeLabel(label) === value);
}

const QUESTION_LABELS = ["السؤال", "الاستشارة"];
const ANSWER_LABELS = ["الإجابــة", "الإجابة", "الجواب", "الرد"];
const BODY_STOP_LABELS = [
  "مواد ذات صلة",
  "مشاركة المحتوى",
  "تعليقات الزوار",
  "أضف تعليقك",
  "بحث عن فتوى",
  "بحث عن استشارة",
  "الأكثر مشاهدة",
  "الأكثر مشاهدة اليوم",
  "اقرأ أيضا",
  "اقرأ أيضاً",
  "الفتاوى",
  "الاستشارات",
  "الصوتيات",
  "المكتبة",
  "موضوعات ذات صلة"
];

function extractTitle(html, raw) {
  const mdTitle = /(?:^|\n)Title:\s*(.+)\s*(?:\n|$)/.exec(String(raw || "").slice(0, 400));
  if (mdTitle && mdTitle[1].trim()) return htmlx.cleanText(mdTitle[1]);

  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (t && t[1].trim()) {
    const clean = htmlx
      .cleanText(htmlx.decodeEntities(t[1]))
      .replace(/\s*[-|–]\s*إسلام ويب.*$/, "")
      .replace(/^إسلام ويب\s*[-|–]\s*/, "");
    if (!isGenericTitle(clean)) return clean;
  }

  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (og && !isGenericTitle(og[1])) return htmlx.cleanText(og[1]);

  const list = htmlx.headings(html);
  const h2 = list.find((h) => h.level <= 2 && h.text.length > 3 && !isGenericTitle(h.text));
  if (h2) return h2.text;

  const h1 = list.find((h) => h.level === 1 && h.text && !isGenericTitle(h.text));
  if (h1) return h1.text;

  return "";
}

function extractDates(html) {
  const text = htmlx.cleanText(htmlx.htmlToText(html)).replace(/\s+/g, " ");
  const hijri = /(\d{1,2}\s+[\u0600-\u06FF\s]{2,25}?\s+1[0-9]{3}\s*هـ)/.exec(text);
  const greg = /(\d{1,2}-\d{1,2}-\d{4}\s*م)/.exec(text);
  const iso =
    /datePublished"?\s*[:=]\s*"([^"]+)"/i.exec(html) ||
    /<meta[^>]+itemprop=["']dateCreated["'][^>]+content=["']([^"']+)["']/i.exec(html);
  return {
    hijri: hijri ? htmlx.cleanText(hijri[1]) : "",
    gregorian: greg ? htmlx.cleanText(greg[1]) : "",
    iso: iso ? String(iso[1]).slice(0, 40) : ""
  };
}

function extractMetaBlock(html, title = "") {
  const text = htmlx.htmlToText(html);
  const start = title ? text.indexOf(title) : -1;
  const slice = start >= 0 ? text.slice(start, start + 900) : text.slice(0, 900);
  const number = /(?:رقم (?:الفتوى|الاستشارة|السؤال))\s*[:：]?\s*(\d{2,9})/.exec(slice);
  const views = /(?:المشاهدات|مشاهدات)\s*[:：]?\s*(\d{3,9})/.exec(slice);
  const published = /(?:تاريخ النشر)\s*[:：]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(slice);
  const answerer = /المجيب\s*[:：]?\s*([^\n]{2,80})/.exec(slice);
  return {
    number: number ? number[1] : "",
    views: views ? views[1] : "",
    published: published ? published[1] : "",
    answerer: answerer ? htmlx.cleanText(answerer[1]).replace(/^\[|\]$/g, "").slice(0, 60) : ""
  };
}

/**
 * يحلّل صفحة وثيقة كاملة.
 * @returns {object|null}
 */
function parseDocPage(raw, { url = "", fallbackKind = "" } = {}) {
  const html = htmlx.toUnifiedHtml(raw);
  const ref = parseRef(url) || parseRef(extractCanonical(html) || "") || (fallbackKind ? null : null);
  if (!ref) return null;

  const meta = kindMeta(ref.kind);
  const title = extractTitle(html, raw) || `وثيقة رقم ${ref.id}`;
  const headings = htmlx.headings(html);
  const question = htmlx.sectionAfterHeading(html, QUESTION_LABELS, { stopLabels: ANSWER_LABELS });
  question.start = (headings.find((h) => htmlx.labelMatches(h.text, QUESTION_LABELS)) || {}).start || -1;
  const answer = htmlx.sectionAfterHeading(
    html,
    ANSWER_LABELS,
    { stopLabels: BODY_STOP_LABELS, from: Math.max(0, question.start) }
  );

  let body = answer.text;
  if (!body && ref.kind === "article") {
    body = articleBody(html, title);
  }

  const dates = extractDates(html);
  const info = extractMetaBlock(html, title);

  return {
    kind: ref.kind,
    kindLabel: meta.label,
    id: ref.id,
    title,
    url: ref.url,
    question: question.found ? htmlx.excerpt(question.text, 900) : "",
    answer: body || "",
    date: dates.gregorian || info.published || dates.iso || "",
    hijriDate: dates.hijri || "",
    number: info.number || ref.id,
    views: info.views || "",
    answerer: info.answerer || "",
    categories: parseCategories(html, question.found ? question.start : -1)
  };
}

function extractCanonical(html) {
  const m = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(html);
  return m ? htmlx.decodeEntities(m[1]) : "";
}

/** نصّ مقال: من عنوان المقال إلى أقرب عنوان توقف أو نهاية الصفحة */
function articleBody(html, title) {
  const list = htmlx.headings(html);
  const idx = list.findIndex((h) => title && (h.text === title || h.text.includes(title)));
  if (idx === -1) return "";
  const start = list[idx];
  let end = html.length;
  for (let i = idx + 1; i < list.length; i++) {
    const next = list[i];
    if (htmlx.labelMatches(next.text, BODY_STOP_LABELS) || next.level <= start.level - 1) {
      end = next.start;
      break;
    }
  }
  return htmlx.cleanText(htmlx.htmlToText(html.slice(start.end, end)));
}

/* ==============================================================
 *  الاستخدام العام
 * ============================================================== */

/**
 * يبني عبارات البحث من سؤال المستخدم (عبارة أساسية + عبارة مختصرة).
 */
function searchQueries(question) {
  const cleaned = String(question || "")
    .replace(/[؟?!.،,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const stripped = cleaned
    .replace(
      /^(?:ما|ماذا|هل|كيف|لماذا|متى|أين|من|أفتوني|أفيدوني|بارك الله فيكم|جزاكم الله خيرا|جزاكم الله خيرًا|لو سمحتم)\s+/g,
      ""
    )
    .replace(/^(?:حكم|حكمه|حكمها|حكمهما)\s+/, "")
    .replace(/\s+(?:في الإسلام|في الشرع|جزاكم الله خيرا|جزاكم الله خيرًا|أفتوني|بارك الله فيكم)$/, "")
    .trim();

  const keywords = rank.shortKeywords(cleaned, 6).join(" ").trim();
  const out = [];
  for (const candidate of [stripped, keywords, cleaned]) {
    const value = candidate.trim();
    if (value.length >= 3 && !out.includes(value)) out.push(value);
  }
  return out.slice(0, 2);
}

/**
 * يبحث في إسلام ويب.
 * @param {string} question سؤال المستخدم
 * @param {{limit?:number, kinds?:string[], queries?:string[]}} opts
 * @returns {Promise<{items:Array, errors:Array, via:string}>}
 */
async function search(question, opts = {}) {
  const limit = Number(opts.limit || IW.topK);
  const kinds =
    opts.kinds && opts.kinds.length
      ? opts.kinds.filter((k) => KINDS[k])
      : RELEVANT_KINDS.filter((k) => IW.sections[k] !== false);

  const queries = (opts.queries && opts.queries.length ? opts.queries : searchQueries(question)).slice(0, 2);
  const tokens = rank.queryTokens(question);
  const items = [];
  const errors = [];
  const seen = new Set();
  const usedVia = new Set();

  const tasks = [];
  for (const kind of kinds) {
    for (const query of queries) {
      tasks.push({ kind, query, url: searchUrl(kind, query) });
    }
  }

  const settled = await Promise.all(
    tasks.map(async (task) => {
      try {
        const page = await fetchPage(task.url);
        return { task, page };
      } catch (err) {
        return { task, error: err };
      }
    })
  );

  for (const entry of settled) {
    if (entry.error) {
      errors.push({ kind: entry.task.kind, query: entry.task.query, error: String(entry.error.message || entry.error) });
      continue;
    }
    usedVia.add(entry.page.via);
    const pageKinds = entry.task.kind === "article" ? RELEVANT_KINDS : [entry.task.kind];
    const parsed = parseSearchPage(entry.page.text, { kinds: pageKinds });
    for (const item of parsed) {
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        ...item,
        query: entry.task.query,
        via: entry.page.via,
        score: 0
      });
    }
  }

  const scored = items
    .map((item) => ({
      ...item,
      score:
        Math.round(
          rank.scoreCandidate(tokens, {
            title: item.title,
            snippet: item.snippet,
            kindBoost: kindMeta(item.kind).boost || 0
          }) * 1000
        ) / 1000
    }))
    .sort((a, b) => b.score - a.score);

  return { items: scored.slice(0, limit), all: scored, errors, via: [...usedVia].join("+") || "none" };
}

/** يجلب نصّ وثيقة كامل (السؤال + الإجابة) */
async function fetchDocument(ref) {
  const kind = typeof ref === "string" ? "" : ref.kind;
  const id = typeof ref === "string" ? ref : ref.id;
  const url = (typeof ref === "object" && ref.url) || (kind ? docUrl(kind, id) : "");
  if (!url) throw new IslamWebError("مرجع غير صالح", "bad_ref");

  try {
    const page = await fetchPage(url);
    const doc = parseDocPage(page.text, { url, fallbackKind: kind });
    if (!doc) throw new IslamWebError("تعذّر تحليل الصفحة", "parse");
    if (!doc.answer || doc.answer.length < 40) throw new IslamWebError("لم يُستخرج نص الإجابة", "empty_answer");
    return { ...doc, via: page.via, cached: !!page.cached };
  } catch (err) {
    // محاولة أخيرة: نسخة الطباعة (أخفّ وأبسط في البنية)
    if (kind === "fatwa" || kind === "consult") {
      const printUrl = `${IW.base}/ar/${kind}/print.php?id=${encodeURIComponent(id)}`;
      try {
        const page = await fetchPage(printUrl);
        const doc = parseDocPage(page.text, { url, fallbackKind: kind });
        if (doc && doc.answer) return { ...doc, via: `${page.via}:print`, cached: !!page.cached };
      } catch (_) {
        /* نُبلّغ بالخطأ الأصلي */
      }
    }
    throw err;
  }
}

/** فحص سريع لقابلية الوصول (يُستخدم في /api/diagnose) */
async function selfTest() {
  if (!IW.enabled) return { ok: false, level: "warn", detail: "موصّل إسلام ويب مُعطَّل" };
  const url = `${IW.base}/ar/fatwa/536365/`;
  try {
    const page = await fetchPage(url, { noCache: true });
    const doc = parseDocPage(page.text, { url });
    return {
      ok: !!(doc && doc.answer),
      level: doc && doc.answer ? "ok" : "warn",
      via: page.via,
      detail: doc && doc.answer ? `تمّ الجلب عبر: ${page.via}` : "تمّ الجلب لكن تعذّر استخراج نص الإجابة"
    };
  } catch (err) {
    return {
      ok: false,
      level: "warn",
      detail: `تعذّر الوصول إلى إسلام ويب (${String(err.message || err).slice(0, 120)}). الأداة تعمل بالذاكرة المؤقتة إن وُجدت.`
    };
  }
}

/** تطبيع نصّ عربي للمقارنات (يُصدَّر للاختبارات) */
function normalize(text) {
  return normalizeArabic(text);
}

module.exports = {
  IslamWebError,
  KINDS,
  search,
  searchQueries,
  fetchDocument,
  fetchPage,
  parseSearchPage,
  parseDocPage,
  parseRef,
  docUrl,
  searchUrl,
  kindMeta,
  selfTest,
  cacheClear,
  cacheClearAll,
  cacheStats,
  normalize
};
