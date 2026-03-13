const express = require("express");
const router = express.Router();
const multer = require("multer");
const { protect } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
// const { uploadFile, getAuthParams } = require("../services/imagekitService");
const Consultation = require("../models/Consultation");
const { uploadFile, getAuthParams } = require("../services/imagekitService");

// Use memory storage — we forward the buffer to ImageKit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/webp",
      "application/pdf",
      "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4",
      "video/webm", "video/mp4",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type ${file.mimetype} not allowed`));
  },
});

router.use(protect);

// ─── GET /api/upload/auth — ImageKit client-side auth params ─────────────────
// Frontend uses these to upload directly from browser to ImageKit
router.get(
  "/auth",
  asyncHandler(async (req, res) => {
    const params = getAuthParams();
    res.json({ success: true, ...params });
  })
);

// ─── POST /api/upload/file — Server-side upload via our backend ───────────────
// Receives multipart/form-data and forwards to ImageKit
router.post(
  "/file",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file)
      return res.status(400).json({ success: false, message: "No file uploaded" });

    const { folder = "/uploads", consultationId, consentGiven } = req.body;

    if (!consentGiven || consentGiven === "false")
      return res.status(400).json({ success: false, message: "Consent must be given before upload" });

    const folderPath = consultationId ? `/consultations/${consultationId}` : folder;

    const result = await uploadFile(req.file.buffer, req.file.originalname, folderPath);

    // Determine file type
    const mime = req.file.mimetype;
    let type = "other";
    if (mime.startsWith("image/")) type = "image";
    else if (mime === "application/pdf") type = "pdf";
    else if (mime.startsWith("audio/")) type = "audio";
    else if (mime.startsWith("video/")) type = "video";

    const attachment = {
      url: result.url,
      fileId: result.fileId,
      thumbnailUrl: result.thumbnailUrl,
      type,
      originalName: req.file.originalname,
      size: req.file.size,
      uploadedBy: req.user._id,
      consentGiven: true,
    };

    // If consultationId provided, attach to the consultation doc
    if (consultationId) {
      await Consultation.findByIdAndUpdate(consultationId, {
        $push: { attachments: attachment },
      });
    }

    res.status(201).json({
      success: true,
      file: {
        url: result.url,
        fileId: result.fileId,
        thumbnailUrl: result.thumbnailUrl,
        type,
        originalName: req.file.originalname,
      },
    });
  })
);

// ─── POST /api/upload/voice-symptoms — voice transcript → symptom extraction ──
router.post(
  "/voice-symptoms",
  asyncHandler(async (req, res) => {
    const { transcript } = req.body;
    if (!transcript)
      return res.status(400).json({ success: false, message: "transcript is required" });

    const { extractSymptoms } = require("../services/triageService");
    const symptoms = extractSymptoms(transcript);

    res.json({
      success: true,
      transcript,
      extractedSymptoms: symptoms,
      confidence: symptoms.length > 0 ? 0.85 : 0.3,
      message: "Please review and confirm the extracted symptoms.",
    });
  })
);

module.exports = router;