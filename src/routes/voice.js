/**
 * voice.js — Voice symptom capture and extraction routes
 *
 * POST /api/voice/symptoms       — extract symptoms from a text transcript
 * POST /api/voice/upload         — upload audio file, extract symptoms, return transcript
 * POST /api/voice/triage         — one-shot: transcript → symptoms → triage → medicine suggestion
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const { protect } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { extractSymptoms, runTriage } = require("../services/triageService");
const { uploadFile } = require("../services/imagekitService");
const Medicine = require("../models/Medicine");
const SymptomRule = require("../models/SymptomRule");

router.use(protect);

// Audio upload: memory storage, forwarded to ImageKit
const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
    fileFilter: (req, file, cb) => {
        const allowed = [
            "audio/webm", "audio/ogg", "audio/mpeg",
            "audio/mp4", "audio/wav", "audio/aac",
            "video/webm", // browsers sometimes send webm for audio
        ];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error(`Audio type "${file.mimetype}" not supported`));
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: match symptom keywords against DB SymptomRules
// Returns the best matching rule or null
// ─────────────────────────────────────────────────────────────────────────────
const matchSymptomRule = async (symptoms, patientFlags = {}) => {
    const rules = await SymptomRule.find({ isActive: true }).sort({ priority: -1 });
    const symptomText = symptoms.join(" ").toLowerCase();

    for (const rule of rules) {
        const hit = rule.symptoms.some((kw) => symptomText.includes(kw));
        if (!hit) continue;
        if (rule.blockFor?.pregnancy && patientFlags.isPregnant) continue;
        if (rule.blockFor?.childrenUnder12 && patientFlags.ageYears < 12) continue;
        return rule;
    }
    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/voice/symptoms
// Body: { transcript: string, language?: string }
// Returns: { extractedSymptoms, rawText }
// ─────────────────────────────────────────────────────────────────────────────
router.post(
    "/symptoms",
    asyncHandler(async (req, res) => {
        const { transcript, language = "en" } = req.body;

        if (!transcript || !transcript.trim()) {
            return res.status(400).json({ success: false, message: "transcript is required" });
        }

        const extractedSymptoms = extractSymptoms(transcript);

        res.json({
            success: true,
            transcript,
            language,
            extractedSymptoms,
            count: extractedSymptoms.length,
            confidence: extractedSymptoms.length > 0 ? 0.85 : 0.3,
            message:
                extractedSymptoms.length > 0
                    ? "Symptoms extracted. Please review and confirm."
                    : "No recognisable symptoms found. Try describing symptoms in more detail.",
        });
    })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/voice/upload
// multipart/form-data: audio file + optional fields
// Saves audio to ImageKit, extracts symptoms from transcript (if provided)
// ─────────────────────────────────────────────────────────────────────────────
router.post(
    "/upload",
    audioUpload.single("audio"),
    asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No audio file provided" });
        }

        const { transcript, consultationId, language = "en" } = req.body;

        // Upload audio to ImageKit
        const folder = consultationId ? `/voice/${consultationId}` : "/voice/uploads";
        const fileName = `voice_${Date.now()}_${req.user._id}.webm`;
        const ikResult = await uploadFile(req.file.buffer, fileName, folder);

        // Extract symptoms from transcript if provided
        let extractedSymptoms = [];
        if (transcript) {
            extractedSymptoms = extractSymptoms(transcript);
        }

        res.status(201).json({
            success: true,
            audioUrl: ikResult.url,
            audioFileId: ikResult.fileId,
            transcript: transcript || null,
            language,
            extractedSymptoms,
            message: transcript
                ? "Audio saved and symptoms extracted. Review symptoms before submitting."
                : "Audio saved. Submit the transcript separately via POST /api/voice/symptoms.",
        });
    })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/voice/triage
// One-shot endpoint: transcript → extract symptoms → run triage → get medicine info
// Body: { transcript, patientId?, patientFlags? }
// ─────────────────────────────────────────────────────────────────────────────
router.post(
    "/triage",
    asyncHandler(async (req, res) => {
        const { transcript, patientFlags = {}, additionalSymptoms = [] } = req.body;

        if (!transcript && additionalSymptoms.length === 0) {
            return res.status(400).json({
                success: false,
                message: "transcript or additionalSymptoms required",
            });
        }

        // Step 1: Extract symptoms from transcript
        const extractedFromVoice = transcript ? extractSymptoms(transcript) : [];
        const allSymptoms = [...new Set([...extractedFromVoice, ...additionalSymptoms])];

        // Step 2: Run triage engine (checks red flags + DB rules)
        const triageResult = await runTriage(allSymptoms, patientFlags);

        // Step 3: If LOW severity, find OTC medicine suggestion from SymptomRules DB
        let medicineInfo = null;
        let matchedRule = null;

        if (triageResult.severity === "LOW" && triageResult.suggestedMedicineName) {
            // Get full medicine details from Medicine collection
            medicineInfo = await Medicine.findOne({
                name: triageResult.suggestedMedicineName.toLowerCase(),
                isActive: true,
            });

            // Also get the matched symptom rule for condition name + dosage note
            matchedRule = await matchSymptomRule(allSymptoms, patientFlags);
        }

        res.json({
            success: true,

            // Voice input summary
            input: {
                transcript: transcript || null,
                extractedSymptoms: extractedFromVoice,
                allSymptoms,
            },

            // Triage result
            triage: triageResult,

            // Condition + OTC suggestion (only when LOW severity)
            suggestion:
                triageResult.severity === "LOW" && medicineInfo
                    ? {
                        condition: matchedRule?.condition || "Mild Condition",
                        medicine: {
                            name: medicineInfo.displayName,
                            genericName: medicineInfo.genericName,
                            dosage: matchedRule?.dosageNote || medicineInfo.dosage,
                            warnings: medicineInfo.warnings,
                            imageUrl: medicineInfo.imageUrl || null,
                            thumbnailUrl: medicineInfo.thumbnailUrl || null,
                            approximatePriceINR: medicineInfo.approximatePriceINR,
                            brandNames: medicineInfo.brandNames,
                        },
                    }
                    : null,

            // Always show this safety note
            safetyNote:
                "This suggestion is informational only. Consult a pharmacist or doctor before use.",
        });
    })
);

module.exports = router;