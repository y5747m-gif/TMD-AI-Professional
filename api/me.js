const {
  getSession
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
    "GET, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );


  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }


  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "استخدم GET لهذا المسار."
    });
  }


  const user =
    getSession(req);


  if (!user) {
    return res.status(200).json({
      ok: true,
      authenticated: false
    });
  }


  return res.status(200).json({
    ok: true,
    authenticated: true,
    user: {
      username: user.username,
      role: user.role
    }
  });

};
