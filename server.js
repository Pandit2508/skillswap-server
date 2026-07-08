import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from "passport";
import jwt from "jsonwebtoken";

import "./config/passport.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import matchRoutes from "./routes/matchRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";

dotenv.config();

const app = express();
// Trust exactly one proxy hop (Render's load balancer) rather than the
// whole chain — accurate for this deployment and required by
// express-rate-limit's IP-spoofing safety check.
app.set("trust proxy", 1);

const CLIENT_ORIGIN = "https://skillswap-client-yv4s.vercel.app";

/* ================= CORS ================= */
app.use(cors({
  origin: CLIENT_ORIGIN,
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
app.use("/api/reviews", reviewRoutes);

/* ================= TEST ROUTE ================= */
app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

/* ================= SOCKET.IO =================
   Real-time delivery for match-request notifications. Clients
   authenticate the socket connection with their existing JWT
   (from the cookie or passed explicitly) and join a private room
   keyed by their user id, so events can be targeted per-user
   instead of broadcast to everyone.
================================================= */
const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    credentials: true,
  },
});

io.use((socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.cookie
        ?.split("; ")
        .find((c) => c.startsWith("token="))
        ?.split("=")[1];

    if (!token) {
      return next(new Error("Not authenticated"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    next(new Error("Not authenticated"));
  }
});

io.on("connection", (socket) => {
  socket.join(`user_${socket.userId}`);

  socket.on("disconnect", () => {
    // no-op: room membership is cleaned up automatically
  });
});

// Exposed so route handlers can emit events without importing this
// file directly (avoids circular imports between server.js and routes).
app.set("io", io);

/* ================= SERVER ================= */
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

/* ================= SETTINGS ================= */
app.disable("etag");