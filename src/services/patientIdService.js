const Patient = require("../models/Patient");

/**
 * Generates a unique human-readable patient ID: NBH-YYYY-XXXX
 * Uses a simple incrementing counter based on existing patients this year.
 */
const generatePatientId = async () => {
  const year = new Date().getFullYear();
  const prefix = `NBH-${year}-`;

  // Find the highest existing ID for this year
  const latest = await Patient.findOne(
    { patientId: { $regex: `^${prefix}` } },
    { patientId: 1 },
    { sort: { patientId: -1 } }
  );

  let next = 1;
  if (latest) {
    const parts = latest.patientId.split("-");
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) next = lastNum + 1;
  }

  // Zero-pad to 4 digits, expand if needed
  return `${prefix}${String(next).padStart(4, "0")}`;
};

module.exports = { generatePatientId };