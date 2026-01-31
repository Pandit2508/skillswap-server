import jwt from "jsonwebtoken";
import pool from "../config/db.js";

export const protect = async (req, res, next) => {
  try {
    const token = req.cookies?.token;

    // 🔴 No token at all
    if (!token) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    let decoded;

    // 🔐 Verify JWT
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // 🔥 Token expired / invalid → clear cookie
      res.clearCookie("token", {
        httpOnly: true,
        sameSite: "None",
        secure: false, // true in production (HTTPS)
        path: "/",
      });

      return res.status(401).json({
        message: "Session expired. Please login again.",
      });
    }

    // 🔴 Token verified but no user id (extra safety)
    if (!decoded?.id) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    // 👤 Fetch user (same shape for normal + Google login)
    const userRes = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [decoded.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    // ✅ Attach clean user to request
    req.user = userRes.rows[0];

    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ message: "Authentication failed" });
  }
};
