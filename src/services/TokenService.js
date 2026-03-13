const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const signAccessToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

const signRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  });
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

const hashToken = async (token) => {
  return bcrypt.hash(token, 10);
};

const compareToken = async (token, hash) => {
  return bcrypt.compare(token, hash);
};

module.exports = { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken, compareToken };