import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getProfile,
  createProfile,
} from "../controllers/profileController.js";

const router = express.Router();

/**
 * GET /api/profile
 * Returns user's profile
 * Always responds with a predictable shape
 */
router.get("/", protect, async (req, res, next) => {
  try {
    const profile = await getProfile(req, res);

    // If controller already sent response, stop
    if (res.headersSent) return;

    // Fallback (safety)
    res.status(200).json({
      profile: profile || null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/profile
 * Create or update profile
 */
router.post("/", protect, createProfile);

export default router;
