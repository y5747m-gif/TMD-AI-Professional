"use strict";

/**
 * mishkat/lib/config.js
 * ---------------------------------------------------------------
 * الإعدادات المركزية لأداة «مشكاة» (النسخة الجديدة):
 *   • لا نصوص فيديوهات ولا سحب من يوتيوب — لائحة فيديوهات (عنوان + رابط).
 *   • مصدر الردود: موقع إسلام ويب (islamweb.net) مع توثيق رقم الفتوى ورابطها.
 * لا يحتوي هذا الملف على أي مكتبات خارجية، ويعمل على Node.js 18+.
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", ".."); // جذر المستودع
const MISHKAT_DIR = path.resolve(__dirname, "..");

/* ==============================================================
 *  1) محمّل ملفات .env بسيط (بدون مكتبات خارجية)
 * ============================================================== */

function parseEnvFile(file) {
  const out = {};
  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (_) {
    return out;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!value.startsWith("http") && value.includes(" #")) {
      value = value.slice(0, value.indexOf(" #")).trim();
    }
    if (key) out[key] = value;
  }
  return out;
}

function loadEnv() {
  const candidates = [
    path.join(MISHKAT_DIR, ".env"),
    path.join(ROOT, ".env"),
    path.join(ROOT, ".env.local")
  ];
  for (const file of candidates) {
    const parsed = parseEnvFile(file);
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined || process.env[k] === "") {
        process.env[k] = v;
      }
    }
  }
}
loadEnv();

/* ==============================================================
 *  2) مساعدات قراءة القيم
 * ============================================================== */

const str = (key, fallback = "") => String(process.env[key] ?? fallback).trim();
const num = (key, fallback) => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
};
const bool = (key, fallback = false) => {
  const v = str(key).toLowerCase();
  if (!v) return fallback;
  return ["1", "true", "yes", "on", "نعم"].includes(v);
};

/* ==============================================================
 *  3) القناة (روابط فقط) + مسارات البيانات
 * ============================================================== */

const CHANNEL_ID = str("YOUTUBE_CHANNEL_ID", "UCv0g_v1C6JcZALvrkDu98AQ");
const CHANNEL_URL = str(
  "YOUTUBE_CHANNEL_URL",
  `https://www.youtube.com/channel/${CHANNEL_ID}`
);

const DATA_DIR = str("MISHKAT_DATA_DIR", path.join(MISHKAT_DIR, "data"));
const VIDEOS_PATH = str("MISHKAT_VIDEOS_PATH", path.join(DATA_DIR, "videos.json"));
const CACHE_DIR = str("MISHKAT_CACHE_DIR", path.join(DATA_DIR, "cache"));

/* ==============================================================
 *  4) مصدر الردود: إسلام ويب
 * ============================================================== */

const ISLAMWEB_MODE = str("ISLAMWEB_MODE", "auto").toLowerCase(); // auto | direct | reader | off
const ISLAMWEB_READER_BASE = str("ISLAMWEB_READER_BASE", "https://r.jina.ai/");

const ISLAMWEB = {
  enabled: bool("ISLAMWEB_ENABLED", true) && ISLAMWEB_MODE !== "off",
  mode: ISLAMWEB_MODE,
  base: str("ISLAMWEB_BASE", "https://www.islamweb.net").replace(/\/+$/, ""),
  readerBase: ISLAMWEB_READER_BASE.endsWith("/")
    ? ISLAMWEB_READER_BASE
    : `${ISLAMWEB_READER_BASE}/`,
  useReaderFallback: bool("ISLAMWEB_READER_FALLBACK", true),
  timeoutMs: num("ISLAMWEB_TIMEOUT_MS", 12000),
  readerTimeoutMs: num("ISLAMWEB_READER_TIMEOUT_MS", 30000),
  topK: num("ISLAMWEB_TOP_K", 6),
  fullDocs: num("ISLAMWEB_FULL_DOCS", 2), // كم فتوى نجلب نصها الكامل
  maxAnswerChars: num("ISLAMWEB_MAX_ANSWER_CHARS", 6000),
  cacheTtlMinutes: num("ISLAMWEB_CACHE_TTL_MINUTES", 720),
  userAgent: str(
    "ISLAMWEB_USER_AGENT",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
  ),
  sections: {
    fatwa: bool("ISLAMWEB_SECTION_FATWA", true),
    consult: bool("ISLAMWEB_SECTION_CONSULT", true),
    article: bool("ISLAMWEB_SECTION_ARTICLE", true)
  }
};

/* ==============================================================
 *  5) مزوّدو الذكاء الاصطناعي (اختياري — لصياغة الرد وترتيبه)
 * ============================================================== */

const PROVIDERS = [
  {
    id: "gemini",
    label: "Google Gemini",
    key: str("GEMINI_API_KEY") || str("GOOGLE_API_KEY"),
    model: str("GEMINI_MODEL", "gemini-2.0-flash"),
    base: str("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")
  },
  {
    id: "groq",
    label: "Groq",
    key: str("GROQ_API_KEY"),
    model: str("GROQ_MODEL", "openai/gpt-oss-120b"),
    base: str("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
  },
  {
    id: "openai",
    label: "OpenAI",
    key: str("OPENAI_API_KEY"),
    model: str("OPENAI_MODEL", "gpt-4o-mini"),
    base: str("OPENAI_BASE_URL", "https://api.openai.com/v1")
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    key: str("OPENROUTER_API_KEY"),
    model: str("OPENROUTER_MODEL", "google/gemini-2.0-flash-001"),
    base: str("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
  },
  {
    id: "custom",
    label: "مزوّد مخصّص (OpenAI-compatible)",
    key: str("MISHKAT_LLM_API_KEY") || str("LLM_API_KEY"),
    model: str("MISHKAT_LLM_MODEL") || str("LLM_MODEL", "gpt-4o-mini"),
    base: str("MISHKAT_LLM_BASE_URL") || str("LLM_BASE_URL")
  }
].filter((p) => p.key && p.base);

const AI_MODE = str("MISHKAT_AI_MODE", "auto").toLowerCase();

function resolveProvider() {
  if (AI_MODE === "off" || AI_MODE === "none") return null;
  if (AI_MODE !== "auto") {
    const found = PROVIDERS.find((p) => p.id === AI_MODE);
    if (found) return found;
  }
  return PROVIDERS[0] || null;
}

const AI = {
  temperature: num("MISHKAT_TEMPERATURE", num("TEMPERATURE", 0.15)),
  maxTokens: num("MISHKAT_MAX_TOKENS", num("MAX_TOKENS", 2048)),
  timeoutMs: num("MISHKAT_AI_TIMEOUT_MS", 60000),
  contextChars: num("MISHKAT_CONTEXT_CHARS", 16000),
  useRerank: bool("MISHKAT_AI_RERANK", true),
  useCompose: bool("MISHKAT_AI_COMPOSE", true),
  answerChars: num("MISHKAT_ANSWER_CHARS", 2200)
};

/* ==============================================================
 *  6) الفيديوهات والاسترجاع
 * ============================================================== */

const VIDEOS = {
  topK: num("MISHKAT_VIDEOS_TOP_K", 5),
  minScore: num("MISHKAT_VIDEOS_MIN_SCORE", 0.28),
  linkOnly: true, // لا تُعرض نصوص الفيديوهات إطلاقًا
  oembed: bool("MISHKAT_VIDEO_OEMBED", true) // جلب العنوان تلقائيًا عند الإضافة
};

const SERVER = {
  port: num("PORT", 3000),
  host: str("MISHKAT_HOST", "0.0.0.0"),
  adminToken: str("MISHKAT_ADMIN_TOKEN") || str("ADMIN_TOKEN"),
  publicDir: path.join(MISHKAT_DIR, "public")
};

const APP = {
  name: str("MISHKAT_NAME", "مشكاة"),
  tagline: str(
    "MISHKAT_TAGLINE",
    "مساعد للأسئلة الدينية: ردود من موقع إسلام ويب، وروابط الفيديوهات المتعلقة بالسؤال"
  ),
  defaultMode: str("MISHKAT_DEFAULT_MODE", "sources"), // sources | composed
  developer: str("MISHKAT_DEVELOPER", ""),
  islamwebHome: "https://www.islamweb.net/ar/"
};

module.exports = {
  ROOT,
  MISHKAT_DIR,
  CHANNEL_ID,
  CHANNEL_URL,
  DATA_DIR,
  VIDEOS_PATH,
  CACHE_DIR,
  ISLAMWEB,
  PROVIDERS,
  resolveProvider,
  AI_MODE,
  AI,
  VIDEOS,
  SERVER,
  APP,
  str,
  num,
  bool
};
