const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema({
  url: { type: String, required: true },        // ImageKit URL
  fileId: { type: String },                     // ImageKit fileId for deletion
  thumbnailUrl: { type: String },
  type: { type: String, enum: ["image", "pdf", "audio", "video", "other"] },
  originalName: { type: String },
  size: { type: Number },                       // bytes
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  checksum: { type: String },
  consentGiven: { type: Boolean, default: false },
});

const consultationSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    submittedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    assignedDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Raw symptom text (multilingual)
    symptomsText: { type: String },
    // Structured symptom tags extracted from text/voice
    symptoms: [{ type: String }],
    language: { type: String, default: "en" },

    // Triage result
    severity: { type: String, enum: ["HIGH", "MEDIUM", "LOW"], required: true },
    priority: { type: Number, default: 0 }, // computed: HIGH=3, MEDIUM=2, LOW=1
    triggeredRuleId: { type: String },      // which TriageRule fired
    nextAction: { type: String },
    suggestedMedicine: { type: String },

    // Patient safety flags at time of submission (snapshot)
    patientFlags: {
      isPregnant: Boolean,
      hasComorbidities: Boolean,
      age: Number,
    },

    // Consultation lifecycle
    status: {
      type: String,
      enum: ["queued", "in_progress", "call_failed", "async_pending", "completed", "cancelled"],
      default: "queued",
    },

    // Doctor's output
    doctorNotes: { type: String },
    prescription: { type: String },
    followUpDate: { type: Date },

    // Call metadata
    callType: { type: String, enum: ["video", "audio", "async", "none"] },
    callStartedAt: { type: Date },
    callEndedAt: { type: Date },
    callSignalData: { type: mongoose.Schema.Types.Mixed }, // WebRTC signaling

    // Files attached to this consultation
    attachments: [attachmentSchema],

    // Voice transcript (if submitted via voice)
    voiceTranscript: { type: String },
    voiceFileUrl: { type: String },

    // Offline sync fields
    clientId: { type: String },        // client-generated UUID for idempotency
    clientTimestamp: { type: Date },

    // Consent log
    consentGiven: { type: Boolean, default: false },
    consentAt: { type: Date },
  },
  { timestamps: true }
);

// Auto-set priority from severity
consultationSchema.pre("save", function (next) {
  const map = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  this.priority = map[this.severity] || 1;
  next();
});

consultationSchema.index({ patientId: 1 });
consultationSchema.index({ status: 1, priority: -1, createdAt: 1 });
consultationSchema.index({ assignedDoctorId: 1 });
consultationSchema.index({ clientId: 1 }, { sparse: true });

module.exports = mongoose.model("Consultation", consultationSchema);