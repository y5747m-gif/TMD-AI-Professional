"use strict";

/*
  T.M.D AI
  Gemini API Backend
  Vercel Serverless Function
*/

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.7-flash";

const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;


module.exports = async function handler(req, res) {

  // -----------------------------------------
  // Headers
  // -----------------------------------------

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


  // -----------------------------------------
  // OPTIONS
  // -----------------------------------------

  if (req.method === "OPTIONS") {
    return res
      .status(204)
      .end();
  }


  // -----------------------------------------
  // Only POST
  // -----------------------------------------

  if (req.method !== "POST") {

    return res
      .status(405)
      .json({
        ok: false,
        error: "استخدم POST لهذا المسار."
      });

  }


  // -----------------------------------------
  // Gemini API Key
  // -----------------------------------------

  const apiKey =
    process.env.GEMINI_API_KEY;


  if (!apiKey) {

    return res
      .status(500)
      .json({
        ok: false,
        error:
          "GEMINI_API_KEY غير موجود في إعدادات Vercel."
      });

  }


  try {

    // -----------------------------------------
    // Read request body
    // -----------------------------------------

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});


    // -----------------------------------------
    // Messages
    // -----------------------------------------

    const messages =
      Array.isArray(body.messages)
        ? body.messages
        : [];


    const cleaned =
      messages
        .filter(message =>
          message &&
          (
            message.role === "user" ||
            message.role === "assistant"
          ) &&
          typeof message.content === "string"
        )
        .slice(-20);


    if (!cleaned.length) {

      return res
        .status(400)
        .json({
          ok: false,
          error: "اكتب رسالة أولًا."
        });

    }


    // -----------------------------------------
    // Convert messages to Gemini format
    // -----------------------------------------

    const contents = [];


    for (const message of cleaned) {

      const parts = [];


      // ---------------------------------------
      // Image
      // ---------------------------------------

      if (message.image) {

        if (
          typeof message.image === "string" &&
          message.image.startsWith("data:image/")
        ) {

          const match =
            message.image.match(
              /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
            );


          if (match) {

            const mimeType =
              match[1];

            const base64Data =
              match[2];


            parts.push({
              inlineData: {
                mimeType,
                data: base64Data
              }
            });

          }

        }

      }


      // ---------------------------------------
      // Text
      // ---------------------------------------

      const text =
        message.content
          .trim()
          .slice(0, 12000);


      if (text) {

        parts.push({
          text
        });

      }


      // ---------------------------------------
      // Skip empty messages
      // ---------------------------------------

      if (!parts.length) {
        continue;
      }


      // Gemini uses:
      // user
      // model

      contents.push({

        role:
          message.role === "assistant"
            ? "model"
            : "user",

        parts

      });

    }


    if (!contents.length) {

      return res
        .status(400)
        .json({
          ok: false,
          error:
            "لم يتم العثور على محتوى صالح."
        });

    }


    // -----------------------------------------
    // Gemini request
    // -----------------------------------------

    const requestBody = {

      systemInstruction: {

        parts: [

          {
            text: `
أنت T.M.D AI، مساعد ذكاء اصطناعي عربي احترافي.

أجب باللغة التي يستخدمها المستخدم.

إذا كان المستخدم يتحدث بالعربية، أجب بالعربية.

إذا أرسل المستخدم صورة:
- افحص الصورة بعناية.
- صف محتواها عند الحاجة.
- أجب عن الأسئلة المتعلقة بها.
- إذا طلب المستخدم تحليل الصورة، قدم تحليلًا واضحًا.
- إذا طلب المستخدم اقتراح تعديلات على الصورة، قدم اقتراحات احترافية.

إذا طلب المستخدم كتابة كود:
- قدم كودًا جاهزًا للنسخ.
- اذكر اسم لغة البرمجة عند الحاجة.
- اجعل الكود منظمًا وواضحًا.

إذا طلب المستخدم شرحًا:
- اشرح بطريقة سهلة ومنظمة.
- استخدم أمثلة عند الحاجة.

لا تدّعي تنفيذ عملية لم تقم بها فعليًا.

أنت تعمل داخل موقع اسمه:
T.M.D AI

كن مفيدًا، واضحًا، مباشرًا ومنظمًا.
            `.trim()
          }

        ]

      },


      contents,


      generationConfig: {

        maxOutputTokens: 2000,

        temperature: 0.7

      }

    };


    // -----------------------------------------
    // Send to Gemini
    // -----------------------------------------

    const response =
      await fetch(
        `${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`,
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(requestBody)

        }
      );


    // -----------------------------------------
    // Read response
    // -----------------------------------------

    const data =
      await response
        .json()
        .catch(() => ({}));


    // -----------------------------------------
    // Gemini Error
    // -----------------------------------------

    if (!response.ok) {

      console.error(
        "Gemini API error:",
        data
      );


      let errorMessage =
        "حدث خطأ أثناء الاتصال بـ Gemini.";


      if (
        data &&
        data.error &&
        data.error.message
      ) {

        errorMessage =
          data.error.message;

      }


      return res
        .status(502)
        .json({

          ok: false,

          error:
            errorMessage

        });

    }


    // -----------------------------------------
    // Extract Gemini text
    // -----------------------------------------

    let text = "";


    if (
      data &&
      Array.isArray(data.candidates)
    ) {

      for (
        const candidate
        of data.candidates
      ) {

        if (
          candidate &&
          candidate.content &&
          Array.isArray(
            candidate.content.parts
          )
        ) {

          for (
            const part
            of candidate.content.parts
          ) {

            if (
              part &&
              typeof part.text === "string"
            ) {

              text += part.text;

            }

          }

        }

      }

    }


    text =
      text.trim();


    // -----------------------------------------
    // Empty response
    // -----------------------------------------

    if (!text) {

      console.error(
        "Gemini returned no text:",
        JSON.stringify(data)
      );


      return res
        .status(502)
        .json({

          ok: false,

          error:
            "لم تُرجع Gemini نصًا."

        });

    }


    // -----------------------------------------
    // Success
    // -----------------------------------------

    return res
      .status(200)
      .json({

        ok: true,

        message:
          text,

        model:
          GEMINI_MODEL

      });


  } catch (error) {

    console.error(
      "TMD Gemini error:",
      error
    );


    return res
      .status(500)
      .json({

        ok: false,

        error:
          "حدث خطأ داخلي في الخادم."

      });

  }

};
