const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, required: true },
    brandNames: [String],
    genericName: { type: String },
    category: { type: String }, // e.g. "analgesic", "antacid"
    dosage: { type: String },   // e.g. "500mg tablet, 1-2 tabs every 6 hours"
    indications: [String],      // symptoms this medicine treats
    warnings: [String],
    sideEffects: [String],
    // ImageKit stored image
    imageUrl: { type: String },
    imageFileId: { type: String }, // ImageKit fileId
    thumbnailUrl: { type: String },
    // Equivalent / cheaper alternatives
    equivalents: [
      {
        name: { type: String },
        brand: { type: String },
        price: { type: Number },
      },
    ],
    approximatePriceINR: { type: Number },
    requiresPrescription: { type: Boolean, default: false },
    // Safety
    safetyNote: {
      type: String,
      default: "This suggestion is informational only. Consult a pharmacist or doctor before use.",
    },
    lastVerifiedAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

medicineSchema.index({ name: "text", displayName: "text", brandNames: "text" });

module.exports = mongoose.model("Medicine", medicineSchema);