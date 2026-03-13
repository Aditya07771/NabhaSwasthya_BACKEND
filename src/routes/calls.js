const express = require("express");
const router = express.Router();
const CallRequest = require("../models/CallRequest");
const { protect, authorize } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

router.post("/request", protect, asyncHandler(async (req, res) => {
    const { patientId, patientName } = req.body;
    if (!patientId || !patientName)
        return res.status(400).json({ success: false, message: "patientId and patientName required" });

    const roomId = `call_${patientId}`;

    const call = await CallRequest.create({
        patientId,
        patientName,
        userId: req.user._id,
        roomId,
        status: "waiting",
    });

    const io = req.app.get("io");
    if (io) {
        io.emit("incoming_call", {
            callId: call._id,
            patientId,
            patientName,
            roomId,
            createdAt: call.createdAt,
        });
    }

    res.status(200).json({
        success: true,
        callId: call._id,
        roomId,
        channelName: roomId,
    });
}));

router.get("/", protect, authorize("doctor", "admin"), asyncHandler(async (req, res) => {
    const { status = "waiting" } = req.query;
    const calls = await CallRequest.find({ status }).sort({ createdAt: 1 });
    res.json({ success: true, calls });
}));

router.put("/:id/status", protect, authorize("doctor", "admin"), asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowed = ["active", "completed", "missed"];
    if (!allowed.includes(status))
        return res.status(400).json({ success: false, message: `status must be: ${allowed.join(", ")}` });

    const updates = { status };
    if (status === "active") updates.startedAt = new Date();
    if (status === "completed") updates.completedAt = new Date();

    const call = await CallRequest.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!call) return res.status(404).json({ success: false, message: "Call not found" });

    const io = req.app.get("io");
    if (io) io.emit("call_status_update", { callId: call._id, status: call.status });

    res.json({ success: true, call });
}));

module.exports = router;