const { put } = require("@vercel/blob");

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};


/* ========================================
   OWNER AUTHENTICATION
======================================== */

function isOwner(req) {
  const secret = process.env.OWNER_SECRET;
  const header = req.headers.authorization || "";

  if (!secret || !header.startsWith("Bearer ")) {
    return false;
  }

  return header.slice(7).trim() === secret;
}


/* ========================================
   JSON RESPONSE
======================================== */

function json(res, status, data) {
  return res.status(status).json(data);
}


/* ========================================
   DATA URL PARSER
======================================== */

function parseImageDataUrl(dataUrl) {

  const match = String(dataUrl || "").match(
    /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/i
  );

  if (!match) {
    return null;
  }

  const contentType =
    match[1].toLowerCase();

  const base64 =
    match[2];

  if (!ALLOWED_TYPES[contentType]) {
    return null;
  }

  let buffer;

  try {
    buffer = Buffer.from(
      base64,
      "base64"
    );
  } catch {
    return null;
  }

  if (!buffer || !buffer.length) {
    return null;
  }

  return {
    contentType,
    extension:
      ALLOWED_TYPES[contentType],
    buffer
  };
}


/* ========================================
   MAIN HANDLER
======================================== */

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
    "Content-Type, Authorization"
  );


  /* ----------------------------------------
     OPTIONS
  ---------------------------------------- */

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }


  /* ----------------------------------------
     METHOD
  ---------------------------------------- */

  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      error: "استخدم POST."
    });
  }


  /* ----------------------------------------
     OWNER CHECK
  ---------------------------------------- */

  if (!isOwner(req)) {
    return json(res, 401, {
      ok: false,
      error: "غير مصرح."
    });
  }


  /* ----------------------------------------
     VERCEL BLOB
  ---------------------------------------- */

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return json(res, 500, {
      ok: false,
      error:
        "BLOB_READ_WRITE_TOKEN غير موجود. أنشئ Vercel Blob واربطه بالمشروع."
    });
  }


  try {

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};


    const dataUrl =
      String(body.dataUrl || "");

    const type =
      String(body.type || "").toLowerCase();


    /* ----------------------------------------
       IMAGE VALIDATION
    ---------------------------------------- */

    if (!dataUrl.startsWith("data:image/")) {
      return json(res, 400, {
        ok: false,
        error: "الملف المرسل ليس صورة."
      });
    }


    const image =
      parseImageDataUrl(dataUrl);


    if (!image) {
      return json(res, 400, {
        ok: false,
        error:
          "صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WEBP أو GIF."
      });
    }


    /* ----------------------------------------
       SIZE CHECK
    ---------------------------------------- */

    if (image.buffer.length > MAX_IMAGE_SIZE) {
      return json(res, 413, {
        ok: false,
        error:
          "حجم الصورة يجب ألا يتجاوز 5MB."
      });
    }


    /* ----------------------------------------
       UPLOAD FOLDER
    ---------------------------------------- */

    /*
     * This endpoint remains an OWNER/admin
     * upload endpoint.
     *
     * User image analysis does NOT use this
     * endpoint.
     */

    const folder =
      type === "logo"
        ? "branding"
        : "backgrounds";


    /* ----------------------------------------
       SAFE FILE NAME
    ---------------------------------------- */

    const filename =
      `${folder}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 9)}.${image.extension}`;


    /* ----------------------------------------
       VERCEL BLOB UPLOAD
    ---------------------------------------- */

    const blob = await put(
      filename,
      image.buffer,
      {
        access: "public",

        contentType:
          image.contentType,

        addRandomSuffix: false,

        cacheControlMaxAge:
          31536000
      }
    );


    /* ----------------------------------------
       SUCCESS
    ---------------------------------------- */

    return json(res, 200, {
      ok: true,

      url: blob.url,

      pathname:
        blob.pathname,

      contentType:
        image.contentType,

      size:
        image.buffer.length
    });


  } catch (error) {

    console.error(
      "TMD AI Upload error:",
      error
    );


    return json(res, 500, {
      ok: false,
      error:
        "تعذر رفع الصورة."
    });
  }
};
