const mongoose = require("mongoose");

const callRequestSchema = new mongoose.Schema(
    {
        patientId: { type: String, required: true },
        patientName: { type: String, required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // logged-in user ref
        status: {
            type: String,
            enum: ["waiting", "active", "completed", "missed"],
            default: "waiting",
        },
        roomId: { type: String },
        startedAt: { type: Date },
        completedAt: { type: Date },
    },
    { timestamps: true }
);

callRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("CallRequest", callRequestSchema);