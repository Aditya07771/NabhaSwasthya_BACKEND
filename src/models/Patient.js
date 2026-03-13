const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema(
  {
    // Human-readable ID: NBH-2024-0001
    patientId: { type: String, unique: true, required: true },
    name: { type: String, required: true, trim: true },
    dob: { type: Date },
    sex: { type: String, enum: ["male", "female", "other"] },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    village: { type: String },
    district: { type: String },
    state: { type: String },
    guardianName: { type: String },
    bloodGroup: { type: String },
    // Flags used for safety guardrails in triage / medicine suggestion
    isPregnant: { type: Boolean, default: false },
    hasComorbidities: { type: Boolean, default: false },
    comorbidities: [String], // e.g. ["diabetes", "hypertension"]
    // ASHA who registered this patient
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    linkedUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // if patient has app account
    metadata: { type: mongoose.Schema.Types.Mixed },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

patientSchema.index({ patientId: 1 });
patientSchema.index({ phone: 1 });
patientSchema.index({ name: "text" });
patientSchema.index({ createdByUserId: 1 });

module.exports = mongoose.model("Patient", patientSchema);