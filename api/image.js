const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
];


function getBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return req.body;
}


function normalizeImage(image) {
  if (!image) {
    return null;
  }

  if (typeof image === "string") {
    return image;
  }

  if (
    typeof image.data === "string" &&
    image.data.length > 0
  ) {
    return image.data;
  }

  return null;
}


function detectMimeType(data) {
  const match =
    data.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,/
    );

  return match
    ? match[1]
    : "";
}


function getBase64(data) {
  return data.replace(
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
    ""
  );
}


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
      error: "استخدم POST لهذا المسار."
    });
  }


  const apiKey =
    process.env.OPENAI_API_KEY;


  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error:
        "OPENAI_API_KEY غير موجود في Vercel."
    });
  }


  try {

    const body =
      getBody(req);


    const image =
      normalizeImage(body.image);


    if (!image) {
      return res.status(400).json({
        ok: false,
        error: "لم يتم إرسال صورة."
      });
    }


    const mimeType =
      detectMimeType(image);


    if (
      !ALLOWED_TYPES.includes(mimeType)
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WEBP أو GIF."
      });
    }


    const base64 =
      getBase64(image);


    const size =
      Buffer.byteLength(
        base64,
        "base64"
      );


    if (size > MAX_IMAGE_SIZE) {
      return res.status(400).json({
        ok: false,
        error:
          "حجم الصورة كبير جدًا. الحد الأقصى 8MB."
      });
    }


    const userPrompt =
      typeof body.prompt === "string" &&
      body.prompt.trim()
        ? body.prompt.trim()
        : "حلل هذه الصورة بالتفصيل واذكر أهم العناصر والمعلومات الموجودة فيها.";


    const model =
      process.env.OPENAI_MODEL ||
      "gpt-4o-mini";


    const response =
      await fetch(
        "https://api.openai.com/v1/chat/completions",
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
                  "أنت T.M.D AI، مساعد ذكاء اصطناعي احترافي. حلل الصور بدقة، وأجب باللغة العربية إذا كان المستخدم يكتب بالعربية."
              },

              {
                role: "user",

                content: [
                  {
                    type: "text",

                    text:
                      userPrompt
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

            max_tokens: 1500
          })
        }
      );


    const data =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      console.error(
        "OpenAI image error:",
        data
      );

      return res.status(502).json({
        ok: false,
        error:
          data?.error?.message ||
          `OpenAI returned HTTP ${response.status}`
      });
    }


    const text =
      data?.choices?.[0]?.message?.content
        ?.trim() || "";


    if (!text) {
      return res.status(502).json({
        ok: false,
        error:
          "لم تُرجع خدمة الذكاء الاصطناعي نتيجة."
      });
    }


    return res.status(200).json({
      ok: true,
      message: text,
      model
    });


  } catch (error) {

    console.error(
      "TMD image error:",
      error
    );


    return res.status(500).json({
      ok: false,
      error:
        "حدث خطأ داخلي أثناء تحليل الصورة."
    });
  }
};
