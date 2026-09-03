"use strict";

const {
  put,
  list
} = require("@vercel/blob");


const DEFAULT_SETTINGS = {

  siteName:
    "T.M.D AI",

  siteDescription:
    "المساعد الذكي",

  developerName:
    "ياسين عمرو عبد الرحيم",

  primaryColor:
    "#c9a227",

  secondaryColor:
    "#ffffff",

  backgroundColor:
    "#faf8f1",

  logoText:
    "T",

  backgroundImage:
    "",

  showWelcome:
    true,

  showSuggestions:
    true,

  showDeveloper:
    true,

  enableImageTools:
    true,

  suggestions: [

    {
      title:
        "شرح الذكاء الاصطناعي",

      icon:
        "🤖",

      prompt:
        "اشرح لي الذكاء الاصطناعي بطريقة بسيطة"

    },

    {
      title:
        "اكتب كود",

      icon:
        "💻",

      prompt:
        "اكتب لي كود HTML احترافي"

    },

    {
      title:
        "حل مسألة",

      icon:
        "🧮",

      prompt:
        "حل لي هذه المسألة خطوة بخطوة"

    },

    {
      title:
        "سؤال ديني",

      icon:
        "📖",

      prompt:
        "اشرح لي هذه المسألة الدينية مع ذكر المصادر المؤكدة فقط"

    }

  ]

};


const SETTINGS_FILE =
  "tmd-ai/settings.json";


function isOwner(req) {

  const secret =
    process.env.OWNER_SECRET;


  if (!secret) {
    return false;
  }


  const authorization =
    req.headers.authorization ||
    "";


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


  return token === secret;
}


async function getSettings() {

  try {

    const result =
      await list({
        prefix:
          SETTINGS_FILE
      });


    const blob =
      result.blobs.find(
        item =>
          item.pathname ===
          SETTINGS_FILE
      );


    if (!blob) {

      return {
        ...DEFAULT_SETTINGS
      };

    }


    const response =
      await fetch(
        blob.url,
        {
          cache:
            "no-store"
        }
      );


    if (!response.ok) {

      throw new Error(
        "تعذر قراءة ملف الإعدادات."
      );

    }


    const saved =
      await response.json();


    return {

      ...DEFAULT_SETTINGS,

      ...(saved || {})

    };

  } catch (error) {

    console.error(
      "Get settings error:",
      error
    );


    return {
      ...DEFAULT_SETTINGS
    };

  }

}


module.exports =
  async function handler(
    req,
    res
  ) {

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


    if (
      req.method ===
      "OPTIONS"
    ) {

      return res
        .status(204)
        .end();

    }


    if (
      req.method ===
      "GET"
    ) {

      const settings =
        await getSettings();


      return res
        .status(200)
        .json({

          ok:
            true,

          settings

        });

    }


    if (
      req.method ===
      "POST"
    ) {

      if (!isOwner(req)) {

        return res
          .status(401)
          .json({

            ok:
              false,

            error:
              "غير مصرح. يجب تسجيل دخول المالك."

          });

      }


      try {

        const body =
          typeof req.body ===
          "string"

            ? JSON.parse(
                req.body || "{}"
              )

            : (
                req.body || {}
              );


        const current =
          await getSettings();


        const updated = {

          ...current,

          ...body

        };


        if (
          !Array.isArray(
            updated.suggestions
          )
        ) {

          updated.suggestions =
            DEFAULT_SETTINGS.suggestions;

        }


        const blob =
          await put(

            SETTINGS_FILE,

            JSON.stringify(
              updated
            ),

            {

              access:
                "public",

              contentType:
                "application/json",

              addRandomSuffix:
                false,

              allowOverwrite:
                true

            }

          );


        return res
          .status(200)
          .json({

            ok:
              true,

            settings:
              updated,

            url:
              blob.url

          });


      } catch (error) {

        console.error(
          "Save settings error:",
          error
        );


        return res
          .status(500)
          .json({

            ok:
              false,

            error:
              "تعذر حفظ إعدادات الموقع."

          });

      }

    }


    return res
      .status(405)
      .json({

        ok:
          false,

        error:
          "الطريقة غير مدعومة."

      });

  };
