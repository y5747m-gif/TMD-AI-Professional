"use strict";

const { put, get } = require("@vercel/blob");

/*
 * T.M.D AI
 * api/settings.js
 *
 * مسؤول عن:
 * - قراءة إعدادات الموقع
 * - حفظ إعدادات المالك
 * - حفظ التصميم بشكل دائم باستخدام Vercel Blob
 * - جعل الإعدادات الجديدة تظهر لجميع المستخدمين
 */

const SETTINGS_PATH = "tmd-ai/settings.json";

/* =========================
   الإعدادات الافتراضية
========================= */

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

  sidebarIconColor: "#c9a227",

  sendButtonText: "➤",

  showWelcome: true,

  showSuggestions: true,

  showDeveloper: true,

  enableImageTools: true,

  suggestions: [
    {
      title: "شرح الذكاء الاصطناعي",
      icon: "🤖",
      prompt:
        "اشرح لي الذكاء الاصطناعي بطريقة بسيطة"
    },

    {
      title: "اكتب كود",
      icon: "💻",
      prompt:
        "اكتب لي كود HTML احترافي"
    },

    {
      title: "حل مسألة",
      icon: "🧮",
      prompt:
        "حل لي هذه المسألة خطوة بخطوة"
    },

    {
      title: "سؤال ديني",
      icon: "📖",
      prompt:
        "أجب عن هذا السؤال الديني مع ذكر المصادر الموثوقة، ووضح إن كان هناك اختلاف بين العلماء."
    }
  ]
};


/* =========================
   دمج الإعدادات
========================= */

function mergeSettings(input) {

  const safe =
    input &&
    typeof input === "object"
      ? input
      : {};


  const suggestions =
    Array.isArray(
      safe.suggestions
    )
      ? safe.suggestions
          .filter(
            item =>
              item &&
              typeof item === "object"
          )
          .slice(0, 12)
          .map(item => ({
            title:
              String(
                item.title || ""
              ).slice(0, 100),

            icon:
              String(
                item.icon || "✨"
              ).slice(0, 20),

            prompt:
              String(
                item.prompt || ""
              ).slice(0, 1000)
          }))
      : DEFAULT_SETTINGS.suggestions;


  return {
    ...DEFAULT_SETTINGS,

    ...safe,

    siteName:
      String(
        safe.siteName ??
        DEFAULT_SETTINGS.siteName
      ).slice(0, 100),

    siteDescription:
      String(
        safe.siteDescription ??
        DEFAULT_SETTINGS.siteDescription
      ).slice(0, 300),

    developerName:
      String(
        safe.developerName ??
        DEFAULT_SETTINGS.developerName
      ).slice(0, 150),

    primaryColor:
      String(
        safe.primaryColor ??
        DEFAULT_SETTINGS.primaryColor
      ).slice(0, 30),

    secondaryColor:
      String(
        safe.secondaryColor ??
        DEFAULT_SETTINGS.secondaryColor
      ).slice(0, 30),

    backgroundColor:
      String(
        safe.backgroundColor ??
        DEFAULT_SETTINGS.backgroundColor
      ).slice(0, 30),

    textColor:
      String(
        safe.textColor ??
        DEFAULT_SETTINGS.textColor
      ).slice(0, 30),

    panelColor:
      String(
        safe.panelColor ??
        DEFAULT_SETTINGS.panelColor
      ).slice(0, 30),

    borderColor:
      String(
        safe.borderColor ??
        DEFAULT_SETTINGS.borderColor
      ).slice(0, 30),

    logoText:
      String(
        safe.logoText ??
        DEFAULT_SETTINGS.logoText
      ).slice(0, 20),

    logoUrl:
      String(
        safe.logoUrl ??
        DEFAULT_SETTINGS.logoUrl
      ).slice(0, 2000),

    faviconUrl:
      String(
        safe.faviconUrl ??
        DEFAULT_SETTINGS.faviconUrl
      ).slice(0, 2000),

    backgroundImage:
      String(
        safe.backgroundImage ??
        DEFAULT_SETTINGS.backgroundImage
      ).slice(0, 2000),

    sidebarIconColor:
      String(
        safe.sidebarIconColor ??
        DEFAULT_SETTINGS.sidebarIconColor
      ).slice(0, 30),

    sendButtonText:
      String(
        safe.sendButtonText ??
        DEFAULT_SETTINGS.sendButtonText
      ).slice(0, 20),

    showWelcome:
      Boolean(
        safe.showWelcome ??
        DEFAULT_SETTINGS.showWelcome
      ),

    showSuggestions:
      Boolean(
        safe.showSuggestions ??
        DEFAULT_SETTINGS.showSuggestions
      ),

    showDeveloper:
      Boolean(
        safe.showDeveloper ??
        DEFAULT_SETTINGS.showDeveloper
      ),

    enableImageTools:
      Boolean(
        safe.enableImageTools ??
        DEFAULT_SETTINGS.enableImageTools
      ),

    suggestions
  };
}


/* =========================
   التحقق من المالك
========================= */

function isOwner(req) {

  const secret =
    process.env.OWNER_SECRET;


  if (!secret) {
    return false;
  }


  const authorization =
    req.headers.authorization || "";


  if (
    !authorization.startsWith(
      "Bearer "
    )
  ) {
    return false;
  }


  const token =
    authorization
      .slice(7)
      .trim();


  return (
    token === secret
  );
}


/* =========================
   قراءة Blob
========================= */

async function readBlobText(stream) {

  const chunks = [];

  const reader =
    stream.getReader();


  while (true) {

    const {
      done,
      value
    } = await reader.read();


    if (done) {
      break;
    }


    chunks.push(
      Buffer.from(value)
    );
  }


  return Buffer
    .concat(chunks)
    .toString("utf8");
}


/* =========================
   قراءة الإعدادات
========================= */

async function readSettings() {

  /*
   * إذا لم يتم ربط Vercel Blob،
   * نستخدم الإعدادات الافتراضية.
   */

  if (
    !process.env.BLOB_READ_WRITE_TOKEN
  ) {

    return {
      ...DEFAULT_SETTINGS
    };

  }


  try {

    const result =
      await get(
        SETTINGS_PATH,
        {
          access: "public"
        }
      );


    if (
      !result ||
      result.statusCode !== 200 ||
      !result.stream
    ) {

      return {
        ...DEFAULT_SETTINGS
      };

    }


    const text =
      await readBlobText(
        result.stream
      );


    if (!text.trim()) {

      return {
        ...DEFAULT_SETTINGS
      };

    }


    const parsed =
      JSON.parse(text);


    return mergeSettings(
      parsed
    );


  } catch (error) {

    /*
     * أول تشغيل طبيعي أن لا يكون
     * ملف الإعدادات موجودًا بعد.
     */

    console.warn(
      "TMD settings read:",
      error.message
    );


    return {
      ...DEFAULT_SETTINGS
    };

  }
}


/* =========================
   حفظ الإعدادات
========================= */

async function saveSettings(
  settings
) {

  if (
    !process.env.BLOB_READ_WRITE_TOKEN
  ) {

    throw new Error(
      "BLOB_READ_WRITE_TOKEN_MISSING"
    );

  }


  const cleanSettings =
    mergeSettings(
      settings
    );


  await put(
    SETTINGS_PATH,

    JSON.stringify(
      cleanSettings,
      null,
      2
    ),

    {
      access: "public",

      contentType:
        "application/json; charset=utf-8",

      allowOverwrite:
        true,

      cacheControlMaxAge:
        0
    }
  );


  return cleanSettings;
}


/* =========================
   Handler
========================= */

module.exports =
  async function handler(
    req,
    res
  ) {

    /*
     * منع التخزين المؤقت
     */

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );


    res.setHeader(
      "Pragma",
      "no-cache"
    );


    res.setHeader(
      "Expires",
      "0"
    );


    /*
     * CORS
     */

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


    /*
     * OPTIONS
     */

    if (
      req.method === "OPTIONS"
    ) {

      return res
        .status(204)
        .end();

    }


    /* =========================
       GET
    ========================= */

    if (
      req.method === "GET"
    ) {

      try {

        const settings =
          await readSettings();


        return res
          .status(200)
          .json({
            ok: true,
            settings
          });


      } catch (error) {

        console.error(
          "GET settings error:",
          error
        );


        return res
          .status(500)
          .json({
            ok: false,
            error:
              "تعذر تحميل إعدادات الموقع."
          });

      }

    }


    /* =========================
       POST
    ========================= */

    if (
      req.method === "POST"
    ) {

      /*
       * لا يسمح بتعديل التصميم
       * إلا للمالك.
       */

      if (
        !isOwner(req)
      ) {

        return res
          .status(401)
          .json({
            ok: false,
            error:
              "غير مصرح. يجب تسجيل دخول المالك."
          });

      }


      /*
       * التأكد من Blob
       */

      if (
        !process.env.BLOB_READ_WRITE_TOKEN
      ) {

        return res
          .status(500)
          .json({
            ok: false,
            error:
              "BLOB_READ_WRITE_TOKEN غير موجود. يجب ربط Vercel Blob بالمشروع."
          });

      }


      try {

        let body =
          req.body;


        /*
         * بعض إعدادات Vercel
         * قد ترسل body كنص.
         */

        if (
          typeof body === "string"
        ) {

          body =
            JSON.parse(
              body || "{}"
            );

        }


        if (
          !body ||
          typeof body !== "object" ||
          Array.isArray(body)
        ) {

          return res
            .status(400)
            .json({
              ok: false,
              error:
                "بيانات الإعدادات غير صحيحة."
            });

        }


        /*
         * قراءة الإعدادات القديمة.
         */

        const current =
          await readSettings();


        /*
         * دمج القديمة مع الجديدة.
         */

        const updated =
          mergeSettings({
            ...current,
            ...body
          });


        /*
         * الحفظ الدائم.
         */

        const saved =
          await saveSettings(
            updated
          );


        return res
          .status(200)
          .json({
            ok: true,

            settings:
              saved,

            message:
              "تم حفظ إعدادات الموقع بنجاح."
          });


      } catch (error) {

        console.error(
          "POST settings error:",
          error
        );


        if (
          error.message ===
          "BLOB_READ_WRITE_TOKEN_MISSING"
        ) {

          return res
            .status(500)
            .json({
              ok: false,
              error:
                "BLOB_READ_WRITE_TOKEN غير موجود."
            });

        }


        return res
          .status(500)
          .json({
            ok: false,
            error:
              "تعذر حفظ إعدادات الموقع."
          });

      }

    }


    /* =========================
       Method Not Allowed
    ========================= */

    res.setHeader(
      "Allow",
      "GET, POST, OPTIONS"
    );


    return res
      .status(405)
      .json({
        ok: false,
        error:
          "الطريقة غير مدعومة."
      });
  };
