"use strict";

const OPENAI_URL =
  "https://api.openai.com/v1/responses";


module.exports = async function handler(
  req,
  res
){

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


  if(req.method === "OPTIONS"){

    return res
      .status(204)
      .end();

  }


  if(req.method !== "POST"){

    return res
      .status(405)
      .json({

        ok:false,

        error:
          "استخدم POST لهذا المسار."

      });

  }


  const apiKey =
    process.env.OPENAI_API_KEY;


  if(!apiKey){

    return res
      .status(500)
      .json({

        ok:false,

        error:
          "OPENAI_API_KEY غير موجود في Vercel."

      });

  }


  try{

    const body =
      typeof req.body === "string"
        ? JSON.parse(
            req.body || "{}"
          )
        : (
            req.body || {}
          );


    const messages =
      Array.isArray(
        body.messages
      )
        ? body.messages
        : [];


    const cleaned =
      messages
        .filter(
          message =>
            message &&
            (
              message.role === "user" ||
              message.role === "assistant"
            ) &&
            typeof message.content === "string"
        )
        .slice(-20);


    if(!cleaned.length){

      return res
        .status(400)
        .json({

          ok:false,

          error:
            "اكتب رسالة أولًا."

        });

    }


    const input =
      cleaned.map(
        message => {

          const content = [];


          if(message.image){

            if(
              typeof message.image !== "string" ||
              !message.image.startsWith(
                "data:image/"
              )
            ){

              return {

                role:
                  message.role,

                content:[
                  {
                    type:
                      "input_text",

                    text:
                      message.content
                  }
                ]

              };

            }


            content.push({

              type:
                "input_image",

              image_url:
                message.image

            });

          }


          content.push({

            type:
              "input_text",

            text:
              message.content
                .trim()
                .slice(
                  0,
                  12000
                )

          });


          return {

            role:
              message.role,

            content

          };

        }
      );


    const model =
      process.env.OPENAI_MODEL ||
      "gpt-5.6-luna";


    const response =
      await fetch(
        OPENAI_URL,
        {

          method:
            "POST",

          headers:
            {

              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${apiKey}`

            },

          body:
            JSON.stringify({

              model,

              instructions:
                `
أنت T.M.D AI، مساعد عربي احترافي.

أجب باللغة التي يستخدمها المستخدم.

إذا أرسل المستخدم صورة، افحص الصورة بعناية وأجب بناءً على محتواها.

إذا طلب المستخدم تعديل صورة أو اقتراح تعديلات، قدم اقتراحات واضحة.

لا تدّعي أنك عدلت الصورة فعليًا إذا لم يتم توفير أداة تعديل صور فعلية.

كن واضحًا ومفيدًا ومنظمًا.
                `.trim(),

              input,

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


    if(!response.ok){

      const message =
        data &&
        data.error &&
        data.error.message

          ? data.error.message

          : `OpenAI returned HTTP ${response.status}`;


      return res
        .status(502)
        .json({

          ok:false,

          error:
            message

        });

    }


    const text =
      typeof data.output_text === "string"
        ? data.output_text.trim()
        : "";


    if(!text){

      return res
        .status(502)
        .json({

          ok:false,

          error:
            "لم تُرجع خدمة الذكاء الاصطناعي نصًا."

        });

    }


    return res
      .status(200)
      .json({

        ok:true,

        message:
          text,

        model

      });


  }catch(error){

    console.error(
      "TMD AI error:",
      error
    );


    return res
      .status(500)
      .json({

        ok:false,

        error:
          "حدث خطأ داخلي في الخادم."

      });

  }

};
