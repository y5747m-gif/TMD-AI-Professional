const { put } = require("@vercel/blob");

function isOwner(req) {
  const secret = process.env.OWNER_SECRET;
  const header = req.headers.authorization || "";

  if (!secret || !header.startsWith("Bearer ")) {
    return false;
  }

  return header.slice(7).trim() === secret;
}

function json(res, status, data) {
  return res.status(status).json(data);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      error: "استخدم POST."
    });
  }

  if (!isOwner(req)) {
    return json(res, 401, {
      ok: false,
      error: "غير مصرح."
    });
  }

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

    const dataUrl = String(body.dataUrl || "");
    const type = String(body.type || "");

    if (!dataUrl.startsWith("data:image/")) {
      return json(res, 400, {
        ok: false,
        error: "الملف المرسل ليس صورة."
      });
    }

    const match = dataUrl.match(
      /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/i
    );

    if (!match) {
      return json(res, 400, {
        ok: false,
        error: "صيغة الصورة غير مدعومة."
      });
    }

    const contentType = match[1].toLowerCase();
    const base64 = match[2];

    const buffer = Buffer.from(base64, "base64");

    if (buffer.length > 5 * 1024 * 1024) {
      return json(res, 413, {
        ok: false,
        error: "حجم الصورة يجب ألا يتجاوز 5MB."
      });
    }

    const extension =
      contentType === "image/jpeg"
        ? "jpg"
        : contentType.split("/")[1];

    const folder =
      type === "logo"
        ? "branding"
        : "backgrounds";

    const filename =
      `${folder}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 9)}.${extension}`;

    const blob = await put(filename, buffer, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      cacheControlMaxAge: 31536000
    });

    return json(res, 200, {
      ok: true,
      url: blob.url,
      pathname: blob.pathname
    });
  } catch (error) {
    console.error("Upload error:", error);

    return json(res, 500, {
      ok: false,
      error: "تعذر رفع الصورة."
    });
  }
};
