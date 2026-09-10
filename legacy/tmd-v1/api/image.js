const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "استخدم POST."
    });
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "GROQ_API_KEY غير موجود في Vercel."
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const image = String(body.image || "");

    const prompt =
      String(body.prompt || "").trim() ||
      "حلل هذه الصورة بالتفصيل، واشرح ما يظهر فيها، واقرأ أي نص واضح داخلها.";

    if (!image.startsWith("data:image/")) {
      return res.status(400).json({
        ok: false,
        error: "لم يتم إرسال صورة صحيحة."
      });
    }

    /*
     * Groq Vision currently supports image inputs
     * up to 20MB for this model.
     */

    if (image.length > 20 * 1024 * 1024) {
      return res.status(413).json({
        ok: false,
        error: "الصورة كبيرة جدًا. استخدم صورة أصغر من 20MB."
      });
    }

    const response = await fetch(GROQ_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },

      body: JSON.stringify({
        model:
          process.env.GROQ_VISION_MODEL ||
          "qwen/qwen3.6-27b",

        messages: [
          {
            role: "system",

            content:
              "أنت T.M.D AI، مساعد ذكاء اصطناعي متخصص في فهم وتحليل الصور. " +
              "قم بتحليل الصور بدقة، وصف العناصر الظاهرة، قراءة النصوص داخل الصور " +
              "عند وضوحها، والإجابة عن أسئلة المستخدم المتعلقة بالصورة. " +
              "لا تخترع معلومات غير موجودة في الصورة. " +
              "لا تدّعي أنك أنشأت أو عدّلت الصورة. " +
              "أنت تقوم بتحليل الصورة وإرجاع إجابة نصية فقط."
          },

          {
            role: "user",

            content: [
              {
                type: "text",
                text: prompt
              },

              {
                type: "image_url",

                image_url: {
                  url: image
                }
              }
            ]
          }
        ],

        temperature: 0.4,

        max_tokens: 1800
      })
    });

    const data =
      await response.json().catch(() => ({}));

    if (!response.ok) {

      const message =
        data &&
        data.error &&
        data.error.message
          ? data.error.message
          : `Groq returned HTTP ${response.status}`;

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
      typeof data.choices[0].message.content === "string"
        ? data.choices[0].message.content.trim()
        : "";

    if (!text) {
      return res.status(502).json({
        ok: false,
        error: "لم تُرجع خدمة تحليل الصور نتيجة."
      });
    }

    return res.status(200).json({
      ok: true,
      message: text,

      model:
        process.env.GROQ_VISION_MODEL ||
        "qwen/qwen3.6-27b"
    });

  } catch (error) {

    console.error(
      "TMD AI image analysis error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "حدث خطأ داخلي أثناء تحليل الصورة."
    });
  }
};
