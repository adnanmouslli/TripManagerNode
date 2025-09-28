// controllers/security.js (CommonJS)

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { toJSON, getUid } = require("./_utils");

// 🔧 Helper: تحويل إلى BigInt
const toId = (x) => {
  try {
    return BigInt(x);
  } catch {
    return BigInt(parseInt(x, 10) || 0);
  }
};

/** ===========================================================
 * 🟢 GET /api/security/security-logs
 * جلب كل السجلات مع فلترة + Pagination
 * =========================================================== */
async function listSecurityLogs(req, res) {
  try {
    const {
      tripId,
      reservationId,
      nationalId,
      from,
      to,
      page = "1",
      pageSize = "50",
    } = req.query;

    const take = Math.min(parseInt(pageSize) || 50, 200);
    const skip = (parseInt(page) - 1) * take;

    const where = {};
    if (tripId) where.tripId = toId(tripId);
    if (reservationId) where.reservationId = toId(reservationId);
    if (nationalId)
      where.nationalId = { contains: nationalId, mode: "insensitive" };
    if (from || to) {
      where.recordedAt = {};
      if (from) where.recordedAt.gte = new Date(from);
      if (to) where.recordedAt.lte = new Date(to);
    }

    const [items, total] = await Promise.all([
      prisma.securityLog.findMany({
        where,
        orderBy: { recordedAt: "desc" },
        skip,
        take,
        include: {
          recorder: { select: { id: true, name: true, role: true } },
          trip: {
            select: {
              id: true,
              departureDt: true,
              originLabel: true,
              destinationLabel: true,
            },
          },
          reservation: { select: { id: true } },
        },
      }),
      prisma.securityLog.count({ where }),
    ]);

    res.json({
      total,
      page: Number(page),
      pageSize: take,
      items: toJSON(items),
    });
  } catch (e) {
    res
      .status(500)
      .json({ message: "Error listing security logs", error: e.message });
  }
}

/** ===========================================================
 * 🟢 GET /api/security/security-logs/:id
 * جلب سجل واحد
 * =========================================================== */
async function getSecurityLog(req, res) {
  try {
    const id = toId(req.params.id);
    const log = await prisma.securityLog.findUnique({
      where: { id },
      include: {
        recorder: { select: { id: true, name: true, role: true } },
        trip: {
          select: {
            id: true,
            departureDt: true,
            originLabel: true,
            destinationLabel: true,
          },
        },
        reservation: { select: { id: true } },
      },
    });

    if (!log) return res.status(404).json({ message: "Not found" });
    res.json(toJSON(log));
  } catch (e) {
    res
      .status(500)
      .json({ message: "Error fetching security log", error: e.message });
  }
}

/** ===========================================================
 * 🟢 POST /api/security/logs
 * إنشاء سجل جديد
 * =========================================================== */
async function createSecurityLog(req, res) {
  try {
    const {
      tripId,
      reservationId,
      nationalId,
      firstName,
      lastName,
      fatherName,
      motherName,
      birthDate,
      issuePlace,
      phone,
      notes,
    } = req.body;

    if (!tripId || !nationalId || !firstName || !lastName) {
      return res.status(400).json({
        message: "tripId, nationalId, firstName, lastName are required",
      });
    }

    const uid = getUid(req);
    if (!uid) return res.status(401).json({ message: "Unauthorized" });

    const tripPk = toId(tripId);
    const trip = await prisma.trip.findUnique({ where: { id: tripPk } });
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    let reservationConnect = undefined;
    if (reservationId) {
      const rId = toId(reservationId);
      const r = await prisma.reservation.findUnique({
        where: { id: rId },
        include: { trip: { select: { id: true } } },
      });
      if (!r) return res.status(404).json({ message: "Reservation not found" });
      if (r.trip?.id?.toString() !== tripPk.toString()) {
        return res
          .status(400)
          .json({ message: "Reservation does not belong to this trip" });
      }
      reservationConnect = { connect: { id: rId } };
    }

    const log = await prisma.securityLog.create({
      data: {
        trip: { connect: { id: tripPk } },
        reservation: reservationConnect ?? undefined,
        recorder: { connect: { id: uid } },
        nationalId,
        firstName,
        lastName,
        fatherName: fatherName ?? null,
        motherName: motherName ?? null,
        birthDate: birthDate ? new Date(birthDate) : null,
        issuePlace: issuePlace ?? null,
        phone: phone ?? null,
        notes: notes ?? null,
      },
    });

    res.status(201).json(toJSON(log));
  } catch (e) {
    res
      .status(500)
      .json({ message: "Failed to create security log", error: e.message });
  }
}

/** ===========================================================
 * 🟢 PATCH /api/security/logs/:id
 * تحديث سجل
 * =========================================================== */
async function updateSecurityLog(req, res) {
  try {
    const id = toId(req.params.id);
    const {
      nationalId,
      firstName,
      lastName,
      fatherName,
      motherName,
      birthDate,
      issuePlace,
      phone,
      notes,
    } = req.body;

    const uid = getUid(req);
    if (!uid) return res.status(401).json({ message: "Unauthorized" });

    const log = await prisma.securityLog.findUnique({ where: { id } });
    if (!log)
      return res.status(404).json({ message: "Security log not found" });

    const data = {};
    if (nationalId !== undefined) data.nationalId = nationalId;
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (fatherName !== undefined) data.fatherName = fatherName ?? null;
    if (motherName !== undefined) data.motherName = motherName ?? null;
    if (birthDate !== undefined)
      data.birthDate = birthDate ? new Date(birthDate) : null;
    if (issuePlace !== undefined) data.issuePlace = issuePlace ?? null;
    if (phone !== undefined) data.phone = phone ?? null;
    if (notes !== undefined) data.notes = notes ?? null;

    const updated = await prisma.securityLog.update({ where: { id }, data });
    res.json(toJSON(updated));
  } catch (e) {
    res
      .status(500)
      .json({ message: "Failed to update security log", error: e.message });
  }
}

/** ===========================================================
 * 🟢 DELETE /api/security/logs/:id
 * حذف سجل
 * =========================================================== */
async function deleteSecurityLog(req, res) {
  try {
    const id = toId(req.params.id);
    const uid = getUid(req);
    if (!uid) return res.status(401).json({ message: "Unauthorized" });

    const log = await prisma.securityLog.findUnique({ where: { id } });
    if (!log)
      return res.status(404).json({ message: "Security log not found" });

    await prisma.securityLog.delete({ where: { id } });
    res.json({ message: "Security log deleted" });
  } catch (e) {
    res
      .status(500)
      .json({ message: "Failed to delete security log", error: e.message });
  }
}

async function getAllTrips(req, res) {
  try {
    const trips = await prisma.trip.findMany({
      select: {
        id: true,
        originLabel: true,
        destinationLabel: true,
        departureDt: true,
      },
    });

    // تحويل BigInt إلى string لتجنب JSON.stringify error
    const tripsSafe = JSON.parse(
      JSON.stringify(trips, (_, value) =>
        typeof value === "bigint" ? value.toString() : value
      )
    );

    res.json(tripsSafe);
  } catch (error) {
    console.error("Error fetching trips:", error);
    res.status(500).json({ error: "Failed to fetch trips" });
  }
}

module.exports = {
  listSecurityLogs,
  getSecurityLog,
  createSecurityLog,
  updateSecurityLog,
  deleteSecurityLog,
  getAllTrips,
};