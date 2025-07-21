import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import cors from "cors";
import './config/passport.js';
import passport  from "passport";
import authRoutes from "./routes/authRoutes.js";
import cookieParser from "cookie-parser";
import userRoutes from "./routes/userRoutes.js";
import matchRoutes from "./routes/matchRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";

dotenv.config();
const app = express();
app.use(cookieParser());

app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());

// Add session middleware for passport
app.use(
  session({
    secret: "random secret", // not used for JWT, just required by passport
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/match-requests", matchRoutes);

app.use("/api/profile", profileRoutes);


app.listen(5000, () => console.log("Server running on http://localhost:5000"));
