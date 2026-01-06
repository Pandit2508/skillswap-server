import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from "passport";

import "./config/passport.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import matchRoutes from "./routes/matchRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";

dotenv.config();

const app = express();

/* ================= CORS ================= */
app.use(
  cors({
    origin: "http://localhost:3000", // frontend
    credentials: true,               // allow cookies
  })
);

/* ================= MIDDLEWARE ================= */
app.use(cookieParser());
app.use(express.json());

/* ================= PASSPORT ================= */
// ❌ NO express-session (JWT-based auth)
app.use(passport.initialize());

/* ================= ROUTES ================= */
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/match-requests", matchRoutes);
app.use("/api/profile", profileRoutes);

/* ================= SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
