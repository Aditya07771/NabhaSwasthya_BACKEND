const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Verifies the Bearer JWT in Authorization header.
 * Attaches decoded payload to req.user.
 */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: "Token invalid or expired" });
    }

    const user = await User.findById(decoded.id).select("-passwordHash -refreshTokenHash");
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: "User not found or deactivated" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ success: false, message: "Server error during auth" });
  }
};

/**
 * Restrict access to certain roles.
 * Usage: authorize("admin", "doctor")
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not allowed to access this resource`,
      });
    }
    next();
  };
};

module.exports = { protect, authorize };