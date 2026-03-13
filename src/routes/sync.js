const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const Patient = require("../models/Patient");
const Consultation = require("../models/Consultation");
const { Stock } = require("../models/Pharmacy");
const { generatePatientId } = require("../services/patientIdService");
const { runTriage, extractSymptoms } = require("../services/triageService");

router.use(protect);

/**
 * POST /api/sync/ingest
 * Accepts a batch of queued offline actions.
 * Each action: { clientId, type, payload, clientTimestamp }
 * Returns per-item status: applied | duplicate | rejected
 */
router.post(
  "/ingest",
  asyncHandler(async (req, res) => {
    const { actions = [] } = req.body;
    if (!Array.isArray(actions))
      return res.status(400).json({ success: false, message: "actions must be an array" });
    if (actions.length > 200)
      return res.status(400).json({ success: false, message: "Max 200 actions per sync batch" });

    const results = [];

    for (const action of actions) {
      const { clientId, type, payload, clientTimestamp } = action;
      let status = "rejected";
      let data = null;
      let error = null;

      try {
        switch (type) {
          // ── Create patient ─────────────────────────────────────────────────
          case "CREATE_PATIENT": {
            // Check idempotency by clientId if provided
            if (clientId) {
              const existing = await Patient.findOne({ "metadata.clientId": clientId });
              if (existing) {
                status = "duplicate";
                data = { patientId: existing.patientId };
                break;
              }
            }
            const patientId = await generatePatientId();
            const patient = await Patient.create({
              ...payload,
              patientId,
              createdByUserId: req.user._id,
              metadata: { clientId, clientTimestamp },
            });
            status = "applied";
            data = { patientId: patient.patientId, _id: patient._id };
            break;
          }

          // ── Submit consultation ─────────────────────────────────────────────
          case "CREATE_CONSULTATION": {
            if (clientId) {
              const existing = await Consultation.findOne({ clientId });
              if (existing) {
                status = "duplicate";
                data = { _id: existing._id };
                break;
              }
            }
            const symptoms = payload.symptoms || [];
            if (payload.symptomsText) {
              symptoms.push(...extractSymptoms(payload.symptomsText));
            }
            const triageResult = await runTriage(symptoms, payload.patientFlags || {});
            const consultation = await Consultation.create({
              ...payload,
              symptoms: [...new Set(symptoms)],
              severity: triageResult.severity,
              nextAction: triageResult.nextAction,
              suggestedMedicine: triageResult.suggestedMedicineName,
              triggeredRuleId: triageResult.triggeredRuleId,
              submittedByUserId: req.user._id,
              clientId,
              clientTimestamp,
            });
            status = "applied";
            data = { _id: consultation._id, severity: consultation.severity };
            break;
          }

          // ── Update stock ───────────────────────────────────────────────────
          case "UPDATE_STOCK": {
            const { pharmacyId, medicineName, quantity, price, brand, strength } = payload;
            const stock = await Stock.findOneAndUpdate(
              { pharmacyId, medicineName: medicineName.toLowerCase() },
              { quantity, price, brand, strength, lastUpdated: new Date(), clientId, clientTimestamp },
              { upsert: true, new: true }
            );
            status = "applied";
            data = { _id: stock._id };
            break;
          }

          default:
            error = `Unknown action type: ${type}`;
        }
      } catch (err) {
        status = "rejected";
        error = err.message;
      }

      results.push({
        clientId,
        type,
        status,
        data,
        error,
        serverTimestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      results,
      serverTimestamp: new Date().toISOString(),
      applied: results.filter((r) => r.status === "applied").length,
      duplicates: results.filter((r) => r.status === "duplicate").length,
      rejected: results.filter((r) => r.status === "rejected").length,
    });
  })
);

module.exports = router;