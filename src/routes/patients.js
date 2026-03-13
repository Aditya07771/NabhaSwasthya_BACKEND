const express = require("express");
const router = express.Router();
const Patient = require("../models/Patient");
const { protect, authorize } = require("../middleware/auth");
const { auditLog } = require("../middleware/audit");
const { asyncHandler } = require("../middleware/errorHandler");
const { generatePatientId } = require("../services/patientIdService");

router.use(protect);

// ─── POST /api/patients ───────────────────────────────────────────────────────
router.post("/", authorize("asha", "doctor", "admin"), asyncHandler(async (req, res) => {
  const {
    name, dob, sex, phone, email, village, district, state,
    guardianName, bloodGroup, isPregnant, hasComorbidities, comorbidities,
  } = req.body;

  if (!name) return res.status(400).json({ success: false, message: "Name is required" });

  if (phone) {
    const dup = await Patient.findOne({ phone });
    if (dup) return res.status(200).json({ success: true, warning: "Patient with this phone already exists", patient: dup });
  }

  const patientId = await generatePatientId();
  const patient = await Patient.create({
    patientId, name, dob, sex, phone, email, village, district, state,
    guardianName, bloodGroup,
    isPregnant: isPregnant || false,
    hasComorbidities: hasComorbidities || false,
    comorbidities: comorbidities || [],
    createdByUserId: req.user._id,
  });

  res.status(201).json({ success: true, patient });
}));

// ─── POST /api/patients/bulk ──────────────────────────────────────────────────
router.post("/bulk", authorize("asha", "admin"), asyncHandler(async (req, res) => {
  const { patients } = req.body;
  if (!Array.isArray(patients) || patients.length === 0)
    return res.status(400).json({ success: false, message: "patients array is required" });
  if (patients.length > 100)
    return res.status(400).json({ success: false, message: "Max 100 patients per bulk upload" });

  const results = [];
  for (const p of patients) {
    try {
      const patientId = await generatePatientId();
      const created = await Patient.create({ ...p, patientId, createdByUserId: req.user._id });
      results.push({ success: true, patientId: created.patientId, id: created._id });
    } catch (err) {
      results.push({ success: false, name: p.name, error: err.message });
    }
  }
  res.json({ success: true, results });
}));

// ─── GET /api/patients ────────────────────────────────────────────────────────
router.get("/", authorize("asha", "doctor", "admin"), auditLog("LIST_PATIENTS", "Patient"), asyncHandler(async (req, res) => {
  const { query, village, page = 1, limit = 20 } = req.query;
  const filter = { isActive: true };

  if (query) {
    filter.$or = [
      { patientId: { $regex: query, $options: "i" } },
      { phone: { $regex: query, $options: "i" } },
      { name: { $regex: query, $options: "i" } },
    ];
  }
  if (village) filter.village = { $regex: village, $options: "i" };
  if (req.user.role === "asha") filter.createdByUserId = req.user._id;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [patients, total] = await Promise.all([
    Patient.find(filter).skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
    Patient.countDocuments(filter),
  ]);

  res.json({ success: true, patients, total, page: parseInt(page), limit: parseInt(limit) });
}));

// ─── GET /api/patients/:id ────────────────────────────────────────────────────
router.get("/:id", auditLog("READ_PATIENT", "Patient"), asyncHandler(async (req, res) => {
  const patient = await Patient.findOne({
    $or: [
      { _id: req.params.id.match(/^[a-f\d]{24}$/i) ? req.params.id : null },
      { patientId: req.params.id },
    ],
  }).populate("createdByUserId", "name role");

  if (!patient) return res.status(404).json({ success: false, message: "Patient not found" });
  res.json({ success: true, patient });
}));

// ─── PUT /api/patients/:id ────────────────────────────────────────────────────
router.put("/:id", authorize("asha", "doctor", "admin"), auditLog("UPDATE_PATIENT", "Patient"), asyncHandler(async (req, res) => {
  const allowed = ["name", "dob", "sex", "phone", "email", "village", "guardianName", "bloodGroup", "isPregnant", "hasComorbidities", "comorbidities"];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  const patient = await Patient.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!patient) return res.status(404).json({ success: false, message: "Patient not found" });
  res.json({ success: true, patient });
}));

// ─── GET /api/patients/:id/records ────────────────────────────────────────────
router.get("/:id/records", auditLog("READ_PATIENT_RECORDS", "Patient"), asyncHandler(async (req, res) => {
  const Consultation = require("../models/Consultation");
  const patient = await Patient.findById(req.params.id);
  if (!patient) return res.status(404).json({ success: false, message: "Patient not found" });

  const consultations = await Consultation.find({ patientId: req.params.id })
    .populate("submittedByUserId", "name role")
    .populate("assignedDoctorId", "name")
    .sort({ createdAt: -1 })
    .select("-voiceFileUrl");

  res.json({ success: true, patient, consultations });
}));

module.exports = router;