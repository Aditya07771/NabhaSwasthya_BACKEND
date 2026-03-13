const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { protect } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

router.get("/", protect, asyncHandler(async (req, res) => {
    const workers = await User.find({ role: "asha", isActive: true })
        .select("name phone email village")
        .lean();
    res.json({ success: true, data: workers });
}));

module.exports = router;