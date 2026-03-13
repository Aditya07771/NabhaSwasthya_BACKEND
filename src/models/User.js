 const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Roles: patient | asha | doctor | admin
// NOTE: "admin" role covers both pharmacist AND admin capabilities as per spec.

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: {
      type: String,
      trim: true,
      sparse: true,
      // sparse allows multiple nulls while keeping uniqueness for real values
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
    },
    passwordHash: { type: String, select: false }, // only present for email/password users
    role: {
      type: String,
      enum: ["patient", "asha", "doctor", "admin"],
      required: true,
      default: "patient",
    },
    // Firebase UID — set when the user authenticates via Firebase OAuth
    firebaseUid: { type: String, sparse: true },
    // Auth provider
    authProvider: {
      type: String,
      enum: ["email", "google", "firebase", "phone"],
      default: "email",
    },
    // Optional: link to an organisation / pharmacy
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Pharmacy" },
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    lastSeen: { type: Date },
    refreshTokenHash: { type: String, select: false },
    // ASHA-specific metadata
    ashaId: { type: String, sparse: true },
    village: { type: String },
  },
  { timestamps: true }
);

// Ensure at least email or phone
userSchema.pre("validate", function (next) {
  if (!this.email && !this.phone && !this.firebaseUid) {
    return next(new Error("User must have email, phone, or firebaseUid"));
  }
  next();
});

// Password helpers
userSchema.methods.setPassword = async function (plainPassword) {
  this.passwordHash = await bcrypt.hash(plainPassword, 12);
};

userSchema.methods.checkPassword = async function (plainPassword) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.refreshTokenHash;
  return obj;
};

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ firebaseUid: 1 });
userSchema.index({ role: 1 });

module.exports = mongoose.model("User", userSchema);