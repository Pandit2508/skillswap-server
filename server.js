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

/* ================= CORS ================= */
const allowedOrigins = [
  "http://localhost:3000",
  "https://skillswap-client-yv4s.vercel.app",
  "https://skillswap-client-yr53.vercel.app", // 👈 your CURRENT deployed frontend
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // Postman etc.

      if (allowedOrigins.includes(origin)) {
        return callback(null, origin); // ✅ MUST return origin, not true
      } else {
        console.log("❌ Blocked by CORS:", origin);
        return callback(new Error("Not allowed by CORS")); // ✅ proper rejection
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

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
app.use("/api/bookings", bookingRoutes); // ✅ moved BEFORE listen

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