require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");
const { initFirebase } = require("./config/firebase");
const { getImageKit } = require("./config/imagekit");
const { errorHandler } = require("./middleware/errorHandler");

// ── Routes ────────────────────────────────────────────────────────────────────
const authRoutes = require("./routes/auth");
const patientRoutes = require("./routes/patients");
const consultationRoutes = require("./routes/consultations");
const medicineRoutes = require("./routes/medicines");
const pharmacyRoutes = require("./routes/pharmacy");
const uploadRoutes = require("./routes/upload");
const syncRoutes = require("./routes/sync");
const adminRoutes = require("./routes/admin");

// ── Init ──────────────────────────────────────────────────────────────────────
connectDB();
initFirebase();
getImageKit();

const app = express();

// ── Security & middleware ─────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // strict for auth endpoints
  message: { success: false, message: "Too many auth attempts, please try again later." },
});

app.use(globalLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "NBH Health Backend",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/consultations", consultationRoutes);

// symptom-check lives at the router level in consultations.js but we also mount at root /api
app.use("/api/medicines", medicineRoutes);
app.use("/api/pharmacy", pharmacyRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/admin", adminRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── Central error handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

module.exports = app;