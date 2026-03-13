const mongoose = require("mongoose");

// Admin-editable rules powering the triage engine
const triageRuleSchema = new mongoose.Schema(
  {
    ruleId: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    description: { type: String },
    // Keywords that trigger this rule (case-insensitive match)
    keywords: [{ type: String, lowercase: true }],
    // Severity output
    severity: { type: String, enum: ["HIGH", "MEDIUM", "LOW"], required: true },
    // Next action code
    nextAction: {
      type: String,
      enum: ["consult_immediately", "schedule_consult", "suggest_otc", "monitor"],
      required: true,
    },
    // Optional OTC medicine suggestion (only for LOW severity)
    suggestedMedicineName: { type: String },
    // Conditions where this rule should be BLOCKED (safety guardrail)
    blockFor: {
      pregnancy: { type: Boolean, default: false },
      childrenUnder12: { type: Boolean, default: false },
      comorbidities: [String],
    },
    // Audit
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 0 }, // higher = evaluated first
  },
  { timestamps: true }
);

triageRuleSchema.index({ keywords: 1 });
triageRuleSchema.index({ isActive: 1, priority: -1 });

module.exports = mongoose.model("TriageRule", triageRuleSchema);