const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { asyncHandler } = require("../middleware/errorHandler");
const { protect } = require("../middleware/auth");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  compareToken,
} = require("../services/TokenService");
const { verifyFirebaseToken } = require("../config/firebase");

// ─── Helper ──────────────────────────────────────────────────────────────────
const sendTokens = async (res, user) => {
  const accessToken = signAccessToken(user._id, user.role);
  const refreshToken = signRefreshToken(user._id);

  // Store hashed refresh token
  user.refreshTokenHash = await hashToken(refreshToken);
  user.lastSeen = new Date();
  await user.save();

  return res.json({
    success: true,
    accessToken,
    refreshToken,
    user: user.toSafeObject(),
  });
};


// Add inside routes/auth.js alongside /me
router.get("/profile", protect, asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user.toSafeObject() });
}));


// ─── POST /api/auth/register ─────────────────────────────────────────────────
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { name, email, phone, password, role } = req.body;

    if (!name) return res.status(400).json({ success: false, message: "Name is required" });
    if (!email && !phone)
      return res.status(400).json({ success: false, message: "Email or phone is required" });
    if (!password)
      return res.status(400).json({ success: false, message: "Password is required" });
    if (password.length < 8)
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });

    // Only allow certain roles to self-register; admin must be created by another admin
    const allowedSelfRegister = ["patient", "asha", "doctor", "admin"];
    const assignedRole = allowedSelfRegister.includes(role) ? role : "patient";

    // Check duplicate
    const query = [];
    if (email) query.push({ email });
    if (phone) query.push({ phone });
    const existing = await User.findOne({ $or: query });
    if (existing)
      return res.status(409).json({ success: false, message: "Email or phone already registered" });

    const user = new User({ name, email, phone, role: assignedRole, authProvider: "email" });
    await user.setPassword(password);
    await user.save();

    return sendTokens(res, user);
  })
);

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, phone, password } = req.body;

    if (!password)
      return res.status(400).json({ success: false, message: "Password is required" });
    if (!email && !phone)
      return res.status(400).json({ success: false, message: "Email or phone is required" });

    const query = email ? { email } : { phone };
    const user = await User.findOne(query).select("+passwordHash");
    if (!user)
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    const isMatch = await user.checkPassword(password);
    if (!isMatch)
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    if (!user.isActive)
      return res.status(403).json({ success: false, message: "Account deactivated" });

    return sendTokens(res, user);
  })
);

// ─── POST /api/auth/firebase ──────────────────────────────────────────────────
// Firebase OAuth login/register (Google, Phone, etc.)
router.post(
  "/firebase",
  asyncHandler(async (req, res) => {
    const { idToken, role, name } = req.body;
    if (!idToken)
      return res.status(400).json({ success: false, message: "Firebase idToken is required" });

    let decoded;
    try {
      decoded = await verifyFirebaseToken(idToken);
    } catch (err) {
      return res.status(401).json({ success: false, message: "Invalid Firebase token: " + err.message });
    }

    const { uid, email, phone_number: phone, name: firebaseName, firebase } = decoded;
    const provider = firebase?.sign_in_provider || "firebase";

    // Find or create user
    let user = await User.findOne({ firebaseUid: uid });
    if (!user) {
      // Try match by email or phone
      if (email) user = await User.findOne({ email });
      if (!user && phone) user = await User.findOne({ phone });

      if (user) {
        // Link firebase uid to existing account
        user.firebaseUid = uid;
        user.authProvider = provider;
      } else {
        // Create new user
        const assignedRole = ["patient", "asha", "doctor", "admin"].includes(role)
          ? role
          : "patient";
        user = new User({
          name: name || firebaseName || "User",
          email: email || undefined,
          phone: phone || undefined,
          firebaseUid: uid,
          authProvider: provider,
          role: assignedRole,
          isVerified: true, // Firebase already verified
        });
      }
      await user.save();
    }

    if (!user.isActive)
      return res.status(403).json({ success: false, message: "Account deactivated" });

    return sendTokens(res, user);
  })
);

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken)
      return res.status(400).json({ success: false, message: "Refresh token required" });

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ success: false, message: "Refresh token invalid or expired" });
    }

    const user = await User.findById(decoded.id).select("+refreshTokenHash");
    if (!user || !user.refreshTokenHash)
      return res.status(401).json({ success: false, message: "User not found" });

    const valid = await compareToken(refreshToken, user.refreshTokenHash);
    if (!valid)
      return res.status(401).json({ success: false, message: "Refresh token mismatch" });

    return sendTokens(res, user);
  })
);

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get(
  "/me",
  protect,
  asyncHandler(async (req, res) => {
    res.json({ success: true, user: req.user.toSafeObject() });
  })
);

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post(
  "/logout",
  protect,
  asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, { $unset: { refreshTokenHash: 1 } });
    res.json({ success: true, message: "Logged out" });
  })
);

module.exports = router;