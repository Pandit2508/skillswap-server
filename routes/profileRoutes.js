// routes/profileRoute.js
import express from "express";
import getProfile from "../controllers/getProfile.js";
import {protect} from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getProfile); // GET /api/profile



export default router;
