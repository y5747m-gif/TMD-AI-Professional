"use strict";


const OPENAI_URL =
  "https://api.openai.com/v1/responses";


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
      "POST, OPTIONS"
    );


    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type"
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
      req.method !==
      "POST"
    ) {

      return res
        .status(405)
        .json({

          ok:
            false,

          error:
            "استخدم POST."

        });

    }


    const apiKey =
      process.env.OPENAI_API_KEY;


    if (!apiKey) {

      return res
        .status(500)
        .json({

          ok:
            false,

          error:
            "OPENAI_API_KEY غير موجود في Vercel."

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


      const image =
        String(
          body.image || ""
        );


      const prompt =
        String(
          body.prompt || ""
        ).trim();


      const mode =
        body.mode ===
        "edit"

          ? "edit"

          : "analyze";


      if (!image) {

        return res
          .status(400)
          .json({

            ok:
              false,

            error:
              "لم يتم إرسال صورة."

          });

      }


      if (!image.startsWith(
        "data:image/"
      )) {

        return res
          .status(400)
          .json({

            ok:
              false,

            error:
              "صيغة الصورة غير صحيحة."

          });

      }


      if (
        image.length >
        15_000_000
      ) {

        return res
          .status(413)
          .json({

            ok:
              false,

            error:
              "الصورة كبيرة جدًا."

          });

      }


      const instructions =
        mode === "edit"

          ? `أنت مساعد متخصص في الصور والتصميم.

حلل الصورة المرفقة بدقة.

المستخدم يريد:
${prompt || "اقتراح تعديلات احترافية على الصورة."}

حدد:
1. محتوى الصورة.
2. العناصر الموجودة.
3. التعديلات المطلوبة.
4. أفضل طريقة لتنفيذ التعديلات.
5. وصفًا احترافيًا يمكن استخدامه كموجه لأداة تعديل الصور.

لا تدّعِ أنك عدلت الصورة فعليًا إذا لم يتم تنفيذ التعديل.`

          : `أنت مساعد متخصص في تحليل الصور.

حلل الصورة المرفقة بالتفصيل.

طلب المستخدم:
${prompt || "حلل الصورة بالتفصيل."}

اذكر العناصر المهمة والنصوص الظاهرة والمشهد والتفاصيل المرئية، وكن واضحًا بشأن أي شيء غير مؤكد.`;


      const response =
        await fetch(
          OPENAI_URL,
          {

            method:
              "POST",

            headers: {

              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${apiKey}`

            },

            body:
              JSON.stringify({

                model:
                  process.env.OPENAI_VISION_MODEL ||
                  process.env.OPENAI_MODEL ||
                  "gpt-5.6-luna",

                instructions,

                input: [

                  {

                    role:
                      "user",

                    content: [

                      {

                        type:
                          "input_text",

                        text:
                          prompt ||
                          "حلل الصورة."

                      },

                      {

                        type:
                          "input_image",

                        image_url:
                          image

                      }

                    ]

                  }

                ],

                max_output_tokens:
                  1600

              })

          }
        );


      const data =
        await response
          .json()
          .catch(
            () => ({})
          );


      if (!response.ok) {

        const message =
          data?.error?.message ||
          `OpenAI HTTP ${response.status}`;


        return res
          .status(502)
          .json({

            ok:
              false,

            error:
              message

          });

      }


      const text =
        typeof data.output_text ===
        "string"

          ? data.output_text.trim()

          : "";


      if (!text) {

        return res
          .status(502)
          .json({

            ok:
              false,

            error:
              "لم تُرجع خدمة الذكاء الاصطناعي نتيجة للصورة."

          });

      }


      return res
        .status(200)
        .json({

          ok:
            true,

          message:
            text

        });


    } catch (error) {

      console.error(
        "Image API error:",
        error
      );


      return res
        .status(500)
        .json({

          ok:
            false,

          error:
            "حدث خطأ داخلي أثناء معالجة الصورة."

        });

    }

  };
