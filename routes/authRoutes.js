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
 */
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.CLIENT_URL}/login`,
    session: false,
  }),
  (req, res) => {
    console.log("🔥 GOOGLE CALLBACK HIT");
    console.log("USER:", req.user);

    try {
      if (!req.user) {
        console.log("❌ No user from Google");
        return res.redirect(`${process.env.CLIENT_URL}/login`);
      }

      const isProd = process.env.NODE_ENV === "production";

      const token = jwt.sign(
        { id: req.user.id },
        process.env.JWT_SECRET,
        { expiresIn: "2d" }
      );

      res.cookie("token", token, {
        httpOnly: true,
        sameSite: isProd ? "None" : "Lax",
        secure: isProd,
        path: "/",
      });

      return res.redirect(`${process.env.CLIENT_URL}/google-redirect`);
    } catch (err) {
      console.error("💥 Google OAuth ERROR FULL:", err);
      return res.redirect(`${process.env.CLIENT_URL}/login`);
    }
  }
);

export default router;