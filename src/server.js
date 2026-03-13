require("dotenv").config();

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  console.error(err.stack);
  process.exit(1);
});

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("./config/db");

const app = express();
const server = http.createServer(app); // ← wrap express in http server

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Make io accessible in route handlers via req.app.get("io")
app.set("io", io);

io.on("connection", (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room: ${roomId}`);
  });

  socket.on("disconnect", () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
  });
});

// ── Security & Middleware ─────────────────────────────────────────────────────
app.use(helmet());

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Health Check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", service: "NBH Health Backend", time: new Date() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
const authRoutes = require("./routes/auth");
const patientDashboard = require("./routes/patientDashboard");
const patientRoutes = require("./routes/patients");
const pharmacyRoutes = require("./routes/pharmacy");
const ashaRoutes = require("./routes/asha");
const aiRoutes = require("./routes/ai");
const callRoutes = require("./routes/calls");       // ← new

app.use("/api/auth", authRoutes);
app.use("/api/patient", patientDashboard);
app.use("/api/patients", patientRoutes);
app.use("/api/pharmacy", pharmacyRoutes);
app.use("/api/pharmacies", pharmacyRoutes);
app.use("/api/asha-workers", ashaRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/calls", callRoutes);                 // ← new

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  server.listen(PORT, () => {            // ← server.listen, not app.listen
    console.log(`\n🚀 NBH Health Backend running on port ${PORT}`);
    console.log(`Environment : ${process.env.NODE_ENV || "development"}`);
    console.log(`Health Check: http://localhost:${PORT}/health\n`);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} received — shutting down gracefully...`);
    server.close(() => { console.log("HTTP server closed."); process.exit(0); });
    setTimeout(() => { console.error("Forcing shutdown..."); process.exit(1); }, 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (err) => {
    console.error("UNHANDLED REJECTION! 💥", err.name, err.message);
    shutdown("unhandledRejection");
  });
};

startServer();