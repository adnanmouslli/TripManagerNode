const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { toJSON, getUid } = require("./_utils");
const path = require("path");
const PdfPrinter = require("pdfmake");

const toId = (x) => {
  try {
    return BigInt(x);
  } catch {
    return BigInt(parseInt(x, 10) || 0);
  }
};
// GET /api/ops/trips/:tripId
async function getTripById(req, res) {
  try {
    // تحقق من صلاحية المستخدم (ops أو admin)
    if (!req.user || !["ops", "admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Only ops users can view trips" });
    }

    const tripId = req.params.tripId;

    // جلب الرحلة
    const trip = await prisma.trip.findUnique({
      where: { id: BigInt(tripId) }, // تحويل id لـ BigInt إذا كانت قاعدة البيانات تستخدم BigInt
      select: {
        id: true,
        originLabel: true,
        destinationLabel: true,
        driverName: true,
        departureDt: true,
        status: true,
        busType: { select: { id: true, name: true } },
        reservations: { select: { id: true } }, // لحساب عدد الركاب
      },
    });

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // تحويل البيانات
    const tripJson = {
      id: trip.id.toString(),
      originLabel: trip.originLabel,
      destinationLabel: trip.destinationLabel,
      driverName: trip.driverName,
      departureDt: trip.departureDt ? trip.departureDt.toISOString() : null,
      status: trip.status,
      busType: trip.busType
        ? { id: trip.busType.id.toString(), name: trip.busType.name }
        : null,
      passengersCount: trip.reservations.length,
    };

    res.json(tripJson);
  } catch (e) {
    console.error("Error fetching trip:", e);
    res.status(500).json({ message: "Failed to fetch trip", error: e.message });
  }
}
// GET /api/ops/alltrips
async function getAllTrips(req, res) {
  try {
    // تحقق من صلاحية المستخدم (ops أو admin)
    if (!req.user || !["ops", "admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Only ops users can view trips" });
    }

    // جلب كل الرحلات
    const trips = await prisma.trip.findMany({
      select: {
        id: true,
        originLabel: true,
        destinationLabel: true,
        driverName: true,
        departureDt: true,
        status: true,
        busType: { select: { id: true, name: true } }, // معلومات نوع الباص
        reservations: { select: { id: true } }, // نستخدمها لحساب عدد الركاب
      },
      orderBy: { departureDt: "asc" }, // ترتيب حسب وقت الانطلاق
    });

    // تحويل البيانات وإصلاح مشكلة BigInt
    const tripsJson = trips.map((t) => ({
      id: t.id.toString(), // تحويل BigInt
      originLabel: t.originLabel,
      destinationLabel: t.destinationLabel,
      driverName: t.driverName,
      departureDt: t.departureDt ? t.departureDt.toISOString() : null,
      status: t.status,
      busType: t.busType
        ? { id: t.busType.id.toString(), name: t.busType.name }
        : null,
      passengersCount: t.reservations.length,
    }));

    res.json(tripsJson);
  } catch (e) {
    console.error("Error fetching trips:", e);
    res.status(500).json({ message: "Failed to fetch trips", error: e.message });
  }
}

// POST /api/ops/trips
async function createTrip(req, res) {
  try {
    // uid من التوكن (التحقق من الدور يتم بالراوتر عبر checkRole)
    const uid = getUid(req);
    const {
      originLabel,
      destinationLabel,
      driverName,
      departureTime,
      busTypeId,
    } = req.body;

    if (
      !originLabel ||
      !destinationLabel ||
      !driverName ||
      !departureTime ||
      !busTypeId
    ) {
      return res.status(400).json({
        message:
          "originLabel, destinationLabel, driverName, departureTime, busTypeId are required",
      });
    }

    // تأكد أن نوع الباص موجود
    const bt = await prisma.busType.findUnique({
      where: { id: Number(busTypeId) },
    });
    if (!bt) return res.status(404).json({ message: "Bus type not found" });

    const trip = await prisma.trip.create({
      data: {
        originLabel,
        destinationLabel,
        driverName,
        departureDt: new Date(departureTime),
        busType: { connect: { id: Number(busTypeId) } },
        creator: { connect: { id: uid } }, // أنشأها متسيّر الرحلات
        status: "scheduled",
      },
    });

    res.status(201).json(toJSON(trip));
  } catch (e) {
    res
      .status(500)
      .json({ message: "Failed to create trip", error: e.message });
  }
}

// PATCH /api/ops/trips/:tripId
async function updateTrip(req, res) {
  try {
    const tripId = toId(req.params.tripId);

    // نقبل كلا الاسمين: departureTime (سلسلة ISO) أو departureDt
    const {
      busTypeId,
      departureTime,     // مثال: "2025-09-01T08:30:00Z"
      departureDt,       // بديل: إما Date أو String
      originLabel,       // String أو null لمسح القيمة
      destinationLabel,  // String أو null لمسح القيمة
      durationMinutes,   // Int أو null
      driverName,        // String أو null
      status,            // one of: scheduled|boarding|departed|canceled|completed
    } = req.body;

    // تأكد أن الرحلة موجودة
    const existsTrip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true },
    });
    if (!existsTrip) return res.status(404).json({ message: "Trip not found" });

    const data = {};

    // تغيير نوع الباص
    if (Object.prototype.hasOwnProperty.call(req.body, "busTypeId")) {
      const btId = Number(busTypeId);
      if (!Number.isInteger(btId) || btId <= 0) {
        return res.status(400).json({ message: "Invalid busTypeId" });
      }
      const bt = await prisma.busType.findUnique({ where: { id: btId } });
      if (!bt) return res.status(404).json({ message: "Bus type not found" });
      // بما أن العلاقة معرفة بـ fields: [busTypeId] نحدّث الـ scalar مباشرة:
      data.busTypeId = btId;
    }

    // تغيير وقت الانطلاق
    if (
      Object.prototype.hasOwnProperty.call(req.body, "departureTime") ||
      Object.prototype.hasOwnProperty.call(req.body, "departureDt")
    ) {
      const raw = departureTime ?? departureDt;
      const dt = raw instanceof Date ? raw : new Date(raw);
      if (isNaN(dt)) {
        return res.status(400).json({ message: "Invalid departure datetime" });
      }
      data.departureDt = dt;
    }

    // الحقول النصية (ندعم التعيين إلى null لمسحها)
    if (Object.prototype.hasOwnProperty.call(req.body, "originLabel")) {
      data.originLabel = originLabel ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "destinationLabel")) {
      data.destinationLabel = destinationLabel ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "driverName")) {
      data.driverName = driverName ?? null;
    }

    // مدة الرحلة
    if (Object.prototype.hasOwnProperty.call(req.body, "durationMinutes")) {
      if (durationMinutes === null) {
        data.durationMinutes = null;
      } else {
        const dur = Number(durationMinutes);
        if (!Number.isInteger(dur) || dur < 0) {
          return res.status(400).json({ message: "Invalid durationMinutes" });
        }
        data.durationMinutes = dur;
      }
    }

    // الحالة
    if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
      const allowed = ["scheduled", "boarding", "departed", "canceled", "completed"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      data.status = status;
    }

    const updated = await prisma.trip.update({
      where: { id: tripId },
      data,
    });

    res.json(toJSON(updated));
  } catch (e) {
    res.status(500).json({ message: "Failed to update trip", error: e.message });
  }
}

// DELETE /api/ops/trips/:tripId
async function deleteTrip(req, res) {
  try {
    const tripId = toId(req.params.tripId);
    await prisma.trip.delete({ where: { id: tripId } });
    res.json({ message: "Trip deleted successfully" });
  } catch (e) {
    res
      .status(500)
      .json({ message: "Failed to delete trip", error: e.message });
  }
}

// GET /api/ops/trips/:tripId/passengers
async function getTripPassengers(req, res) {
  try {
    const tripId = toId(req.params.tripId);
    const reservations = await prisma.reservation.findMany({
      where: { trip: { id: tripId } },
      select: {
        passengerName: true,
        phone: true,
        boardingPoint: true,
        seat: { select: { row: true, col: true, id: true } },
        paid: true,
        amount: true,
      },
      orderBy: [{ id: "asc" }],
    });
    res.json(toJSON(reservations));
  } catch (e) {
    res
      .status(500)
      .json({ message: "Failed to fetch passengers", error: e.message });
  }
}

// GET /api/ops/trips/:tripId/payments-summary
async function getTripPaymentsSummary(req, res) {
  try {
    const tripId = toId(req.params.tripId);

    const [agg, counts] = await Promise.all([
      prisma.reservation.aggregate({
        where: { trip: { id: tripId }, paid: true },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.reservation
        .groupBy({
          where: { trip: { id: tripId } },
          by: ["paid"],
          _count: { _all: true },
        })
        .catch(() => []),
    ]);

    const totalPaid = agg._sum.amount ?? 0;
    const paidCount = counts.find((c) => c.paid === true)?._count._all ?? 0;
    const unpaidCount = counts.find((c) => c.paid === false)?._count._all ?? 0;

    res.json({ tripId: tripId.toString(), totalPaid, paidCount, unpaidCount });
  } catch (e) {
    res
      .status(500)
      .json({ message: "Failed to fetch payments summary", error: e.message });
  }
}

// POST /api/ops/trips/:tripId/passengers  (اسم فقط، بدون دفع/صعود)
// POST /api/ops/trips/:tripId/passengers  (إضافة حجز مع البيانات الأساسية)
async function addPassenger(req, res) {
  try {
    const uid = getUid(req);
    const tripId = toId(req.params.tripId);
    const { passengerName, seatId, boardingPoint, amount } = req.body;

    // ✅ تحقق من الحقول المطلوبة
    if (!passengerName || !boardingPoint || amount === undefined) {
      return res.status(400).json({
        message: "passengerName, boardingPoint, amount are required",
      });
    }

    // التحقق من المقعد (اختياري)
    let seatConnect = undefined;
    if (seatId !== undefined && seatId !== null) {
      const trip = await prisma.trip.findUnique({
        where: { id: tripId },
        include: { busType: { select: { id: true } } },
      });
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const busTypeId = Number(trip.busTypeId ?? trip.busType?.id);
      const seat = await prisma.seat.findUnique({
        where: { id: Number(seatId) },
      });
      if (!seat || seat.busTypeId !== busTypeId) {
        return res
          .status(400)
          .json({ message: "Seat does not belong to trip's bus type" });
      }

      // تأكد أن المقعد غير محجوز مسبقاً
      const exists = await prisma.reservation.findFirst({
        where: { tripId, seatId: Number(seatId) },
      });
      if (exists) {
        return res
          .status(409)
          .json({ message: "Seat already reserved for this trip" });
      }

      seatConnect = { connect: { id: Number(seatId) } };
    }

    // ✅ إنشاء الحجز
    const reservation = await prisma.reservation.create({
      data: {
        trip: { connect: { id: tripId } },
        seat: seatConnect,
        passengerName,
        boardingPoint,
        amount: Number(amount), // المبلغ المدفوع
        paid: Number(amount) > 0, // إذا في مبلغ > 0 اعتبره مدفوع
        creator: { connect: { id: uid } },
      },
    });

    res.status(201).json(toJSON(reservation));
  } catch (e) {
    res.status(500).json({
      message: "Failed to add passenger",
      error: e.message,
    });
  }
}


const fonts = {
  Arabic: {
    normal: path.join(__dirname, "..", "assets", "fonts", "Cairo.ttf"),
    bold: path.join(__dirname, "..", "assets", "fonts", "Cairo.ttf"),
    italics: path.join(__dirname, "..", "assets", "fonts", "Cairo.ttf"),
    bolditalics: path.join(__dirname, "..", "assets", "fonts", "Cairo.ttf"),
  },
};



// GET /api/ops/trips/:tripId/report.pdf
const printer = new PdfPrinter(fonts);

// controllers/ops.js

async function generateTripReportPDF(req, res) {
  try {
    // 1) التحقق من التوكن والدور من الـ middleware
    // (verifyAccessToken يملأ req.user = { id, role })
    if (!req.user || !["ops", "admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Only ops users can view trip reports" });
    }

    // 2) جلب tripId من الـ params (وليس من الـ body)
    const rawTripId = req.params.tripId ?? req.body.tripId;
    if (!rawTripId) {
      return res.status(400).json({ error: "tripId is required (in route param)" });
    }
    let tripId;
    try { tripId = BigInt(rawTripId); } catch { return res.status(400).json({ error: "Invalid tripId" }); }

    // 3) جلب بيانات الرحلة
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        originLabel: true,
        destinationLabel: true,
        driverName: true,
        departureDt: true,
        reservations: {
          select: {
            passengerName: true,
            amount: true,        // Decimal
            boardingPoint: true, // "المحافظة/مكان الصعود"
          },
        },
      },
    });

    if (!trip) return res.status(404).json({ error: "Trip not found" });

    // 4) الإحصاءات
    const byAmount = {};
    const byProvince = {};

    for (const r of trip.reservations) {
      const amt = Number(r.amount || 0);
      byAmount[amt] = (byAmount[amt] || 0) + 1;

      const prov = r.boardingPoint || "غير محدد";
      byProvince[prov] = (byProvince[prov] || 0) + 1;
    }

    // 5) تعريف محتوى التقرير pdfmake
    const depStr = trip.departureDt ? new Date(trip.departureDt).toLocaleString("ar-SY") : "غير محدد";

    const docDefinition = {
      content: [
        { text: "الرحلة تقرير ", style: "header", alignment: "center" },
        { text: "\n" },

        // معلومات الرحلة
        {
          columns: [
            {
              text: `${trip.destinationLabel || "غير محدد"} : إلى`,
              alignment: "right",
            },
            {
              text: `${trip.originLabel || "غير محدد"} : من`,
              alignment: "right",
            },
          ],
          margin: [0, 2, 0, 2],
        },
        {
          text: `${trip.driverName || "غير محدد"} : السائق`,
          alignment: "right",
          margin: [0, 2, 0, 2],
        },
        {
          text: `${depStr} :  الرحلة تاريخ `,
          alignment: "right",
          margin: [0, 2, 0, 2],
        },
        {
          text: `${trip.reservations.length || 0} : الركاب إجمالي `,
          alignment: "right",
          margin: [0, 2, 0, 10],
        },

        // جدول الركاب حسب المحافظة
        {
          text: " المحافظة حسب الركاب عدد ",
          style: "subheader",
          alignment: "center",
          margin: [0, 5, 0, 5],
        },
        {
          table: {
            headerRows: 1,
            widths: ["*", "*"],
            body: [
              ["المحافظة", "الركاب عدد "],
              ...Object.entries(byProvince).map(([prov, count]) => [
                prov,
                count,
              ]),
            ],
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 10],
        },

        // جدول الركاب حسب المبلغ المدفوع
        {
          text: "المدفوع المبلغ حسب الركاب عدد",
          style: "subheader",
          alignment: "center",
          margin: [0, 5, 0, 5],
        },
        {
          table: {
            headerRows: 1,
            widths: ["*", "*"],
            body: [
              ["المبلغ", "الركاب عدد "],
              ...Object.entries(byAmount).map(([amount, count]) => [
                amount,
                count,
              ]),
            ],
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 10],
        },
      ],
      defaultStyle: {
        font: "Arabic",
        fontSize: 12,
      },
      styles: {
        header: { fontSize: 18, bold: true },
        subheader: { fontSize: 14, bold: true },
      },
    };

    // 6) إنشاء وإرسال الـ PDF
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="trip_${rawTripId}_report.pdf"`);
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (err) {
    console.error("Error generating trip PDF:", err);
    res.status(500).json({ error: "Failed to generate trip PDF" });
  }
}



// GET /api/ops/trips/:tripId/reservations/:reservationId/ticket.pdf
async function generateReservationTicketPDF(req, res) {
  try {
    const rawTripId = req.params.tripId;
    const rawReservationId = req.params.reservationId;
    if (!rawTripId || !rawReservationId) {
      return res.status(400).json({ error: "tripId and reservationId are required in route params" });
    }

    let tripId, reservationId;
    try { tripId = BigInt(rawTripId); } catch { return res.status(400).json({ error: "Invalid tripId" }); }
    try { reservationId = BigInt(rawReservationId); } catch { return res.status(400).json({ error: "Invalid reservationId" }); }

    const reservation = await prisma.reservation.findFirst({
      where: { id: reservationId, trip: { id: tripId } },
      include: {
        seat: { select: { id: true, row: true, col: true } },
        trip: {
          select: { originLabel: true, destinationLabel: true, driverName: true, departureDt: true },
        },
      },
    });
    if (!reservation) return res.status(404).json({ error: "Reservation not found for this trip" });

    const depStr = reservation.trip?.departureDt
      ? new Date(reservation.trip.departureDt).toLocaleString("ar-SY")
      : "غير محدد";

    const seatLabel = reservation.seat
      ? (reservation.seat.row != null && reservation.seat.col != null
          ? `صف ${reservation.seat.row} - كرسي ${reservation.seat.col}`
          : `مقعد #${reservation.seat.id}`)
      : "بدون مقعد محدد";

    const paidText = reservation.paid ? "مدفوع" : "غير مدفوع";
    const amountText = typeof reservation.amount === "number"
      ? reservation.amount
      : Number(reservation.amount || 0);

    const docDefinition = {
      content: [
        { text: "رحلة تذكرة", style: "header", alignment: "center" },
        { text: "\n" },
        {
          table: {
            widths: ["*", "*"],
            body: [
              [{ text: "البيان", bold: true, alignment: "center" }, { text: "القيمة", bold: true, alignment: "center" }],
              ["الراكب اسم", reservation.passengerName || "غير محدد"],
              ["الهاتف", reservation.phone || "غير محدد"],
              ["من", reservation.trip?.originLabel || "غير محدد"],
              ["إلى", reservation.trip?.destinationLabel || "غير محدد"],
              ["تاريخ/الرحلة وقت", depStr],
              ["المقعد", seatLabel],
              ["الصعود مكان ", reservation.boardingPoint || "غير محدد"],
              ["المبلغ", `${amountText}`],
              ["الدفع حالة", paidText],
              ["ملاحظات", reservation.notes || "—"],
              ["الحجز رقم", reservation.id.toString()],
            ],
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 10],
        },
        {
          columns: [
            { text: "—", alignment: "right" },
            { qr: `TRIP:${rawTripId}|RES:${rawReservationId}|PN:${reservation.passengerName || ""}`, fit: 100, alignment: "left" },
          ],
        },
        { text: "\n" },
        { text: `السائق: ${reservation.trip?.driverName || "غير محدد"}`, alignment: "right" },
      ],
      defaultStyle: { font: "Arabic", fontSize: 12 },
      styles: { header: { fontSize: 18, bold: true } },
      pageMargins: [30, 30, 30, 30],
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="ticket_trip_${rawTripId}_res_${rawReservationId}.pdf"`);
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (err) {
    console.error("Error generating reservation ticket PDF:", err);
    res.status(500).json({ error: "Failed to generate reservation ticket PDF" });
  }
}

async function getAllBuses(req, res) {
  try {
    const buses = await prisma.busType.findMany({
      include: { seats: true, trips: true },
    });

    // تحويل كل BigInt إلى String
    const busesSafe = JSON.parse(
      JSON.stringify(buses, (_, value) =>
        typeof value === "bigint" ? value.toString() : value
      )
    );

    res.json(busesSafe);
  } catch (error) {
    console.error("Error fetching buses:", error);
    res.status(500).json({ error: "Failed to fetch buses" });
  }
}


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
async function getSeatMap(req, res) {
  try {
    const tripId = toId(req.params.tripId);

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

    const busTypeId = Number(trip.busTypeId ?? trip.busType?.id);
    if (!busTypeId) {
      return res.status(500).json({ message: "Trip busType not resolved" });
    }

    const seats = await prisma.seat.findMany({
      where: { busTypeId },
      orderBy: [{ row: "asc" }, { col: "asc" }],
      select: {
        id: true,
        row: true,
        col: true,
        number: true,
        status: true,
      },
    });

    const reservations = await prisma.reservation.findMany({
      where: { tripId },
      select: {
        id: true,
        passengerName: true,
        seatId: true,
      },
    });

    // ✅ Map بدون typing (JS)
    const reservedMap = new Map();
    for (const r of reservations) {
      reservedMap.set(r.seatId, r);
    }

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
        const r = reservedMap.get(s.id);
        return {
          seatId: s.id,
          row: s.row,
          col: s.col,
          number: s.number,
          status: r ? "reserved" : s.status,
          ...(r && {
            reservationId: r.id.toString(),
            passengerName: r.passengerName,
          }),
        };
      }),
    };

    return res.json(result);
  } catch (e) {
    console.error("Error in getSeatMap:", e);
    return res.status(500).json({
      message: "Error building seat map",
      error: e.message || String(e),
    });
  }
}
// GET /api/ops/trips/:tripId/reservations
async function getTripReservations(req, res) {
  try {
    const tripId = toId(req.params.tripId);

   const reservations = await prisma.reservation.findMany({
     where: { tripId },
     select: {
       id: true,
       passengerName: true,
       phone: true,
       boardingPoint: true,
       notes: true,
       paid: true,
       amount: true,
       seat: { select: { id: true, row: true, col: true } },
     },
     orderBy: [{ id: "asc" }],
   });

   // ✅ حوّلي BigInt → String
   const safeReservations = JSON.parse(
     JSON.stringify(reservations, (_, value) =>
       typeof value === "bigint" ? value.toString() : value
     )
   );

   res.json(safeReservations);


    res.json(
      reservations.map((r) => ({
        id: r.id.toString(),
        passengerName: r.passengerName,
        phone: r.phone,
        boardingPoint: r.boardingPoint,
        notes: r.notes,
        paid: r.paid,
        amount: r.amount,
        createdAt: r.createdAt,
        seat: r.seat
          ? {
              row: r.seat.row,
              col: r.seat.col,
              number: r.seat.number,
            }
          : null,
        creator: r.creator ? { id: r.creator.id, name: r.creator.name } : null,
      }))
    );
  } catch (e) {
    console.error("Error fetching reservations:", e);
    res
      .status(500)
      .json({ message: "Failed to fetch reservations", error: e.message });
  }
}



module.exports = {
  getTripById,
  getAllTrips,
  createTrip,
  updateTrip,
  deleteTrip,
  getTripPassengers,
  getTripPaymentsSummary,
  addPassenger,
  generateTripReportPDF,
  generateReservationTicketPDF,
  getAllBuses,
  getSeatMap,
  getTripReservations,
};

