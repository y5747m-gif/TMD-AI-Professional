const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const {
  requireAuth
} = require("./_auth");


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
      error:
        "استخدم POST لهذا المسار."
    });
  }


  const user =
    requireAuth(req, res);


  if (!user) {
    return;
  }


  const apiKey =
    process.env.GROQ_API_KEY;


  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error:
        "GROQ_API_KEY غير موجود في Vercel."
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


    const cleaned =
      messages

        .filter(
          (message) =>
            message &&
            (
              message.role === "user" ||
              message.role === "assistant"
            ) &&
            typeof message.content === "string"
        )

        .slice(-20)

        .map(
          (message) => ({
            role: message.role,

            content:
              message.content
                .trim()
                .slice(0, 12000)
          })
        )

        .filter(
          (message) =>
            message.content
        );


    if (!cleaned.length) {
      return res.status(400).json({
        ok: false,
        error:
          "اكتب رسالة أولًا."
      });
    }


    const model =
      process.env.GROQ_MODEL ||
      "llama-3.3-70b-versatile";


    const response =
      await fetch(
        GROQ_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${apiKey}`
          },

          body: JSON.stringify({

            model,

            messages: [
              {
                role: "system",

                content:
                  "أنت T.M.D AI، مساعد ذكاء اصطناعي عربي احترافي. أجب بوضوح وباختصار مفيد. ادعم العربية والإنجليزية. ساعد المستخدم في البرمجة والدراسة والكتابة والأسئلة العامة."
              },

              ...cleaned
            ],

            temperature: 0.7,

            max_tokens: 1200

          })
        }
      );


    const data =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      const message =
        data &&
        data.error &&
        data.error.message
          ? data.error.message
          : `Groq returned HTTP ${response.status}`;


      console.error(
        "Groq API error:",
        data
      );


      return res.status(502).json({
        ok: false,
        error: message
      });

    }


    const text =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      typeof
        data.choices[0].message.content ===
        "string"

        ? data.choices[0]
            .message
            .content
            .trim()

        : "";


    if (!text) {

      console.error(
        "Empty Groq response:",
        data
      );


      return res.status(502).json({
        ok: false,
        error:
          "لم تُرجع خدمة Groq نصًا."
      });

    }


    return res.status(200).json({

      ok: true,

      message: text,

      model,

      user: {
        username: user.username,
        role: user.role
      }

    });


  } catch (error) {

    console.error(
      "TMD AI / Groq error:",
      error
    );


    return res.status(500).json({
      ok: false,
      error:
        "حدث خطأ داخلي في الخادم."
    });

  }

};
