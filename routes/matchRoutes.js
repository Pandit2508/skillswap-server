import express from "express";
const router = express.Router();

// Dummy POST handler to simulate sending a match request
router.post("/", (req, res) => {
  const { receiver_id } = req.body;
  if (!receiver_id) {
    return res.status(400).json({ error: "receiver_id is required" });
  }

  res.status(200).json({ message: "Match request sent to user " + receiver_id });
});

export default router;
