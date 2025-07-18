import jwt from "jsonwebtoken";

export const protect = (req, res, next) => {
const token = req.cookies?.token || (req.headers.authorization?.split(" ")[1]);

  if (!token) {
    return res.status(401).json({ error: "Not authorized, no token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token is invalid or expired" });
  }
};