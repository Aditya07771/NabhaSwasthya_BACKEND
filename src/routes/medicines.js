const express = require("express");
const router = express.Router();
const Medicine = require("../models/Medicine");
const SymptomRule = require("../models/SymptomRule");
const { protect, authorize } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const {
  fetchAndStoreMedicineImage,
  bulkFetchMedicineImages,
} = require("../services/medicineImageService");

router.use(protect);

// ─── GET /api/medicines ───────────────────────────────────────────────────────
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { query, page = 1, limit = 20 } = req.query;
    const filter = { isActive: true };

    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: "i" } },
        { displayName: { $regex: query, $options: "i" } },
        { brandNames: { $regex: query, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [medicines, total] = await Promise.all([
      Medicine.find(filter).skip(skip).limit(parseInt(limit)).sort({ displayName: 1 }),
      Medicine.countDocuments(filter),
    ]);

    res.json({ success: true, medicines, total });
  })
);

// ─── GET /api/medicines/:name ─────────────────────────────────────────────────
router.get(
  "/:name",
  asyncHandler(async (req, res) => {
    const medicine = await Medicine.findOne({
      $or: [
        { name: req.params.name.toLowerCase() },
        { displayName: { $regex: `^${req.params.name}$`, $options: "i" } },
      ],
      isActive: true,
    });

    if (!medicine)
      return res.status(404).json({ success: false, message: "Medicine not found" });

    res.json({
      success: true,
      medicine,
      safetyNote:
        "This information is for reference only. Always consult a pharmacist or doctor before use.",
    });
  })
);

// ─── POST /api/medicines — Admin only ─────────────────────────────────────────
router.post(
  "/",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const medicine = await Medicine.create(req.body);
    res.status(201).json({ success: true, medicine });
  })
);

// ─── PUT /api/medicines/:id — Admin only ──────────────────────────────────────
router.put(
  "/:id",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const medicine = await Medicine.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!medicine)
      return res.status(404).json({ success: false, message: "Medicine not found" });
    res.json({ success: true, medicine });
  })
);

// ─── DELETE /api/medicines/:id — Admin only ───────────────────────────────────
router.delete(
  "/:id",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    await Medicine.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: "Medicine deactivated" });
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// MEDICINE IMAGE FETCHING (Google Custom Search → ImageKit)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /api/medicines/fetch-image — fetch image for a single medicine ─────
// Body: { name: "paracetamol" }
router.post(
  "/fetch-image",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const { name } = req.body;
    if (!name)
      return res.status(400).json({ success: false, message: "name is required" });

    const result = await fetchAndStoreMedicineImage(name);
    res.json(result);
  })
);

// ─── POST /api/medicines/fetch-images-bulk — fetch images for all medicines ──
router.post(
  "/fetch-images-bulk",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    // Run async — return immediately with acknowledgement
    // Results logged to console; check DB for updated imageUrls
    res.json({
      success: true,
      message: "Bulk image fetch started in background. Check server logs for progress.",
    });

    // Fire-and-forget (don't await — response already sent)
    bulkFetchMedicineImages().then((results) => {
      const ok = results.filter((r) => r.success).length;
      console.log(`✅  Bulk image fetch done: ${ok}/${results.length} succeeded`);
    });
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// SYMPTOM RULES — admin-editable OTC mapping table
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/medicines/symptom-rules ─────────────────────────────────────────
router.get(
  "/symptom-rules",
  asyncHandler(async (req, res) => {
    const rules = await SymptomRule.find({ isActive: true }).sort({ priority: -1 });
    res.json({ success: true, rules });
  })
);

// ─── POST /api/medicines/symptom-rules — Admin only ───────────────────────────
router.post(
  "/symptom-rules",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const rule = await SymptomRule.create({
      ...req.body,
      createdByUserId: req.user._id,
    });
    res.status(201).json({ success: true, rule });
  })
);

// ─── PUT /api/medicines/symptom-rules/:id — Admin only ────────────────────────
router.put(
  "/symptom-rules/:id",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const rule = await SymptomRule.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!rule) return res.status(404).json({ success: false, message: "Rule not found" });
    res.json({ success: true, rule });
  })
);

// ─── DELETE /api/medicines/symptom-rules/:id — Admin only ─────────────────────
router.delete(
  "/symptom-rules/:id",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    await SymptomRule.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: "Symptom rule deactivated" });
  })
);

module.exports = router;