// controllers/admin.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/* ✅ إنشاء نوع باص جديد */
async function createBusType(req, res) {
  try {
    const { name, seatCount } = req.body;
    if (!name || typeof seatCount !== "number") {
      return res.status(400).json({ message: "name and seatCount required" });
    }

    const bt = await prisma.busType.create({
      data: { name, seatCount },
    });

    res.status(201).json({ message: "Bus type created", busType: bt });
  } catch (e) {
    console.error("Error creating bus type:", e);
    res
      .status(500)
      .json({ message: "Error creating bus type", error: e.message });
  }
}

/* ✅ جلب أنواع الباصات */
async function listBusTypes(req, res) {
  try {
    const list = await prisma.busType.findMany({
      include: { seats: true },
    });

    const shaped = list.map((b) => ({
      id: b.id,
      name: b.name,
      seatCountDeclared: b.seatCount,
      seatCountActual: b.seats.length,
    }));

    res.json(shaped);
  } catch (e) {
    console.error("Error listing bus types:", e);
    res
      .status(500)
      .json({ message: "Error listing bus types", error: e.message });
  }
}

/* ✅ توليد خريطة المقاعد مرنة */
// async function generateSeatMapGrid(req, res) {
//   try {
//     const busTypeId = parseInt(req.params.id, 10);

//     const { rows, leftSeats, rightSeats, lastRowSeats } = req.body;
//     if (!rows || !leftSeats || !rightSeats || !lastRowSeats) {
//       return res
//         .status(400)
//         .json({
//           message: "rows, leftSeats, rightSeats, lastRowSeats required",
//         });
//     }

//     // ✅ تحقق من الحجوزات
//     const linkedReservations = await prisma.reservation.count({
//       where: { seat: { busTypeId } },
//     });
//     if (linkedReservations > 0) {
//       return res.status(400).json({
//         message: "لا يمكن إعادة توليد المقاعد لأن هناك حجوزات مرتبطة",
//       });
//     }

//     await prisma.seat.deleteMany({ where: { busTypeId } });

//     const data = [];
//     let counter = 1;

//     // 🟢 الصفوف الوسطية
//     for (let r = 1; r < rows; r++) {
//       // يسار
//       for (let c = 1; c <= leftSeats; c++) {
//         data.push({ busTypeId, row: r, col: c, number: counter++ });
//       }

//       // يمين (بخلي أعمدتهم تبدأ بعد الممر)
//       for (let c = 1; c <= rightSeats; c++) {
//         data.push({
//           busTypeId,
//           row: r,
//           col: leftSeats + 1 + c, // +1 للممر
//           number: counter++,
//         });
//       }
//     }

//     // 🟢 الصف الأخير
//     const lastRow = rows;
//     for (let c = 1; c <= lastRowSeats; c++) {
//       data.push({ busTypeId, row: lastRow, col: c, number: counter++ });
//     }

//     await prisma.seat.createMany({ data, skipDuplicates: true });

//     res.json({
//       message: "Seat map generated (flexible layout)",
//       rows,
//       created: data.length,
//     });
//   } catch (e) {
//     res
//       .status(500)
//       .json({ message: "Error generating seat map", error: e.message });
//   }
// }


 async function generateSeatMapGrid(req, res) {
  const busTypeId = parseInt(req.params.id, 10);
  const { rows, leftSeats, rightSeats, lastRowSeats } = req.body;

  try {
    // 🟢 تحديث إعدادات الباص
    await prisma.busType.update({
      where: { id: busTypeId },
      data: {
        rows,
        leftSeats,
        rightSeats,
        lastRowSeats,
      },
    });

    // 🟢 حذف المقاعد القديمة (إذا موجودة) وإعادة توليدهم
    await prisma.seat.deleteMany({ where: { busTypeId } });

    let seatNumber = 1;
    for (let r = 1; r <= rows; r++) {
      // يسار
      for (let c = 1; c <= leftSeats; c++) {
        await prisma.seat.create({
          data: {
            number: seatNumber++,
            row: r,
            col: c,
            status: "available",
            busTypeId,
          },
        });
      }
      
      // يمين
      for (let c = 1; c <= rightSeats; c++) {
        await prisma.seat.create({
          data: {
            number: seatNumber++,
            row: r,
            col: leftSeats + c,
            status: "available",
            busTypeId,
          },
        });
      }
    }

    // الصف الأخير
    for (let c = 1; c <= lastRowSeats; c++) {
      await prisma.seat.create({
        data: {
          number: seatNumber++,
          row: rows + 1,
          col: c,
          status: "available",
          busTypeId,
        },
      });
    }

    res.json({ message: "✅ تم توليد المقاعد وحفظ التخطيط" });
  } catch (e) {
    res
      .status(500)
      .json({ message: "Error generating seat map", error: e.message });
  }
}

/* ✅ جلب المقاعد لباص */
async function listSeatsByBusType(req, res) {
  try {
    const busTypeId = parseInt(req.params.id, 10);

    const seats = await prisma.seat.findMany({
      where: { busTypeId },
      orderBy: [
        { row: "asc" }, { col: "asc" }],
    });

    res.json(seats);
  } catch (e) {
    console.error("Error listing seats:", e);
    res.status(500).json({ message: "Error listing seats", error: e.message });
  }
}

/* ✅ تغيير حالة مقعد */
async function toggleSeatStatus(req, res) {
  try {
    const seatId = parseInt(req.params.id, 10);
    const { status } = req.body;

    // التحقق من القيم المسموح بها
    if (!["available", "blocked", "reserved", "held"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    // تحديث حالة المقعد
    const seat = await prisma.seat.update({
      where: { id: seatId },
      data: { status },
    });

    res.json({ message: "Seat status updated", seat });
  } catch (e) {
    console.error("Error toggling seat status:", e);
    res.status(500).json({ message: "Error updating seat", error: e.message });
  }
}

// ✅ توليد المقاعد مع حفظ التخطيط



module.exports = {
  createBusType,
  listBusTypes,
  generateSeatMapGrid,
  listSeatsByBusType,
  toggleSeatStatus,
};
