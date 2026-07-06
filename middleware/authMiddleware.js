import jwt from "jsonwebtoken";
import pool from "../config/db.js";

const clearAuthCookie = (res) => {
  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
  };
  if (process.env.COOKIE_DOMAIN) {
    options.domain = process.env.COOKIE_DOMAIN;
  }
  res.clearCookie("token", options);
};

export const protect = async (req, res, next) => {
  try {
    let token = req.cookies?.token || null;

    // Fallback to Authorization header for non-cookie clients
    const authHeader = req.headers.authorization;
    if (!token && authHeader?.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      clearAuthCookie(res);
      return res.status(401).json({
        message: "Session expired. Please login again.",
      });
    }

    if (!decoded?.id) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    const userRes = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [decoded.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    req.user = userRes.rows[0];
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ message: "Authentication failed" });
  }
};
