const Audit = require("../models/Audit");

/**
 * Returns an Express middleware that logs an audit entry.
 * Usage: router.get("/patients/:id", protect, auditLog("READ_PATIENT", "Patient"), handler)
 */
const auditLog = (action, resource) => {
  return async (req, res, next) => {
    try {
      const resourceId =
        req.params.id || req.params.patientId || req.body?.patientId || null;

      await Audit.create({
        actorId: req.user?._id,
        actorRole: req.user?.role,
        action,
        resource,
        resourceId: resourceId ? String(resourceId) : undefined,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        meta: { method: req.method, path: req.path },
      });
    } catch (err) {
      // Audit failures should NOT block the request
      console.error("Audit log error:", err.message);
    }
    next();
  };
};

module.exports = { auditLog };