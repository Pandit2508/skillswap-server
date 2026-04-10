import jwt from "jsonwebtoken";
import pool from "../config/db.js";

export const protect = async (req, res, next) => {
  try {
    let token = null;

    // 🔥 COOKIE FIRST (your system is cookie-based now)
    if (req.cookies?.token) {
      token = req.cookies.token;
    }

    // 🔥 Optional fallback (only if you REALLY still want it)
    const authHeader = req.headers.authorization;
    if (!token && authHeader && authHeader.startsWith("Bearer")) {
      token = authHeader.split(" ")[1];
    }

    // ❌ No token
    if (!token) {
      console.log("❌ No token found");
      return res.status(401).json({ message: "Not authenticated" });
    }

    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.error("❌ JWT error:", err.message);

      // 🔥 CLEAR COOKIE PROPERLY (must match config)
      res.clearCookie("token", {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        path: "/",
        domain: ".onrender.com", // 🔥 IMPORTANT
      });

      return res.status(401).json({
        message: "Session expired. Please login again.",
      });
    }

    if (!decoded?.id) {
      console.log("❌ Invalid token payload");
      return res.status(401).json({ message: "Invalid token payload" });
    }

    // 👤 Fetch user
    const userRes = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [decoded.id]
    );

    if (userRes.rows.length === 0) {
      console.log("❌ User not found");
      return res.status(401).json({ message: "User no longer exists" });
    }

    // ✅ Attach user
    req.user = userRes.rows[0];

    console.log("✅ Authenticated user:", req.user.id);

    next();
  } catch (err) {
    console.error("🔥 Auth middleware error:", err);
    return res.status(401).json({ message: "Authentication failed" });
  }
};