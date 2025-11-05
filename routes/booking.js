const express = require("express");
const {
  verifyAccessToken,
  checkRole,
} = require("../controllers/middleware/auth");
const booking = require("../controllers/booking");

const router = express.Router();

// 🔒 حماية كل المسارات لموظف الحجز المسبق (أو الأدمن)
router.use(verifyAccessToken);
router.get("/bus",booking.getAllBuses);
/* ========= TRIPS ========= */
router.post("/trips", booking.createTrip);
router.get("/trips", booking.listTrips);
router.get("/trips/:tripId", booking.getTrip);
router.patch("/trips/:tripId", booking.updateTrip);

/* ======= SEAT MAP ======= */
router.get("/trips/:tripId/seat-map", booking.getSeatMap);
router.get("/trips/:tripId/seats/available", booking.getAvailableSeats);

/* ========= RESERVATIONS ========= */
router.post("/reservations", booking.createReservation);
router.get("/reservations", booking.listAllReservations); // 👈 هيك تمام
router.get("/trips/:tripId/reservations", booking.listTripReservations);
router.get("/reservations/:id", booking.getReservation);
router.patch("/reservations/:id", booking.updateReservation);
router.delete("/reservations/:id", booking.deleteReservation);
module.exports = router;
