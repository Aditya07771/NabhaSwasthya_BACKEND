const express = require("express");
const router = express.Router();
const User = require("../models/User");
const TriageRule = require("../models/TriageRule");
const Audit = require("../models/Audit");
const { Pharmacy } = require("../models/Pharmacy");
const { protect, authorize } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

// All admin routes require auth + admin role
router.use(protect, authorize("admin"));

// ═══════════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const { role, page = 1, limit = 20, query } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
        { phone: { $regex: query, $options: "i" } },
      ];
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      User.find(filter).skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
      User.countDocuments(filter),
    ]);
    res.json({ success: true, users, total });
  })
);

// ─── PUT /api/admin/users/:id/role ────────────────────────────────────────────
router.put(
  "/users/:id/role",
  asyncHandler(async (req, res) => {
    const { role } = req.body;
    const allowed = ["patient", "asha", "doctor", "admin"];
    if (!allowed.includes(role))
      return res.status(400).json({ success: false, message: `role must be one of: ${allowed.join(", ")}` });

    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, user: user.toSafeObject() });
  })
);

// ─── PUT /api/admin/users/:id/deactivate ─────────────────────────────────────
router.put(
  "/users/:id/deactivate",
  asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, message: "User deactivated", user: user.toSafeObject() });
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// TRIAGE RULES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/admin/rules ─────────────────────────────────────────────────────
router.get(
  "/rules",
  asyncHandler(async (req, res) => {
    const rules = await TriageRule.find({}).sort({ priority: -1, createdAt: -1 });
    res.json({ success: true, rules });
  })
);

// ─── POST /api/admin/rules ────────────────────────────────────────────────────
router.post(
  "/rules",
  asyncHandler(async (req, res) => {
    const rule = await TriageRule.create({
      ...req.body,
      createdByUserId: req.user._id,
    });
    res.status(201).json({ success: true, rule });
  })
);

// ─── PUT /api/admin/rules/:id ─────────────────────────────────────────────────
router.put(
  "/rules/:id",
  asyncHandler(async (req, res) => {
    const rule = await TriageRule.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!rule) return res.status(404).json({ success: false, message: "Rule not found" });
    res.json({ success: true, rule });
  })
);

// ─── DELETE /api/admin/rules/:id ──────────────────────────────────────────────
router.delete(
  "/rules/:id",
  asyncHandler(async (req, res) => {
    await TriageRule.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: "Rule deactivated" });
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// PHARMACY APPROVALS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PUT /api/admin/pharmacy/:id/approve ─────────────────────────────────────
router.put(
  "/pharmacy/:id/approve",
  asyncHandler(async (req, res) => {
    const pharmacy = await Pharmacy.findByIdAndUpdate(
      req.params.id,
      { isApproved: true },
      { new: true }
    );
    if (!pharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found" });
    res.json({ success: true, pharmacy });
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/admin/audit ─────────────────────────────────────────────────────
router.get(
  "/audit",
  asyncHandler(async (req, res) => {
    const { actorId, resource, action, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (actorId) filter.actorId = actorId;
    if (resource) filter.resource = resource;
    if (action) filter.action = { $regex: action, $options: "i" };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, total] = await Promise.all([
      Audit.find(filter)
        .populate("actorId", "name email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Audit.countDocuments(filter),
    ]);
    res.json({ success: true, logs, total });
  })
);

// ─── GET /api/admin/stats — quick dashboard stats ─────────────────────────────
router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const Patient = require("../models/Patient");
    const Consultation = require("../models/Consultation");

    const [
      totalPatients,
      totalConsultations,
      queuedConsultations,
      highSeverity,
      totalUsers,
    ] = await Promise.all([
      Patient.countDocuments({ isActive: true }),
      Consultation.countDocuments(),
      Consultation.countDocuments({ status: "queued" }),
      Consultation.countDocuments({ severity: "HIGH", status: "queued" }),
      User.countDocuments({ isActive: true }),
    ]);

    res.json({
      success: true,
      stats: {
        totalPatients,
        totalConsultations,
        queuedConsultations,
        highSeverityQueued: highSeverity,
        totalUsers,
      },
    });
  })
);

module.exports = router;