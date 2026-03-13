const TriageRule = require("../models/TriageRule");

// ─── Hardcoded safety blockers (never suggest medicine for these) ──────────
const RED_FLAG_KEYWORDS = [
  "chest pain", "chest tightness", "heart attack",
  "can't breathe", "cannot breathe", "difficulty breathing", "breathlessness",
  "unconscious", "fainted", "seizure", "convulsion",
  "severe bleeding", "heavy bleeding",
  "stroke", "paralysis", "face drooping",
  "poisoning", "overdose",
  "suicidal", "suicide",
];

/**
 * Run triage on a list of symptom strings.
 * Returns { severity, nextAction, suggestedMedicineName, triggeredRuleId, confidence }
 *
 * @param {string[]} symptoms  - array of symptom keywords/phrases
 * @param {object}  patientFlags - { isPregnant, hasComorbidities, ageYears }
 */
const runTriage = async (symptoms = [], patientFlags = {}) => {
  const symptomText = symptoms.join(" ").toLowerCase();

  // ── 1. Red-flag check (always HIGH, never suggest medicine) ──────────────
  for (const flag of RED_FLAG_KEYWORDS) {
    if (symptomText.includes(flag)) {
      return {
        severity: "HIGH",
        nextAction: "consult_immediately",
        suggestedMedicineName: null,
        triggeredRuleId: "BUILTIN_RED_FLAG",
        confidence: 1.0,
        message: "Red-flag symptom detected. Seek immediate medical attention.",
      };
    }
  }

  // ── 2. Load active rules from DB (ordered by priority desc) ─────────────
  const rules = await TriageRule.find({ isActive: true }).sort({ priority: -1 });

  let matched = null;

  for (const rule of rules) {
    // Check if ANY keyword in the rule matches symptom text
    const hit = rule.keywords.some((kw) => symptomText.includes(kw.toLowerCase()));
    if (hit) {
      // Safety guardrail: block if patient matches blockFor conditions
      if (rule.blockFor?.pregnancy && patientFlags.isPregnant) continue;
      if (rule.blockFor?.childrenUnder12 && patientFlags.ageYears < 12) continue;
      matched = rule;
      break; // highest-priority match wins
    }
  }

  if (matched) {
    return {
      severity: matched.severity,
      nextAction: matched.nextAction,
      suggestedMedicineName: matched.severity === "LOW" ? matched.suggestedMedicineName : null,
      triggeredRuleId: matched.ruleId,
      confidence: 0.85,
    };
  }

  // ── 3. Fallback — no rule matched ────────────────────────────────────────
  return {
    severity: "MEDIUM",
    nextAction: "schedule_consult",
    suggestedMedicineName: null,
    triggeredRuleId: "FALLBACK",
    confidence: 0.5,
  };
};

/**
 * Symptom keyword map — English + Hindi + Punjabi + common transliterations.
 * Each entry: { keywords: [...], canonical: "english-symptom-name" }
 *
 * extractSymptoms() returns canonical English names so the triage engine
 * works in one language regardless of input language.
 */
const SYMPTOM_MAP = [
  // ── Fever ────────────────────────────────────────────────────────────────
  {
    canonical: "fever",
    keywords: ["fever", "high temperature", "temperature", "bukhar", "tez bukhar",
      "halka bukhar", "jwor", "jor", "garam", "tapman"],
  },
  // ── Headache ─────────────────────────────────────────────────────────────
  {
    canonical: "headache",
    keywords: ["headache", "head pain", "head ache", "sir dard", "sar dard",
      "sir mein dard", "mastishk dard", "sir mein takleef", "mata dard"],
  },
  // ── Cough ─────────────────────────────────────────────────────────────────
  {
    canonical: "cough",
    keywords: ["cough", "dry cough", "wet cough", "khasi", "khansi", "kasi",
      "khaansi", "khaasi", "khansi aa rahi", "khaansi ho rahi"],
  },
  // ── Cold / Runny nose ─────────────────────────────────────────────────────
  {
    canonical: "cold",
    keywords: ["cold", "runny nose", "stuffy nose", "nasal congestion", "blocked nose",
      "sneezing", "sardi", "nazla", "nasal", "nak beh rahi", "nak band",
      "nak mein jalan", "jukham"],
  },
  // ── Sore throat ───────────────────────────────────────────────────────────
  {
    canonical: "sore throat",
    keywords: ["sore throat", "throat pain", "swallowing pain", "gala dard",
      "gale mein dard", "gala kharab", "gale mein kharaash", "gala sujan"],
  },
  // ── Vomiting ──────────────────────────────────────────────────────────────
  {
    canonical: "vomiting",
    keywords: ["vomiting", "vomit", "nausea", "feeling sick", "ulti", "ulti aana",
      "ulti ho rahi", "matli", "ubkaayi", "jee machalana", "mitli"],
  },
  // ── Diarrhea ──────────────────────────────────────────────────────────────
  {
    canonical: "diarrhea",
    keywords: ["diarrhea", "loose motion", "loose stools", "watery stool",
      "dast", "loose potty", "paitl", "pachan", "badhazmi", "daast"],
  },
  // ── Stomach pain ──────────────────────────────────────────────────────────
  {
    canonical: "stomach pain",
    keywords: ["stomach pain", "abdominal pain", "stomach ache", "tummy ache",
      "pet dard", "pet mein dard", "pait dard", "udar dard",
      "pet mein takleef", "pet mein jalan"],
  },
  // ── Chest pain ────────────────────────────────────────────────────────────
  {
    canonical: "chest pain",
    keywords: ["chest pain", "chest tightness", "chest pressure", "heart pain",
      "seene mein dard", "chhati mein dard", "sina dard",
      "dil mein dard", "seene mein jalan"],
  },
  // ── Breathing difficulty ──────────────────────────────────────────────────
  {
    canonical: "difficulty breathing",
    keywords: ["difficulty breathing", "breathlessness", "shortness of breath",
      "can't breathe", "cannot breathe", "breathing difficulty",
      "sans lena", "sans nahi aa rahi", "sans phoolna",
      "dam ghutna", "sans mein takleef", "dam lena mushkil"],
  },
  // ── Dizziness ─────────────────────────────────────────────────────────────
  {
    canonical: "dizziness",
    keywords: ["dizziness", "dizzy", "vertigo", "lightheaded", "feeling faint",
      "chakkar", "chakkar aana", "chakkar aa raha", "sir ghoomna",
      "sir chakrana", "andhera aana", "behoshi jaisi"],
  },
  // ── Weakness / Fatigue ───────────────────────────────────────────────────
  {
    canonical: "weakness",
    keywords: ["weakness", "fatigue", "tired", "exhausted", "no energy",
      "kamzori", "thakan", "takat nahi", "thaka hua", "nirmata",
      "halka mahsoos", "kamzor"],
  },
  // ── Body ache ────────────────────────────────────────────────────────────
  {
    canonical: "body ache",
    keywords: ["body ache", "body pain", "muscle pain", "joint pain",
      "back pain", "badan dard", "haath pair dard", "jodo mein dard",
      "kamar dard", "muscles mein dard", "badan mein takleef"],
  },
  // ── Rash / Itching ───────────────────────────────────────────────────────
  {
    canonical: "rash",
    keywords: ["rash", "itching", "itch", "skin rash", "hives", "urticaria",
      "kharish", "khaaj", "daane", "khujli", "chamdi par daane",
      "lal daane", "chamdi kharaab"],
  },
  // ── Acidity / Heartburn ──────────────────────────────────────────────────
  {
    canonical: "acidity",
    keywords: ["acidity", "heartburn", "acid reflux", "gas", "bloating",
      "pet mein jalan", "seene mein jalan", "gais", "afara",
      "khatta aana", "belching", "dakar"],
  },
  // ── Eye symptoms ─────────────────────────────────────────────────────────
  {
    canonical: "eye problem",
    keywords: ["eye pain", "eye redness", "red eye", "itchy eyes", "watery eyes",
      "aankh dard", "aankh lal", "aankh mein jalan", "aankh mein khaaj",
      "aankh se pani", "aankhon mein dard"],
  },
  // ── Urinary symptoms ─────────────────────────────────────────────────────
  {
    canonical: "urinary issue",
    keywords: ["burning urination", "frequent urination", "painful urination",
      "peshaab mein jalan", "baar baar peshaab", "peshaab mein takleef",
      "mutral", "mutrasay", "peshab mein dard"],
  },
  // ── Constipation ─────────────────────────────────────────────────────────
  {
    canonical: "constipation",
    keywords: ["constipation", "no bowel movement", "hard stool",
      "kabz", "kabziyat", "potty nahi ho rahi", "mala shushtata"],
  },
  // ── Swelling ─────────────────────────────────────────────────────────────
  {
    canonical: "swelling",
    keywords: ["swelling", "swollen", "puffiness", "edema",
      "sujan", "sooja hua", "phoolna", "angon mein sujan"],
  },
  // ── Seizure ──────────────────────────────────────────────────────────────
  {
    canonical: "seizure",
    keywords: ["seizure", "convulsion", "fits", "shaking", "epilepsy",
      "mirgi", "dhaure", "haath pair kaanpna", "jhatkaa", "fitting"],
  },
  // ── Unconscious ──────────────────────────────────────────────────────────
  {
    canonical: "unconscious",
    keywords: ["unconscious", "fainted", "passed out", "unresponsive", "collapse",
      "behosh", "behoshi", "hosh kho dena", "behosh ho gaya",
      "gir gaya", "hosh nahi"],
  },
  // ── Bleeding ─────────────────────────────────────────────────────────────
  {
    canonical: "bleeding",
    keywords: ["bleeding", "blood", "haemorrhage", "hemorrhage",
      "khoon", "khoon aana", "khoon nikal raha", "rakt",
      "naak se khoon", "blood aa raha"],
  },
  // ── Toothache ────────────────────────────────────────────────────────────
  {
    canonical: "toothache",
    keywords: ["toothache", "tooth pain", "dental pain", "daant dard",
      "daant mein dard", "daant ka dard", "dant pida"],
  },
  // ── Ear pain ─────────────────────────────────────────────────────────────
  {
    canonical: "earache",
    keywords: ["earache", "ear pain", "ear ache", "kaan dard",
      "kaan mein dard", "kaan mein takleef", "kaan mein awaz"],
  },
];

/**
 * Extract canonical symptom names from free text.
 * Works with English, Hindi, Punjabi, and common transliterations.
 *
 * @param {string} text  - free-form text or voice transcript
 * @returns {string[]}   - array of canonical symptom names (English)
 */
const extractSymptoms = (text = "") => {
  const lower = text.toLowerCase();
  const found = [];

  for (const entry of SYMPTOM_MAP) {
    const hit = entry.keywords.some((kw) => lower.includes(kw));
    if (hit && !found.includes(entry.canonical)) {
      found.push(entry.canonical);
    }
  }

  return found;
};

/**
 * Backward-compatible flat list of all keywords (used by legacy code).
 */
const SYMPTOM_KEYWORDS = SYMPTOM_MAP.flatMap((e) => e.keywords);

module.exports = { runTriage, extractSymptoms, SYMPTOM_MAP, SYMPTOM_KEYWORDS };