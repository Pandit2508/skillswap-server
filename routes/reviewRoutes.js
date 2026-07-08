import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getEligibleSessions,
  createReview,
  getUserReviews,
} from "../controllers/reviewController.js";

const router = express.Router();

router.get("/eligible", protect, getEligibleSessions);
router.post("/:bookingId", protect, createReview);
router.get("/user/:userId", getUserReviews);

export default router;
