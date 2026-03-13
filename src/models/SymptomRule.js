const mongoose = require("mongoose");

/**
 * SymptomRule — stores the symptom → OTC medicine mapping table.
 *
 * This is the editable version of the inline rules array in triageService.
 * Admins can add / edit / remove rules from the DB without code changes.
 *
 * Example document:
 * {
 *   symptoms: ["headache", "sir dard"],
 *   condition: "Mild Headache",
 *   medicine: "Paracetamol",
 *   dosageNote: "500mg every 6-8 hours",
 *   priority: 10
 * }
 */
const symptomRuleSchema = new mongoose.Schema(
    {
        // Symptom keywords that trigger this rule (any match = hit)
        symptoms: [{ type: String, lowercase: true, trim: true }],

        // Human-readable probable condition
        condition: { type: String, required: true },

        // Suggested OTC medicine name (must match Medicine.name)
        medicine: { type: String, required: true, lowercase: true, trim: true },

        // Short dosage note shown on result card
        dosageNote: { type: String },

        // Safety: block this rule for these patient flags
        blockFor: {
            pregnancy: { type: Boolean, default: false },
            childrenUnder12: { type: Boolean, default: false },
            comorbidities: [String],
        },

        // Higher priority rules are matched first
        priority: { type: Number, default: 0 },

        isActive: { type: Boolean, default: true },

        createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

symptomRuleSchema.index({ symptoms: 1 });
symptomRuleSchema.index({ isActive: 1, priority: -1 });

module.exports = mongoose.model("SymptomRule", symptomRuleSchema);