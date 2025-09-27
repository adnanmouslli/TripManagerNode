
const express = require("express");
const router = express.Router();

const ops = require("../controllers/ops");
const {
  verifyAccessToken,
  checkRole,
} = require("../controllers/middleware/auth");

/** 🔓 عام: طباعة تذكرة (بدون توكن) */
router.get(
  "/trips/:tripId/reservations/:reservationId/ticket.pdf",
  ops.generateReservationTicketPDF
);

/** 🔐 كل ما بعده يحتاج توكن ودور ops/admin */
router.use(verifyAccessToken, checkRole(["ops", "admin"]));
router.get("/trips/:tripId",ops.getTripById);
router.get("/Alltrips", ops.getAllTrips);
router.post("/trips", ops.createTrip);
router.patch("/trips/:tripId", ops.updateTrip);
router.delete("/trips/:tripId", ops.deleteTrip);

router.get("/trips/:tripId/passengers", ops.getTripPassengers);
router.get("/trips/:tripId/payments-summary", ops.getTripPaymentsSummary);
router.get("/trips/:tripId/report.pdf", ops.generateTripReportPDF);
router.get("/trips/:tripId/steat", ops.getSeatMap);
router.get("/trips/:tripId/reservations", ops.getTripReservations);

/** ✅ السطر المطلوب: إضافة راكب (اسم فقط، بدون دفع/صعود) */
router.post("/trips/:tripId/passengers", ops.addPassenger);
router.get("/bus", ops.getAllBuses);
module.exports = router;

module.exports = router;
