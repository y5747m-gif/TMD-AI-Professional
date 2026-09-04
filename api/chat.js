"use strict";

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const DEFAULT_MODEL =
  "llama-3.1-8b-instant";

const VISION_MODEL =
  "meta-llama/llama-4-scout-17b-16e-instruct";

const ALLOWED_MODELS = new Set([
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "meta-llama/llama-4-scout-17b-16e-instruct"
]);


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
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );


  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }


  if (req.method !== "POST") {

    return res.status(405).json({
      ok: false,
      error: "Method Not Allowed"
    });

  }


  /*
   * GROQ ONLY
   */

  const apiKey =
    process.env.GROQ_API_KEY;


  if (!apiKey) {

    return res.status(500).json({
      ok: false,
      error:
        "GROQ_API_KEY غير موجود في إعدادات Vercel."
    });

  }


  try {

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});


    const messages =
      Array.isArray(body.messages)
        ? body.messages
        : [];


    const requestedModel =
      typeof body.model === "string"
        ? body.model.trim()
        : DEFAULT_MODEL;


    let model =
      ALLOWED_MODELS.has(requestedModel)
        ? requestedModel
        : DEFAULT_MODEL;


    /*
     * إذا كانت هناك صورة،
     * استخدم موديل الرؤية في Groq.
     */

    const hasImage =
      messages.some(message =>
        Array.isArray(message?.content) &&
        message.content.some(
          part =>
            part?.type === "image_url"
        )
      );


    if (hasImage) {
      model = VISION_MODEL;
    }


    const systemMessage = {

      role: "system",

      content: [
        "أنت T.M.D AI، مساعد ذكاء اصطناعي ذكي ومحترف يعمل عبر Groq.",
        "أجب باللغة العربية إذا كانت رسالة المستخدم بالعربية.",
        "أجب باللغة الإنجليزية إذا كانت رسالة المستخدم بالإنجليزية.",
        "كن واضحًا ومنظمًا ومباشرًا.",
        "استخدم العناوين والقوائم والجداول عند الحاجة.",
        "عند تحليل ملف، اعتمد على محتوى الملف المرسل فقط.",
        "لا تخترع معلومات غير موجودة في الملف.",
        "إذا لم تجد المعلومة المطلوبة، أخبر المستخدم بذلك بوضوح.",
        "عند تحليل صورة، حلل محتواها بدقة.",
        "لا تكشف مفاتيح API أو أسرار الخادم."
      ].join("\n")

    };


    const finalMessages = [
      systemMessage,
      ...messages
    ];


    const response =
      await fetch(
        GROQ_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${apiKey}`
          },

          body:
            JSON.stringify({

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


    const data =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      console.error(
        "Groq API Error:",
        data
      );


      return res
        .status(response.status)
        .json({

          ok: false,

          error:
            data?.error?.message ||
            "حدث خطأ أثناء الاتصال بخدمة Groq.",

          model

        });

    }


    const reply =
      data?.choices?.[0]?.message?.content;


    if (
      typeof reply !== "string" ||
      !reply.trim()
    ) {

      return res.status(502).json({

        ok: false,

        error:
          "لم يرجع Groq أي إجابة نصية.",

        model

      });

    }


    return res.status(200).json({

      ok: true,

      reply:
        reply.trim(),

      model

    });


  } catch (error) {

    console.error(
      "T.M.D AI / Groq Error:",
      error
    );


    return res.status(500).json({

      ok: false,

      error:
        error?.message ||
        "حدث خطأ غير متوقع أثناء الاتصال بـ Groq."

    });

  }

};
