const {
  getSession
} = require("./_auth");


module.exports = async function handler(req, res) {

  res.setHeader(
    "Cache-Control",
    "no-store"
  );


  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error:
        "استخدم GET لهذا المسار."
    });
  }


  const session =
    getSession(req);


  return res.status(200).json({

    ok: true,

    service:
      "T.M.D AI",

    authenticated:
      Boolean(session),

    groqConfigured:
      Boolean(
        process.env.GROQ_API_KEY
      ),

    authConfigured:
      Boolean(
        process.env.TMD_AUTH_SECRET
      )

  });

};
