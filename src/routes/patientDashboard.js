const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

router.use(protect);

router.get("/vitals", asyncHandler(async (req, res) => {
    res.json({ success: true, data: [] });
}));

router.get("/medications", asyncHandler(async (req, res) => {
    res.json({ success: true, data: [] });
}));

router.get("/consultations", asyncHandler(async (req, res) => {
    const { page = 1, limit = 5 } = req.query;
    res.json({ success: true, data: [], total: 0, page: +page, limit: +limit });
}));

router.get("/notifications", asyncHandler(async (req, res) => {
    res.json({ success: true, data: [] });
}));

module.exports = router;