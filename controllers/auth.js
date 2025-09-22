const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function signup(req, res) {
  try {
    const { name, phone, role, password } = req.body;
    if (!["admin", "booking", "security", "ops"].includes(role)) {
      return res
        .status(400)
        .json({ message: "Invalid role", timestamp: new Date().toISOString() });
    }
    const existingUser = await prisma.user.findFirst({ where: { phone } });
    if (existingUser) {
      return res.status(400).json({
        message: "User with this phone already exists",
        timestamp: new Date().toISOString(),
      });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, phone, role, passwordHash: hashedPassword },
    });
    console.log("Raw user object:", user); // تسجيل الكائن الخام للتحقق من الحقول
    // تحويل الحقول التي قد تحتوي على BigInt يدويًا
    const userResponse = {
      id: user.id.toString(),
      name: user.name,
      phone: user.phone,
      role: user.role,
      passwordHash: user.passwordHash,
      refreshTokens: user.refreshTokens,
      // تحويل الحقول الزمنية إذا كانت موجودة
      createdAt: user.createdAt ? user.createdAt.toISOString() : undefined,
      updatedAt: user.updatedAt ? user.updatedAt.toISOString() : undefined,
    };
    res.status(201).json({
      message: "User created successfully",
      user: userResponse,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Signup error:", error); // تسجيل الخطأ
    res.status(500).json({
      message: "Error creating user",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

async function login(req, res) {
  try {
    const { name, password } = req.body; // 👈 بدال phone صار name
    const user = await prisma.user.findFirst({ where: { name } }); // 👈 البحث بالـ name
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        message: "Invalid name or password",
        timestamp: new Date().toISOString(),
      });
    }

    const accessToken = jwt.sign(
      { id: user.id.toString(), role: user.role },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "100d" }
    );

    const refreshToken = jwt.sign(
      { id: user.id.toString() },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "100d" }
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokens: { push: refreshToken } },
    });

    res.json({
      message: "Login successful",
      accessToken,
      refreshToken,
      role: user.role,
      user: {
        id: user.id.toString(),
        name: user.name,
        phone: user.phone,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      message: "Error logging in",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}


async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || !user.refreshTokens.includes(refreshToken)) {
      return res.status(401).json({
        message: "Invalid refresh token",
        timestamp: new Date().toISOString(),
      });
    }
    const newAccessToken = jwt.sign(
      { id: user.id.toString(), role: user.role }, // تحويل id إلى string
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "100d" }
    );
    res.json({
      message: "Token refreshed successfully",
      accessToken: newAccessToken,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Refresh error:", error); // إضافة تسجيل للخطأ
    res.status(500).json({
      message: "Error refreshing token",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

async function logout(req, res) {
  try {
    const { refreshToken } = req.body;

    // 👇 هون ما في داعي تعملي jwt.verify مرة تانية
    const user = await prisma.user.findUnique({
      where: { id: BigInt(req.user.id) },
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await prisma.user.update({
      where: { id: BigInt(req.user.id) },
      data: {
        refreshTokens: {
          set: user.refreshTokens.filter((t) => t !== refreshToken),
        },
      },
    });

    res.json({
      message: "Logged out successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      message: "Error logging out",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

function serializeBigInt(obj) {
  return JSON.parse(
    JSON.stringify(obj, (key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

module.exports = { signup, login, refresh, logout };
