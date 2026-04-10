import jwt from "jsonwebtoken";
import pool from "../config/db.js";

export const protect = async (req, res, next) => {
  try {
    let token;

    // 🔥 1. Check Authorization header (PRIMARY)
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer")) {
      token = authHeader.split(" ")[1];
    }

    // 🔥 2. Fallback to cookie (optional)
    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }

    // ❌ No token anywhere
    if (!token) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.error("JWT error:", err.message);

      // 🔥 Clear cookie ONLY if cookie exists
      if (req.cookies?.token) {
        res.clearCookie("token", {
          httpOnly: true,
          sameSite: "None",
          secure: process.env.NODE_ENV === "production",
          path: "/",
        });
      }

      return res.status(401).json({
        message: "Session expired. Please login again.",
      });
    }

    // ❌ Invalid payload
    if (!decoded?.id) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    // 👤 Fetch user
    const userRes = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [decoded.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    // ✅ Attach user
    req.user = userRes.rows[0];

    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ message: "Authentication failed" });
  }
};