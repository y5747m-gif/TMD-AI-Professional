const crypto = require("crypto");

const COOKIE_NAME = "tmd_session";

function getSecret() {
  return process.env.TMD_AUTH_SECRET || "";
}

function sign(value) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(value)
    .digest("hex");
}

function createSession(user) {
  const payload = Buffer.from(
    JSON.stringify({
      username: user.username,
      role: user.role,
      iat: Date.now()
    }),
    "utf8"
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};

  header.split(";").forEach((part) => {
    const index = part.indexOf("=");

    if (index === -1) return;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    cookies[key] = decodeURIComponent(value);
  });

  return cookies;
}

function getSession(req) {
  const secret = getSecret();

  if (!secret) return null;

  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];

  if (!token) return null;

  const parts = token.split(".");

  if (parts.length !== 2) return null;

  const payload = parts[0];
  const signature = parts[1];

  const expected = sign(payload);

  if (signature.length !== expected.length) {
    return null;
  }

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    )
  ) {
    return null;
  }

  try {
    const user = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    if (!user.username || !user.role) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

function setSessionCookie(res, user) {
  const token = createSession(user);

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

function getUsers() {
  let users = [];

  try {
    users = JSON.parse(
      process.env.TMD_USERS_JSON || "[]"
    );
  } catch {
    users = [];
  }

  if (!Array.isArray(users)) {
    users = [];
  }

  const ownerUsername =
    process.env.TMD_OWNER_USERNAME || "";

  const ownerPassword =
    process.env.TMD_OWNER_PASSWORD || "";

  if (
    ownerUsername &&
    ownerPassword
  ) {
    users.push({
      username: ownerUsername,
      password: ownerPassword,
      role: "owner"
    });
  }

  return users.filter(
    (user) =>
      user &&
      typeof user.username === "string" &&
      typeof user.password === "string"
  );
}

function authenticate(username, password) {
  const users = getUsers();

  return (
    users.find(
      (user) =>
        user.username === username &&
        user.password === password
    ) || null
  );
}

function requireAuth(req, res) {
  const user = getSession(req);

  if (!user) {
    res.status(401).json({
      ok: false,
      error: "يجب تسجيل الدخول أولًا."
    });

    return null;
  }

  return user;
}

module.exports = {
  COOKIE_NAME,
  getSession,
  setSessionCookie,
  clearSessionCookie,
  authenticate,
  requireAuth
};
