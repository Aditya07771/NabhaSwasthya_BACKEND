const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

router.post("/chat/start", protect, asyncHandler(async (req, res) => {
    res.json({ success: true, sessionId: Date.now().toString(), message: "AI chat started" });
}));

module.exports = router;