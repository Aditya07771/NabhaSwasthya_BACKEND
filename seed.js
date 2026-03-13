/**
 * Seed script — run once after first deploy:
 *   node seed.js
 *
 * Creates:
 *  - 1 default admin user
 *  - Sample triage rules
 *  - Sample medicines
 */

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./src/models/User");
const TriageRule = require("./src/models/TriageRule");
const Medicine = require("./src/models/Medicine");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/nbh_health";

const ADMIN = {
  name: "Admin",
  email: "admin@nbhealth.in",
  password: "Admin@1234",
  role: "admin",
};

const TRIAGE_RULES = [
  // ── HIGH ──────────────────────────────────────────────────────────────────
  {
    ruleId: "HIGH-CHEST-PAIN",
    name: "Chest Pain",
    keywords: ["chest pain", "chest tightness", "heart attack", "heart pain"],
    severity: "HIGH",
    nextAction: "consult_immediately",
    priority: 100,
    blockFor: { pregnancy: false, childrenUnder12: false },
  },
  {
    ruleId: "HIGH-BREATHING",
    name: "Breathing Difficulty",
    keywords: ["difficulty breathing", "can't breathe", "breathlessness", "sans nahi"],
    severity: "HIGH",
    nextAction: "consult_immediately",
    priority: 100,
  },
  {
    ruleId: "HIGH-SEIZURE",
    name: "Seizure / Convulsion",
    keywords: ["seizure", "convulsion", "fits", "mirgi"],
    severity: "HIGH",
    nextAction: "consult_immediately",
    priority: 99,
  },
  {
    ruleId: "HIGH-STROKE",
    name: "Stroke Signs",
    keywords: ["stroke", "face drooping", "arm weakness", "speech difficulty", "paralysis"],
    severity: "HIGH",
    nextAction: "consult_immediately",
    priority: 99,
  },
  // ── MEDIUM ────────────────────────────────────────────────────────────────
  {
    ruleId: "MED-HIGH-FEVER",
    name: "High Fever",
    keywords: ["high fever", "tez bukhar", "104", "105"],
    severity: "MEDIUM",
    nextAction: "schedule_consult",
    priority: 50,
  },
  {
    ruleId: "MED-PERSISTENT-VOMITING",
    name: "Persistent Vomiting",
    keywords: ["persistent vomiting", "vomiting blood", "blood in vomit", "khoon aayi ulti"],
    severity: "MEDIUM",
    nextAction: "schedule_consult",
    priority: 50,
  },
  {
    ruleId: "MED-DIARRHEA-CHILD",
    name: "Diarrhea in child",
    keywords: ["diarrhea", "loose motion", "dast"],
    severity: "MEDIUM",
    nextAction: "schedule_consult",
    priority: 40,
  },
  // ── LOW ───────────────────────────────────────────────────────────────────
  {
    ruleId: "LOW-HEADACHE",
    name: "Mild Headache",
    keywords: ["headache", "sir dard", "mild headache"],
    severity: "LOW",
    nextAction: "suggest_otc",
    suggestedMedicineName: "paracetamol",
    priority: 20,
    blockFor: { pregnancy: false, childrenUnder12: false },
  },
  {
    ruleId: "LOW-MILD-FEVER",
    name: "Mild Fever",
    keywords: ["mild fever", "low fever", "fever", "bukhar"],
    severity: "LOW",
    nextAction: "suggest_otc",
    suggestedMedicineName: "paracetamol",
    priority: 15,
    blockFor: { childrenUnder12: false },
  },
  {
    ruleId: "LOW-COLD",
    name: "Common Cold",
    keywords: ["cold", "runny nose", "sneezing", "nasal congestion", "sardi", "nazla"],
    severity: "LOW",
    nextAction: "suggest_otc",
    suggestedMedicineName: "cetirizine",
    priority: 10,
  },
  {
    ruleId: "LOW-ACIDITY",
    name: "Acidity / Heartburn",
    keywords: ["acidity", "heartburn", "gas", "bloating", "pet mein jalan"],
    severity: "LOW",
    nextAction: "suggest_otc",
    suggestedMedicineName: "antacid",
    priority: 10,
    blockFor: { pregnancy: true }, // antacids need pharmacist check in pregnancy
  },
];

const MEDICINES = [
  {
    name: "paracetamol",
    displayName: "Paracetamol (Crocin / Dolo)",
    brandNames: ["Crocin", "Dolo 650", "Paracip", "Calpol"],
    genericName: "Paracetamol (Acetaminophen)",
    category: "analgesic / antipyretic",
    dosage: "500–650mg tablet every 6–8 hours. Max 4g/day. Take with food.",
    indications: ["fever", "headache", "mild pain", "body ache"],
    warnings: [
      "Do not exceed recommended dose",
      "Avoid alcohol",
      "Consult doctor if fever persists >3 days",
    ],
    sideEffects: ["Rare: liver damage on overdose"],
    approximatePriceINR: 15,
    requiresPrescription: false,
  },
  {
    name: "cetirizine",
    displayName: "Cetirizine (Zyrtec / Alerid)",
    brandNames: ["Zyrtec", "Alerid", "CTZ"],
    genericName: "Cetirizine Hydrochloride",
    category: "antihistamine",
    dosage: "10mg once daily at bedtime.",
    indications: ["cold", "runny nose", "sneezing", "allergic rhinitis", "itching"],
    warnings: ["May cause drowsiness", "Avoid driving", "Consult doctor if pregnant"],
    sideEffects: ["Drowsiness", "Dry mouth"],
    approximatePriceINR: 12,
    requiresPrescription: false,
  },
  {
    name: "antacid",
    displayName: "Antacid (Gelusil / Digene)",
    brandNames: ["Gelusil", "Digene", "Pudin Hara"],
    genericName: "Aluminium Hydroxide + Magnesium Hydroxide",
    category: "antacid",
    dosage: "1–2 tablets after meals and at bedtime. Chew before swallowing.",
    indications: ["acidity", "heartburn", "gas", "bloating"],
    warnings: [
      "Do not use long-term without medical advice",
      "Consult doctor if pregnant",
      "Check interactions with other medications",
    ],
    approximatePriceINR: 30,
    requiresPrescription: false,
  },
  {
    name: "ors",
    displayName: "ORS (Oral Rehydration Salt)",
    brandNames: ["Electral", "ORS-Zip", "Pedialyte"],
    genericName: "Oral Rehydration Salts",
    category: "rehydration",
    dosage: "Mix 1 sachet in 1 litre of clean water. Drink 200–400ml after each loose stool.",
    indications: ["diarrhea", "dehydration", "vomiting"],
    warnings: ["Seek medical help if vomiting persists", "Safe in pregnancy and children"],
    approximatePriceINR: 10,
    requiresPrescription: false,
  },
];

const seed = async () => {
  await mongoose.connect(MONGODB_URI);
  console.log("✅  Connected to MongoDB");

  // ── Admin user ─────────────────────────────────────────────────────────────
  let admin = await User.findOne({ email: ADMIN.email });
  if (!admin) {
    admin = new User({
      name: ADMIN.name,
      email: ADMIN.email,
      role: ADMIN.role,
      authProvider: "email",
      isVerified: true,
    });
    await admin.setPassword(ADMIN.password);
    await admin.save();
    console.log(`✅  Admin user created: ${ADMIN.email} / ${ADMIN.password}`);
  } else {
    console.log("ℹ️   Admin user already exists");
  }

  // ── Triage rules ──────────────────────────────────────────────────────────
  for (const rule of TRIAGE_RULES) {
    await TriageRule.findOneAndUpdate({ ruleId: rule.ruleId }, rule, {
      upsert: true,
      new: true,
    });
  }
  console.log(`✅  ${TRIAGE_RULES.length} triage rules seeded`);

  // ── Medicines ─────────────────────────────────────────────────────────────
  for (const med of MEDICINES) {
    await Medicine.findOneAndUpdate({ name: med.name }, med, {
      upsert: true,
      new: true,
    });
  }
  console.log(`✅  ${MEDICINES.length} medicines seeded`);

  console.log("\n🎉  Seeding complete!\n");
  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});