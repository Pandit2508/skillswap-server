import jwt from "jsonwebtoken";

/**
 * Middleware to protect routes that require authentication.
 * Supports JWT from cookies or Authorization header.
 */
export const protect = (req, res, next) => {
  try {
    let token = null;

    // 🔹 Get token from cookie
    if (req.cookies?.token) {
      token = req.cookies.token;
    }

    // 🔹 OR from Authorization header
    else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res
        .status(401)
        .json({ error: "Unauthorized: No token provided" });
    }

    // 🔹 Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔹 Attach user info to request
    req.user = {
      id: decoded.id,       // ✅ matches all your routes
      email: decoded.email // optional, safe
    };

    return next();
  } catch (err) {
    console.error("JWT verification error:", err.message);
    return res
      .status(401)
      .json({ error: "Unauthorized: Invalid or expired token" });
  }
};
