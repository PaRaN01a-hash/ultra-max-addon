const crypto = require("crypto");

function hashPassword(p) {
  return crypto
    .createHash("sha256")
    .update(p + "ultramax_salt")
    .digest("hex");
}

function generateToken() {
  return crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase();
}

module.exports = {
  hashPassword,
  generateToken
};
