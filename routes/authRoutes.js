import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import {
  signup,
  login,
  forgotPassword,
  resetPassword,
  logout
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// ------------------- REGULAR AUTH -------------------

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

router.get("/me", protect, (req, res) => {
  res.json({ message: "Welcome!", user: req.user });
});

// ------------------- GOOGLE OAUTH -------------------

// Start Google OAuth flow
router.get("/google", passport.authenticate("google", {
  scope: ["profile", "email"],
}));

// Google OAuth callback
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login",
    session: false,
  }),
  (req, res) => {
    const user = req.user;

    // Generate token manually
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "3d",
    });

    // Set token in cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // true in production with HTTPS
      sameSite: "Lax",
      maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
    });

    // Redirect to client for post-login handling
    res.redirect("http://localhost:3000/google-redirect");
  }
);

export default router;
