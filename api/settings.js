const { put, get } = require("@vercel/blob");

const SETTINGS_PATH = "tmd-ai/settings.json";

const DEFAULT_SETTINGS = {
  siteName: "T.M.D AI",
  siteDescription: "المساعد الذكي",
  developerName: "ياسين عمرو عبد الرحيم",

  primaryColor: "#c9a227",
  secondaryColor: "#ffffff",
  backgroundColor: "#faf8f1",
  textColor: "#1b1a17",
  panelColor: "#ffffff",
  borderColor: "#ded5b7",

  logoText: "T",
  logoUrl: "",
  faviconUrl: "",
  backgroundImage: "",

  showWelcome: true,
  showSuggestions: true,
  showDeveloper: true,
  enableImageTools: true,

  sidebarIconColor: "#c9a227",
  sendButtonText: "➤",

  suggestions: [
    {
      title: "شرح الذكاء الاصطناعي",
      icon: "🤖",
      prompt: "اشرح لي الذكاء الاصطناعي بطريقة بسيطة"
    },
    {
      title: "اكتب كود",
      icon: "💻",
      prompt: "اكتب لي كود HTML احترافي"
    },
    {
      title: "حل مسألة",
      icon: "🧮",
      prompt: "حل لي هذه المسألة خطوة بخطوة"
    },
    {
      title: "سؤال ديني",
      icon: "📖",
      prompt: "أجب عن هذا السؤال الديني مع ذكر المصادر الموثوقة، ووضح إن كان هناك اختلاف بين العلماء."
    }
  ]
};

function mergeSettings(input) {
  const safe = input && typeof input === "object" ? input : {};

  return {
    ...DEFAULT_SETTINGS,
    ...safe,
    suggestions: Array.isArray(safe.suggestions)
      ? safe.suggestions.slice(0, 12)
      : DEFAULT_SETTINGS.suggestions
  };
}

function isOwner(req) {
  const secret = process.env.OWNER_SECRET;

  if (!secret) {
    return false;
  }

  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return false;
  }

  return header.slice(7).trim() === secret;
}

async function readSettings() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return DEFAULT_SETTINGS;
  }

  try {
    const result = await get(SETTINGS_PATH, {
      access: "public"
    });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return DEFAULT_SETTINGS;
    }

    const chunks = [];
    const reader = result.stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }

    const text = Buffer.concat(chunks).toString("utf8");
    return mergeSettings(JSON.parse(text));
  } catch (error) {
    console.warn("Blob settings read failed:", error.message);
    return DEFAULT_SETTINGS;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    const settings = await readSettings();

    return res.status(200).json({
      ok: true,
      settings
    });
  }

  if (req.method === "POST") {
    if (!isOwner(req)) {
      return res.status(401).json({
        ok: false,
        error: "غير مصرح. يجب تسجيل دخول المالك."
      });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({
        ok: false,
        error:
          "BLOB_READ_WRITE_TOKEN غير موجود. أنشئ Vercel Blob Store واربطه بالمشروع."
      });
    }

    try {
      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body || {};

      const current = await readSettings();
      const updated = mergeSettings({
        ...current,
        ...body
      });

      await put(
        SETTINGS_PATH,
        JSON.stringify(updated, null, 2),
        {
          access: "public",
          contentType: "application/json; charset=utf-8",
          allowOverwrite: true,
          cacheControlMaxAge: 60
        }
      );

      return res.status(200).json({
        ok: true,
        settings: updated,
        message: "تم حفظ إعدادات الموقع بنجاح."
      });
    } catch (error) {
      console.error("Settings save error:", error);

      return res.status(500).json({
        ok: false,
        error:
          "تعذر حفظ الإعدادات. تأكد من إعداد Vercel Blob ومن صحة البيانات."
      });
    }
  }

  return res.status(405).json({
    ok: false,
    error: "الطريقة غير مدعومة."
  });
};
