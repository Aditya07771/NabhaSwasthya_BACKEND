const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    mongoose.set("strictQuery", true);

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, // ← was 5000, give Atlas more time
      autoIndex: true,
    });

    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

// graceful shutdown
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("MongoDB connection closed.");
  process.exit(0);
});

module.exports = connectDB;