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
import bookingRoutes from "./routes/bookingRoutes.js";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

/* ================= CORS ================= */
app.use(cors({
  origin: "https://skillswap-client-yv4s.vercel.app",
  credentials: true,
}));

/* ================= MIDDLEWARE ================= */
app.use(cookieParser());
app.use(express.json());

/* ================= PASSPORT ================= */
app.use(passport.initialize());

/* ================= ROUTES ================= */
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/match-requests", matchRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/bookings", bookingRoutes);

/* ================= TEST ROUTE ================= */
app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

/* ================= SETTINGS ================= */
app.disable("etag");