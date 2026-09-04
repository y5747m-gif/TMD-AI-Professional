"use strict";

/*
 * ============================================================
 * T.M.D AI
 * GROQ ONLY
 *
 * T.M.D AI
 *    ↓
 * /api/chat
 *    ↓
 * Groq API
 *
 * لا يوجد OpenAI API Key
 * لا يوجد اتصال مباشر بـ OpenAI
 * ============================================================
 */

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";


/*
 * الموديل الافتراضي
 *
 * Groq
 */
const DEFAULT_MODEL =
  "llama-3.1-8b-instant";


/*
 * الموديلات التي يسمح الموقع باستخدامها.
 *
 * إذا كان موديل غير متاح يتم الرجوع
 * تلقائيًا إلى الموديل الافتراضي.
 */
const ALLOWED_MODELS = new Set([
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile"
]);


module.exports = async function handler(req, res) {

  /*
   * ==========================================================
   * HEADERS
   * ==========================================================
   */

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
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );


  /*
   * ==========================================================
   * OPTIONS
   * ==========================================================
   */

  if (req.method === "OPTIONS") {

    return res
      .status(204)
      .end();

  }


  /*
   * ==========================================================
   * METHOD
   * ==========================================================
   */

  if (req.method !== "POST") {

    return res
      .status(405)
      .json({

        ok: false,

        error:
          "Method Not Allowed"

      });

  }


  /*
   * ==========================================================
   * GROQ API KEY
   * ==========================================================
   *
   * مهم:
   *
   * نستخدم GROQ_API_KEY فقط.
   *
   * لا تستخدم:
   *
   * OPENAI_API_KEY
   *
   */

  const apiKey =
    process.env.GROQ_API_KEY;


  if (!apiKey) {

    console.error(
      "GROQ_API_KEY is missing."
    );


    return res
      .status(500)
      .json({

        ok: false,

        error:
          "GROQ_API_KEY غير موجود في إعدادات Vercel."

      });

  }


  try {

    /*
     * ========================================================
     * REQUEST BODY
     * ========================================================
     */

    const body =
      typeof req.body === "string"

        ? JSON.parse(
            req.body || "{}"
          )

        : (
            req.body || {}
          );


    /*
     * ========================================================
     * MESSAGES
     * ========================================================
     */

    const messages =
      Array.isArray(
        body.messages
      )

        ? body.messages

        : [];


    /*
     * ========================================================
     * MODEL
     * ========================================================
     *
     * الموقع يستطيع إرسال:
     *
     * {
     *   model: "llama-3.1-8b-instant"
     * }
     *
     */

    const requestedModel =
      typeof body.model === "string"

        ? body.model.trim()

        : DEFAULT_MODEL;


    /*
     * التأكد أن الموديل مسموح
     */

    const model =
      ALLOWED_MODELS.has(
        requestedModel
      )

        ? requestedModel

        : DEFAULT_MODEL;


    /*
     * ========================================================
     * SYSTEM MESSAGE
     * ========================================================
     */

    const systemMessage = {

      role: "system",

      content:
        `
أنت T.M.D AI، مساعد ذكاء اصطناعي ذكي ومحترف.

قواعد العمل:

- أجب باللغة العربية عندما يكتب المستخدم بالعربية.
- أجب باللغة الإنجليزية عندما يكتب المستخدم بالإنجليزية.
- كن واضحًا ومنظمًا ومباشرًا.
- استخدم العناوين والقوائم والجداول عند الحاجة.
- عند تحليل ملف، اعتمد على محتوى الملف المرسل فقط.
- إذا كانت المعلومة غير موجودة في الملف، أخبر المستخدم بذلك.
- عند التعامل مع الأكواد، اشرحها بطريقة واضحة.
- لا تخترع معلومات غير موجودة في المحتوى المرسل.
- لا تدّعي أنك قرأت ملفًا لم يتم إرسال محتواه.
- لا تكشف مفاتيح API أو إعدادات الخادم.
- أنت تعمل كمساعد T.M.D AI المدعوم بواسطة Groq.
        `.trim()

    };


    /*
     * ========================================================
     * FINAL MESSAGES
     * ========================================================
     */

    const finalMessages = [

      systemMessage,

      ...messages

    ];


    /*
     * ========================================================
     * GROQ REQUEST
     * ========================================================
     */

    const response =
      await fetch(
        GROQ_URL,
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${apiKey}`

          },

          body:
            JSON.stringify({

              model:
                model,

              messages:
                finalMessages,

              temperature:
                0.7,

              max_tokens:
                4096

            })

        }
      );


    /*
     * ========================================================
     * GROQ RESPONSE
     * ========================================================
     */

    const data =
      await response
        .json()
        .catch(
          () => ({})
        );


    /*
     * ========================================================
     * ERROR
     * ========================================================
     */

    if (!response.ok) {

      console.error(
        "Groq API Error:",
        data
      );


      const errorMessage =
        data?.error?.message ||
        "حدث خطأ أثناء الاتصال بخدمة Groq.";


      return res
        .status(
          response.status
        )
        .json({

          ok: false,

          error:
            errorMessage,

          model:
            model

        });

    }


    /*
     * ========================================================
     * GET ANSWER
     * ========================================================
     */

    const reply =
      data?.choices?.[0]?.message?.content;


    /*
     * ========================================================
     * EMPTY RESPONSE
     * ========================================================
     */

    if (
      typeof reply !== "string" ||
      !reply.trim()
    ) {

      console.error(
        "Groq returned no text:",
        data
      );


      return res
        .status(502)
        .json({

          ok: false,

          error:
            "لم يرجع Groq أي إجابة نصية."

        });

    }


    /*
     * ========================================================
     * SUCCESS
     * ========================================================
     */

    return res
      .status(200)
      .json({

        ok: true,

        reply:
          reply.trim(),

        model:
          model

      });


  } catch (error) {

    /*
     * ========================================================
     * INTERNAL ERROR
     * ========================================================
     */

    console.error(
      "T.M.D AI Groq Error:",
      error
    );


    return res
      .status(500)
      .json({

        ok: false,

        error:
          error?.message ||
          "حدث خطأ غير متوقع أثناء الاتصال بـ Groq."

      });

  }

};
