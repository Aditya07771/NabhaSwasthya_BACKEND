require("dotenv").config();

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  console.error(err.stack);
  process.exit(1);
});

// ✅ Import the fully configured app from app.js
const app = require("./app");
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);

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

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // DB is already connected inside app.js, so we just listen on the server
  server.listen(PORT, () => {
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