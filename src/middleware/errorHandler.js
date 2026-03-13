/**
 * Central error handler — must be registered last in Express app.
 */
const errorHandler = (err, req, res, next) => {
  console.error("❌ Error:", err.message);
  if (process.env.NODE_ENV === "development") {
    console.error(err.stack);
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join(", ") });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return res.status(409).json({
      success: false,
      message: `Duplicate value for field: ${field}`,
    });
  }

  // JWT errors (shouldn't reach here normally but safety net)
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }

  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || "Internal server error",
  });
};

/**
 * Wraps an async route handler to catch errors and forward to errorHandler.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { errorHandler, asyncHandler };