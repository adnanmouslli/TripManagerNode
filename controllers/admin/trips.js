const { PrismaClient } = require("@prisma/client");
const { toJSON } = require("../_utils");
const prisma = new PrismaClient();

async function listTrips(req, res) {
  try {
    const { from, to, status, busTypeId } = req.query;
    const where = {};
    if (status) where.status = status;
    if (busTypeId) where.busTypeId = Number(busTypeId);
    if (from || to) {
      where.departureDt = {};
      if (from) where.departureDt.gte = new Date(from);
      if (to) where.departureDt.lte = new Date(to);
    }

    const trips = await prisma.trip.findMany({
      where,
      orderBy: { departureDt: "asc" },
      include: {
        busType: true,
        _count: {
          select: { reservations: true, tripSeats: true, securityLogs: true },
        },
      },
    });

    res.json(toJSON(trips));
  } catch (e) {
    res.status(500).json({ message: "Error listing trips", error: e.message });
  }
}

async function getTrip(req, res) {
  try {
    const id = BigInt(req.params.id);
    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        busType: true,
        reservations: true,
        tripSeats: true,
        securityLogs: true,
      },
    });
    if (!trip) return res.status(404).json({ message: "Not found" });
    res.json(toJSON(trip));
  } catch (e) {
    res.status(500).json({ message: "Error fetching trip", error: e.message });
  }
}

module.exports = { listTrips, getTrip };