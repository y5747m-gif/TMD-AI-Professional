"use strict";

const crypto =
  require("crypto");


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
          "Method Not Allowed"

      });

  }


  const ownerPassword =
    process.env.OWNER_PASSWORD;


  if(!ownerPassword){

    return res
      .status(500)
      .json({

        ok:false,

        error:
          "OWNER_PASSWORD غير موجود في إعدادات Vercel."

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


    const password =
      String(
        body.password || ""
      );


    if(!password){

      return res
        .status(400)
        .json({

          ok:false,

          error:
            "أدخل كلمة المرور."

        });

    }


    const valid =
      crypto.timingSafeEqual(

        Buffer.from(password),

        Buffer.from(ownerPassword)

      );


    if(!valid){

      return res
        .status(401)
        .json({

          ok:false,

          error:
            "كلمة مرور المالك غير صحيحة."

        });

    }


    /*
      ملاحظة:
      هذا التوكن البسيط مناسب للنسخة
      الأساسية.
    */

    const token =
      crypto
        .createHash("sha256")
        .update(
          ownerPassword +
          ":" +
          Date.now()
        )
        .digest("hex");


    return res
      .status(200)
      .json({

        ok:true,

        token

      });


  }catch(error){

    console.error(
      "Owner login error:",
      error
    );


    return res
      .status(500)
      .json({

        ok:false,

        error:
          "حدث خطأ أثناء تسجيل الدخول."

      });

  }

};
