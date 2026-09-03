const DEFAULT_SETTINGS = {
  siteName: "T.M.D AI",
  siteDescription: "المساعد الذكي",
  developerName: "ياسين عمرو عبد الرحيم",

  primaryColor: "#c9a227",
  secondaryColor: "#ffffff",
  backgroundColor: "#faf8f1",

  logoText: "T",
  logoUrl: "",
  faviconUrl: "",
  backgroundImage: "",

  showWelcome: true,
  showSuggestions: true,
  showDeveloper: true,

  enableImageTools: true,

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
      prompt: "اشرح لي هذه المسألة الدينية مع ذكر المصادر المؤكدة فقط"
    }
  ]
};


// =====================================================
// كلمة مرور المالك
// يمكنك تغييرها من هنا
// =====================================================

const OWNER_PASSWORD = "TMD2026@Owner";


// =====================================================
// قراءة إعدادات الموقع
// =====================================================

function getSettings() {
  const raw = process.env.TMD_SETTINGS;

  if (!raw) {
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw);

    return {
      ...DEFAULT_SETTINGS,
      ...parsed
    };

  } catch (error) {

    console.error(
      "TMD_SETTINGS error:",
      error
    );

    return DEFAULT_SETTINGS;
  }
}


// =====================================================
// التحقق من المالك
// =====================================================

function isOwner(req) {

  const header =
    req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return false;
  }

  const token =
    header.slice(7).trim();

  return token === OWNER_PASSWORD;
}


// =====================================================
// API
// =====================================================

module.exports = async function handler(req, res) {

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );


  // ---------------------------------------------------
  // OPTIONS
  // ---------------------------------------------------

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }


  // ---------------------------------------------------
  // GET
  // ---------------------------------------------------

  if (req.method === "GET") {

    return res.status(200).json({
      ok: true,
      settings: getSettings()
    });

  }


  // ---------------------------------------------------
  // POST
  // ---------------------------------------------------

  if (req.method === "POST") {

    // التحقق من كلمة مرور المالك

    if (!isOwner(req)) {

      return res.status(401).json({
        ok: false,
        error: "كلمة مرور المالك غير صحيحة."
      });

    }


    try {

      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body || {};


      const current =
        getSettings();


      const updated = {
        ...current,
        ...body
      };


      return res.status(200).json({
        ok: true,
        settings: updated,
        message:
          "تم حفظ إعدادات الموقع بنجاح."
      });


    } catch (error) {

      console.error(
        "Settings error:",
        error
      );


      return res.status(400).json({
        ok: false,
        error:
          "بيانات الإعدادات غير صحيحة."
      });

    }

  }


  // ---------------------------------------------------
  // طريقة غير مدعومة
  // ---------------------------------------------------

  return res.status(405).json({
    ok: false,
    error:
      "الطريقة غير مدعومة."
  });

};
