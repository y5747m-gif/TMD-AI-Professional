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

  const ownerSecret = process.env.OWNER_SECRET;

  if (!ownerSecret) {
    return res.status(500).json({
      ok: false,
      error: "OWNER_SECRET غير موجود في Vercel."
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const password = String(body.password || "");

    if (!password) {
      return res.status(400).json({
        ok: false,
        error: "أدخل كلمة مرور المالك."
      });
    }

    if (password !== ownerSecret) {
      return res.status(401).json({
        ok: false,
        error: "كلمة مرور المالك غير صحيحة."
      });
    }

    return res.status(200).json({
      ok: true,
      token: ownerSecret
    });
  } catch (error) {
    console.error("Owner login error:", error);

    return res.status(400).json({
      ok: false,
      error: "بيانات الطلب غير صحيحة."
    });
  }
};
