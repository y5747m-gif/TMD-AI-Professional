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
      error:
        "استخدم GET لهذا المسار."
    });
  }

  const configured =
    Boolean(
      process.env.OWNER_PASSWORD
    );

  return res.status(200).json({
    ok: true,
    configured,
    ownerLoginEnabled:
      configured
  });
};
