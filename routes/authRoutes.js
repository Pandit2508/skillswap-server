import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
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
   REGULAR AUTH
========================================================= */

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

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
 * STEP 1: Redirect user to Google
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
 * - Passport authenticates user
 * - JWT stored in HttpOnly cookie
 * - Redirect to frontend
 */
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "http://localhost:3000/login",
    session: false,
  }),
  (req, res) => {
    try {
      const user = req.user;

      const token = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET,
        {
          expiresIn: process.env.JWT_EXPIRES_IN || "3d",
        }
      );

      // ✅ FINAL CORRECT COOKIE CONFIG
      res.cookie("token", token, {
        httpOnly: true,
        sameSite: "None",   // required for cross-origin
        secure: false,      // localhost only
        path: "/",          // 🔥 IMPORTANT
        maxAge: 3 * 24 * 60 * 60 * 1000,
      });

      res.redirect("http://localhost:3000/google-redirect");
    } catch (err) {
      console.error("Google OAuth error:", err);
      res.redirect("http://localhost:3000/login");
    }
  }
);

export default router;
