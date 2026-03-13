const express = require("express");
const router = express.Router();
const CallRequest = require("../models/CallRequest");
const { protect, authorize } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

// ─── POST /api/calls/request ──────────────────────────────────────────────────
// Android app / patient requests a call
router.post("/request", protect, asyncHandler(async (req, res) => {
    const { patientId, patientName } = req.body;

    if (!patientId || !patientName)
        return res.status(400).json({ success: false, message: "patientId and patientName required" });

    // ✅ Simple stable roomId so both sides can predict it
    const roomId = `call_${patientId}`;

    const call = await CallRequest.create({
        patientId,
        patientName,
        userId: req.user._id,
        roomId,
        status: "waiting",
    });

    const io = req.app.get("io");
    io.emit("incoming_call", {
        callId: call._id,
        patientId,
        patientName,
        roomId,          // ← web dashboard receives this
        createdAt: call.createdAt,
    });

    res.status(200).json({
        success: true,
        callId: call._id,
        roomId,      // ← Android app receives this and joins ZegoCloud with it
        channelName: roomId,
    });
}));

// ─── GET /api/calls ───────────────────────────────────────────────────────────
// Doctor/admin sees waiting calls queue
router.get(
    "/",
    protect,
    authorize("doctor", "admin"),
    asyncHandler(async (req, res) => {
        const { status = "waiting" } = req.query;
        const calls = await CallRequest.find({ status }).sort({ createdAt: 1 });
        res.json({ success: true, calls });
    })
);

// ─── PUT /api/calls/:id/status ────────────────────────────────────────────────
// Doctor updates call status (active / completed / missed)
router.put(
    "/:id/status",
    protect,
    authorize("doctor", "admin"),
    asyncHandler(async (req, res) => {
        const { status } = req.body;
        const allowed = ["active", "completed", "missed"];
        if (!allowed.includes(status))
            return res.status(400).json({ success: false, message: `status must be one of: ${allowed.join(", ")}` });

        const updates = { status };
        if (status === "active") updates.startedAt = new Date();
        if (status === "completed") updates.completedAt = new Date();

        const call = await CallRequest.findByIdAndUpdate(req.params.id, updates, { new: true });
        if (!call)
            return res.status(404).json({ success: false, message: "Call not found" });

        // Notify dashboard of status change
        const io = req.app.get("io");
        io.emit("call_status_update", { callId: call._id, status: call.status });

        res.json({ success: true, call });
    })
);

// ─── DELETE /api/calls/:id ────────────────────────────────────────────────────
router.delete(
    "/:id",
    protect,
    authorize("admin"),
    asyncHandler(async (req, res) => {
        await CallRequest.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Call request deleted" });
    })
);

module.exports = router;