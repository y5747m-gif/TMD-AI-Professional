const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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
      error: "استخدم POST لهذا المسار."
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

    const image = body.image;
    const prompt =
      typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt.trim().slice(0, 12000)
        : "حلل هذه الصورة واشرح محتواها بالتفصيل باللغة العربية.";

    if (!image || typeof image !== "string") {
      return res.status(400).json({
        ok: false,
        error: "لم يتم إرسال صورة."
      });
    }

    /*
     * يجب أن تكون الصورة بصيغة Data URL:
     * data:image/jpeg;base64,...
     */

    if (!image.startsWith("data:image/")) {
      return res.status(400).json({
        ok: false,
        error: "صيغة الصورة غير صحيحة."
      });
    }

    /*
     * حماية بسيطة من الصور الضخمة جدًا.
     * الحد هنا حوالي 10MB كنص Base64.
     */

    if (image.length > 14000000) {
      return res.status(413).json({
        ok: false,
        error: "حجم الصورة كبير جدًا. استخدم صورة أصغر."
      });
    }

    const response = await fetch(GROQ_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },

      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",

        messages: [
          {
            role: "system",
            content:
              "أنت T.M.D AI، مساعد ذكاء اصطناعي عربي احترافي. حلل الصور بدقة. إذا كانت الصورة تحتوي على نص فاستخرج النص واشرحه. إذا كانت تحتوي على سؤال دراسي فساعد المستخدم في حله. أجب باللغة العربية بشكل واضح ومنظم، ويمكنك استخدام الإنجليزية عند الحاجة."
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

        max_tokens: 2000
      })
    });

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      console.error(
        "Groq image API error:",
        data
      );

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
      console.error(
        "Empty Groq image response:",
        data
      );

      return res.status(502).json({
        ok: false,
        error: "لم تُرجع خدمة Groq نتيجة لتحليل الصورة."
      });
    }

    return res.status(200).json({
      ok: true,
      message: text,
      model:
        "meta-llama/llama-4-scout-17b-16e-instruct"
    });

  } catch (error) {
    console.error(
      "TMD AI image error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "حدث خطأ داخلي أثناء تحليل الصورة."
    });
  }
};
