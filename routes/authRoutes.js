import express from "express";
import { signup, login } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);

router.get("/me", protect, (req, res) => {
  res.json({ message: "Welcome!", user: req.user });
});

export default router;

