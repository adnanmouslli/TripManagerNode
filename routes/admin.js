const express = require("express");
const {
  verifyAccessToken,
  checkRole,
} = require("../controllers/middleware/auth");
const admin = require("../controllers/admin");

const router = express.Router();

// حماية كل مسارات الأدمن
router.use(verifyAccessToken, checkRole(["admin"]));

//profile admin

// بياناتي كأدمن
router.get("/me", admin.getMyProfile);
router.patch("/me", admin.updateMyProfile);
router.post("/me/change-password", admin.changeMyPassword);

/* USERS */
router.post("/users", admin.createUser);
router.get("/users", admin.listUsers);
router.get("/users/:id", admin.getUser);
router.delete("/users/:id", admin.deleteUser); // 👈 هون
router.patch("/users/:id", admin.updateUser);
// router.post("/users/:id/reset-password", admin.resetPassword);

/* BUS TYPES & SEAT MAP */
router.post("/bus-types", admin.createBusType);
router.get("/bus-types", admin.listBusTypes);
router.post("/bus-types/:id/seat-map/grid",admin.generateSeatMapGrid);
router.get("/bus-types/:id/seats", admin.listSeatsByBusType);
router.patch("/seats/:id/status", admin.toggleSeatStatus);

/* TRIPS (READ) */
router.get("/trips", admin.listTrips);
router.get("/trips/:id", admin.getTrip);

/* SECURITY LOGS (READ) */
router.get("/security-logs", admin.listSecurityLogs);
router.get("/security-logs/:id", admin.getSecurityLog);

module.exports = router;
