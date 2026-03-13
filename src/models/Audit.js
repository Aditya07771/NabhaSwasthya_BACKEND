const mongoose = require("mongoose");

const auditSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorRole: { type: String },
    action: { type: String, required: true }, // e.g. "READ_PATIENT", "UPDATE_STOCK"
    resource: { type: String },               // e.g. "Patient"
    resourceId: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  {
    timestamps: true,
    // Capped collection — keeps last 100,000 audit entries
    // capped: { size: 52428800, max: 100000 },
  }
);

auditSchema.index({ actorId: 1 });
auditSchema.index({ resourceId: 1 });
auditSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Audit", auditSchema);