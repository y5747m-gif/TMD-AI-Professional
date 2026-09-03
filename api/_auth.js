const crypto = require("crypto");

function safeEqual(a, b) {
  if (
    typeof a !== "string" ||
    typeof b !== "string"
  ) {
    return false;
  }

  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    aBuffer,
    bBuffer
  );
}

function getBearerToken(req) {
  const header =
    req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header
    .slice(7)
    .trim();
}

function isOwner(req) {
  const token =
    getBearerToken(req);

  const secret =
    process.env.OWNER_SECRET || "";

  if (!token || !secret) {
    return false;
  }

  return safeEqual(
    token,
    secret
  );
}

module.exports = {
  safeEqual,
  getBearerToken,
  isOwner
};
