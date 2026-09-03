const crypto = require("crypto");

function createToken() {
  return crypto
    .randomBytes(32)
    .toString("hex");
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
      error:
        "استخدم POST لهذا المسار."
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    const ownerPassword =
      process.env.OWNER_PASSWORD || "";

    if (!ownerPassword) {
      return res.status(500).json({
        ok: false,
        error:
          "OWNER_PASSWORD غير موجود في Vercel."
      });
    }

    if (!password) {
      return res.status(400).json({
        ok: false,
        error:
          "أدخل كلمة مرور المالك."
      });
    }

    if (password !== ownerPassword) {
      return res.status(401).json({
        ok: false,
        error:
          "كلمة مرور المالك غير صحيحة."
      });
    }

    const token =
      createToken();

    return res.status(200).json({
      ok: true,
      token
    });

  } catch (error) {
    console.error(
      "Owner login error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        "حدث خطأ أثناء تسجيل دخول المالك."
    });
  }
};
