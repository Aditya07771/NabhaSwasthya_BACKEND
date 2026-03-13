const express = require("express");
const router = express.Router();
const { Pharmacy, Stock, Reservation } = require("../models/Pharmacy");
const { protect, authorize } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

router.use(protect);

// ═══════════════════════════════════════════════════════════════════════════════
// PHARMACY MANAGEMENT (admin only)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /api/pharmacy/register ─────────────────────────────────────────────
router.post(
  "/register",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const { name, contact, location, licenseNumber } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "Pharmacy name is required" });

    const pharmacy = await Pharmacy.create({
      name,
      contact,
      location,
      licenseNumber,
      ownerUserId: req.user._id,
      isApproved: true, // admin self-registers = auto-approved
    });

    res.status(201).json({ success: true, pharmacy });
  })
);

// ─── GET /api/pharmacy — list all approved pharmacies ─────────────────────────
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { village, approved = "true" } = req.query;
    const filter = { isActive: true };
    if (approved === "true") filter.isApproved = true;
    if (village) filter["location.village"] = { $regex: village, $options: "i" };

    const pharmacies = await Pharmacy.find(filter)
      .populate("ownerUserId", "name phone")
      .sort({ name: 1 });

    res.json({ success: true, pharmacies });
  })
);

// ─── GET /api/pharmacy/:id ────────────────────────────────────────────────────
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const pharmacy = await Pharmacy.findById(req.params.id).populate("ownerUserId", "name phone");
    if (!pharmacy)
      return res.status(404).json({ success: false, message: "Pharmacy not found" });
    res.json({ success: true, pharmacy });
  })
);

// ─── PUT /api/pharmacy/:id ────────────────────────────────────────────────────
router.put(
  "/:id",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const pharmacy = await Pharmacy.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!pharmacy)
      return res.status(404).json({ success: false, message: "Pharmacy not found" });
    res.json({ success: true, pharmacy });
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// STOCK MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /api/pharmacy/:id/stock — add or update a stock item ────────────────
router.post(
  "/:id/stock",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const { medicineName, displayName, brand, strength, price, quantity, lowStockThreshold, clientId, clientTimestamp } = req.body;

    if (!medicineName) return res.status(400).json({ success: false, message: "medicineName is required" });
    if (price === undefined || price < 0)
      return res.status(400).json({ success: false, message: "price must be >= 0" });
    if (quantity === undefined || quantity < 0)
      return res.status(400).json({ success: false, message: "quantity must be >= 0" });

    // Verify pharmacy belongs to this admin user (or is admin)
    const pharmacy = await Pharmacy.findById(req.params.id);
    if (!pharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found" });

    // Upsert: update existing or create new stock entry
    const stock = await Stock.findOneAndUpdate(
      { pharmacyId: req.params.id, medicineName: medicineName.toLowerCase() },
      {
        displayName,
        brand,
        strength,
        price,
        quantity,
        lowStockThreshold: lowStockThreshold || 10,
        lastUpdated: new Date(),
        clientId,
        clientTimestamp,
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.status(200).json({ success: true, stock });
  })
);

// ─── GET /api/pharmacy/:id/stock ──────────────────────────────────────────────
router.get(
  "/:id/stock",
  asyncHandler(async (req, res) => {
    const { lowStock } = req.query;
    const filter = { pharmacyId: req.params.id };
    if (lowStock === "true") {
      // return items where quantity <= lowStockThreshold
      filter.$expr = { $lte: ["$quantity", "$lowStockThreshold"] };
    }

    const stock = await Stock.find(filter).sort({ medicineName: 1 });
    res.json({ success: true, stock });
  })
);

// ─── DELETE /api/pharmacy/:id/stock/:stockId ──────────────────────────────────
router.delete(
  "/:id/stock/:stockId",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    await Stock.findByIdAndDelete(req.params.stockId);
    res.json({ success: true, message: "Stock item removed" });
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// PHARMACY SEARCH — public-facing for patients
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/pharmacy/nearby ─────────────────────────────────────────────────
router.get(
  "/search/nearby",
  asyncHandler(async (req, res) => {
    const { medicine, village } = req.query;
    if (!medicine)
      return res.status(400).json({ success: false, message: "medicine query param is required" });

    // Find approved pharmacies, optionally filter by village
    const pharmacyFilter = { isApproved: true, isActive: true };
    if (village) pharmacyFilter["location.village"] = { $regex: village, $options: "i" };
    const pharmacies = await Pharmacy.find(pharmacyFilter).select("_id name location contact");

    if (pharmacies.length === 0)
      return res.json({ success: true, results: [] });

    const pharmacyIds = pharmacies.map((p) => p._id);

    // Find stock for these pharmacies that has the medicine with quantity > 0
    const stocks = await Stock.find({
      pharmacyId: { $in: pharmacyIds },
      medicineName: { $regex: medicine.toLowerCase(), $options: "i" },
      quantity: { $gt: 0 },
    });

    // Merge stock into pharmacy objects
    const stockMap = {};
    stocks.forEach((s) => {
      const key = s.pharmacyId.toString();
      if (!stockMap[key]) stockMap[key] = [];
      stockMap[key].push(s);
    });

    const results = pharmacies
      .filter((p) => stockMap[p._id.toString()])
      .map((p) => ({
        pharmacy: p,
        stock: stockMap[p._id.toString()],
      }));

    res.json({ success: true, results, medicine });
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// RESERVATIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /api/pharmacy/:id/reserve ──────────────────────────────────────────
router.post(
  "/:id/reserve",
  asyncHandler(async (req, res) => {
    const { patientId, medicine, brand, qty, consultationId } = req.body;

    if (!patientId || !medicine || !qty)
      return res.status(400).json({ success: false, message: "patientId, medicine, qty required" });

    // Check stock availability
    const stock = await Stock.findOne({
      pharmacyId: req.params.id,
      medicineName: { $regex: `^${medicine.toLowerCase()}$`, $options: "i" },
      quantity: { $gte: qty },
    });
    if (!stock)
      return res.status(400).json({ success: false, message: "Insufficient stock at this pharmacy" });

    // Create reservation and decrement stock (held)
    const [reservation] = await Promise.all([
      Reservation.create({
        patientId,
        pharmacyId: req.params.id,
        medicine,
        brand,
        qty,
        consultationId,
      }),
      Stock.findByIdAndUpdate(stock._id, { $inc: { quantity: -qty } }),
    ]);

    res.status(201).json({ success: true, reservation });
  })
);

// ─── GET /api/pharmacy/:id/reservations ──────────────────────────────────────
router.get(
  "/:id/reservations",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const filter = { pharmacyId: req.params.id };
    if (status) filter.status = status;

    const reservations = await Reservation.find(filter)
      .populate("patientId", "name phone patientId")
      .sort({ createdAt: -1 });

    res.json({ success: true, reservations });
  })
);

// ─── PUT /api/reservations/:id/cancel ────────────────────────────────────────
router.put(
  "/reservations/:id/cancel",
  asyncHandler(async (req, res) => {
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation)
      return res.status(404).json({ success: false, message: "Reservation not found" });

    if (["cancelled", "expired"].includes(reservation.status))
      return res.status(400).json({ success: false, message: "Reservation already cancelled/expired" });

    reservation.status = "cancelled";
    await reservation.save();

    // Restore stock
    await Stock.findOneAndUpdate(
      { pharmacyId: reservation.pharmacyId, medicineName: reservation.medicine.toLowerCase() },
      { $inc: { quantity: reservation.qty } }
    );

    res.json({ success: true, reservation });
  })
);

// ─── PUT /api/reservations/:id/status ────────────────────────────────────────
router.put(
  "/reservations/:id/status",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowed = ["accepted", "ready", "cancelled"];
    if (!allowed.includes(status))
      return res.status(400).json({ success: false, message: `status must be one of: ${allowed.join(", ")}` });

    const reservation = await Reservation.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!reservation)
      return res.status(404).json({ success: false, message: "Reservation not found" });

    res.json({ success: true, reservation });
  })
);

module.exports = router;