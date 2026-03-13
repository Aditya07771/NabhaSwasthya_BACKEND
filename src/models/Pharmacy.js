const mongoose = require("mongoose");

// ─── Pharmacy ──────────────────────────────────────────────────────────────
const pharmacySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    contact: {
      phone: { type: String },
      email: { type: String },
    },
    location: {
      village: { type: String },
      district: { type: String },
      state: { type: String },
      pincode: { type: String },
      lat: { type: Number },
      lng: { type: Number },
    },
    licenseNumber: { type: String },
    isApproved: { type: Boolean, default: false }, // admin approval
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

pharmacySchema.index({ "location.village": 1 });
pharmacySchema.index({ ownerUserId: 1 });
pharmacySchema.index({ "location.lat": 1, "location.lng": 1 });

const Pharmacy = mongoose.model("Pharmacy", pharmacySchema);

// ─── Stock ─────────────────────────────────────────────────────────────────
const stockSchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: "Pharmacy", required: true },
    medicineName: { type: String, required: true, lowercase: true, trim: true },
    displayName: { type: String },
    brand: { type: String },
    strength: { type: String }, // e.g. "500mg"
    price: { type: Number, min: 0, required: true },
    quantity: { type: Number, min: 0, required: true, default: 0 },
    lowStockThreshold: { type: Number, default: 10 },
    lastUpdated: { type: Date, default: Date.now },
    // Offline sync
    clientId: { type: String },
    clientTimestamp: { type: Date },
  },
  { timestamps: true }
);

stockSchema.index({ pharmacyId: 1, medicineName: 1 }, { unique: true });
stockSchema.index({ medicineName: 1, quantity: 1 });

const Stock = mongoose.model("Stock", stockSchema);

// ─── Reservation ───────────────────────────────────────────────────────────
const reservationSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: "Pharmacy", required: true },
    medicine: { type: String, required: true },
    brand: { type: String },
    qty: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ["pending", "accepted", "ready", "cancelled", "expired"],
      default: "pending",
    },
    ttl: { type: Date }, // expires at
    notes: { type: String },
    consultationId: { type: mongoose.Schema.Types.ObjectId, ref: "Consultation" },
  },
  { timestamps: true }
);

// Auto-set TTL 45 minutes from now
reservationSchema.pre("save", function (next) {
  if (!this.ttl) {
    this.ttl = new Date(Date.now() + 45 * 60 * 1000);
  }
  next();
});

reservationSchema.index({ pharmacyId: 1, status: 1 });
reservationSchema.index({ patientId: 1 });
reservationSchema.index({ ttl: 1 }, { expireAfterSeconds: 0 }); // MongoDB TTL auto-delete

const Reservation = mongoose.model("Reservation", reservationSchema);

module.exports = { Pharmacy, Stock, Reservation };