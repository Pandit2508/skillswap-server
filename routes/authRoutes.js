import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import {
  signup,
  login,
  forgotPassword,
  resetPassword,
  logout,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/* =========================================================
   RATE LIMITING
   Auth endpoints are the highest-value brute-force targets,
   so they get a stricter limit than the rest of the API.
========================================================= */

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});

/* =========================================================
   REGULAR AUTH
========================================================= */

router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);
router.post("/logout", logout);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password/:token", authLimiter, resetPassword);

/* =========================================================
   AUTH CHECK
========================================================= */

router.get("/me", protect, (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
});

/* =========================================================
   GOOGLE OAUTH
========================================================= */

/**
 * STEP 1: Redirect to Google
 */
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

/**
 * STEP 2: Google callback
 */
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.CLIENT_URL}/login`,
    session: false,
  }),
  (req, res) => {
    try {
      if (!req.user) {
        return res.redirect(`${process.env.CLIENT_URL}/login`);
      }

      const token = jwt.sign(
        { id: req.user.id },
        process.env.JWT_SECRET,
        { expiresIn: "2d" }
      );

      // Token is passed via URL (not a cookie) since this is a
      // cross-domain redirect from Google back to the client.
      return res.redirect(
        `${process.env.CLIENT_URL}/google-redirect?token=${token}`
      );
    } catch (err) {
      console.error("Google OAuth error:", err);
      return res.redirect(`${process.env.CLIENT_URL}/login`);
    }
  }
);

export default router;