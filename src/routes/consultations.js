const express = require("express");
const router = express.Router();
const Consultation = require("../models/Consultation");
const Patient = require("../models/Patient");
const { protect, authorize } = require("../middleware/auth");
const { auditLog } = require("../middleware/audit");
const { asyncHandler } = require("../middleware/errorHandler");
const { runTriage, extractSymptoms } = require("../services/triageService");

router.use(protect);

// ─── POST /api/symptom-check ──────────────────────────────────────────────────
// Triage check without saving a consultation
router.post(
  "/symptom-check",
  asyncHandler(async (req, res) => {
    const { symptoms = [], transcript, patientId } = req.body;

    let allSymptoms = [...symptoms];
    if (transcript) {
      const extracted = extractSymptoms(transcript);
      allSymptoms = [...new Set([...allSymptoms, ...extracted])];
    }

    let patientFlags = {};
    if (patientId) {
      const patient = await Patient.findById(patientId).select("isPregnant hasComorbidities dob");
      if (patient) {
        const ageYears = patient.dob
          ? Math.floor((Date.now() - patient.dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
          : null;
        patientFlags = {
          isPregnant: patient.isPregnant,
          hasComorbidities: patient.hasComorbidities,
          ageYears,
        };
      }
    }

    const result = await runTriage(allSymptoms, patientFlags);

    res.json({
      success: true,
      extractedSymptoms: allSymptoms,
      triage: result,
      safetyNote:
        "This result is informational only. Consult a qualified healthcare professional before making medical decisions.",
    });
  })
);

// ─── POST /api/consultations ──────────────────────────────────────────────────
// Create a new consultation (patient, ASHA, or doctor can submit)
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const {
      patientId,
      symptomsText,
      symptoms = [],
      language = "en",
      voiceTranscript,
      consentGiven,
      clientId,
      clientTimestamp,
    } = req.body;

    if (!patientId) return res.status(400).json({ success: false, message: "patientId is required" });

    // Idempotency — if same clientId already submitted, return existing
    if (clientId) {
      const existing = await Consultation.findOne({ clientId });
      if (existing)
        return res.status(200).json({ success: true, consultation: existing, duplicate: true });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ success: false, message: "Patient not found" });

    // Build symptom list
    let allSymptoms = [...symptoms];
    const transcript = voiceTranscript || symptomsText;
    if (transcript) {
      const extracted = extractSymptoms(transcript);
      allSymptoms = [...new Set([...allSymptoms, ...extracted])];
    }

    // Patient flags
    const ageYears = patient.dob
      ? Math.floor((Date.now() - patient.dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null;
    const patientFlags = {
      isPregnant: patient.isPregnant,
      hasComorbidities: patient.hasComorbidities,
      ageYears,
    };

    const triageResult = await runTriage(allSymptoms, patientFlags);

    const consultation = await Consultation.create({
      patientId,
      submittedByUserId: req.user._id,
      symptomsText,
      symptoms: allSymptoms,
      language,
      voiceTranscript,
      severity: triageResult.severity,
      nextAction: triageResult.nextAction,
      suggestedMedicine: triageResult.suggestedMedicineName,
      triggeredRuleId: triageResult.triggeredRuleId,
      patientFlags,
      consentGiven: !!consentGiven,
      consentAt: consentGiven ? new Date() : undefined,
      clientId,
      clientTimestamp,
    });

    res.status(201).json({
      success: true,
      consultation,
      triage: triageResult,
    });
  })
);

// ─── GET /api/consultations ───────────────────────────────────────────────────
// Doctor queue — sorted by severity then createdAt
router.get(
  "/",
  authorize("doctor", "admin"),
  asyncHandler(async (req, res) => {
    const { status = "queued", patientId, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (patientId) filter.patientId = patientId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [consultations, total] = await Promise.all([
      Consultation.find(filter)
        .populate("patientId", "name patientId sex dob village phone")
        .populate("submittedByUserId", "name role")
        .populate("assignedDoctorId", "name")
        .sort({ priority: -1, createdAt: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Consultation.countDocuments(filter),
    ]);

    res.json({ success: true, consultations, total, page: parseInt(page), limit: parseInt(limit) });
  })
);

// ─── GET /api/consultations/:id ───────────────────────────────────────────────
router.get(
  "/:id",
  auditLog("READ_CONSULTATION", "Consultation"),
  asyncHandler(async (req, res) => {
    const consultation = await Consultation.findById(req.params.id)
      .populate("patientId")
      .populate("submittedByUserId", "name role phone")
      .populate("assignedDoctorId", "name email");

    if (!consultation)
      return res.status(404).json({ success: false, message: "Consultation not found" });

    res.json({ success: true, consultation });
  })
);

// ─── POST /api/consultations/:id/start-call ───────────────────────────────────
router.post(
  "/:id/start-call",
  authorize("doctor", "admin"),
  asyncHandler(async (req, res) => {
    const { callType = "video", signalData } = req.body;
    const consultation = await Consultation.findByIdAndUpdate(
      req.params.id,
      {
        status: "in_progress",
        assignedDoctorId: req.user._id,
        callType,
        callStartedAt: new Date(),
        callSignalData: signalData,
      },
      { new: true }
    );
    if (!consultation)
      return res.status(404).json({ success: false, message: "Consultation not found" });

    res.json({ success: true, consultation });
  })
);

// ─── PUT /api/consultations/:id/complete ─────────────────────────────────────
router.put(
  "/:id/complete",
  authorize("doctor", "admin"),
  asyncHandler(async (req, res) => {
    const { doctorNotes, prescription, followUpDate } = req.body;
    const consultation = await Consultation.findByIdAndUpdate(
      req.params.id,
      {
        status: "completed",
        doctorNotes,
        prescription,
        followUpDate,
        callEndedAt: new Date(),
      },
      { new: true }
    );
    if (!consultation)
      return res.status(404).json({ success: false, message: "Consultation not found" });

    res.json({ success: true, consultation });
  })
);

// ─── PUT /api/consultations/:id/fail-call ────────────────────────────────────
router.put(
  "/:id/fail-call",
  authorize("doctor", "admin"),
  asyncHandler(async (req, res) => {
    const consultation = await Consultation.findByIdAndUpdate(
      req.params.id,
      { status: "call_failed", callEndedAt: new Date() },
      { new: true }
    );
    if (!consultation)
      return res.status(404).json({ success: false, message: "Consultation not found" });

    res.json({ success: true, consultation, message: "Call marked as failed. Patient can upload async recording." });
  })
);

// ─── POST /api/consultations/:id/async-consult ────────────────────────────────
// Doctor/ASHA submits async recording URL (already uploaded to ImageKit)
router.post(
  "/:id/async-consult",
  asyncHandler(async (req, res) => {
    const { url, fileId, type = "video", notes } = req.body;
    if (!url) return res.status(400).json({ success: false, message: "url is required" });

    const consultation = await Consultation.findByIdAndUpdate(
      req.params.id,
      {
        status: "async_pending",
        voiceFileUrl: url,
        $push: {
          attachments: {
            url,
            fileId,
            type,
            uploadedBy: req.user._id,
            consentGiven: true,
          },
        },
        doctorNotes: notes,
      },
      { new: true }
    );
    if (!consultation)
      return res.status(404).json({ success: false, message: "Consultation not found" });

    res.json({ success: true, consultation });
  })
);

module.exports = router;