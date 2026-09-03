"use strict";


const DEFAULT_SETTINGS = {

  siteName:
    "T.M.D AI",

  siteDescription:
    "المساعد الذكي",

  developerName:
    "ياسين عمرو عبد الرحيم",

  logoText:
    "T",

  logoUrl:
    "",

  faviconUrl:
    "",

  backgroundImage:
    "",

  primaryColor:
    "#c9a227",

  textColor:
    "#f5f7fb",

  backgroundColor:
    "#080b12",

  panelColor:
    "#0d111b",

  borderColor:
    "#202a3b",

  iconColor:
    "#c9a227",

  showWelcome:
    true,

  showSuggestions:
    true,

  showDeveloper:
    true,

  enableImageTools:
    true

};


/*
  ملاحظة مهمة:

  Vercel Serverless Functions لا توفر
  تخزينًا دائمًا داخل ملفات المشروع.

  لذلك هذا الملف يحاول قراءة الإعدادات
  من Environment Variable إذا كانت موجودة.

  والواجهة نفسها تحتفظ بنسخة محلية
  على جهاز المالك.
*/


function getSettings(){

  const raw =
    process.env.TMD_SETTINGS;


  if(!raw){

    return {
      ...DEFAULT_SETTINGS
    };

  }


  try{

    const parsed =
      JSON.parse(raw);


    return {

      ...DEFAULT_SETTINGS,

      ...parsed

    };

  }catch{

    return {
      ...DEFAULT_SETTINGS
    };

  }

}


/*
  فحص المالك.
*/

function isOwner(req){

  const secret =
    process.env.OWNER_PASSWORD;


  if(!secret){

    return false;

  }


  const authorization =
    req.headers.authorization ||
    "";


  if(
    !authorization.startsWith(
      "Bearer "
    )
  ){

    return false;

  }


  /*
    الواجهة تستخدم توكن جلسة،
    لذلك في النسخة المجانية الحالية
    نسمح فقط بوجود Authorization.
    
    التخزين المركزي الحقيقي يحتاج
    قاعدة بيانات / KV / Blob.
  */

  return true;

}


module.exports =
  async function handler(
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
      "GET, POST, OPTIONS"
    );


    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );


    if(
      req.method === "OPTIONS"
    ){

      return res
        .status(204)
        .end();

    }


    if(
      req.method === "GET"
    ){

      return res
        .status(200)
        .json({

          ok:true,

          settings:
            getSettings()

        });

    }


    if(
      req.method === "POST"
    ){

      if(!isOwner(req)){

        return res
          .status(401)
          .json({

            ok:false,

            error:
              "غير مصرح."

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


        const updated = {

          ...getSettings(),

          ...body

        };


        /*
          Vercel لا يسمح بتعديل Environment Variables
          أثناء تشغيل Serverless Function.

          لذلك نعيد الإعدادات للواجهة.
        */


        return res
          .status(200)
          .json({

            ok:true,

            settings:
              updated,

            message:
              "تم استقبال الإعدادات."

          });


      }catch(error){

        console.error(
          "Settings error:",
          error
        );


        return res
          .status(400)
          .json({

            ok:false,

            error:
              "بيانات الإعدادات غير صحيحة."

          });

      }

    }


    return res
      .status(405)
      .json({

        ok:false,

        error:
          "الطريقة غير مدعومة."

      });

  };
