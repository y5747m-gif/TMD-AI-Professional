"use strict";

/**
 * mishkat/lib/config.js
 * ---------------------------------------------------------------
 * الإعدادات المركزية لأداة «مشكاة».
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

    // إزالة علامات التنصيص إن وُجدت
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // دعم تعليقات نهاية السطر البسيطة
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
 *  3) القناة المعتمدة (ثابتة) + قاعدة البيانات
 * ============================================================== */

const CHANNEL_ID = str("YOUTUBE_CHANNEL_ID", "UCv0g_v1C6JcZALvrkDu98AQ");
const CHANNEL_HANDLE = str("YOUTUBE_CHANNEL_HANDLE", "");
const CHANNEL_URL = str(
  "YOUTUBE_CHANNEL_URL",
  `https://www.youtube.com/channel/${CHANNEL_ID}`
);

const DATA_DIR = str("MISHKAT_DATA_DIR", path.join(MISHKAT_DIR, "data"));
const DB_PATH = str("MISHKAT_DB_PATH", path.join(DATA_DIR, "mishkat.db"));
const JSON_INDEX_PATH = str(
  "MISHKAT_JSON_INDEX",
  path.join(DATA_DIR, "index.json")
);

/* ==============================================================
 *  4) الشبكة (قابلة للتحويل إلى سيرفر وهمي في الاختبارات)
 * ============================================================== */

const YT_BASE = str("MISHKAT_YT_BASE", "https://www.youtube.com").replace(/\/+$/, "");
const YT_API_BASE = str(
  "MISHKAT_YTAPI_BASE",
  "https://www.googleapis.com/youtube/v3"
).replace(/\/+$/, "");
const YOUTUBE_API_KEY = str("YOUTUBE_API_KEY");

/* ==============================================================
 *  5) مزوّدو الذكاء الاصطناعي (محرك منفصل قابل للتبديل)
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

// اختيار المزوّد: يدويًا عبر MISHKAT_AI_MODE أو تلقائيًا حسب أول مفتاح متاح
function resolveProvider() {
  if (AI_MODE === "off" || AI_MODE === "none") return null;
  if (AI_MODE !== "auto") {
    const found = PROVIDERS.find((p) => p.id === AI_MODE);
    if (found) return found;
  }
  return PROVIDERS[0] || null;
}

const AI = {
  temperature: num("MISHKAT_TEMPERATURE", num("TEMPERATURE", 0.2)),
  maxTokens: num("MISHKAT_MAX_TOKENS", num("MAX_TOKENS", 2048)),
  timeoutMs: num("MISHKAT_AI_TIMEOUT_MS", 60000),
  contextChars: num("MISHKAT_CONTEXT_CHARS", 14000)
};

/* ==============================================================
 *  6) إعدادات المحرك والاسترجاع
 * ============================================================== */

const RETRIEVAL = {
  topK: num("MISHKAT_TOP_K", 8),
  candidates: num("MISHKAT_CANDIDATES", 60),
  maxPerVideo: num("MISHKAT_MAX_PER_VIDEO", 3),
  minScore: num("MISHKAT_MIN_SCORE", 0.02)
};

const SERVER = {
  port: num("PORT", 3000),
  host: str("MISHKAT_HOST", "0.0.0.0"),
  adminToken: str("MISHKAT_ADMIN_TOKEN") || str("ADMIN_TOKEN"),
  publicDir: path.join(MISHKAT_DIR, "public")
};

const INGEST = {
  maxVideos: num("MISHKAT_MAX_VIDEOS", 0), // 0 = كل الفيديوهات
  chunkChars: num("MISHKAT_CHUNK_CHARS", 700),
  delayMs: num("MISHKAT_INGEST_DELAY_MS", 350),
  retries: num("MISHKAT_INGEST_RETRIES", 3),
  preferYtDlp: bool("MISHKAT_USE_YTDLP", false)
};

const APP = {
  name: str("MISHKAT_NAME", "مشكاة"),
  tagline: str(
    "MISHKAT_TAGLINE",
    "منصة ذكية للإجابة على الأسئلة الدينية من نصوص القناة العلمية"
  ),
  defaultMode: str("MISHKAT_DEFAULT_MODE", "balanced"), // strict | balanced | open
  developer: str("MISHKAT_DEVELOPER", "")
};

module.exports = {
  ROOT,
  MISHKAT_DIR,
  CHANNEL_ID,
  CHANNEL_HANDLE,
  CHANNEL_URL,
  DATA_DIR,
  DB_PATH,
  JSON_INDEX_PATH,
  YT_BASE,
  YT_API_BASE,
  YOUTUBE_API_KEY,
  PROVIDERS,
  resolveProvider,
  AI_MODE,
  AI,
  RETRIEVAL,
  SERVER,
  INGEST,
  APP,
  str,
  num,
  bool
};
