const {
  authenticate,
  setSessionCookie
} = require("./_auth");

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


  if (!process.env.TMD_AUTH_SECRET) {
    return res.status(500).json({
      ok: false,
      error: "TMD_AUTH_SECRET غير موجود في Vercel."
    });
  }


  try {

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});


    const username =
      typeof body.username === "string"
        ? body.username.trim()
        : "";


    const password =
      typeof body.password === "string"
        ? body.password
        : "";


    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        error:
          "أدخل اسم المستخدم وكلمة المرور."
      });
    }


    const user =
      authenticate(
        username,
        password
      );


    if (!user) {
      return res.status(401).json({
        ok: false,
        error:
          "اسم المستخدم أو كلمة المرور غير صحيحة."
      });
    }


    setSessionCookie(
      res,
      {
        username: user.username,
        role: user.role || "user"
      }
    );


    return res.status(200).json({
      ok: true,
      user: {
        username: user.username,
        role: user.role || "user"
      }
    });


  } catch (error) {

    console.error(
      "TMD login error:",
      error
    );


    return res.status(500).json({
      ok: false,
      error:
        "حدث خطأ داخلي أثناء تسجيل الدخول."
    });

  }

};
