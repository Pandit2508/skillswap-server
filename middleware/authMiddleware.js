import jwt from "jsonwebtoken";

/**
 * Middleware to protect routes that require authentication.
 * Extracts JWT token from cookies or Authorization header.
 */
export const protect = (req, res, next) => {
  try {
    // Try to get token from cookie or Authorization header
    const token =
      req.cookies?.token ||
      (req.headers.authorization?.startsWith("Bearer ") &&
        req.headers.authorization.split(" ")[1]);
     
        
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user info to request object for downstream use
    req.user = {
      userId: decoded.id,
      email: decoded.email, // only if you include email in your token payload
    };

    next(); // Move to next middleware or controller
  } catch (err) {
    console.error("JWT verification error:", err.message);
    return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  }
};

