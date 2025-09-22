const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { toJSON } = require("../_utils");

const toId = (x) => {
  try {
    return BigInt(x);
  } catch {
    return BigInt(parseInt(x, 10) || 0);
  }
};

// GET /api/booking/trips/:tripId/seat-map
// async function getSeatMap(req, res) {
//   try {
//     const tripId = toId(req.params.tripId);

//     // جيب الرحلة مع busType.id (لو ما عندك trip.busTypeId كسكالار)
//     const trip = await prisma.trip.findUnique({
//       where: { id: tripId },
//       include: { busType: { select: { id: true } } },
//     });
//     if (!trip) return res.status(404).json({ message: "Trip not found" });

//     // استخرج busTypeId من السكالار إن وجد، وإلا من العلاقة
//     const busTypeId = Number(trip.busTypeId ?? trip.busType?.id);
//     if (!busTypeId) {
//       return res.status(500).json({ message: "Trip busType not resolved" });
//     }

//     // كل مقاعد نوع الباص
//     const seats = await prisma.seat.findMany({
//       where: { busTypeId },
//       orderBy: [{ row: "asc" }, { col: "asc" }],
//     });

//     // حجوزات الرحلة الحالية - عبر العلاقة (بدون tripId scalar)
//     const reservations = await prisma.reservation.findMany({
//       where: { trip: { id: tripId } },
//       select: {
//         id: true,
//         passengerName: true,
//         seat: { select: { id: true } },
//       },
//     });

//     // خريطة المقاعد المحجوزة key=seat.id
//     const reservedMap = new Map();
//     for (const r of reservations) {
//       const sid = Number(r.seat?.id);
//       if (sid) reservedMap.set(sid, r);
//     }

//     const result = {
//       tripId: trip.id.toString(),
//       busTypeId,
//       seats: seats.map((s) => {
//         const r = reservedMap.get(s.id);
//         return r
//           ? {
//               seatId: s.id,
//               row: s.row,
//               col: s.col,
//               reserved: true,
//               reservationId: r.id.toString(),
//               passengerName: r.passengerName,
//             }
//           : {
//               seatId: s.id,
//               row: s.row,
//               col: s.col,
//               reserved: false,
//             };
//       }),
//     };

//     res.json(result);
//   } catch (e) {
//     res
//       .status(500)
//       .json({ message: "Error building seat map", error: e.message });
//   }
// }

// // GET /api/booking/trips/:tripId/seats/available
// async function getAvailableSeats(req, res) {
//   try {
//     const tripId = toId(req.params.tripId);

//     // جيب الرحلة + busType.id
//     const trip = await prisma.trip.findUnique({
//       where: { id: tripId },
//       include: { busType: { select: { id: true } } },
//     });
//     if (!trip) return res.status(404).json({ message: "Trip not found" });

//     const busTypeId = Number(trip.busTypeId ?? trip.busType?.id);
//     if (!busTypeId) {
//       return res.status(500).json({ message: "Trip busType not resolved" });
//     }

//     // كل مقاعد نوع الباص + المقاعد المحجوزة لهذه الرحلة عبر العلاقة
//     const [seats, reserved] = await Promise.all([
//       prisma.seat.findMany({ where: { busTypeId }, select: { id: true } }),
//       prisma.reservation.findMany({
//         where: { trip: { id: tripId } },
//         select: { seat: { select: { id: true } } },
//       }),
//     ]);

//     const reservedSet = new Set(
//       reserved.map((r) => Number(r.seat?.id)).filter(Boolean)
//     );

//     const availableSeatIds = seats
//       .map((s) => s.id)
//       .filter((id) => !reservedSet.has(id));

//     res.json({ tripId: trip.id.toString(), busTypeId, availableSeatIds });
//   } catch (e) {
//     res
//       .status(500)
//       .json({ message: "Error listing available seats", error: e.message });
//   }
// }


// GET /api/booking/trips/:tripId/seat-map
async function getSeatMap(req, res) {
  try {
    const tripId = BigInt(req.params.tripId);

    // جيب الرحلة مع busType
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        busType: {
          select: {
            id: true,
            rows: true,
            leftSeats: true,
            rightSeats: true,
            lastRowSeats: true,
          },
        },
      },
    });

    if (!trip) return res.status(404).json({ message: "Trip not found" });

    const busTypeId = trip.busTypeId ?? trip.busType?.id;
    if (!busTypeId) {
      return res.status(500).json({ message: "Trip busType not resolved" });
    }

    // 🟢 كل مقاعد الباص
    const seats = await prisma.seat.findMany({
      where: { busTypeId },
      orderBy: [{ row: "asc" }, { col: "asc" }],
    });

    // 🟢 حالة المقاعد على مستوى الرحلة
    const tripSeats = await prisma.tripSeat.findMany({
      where: { tripId },
    });
    const tripSeatMap = new Map(tripSeats.map(ts => [ts.seatId, ts.status]));

    // 🟢 الحجوزات
    const reservations = await prisma.reservation.findMany({
      where: { tripId },
      select: {
        id: true,
        passengerName: true,
        seatId: true,
      },
    });
    const reservedMap = new Map(reservations.map(r => [r.seatId, r]));

    // ✨ بناء النتيجة
    const result = {
      tripId: trip.id.toString(),
      busTypeId,
      layout: {
        rows: trip.busType.rows,
        leftSeats: trip.busType.leftSeats,
        rightSeats: trip.busType.rightSeats,
        lastRowSeats: trip.busType.lastRowSeats,
      },
      seats: seats.map((s) => {
        let status = s.status; // الحالة الافتراضية من Seat

        // إذا في حالة خاصة للرحلة
        if (tripSeatMap.has(s.id)) {
          status = tripSeatMap.get(s.id);
        }

        // إذا محجوز → تغطي على أي حالة
        const r = reservedMap.get(s.id);
        if (r) {
          status = "reserved";
        }

        return {
          seatId: s.id,
          row: s.row,
          col: s.col,
          number: s.number,
          status,
          ...(r && {
            reservationId: r.id.toString(),
            passengerName: r.passengerName,
          }),
        };
      }),
    };

    res.json(result);
  } catch (e) {
    console.error("Error building seat map:", e);
    res.status(500).json({ message: "Error building seat map", error: e.message });
  }
}

// GET /api/booking/trips/:tripId/seats/available
async function getAvailableSeats(req, res) {
  try {
    const tripId = BigInt(req.params.tripId);

    // جيب الرحلة + busType
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { busType: { select: { id: true } } },
    });
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    const busTypeId = trip.busTypeId ?? trip.busType?.id;
    if (!busTypeId) {
      return res.status(500).json({ message: "Trip busType not resolved" });
    }

    // 🟢 المقاعد
    const seats = await prisma.seat.findMany({
      where: { busTypeId },
      select: { id: true, status: true },
    });

    // 🟢 حالات المقاعد على مستوى الرحلة
    const tripSeats = await prisma.tripSeat.findMany({
      where: { tripId },
      select: { seatId: true, status: true },
    });
    const tripSeatMap = new Map(tripSeats.map(ts => [ts.seatId, ts.status]));

    // 🟢 الحجوزات
    const reservations = await prisma.reservation.findMany({
      where: { tripId },
      select: { seatId: true },
    });
    const reservedSet = new Set(reservations.map(r => r.seatId));

    // ✨ المقاعد المتاحة
    const availableSeatIds = seats
      .filter((s) => {
        // الحالة الافتراضية
        let status = s.status;

        // إذا في حالة خاصة للرحلة
        if (tripSeatMap.has(s.id)) {
          status = tripSeatMap.get(s.id);
        }

        // ✅ شروط التصفية
        return (
          status === "available" || status === "held" // فقط المتاحة أو الممسوكة
        ) && !reservedSet.has(s.id); // شرط ألا يكون محجوز
      })
      .map((s) => s.id);

    res.json({ tripId: trip.id.toString(), busTypeId, availableSeatIds });
  } catch (e) {
    console.error("Error listing available seats:", e);
    res
      .status(500)
      .json({ message: "Error listing available seats", error: e.message });
  }
}

module.exports = { getSeatMap, getAvailableSeats };


module.exports = { getSeatMap, getAvailableSeats };
