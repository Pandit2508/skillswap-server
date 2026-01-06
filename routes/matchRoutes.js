import express from "express";
import pool from "../config/db.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/* =====================================================
   1️⃣ SEND MATCH REQUEST
===================================================== */
router.post("/", protect, async (req, res) => {
  const senderId = req.user.id;
  const { receiver_id } = req.body;

  if (!receiver_id) {
    return res.status(400).json({ error: "receiver_id is required" });
  }

  if (receiver_id === senderId) {
    return res.status(400).json({ error: "You cannot send a request to yourself" });
  }

  try {
    const existing = await pool.query(
      `
      SELECT id FROM match_requests
      WHERE sender_id = $1 AND receiver_id = $2 AND status = 'pending'
      `,
      [senderId, receiver_id]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Match request already sent" });
    }

    const result = await pool.query(
      `
      INSERT INTO match_requests (sender_id, receiver_id, status)
      VALUES ($1, $2, 'pending')
      RETURNING *
      `,
      [senderId, receiver_id]
    );

    res.status(201).json({
      success: true,
      request: result.rows[0],
    });
  } catch (err) {
    console.error("❌ Send request error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* =====================================================
   2️⃣ GET INCOMING REQUESTS (🔥 FULL PROFILE DATA)
===================================================== */
router.get("/incoming", protect, async (req, res) => {
  const userId = req.user.id;

  try {
    const baseQuery = `
      SELECT
        mr.id AS request_id,
        mr.created_at,
        u.id AS sender_id,
        u.name,
        u.bio,
        u.location,
        u.experience,
        u.avatar_url
      FROM match_requests mr
      JOIN users u ON u.id = mr.sender_id
      WHERE mr.receiver_id = $1
        AND mr.status = 'pending'
      ORDER BY mr.created_at DESC
    `;

    const baseResult = await pool.query(baseQuery, [userId]);

    const requests = [];

    for (const row of baseResult.rows) {
      const skillsOffered = await pool.query(
        `
        SELECT s.name
        FROM skill_offers so
        JOIN skills s ON s.id = so.offered_skill
        WHERE so.user_id = $1
        `,
        [row.sender_id]
      );

      const skillsWanted = await pool.query(
        `
        SELECT s.name
        FROM user_skills us
        JOIN skills s ON s.id = us.skill_id
        WHERE us.user_id = $1
        `,
        [row.sender_id]
      );

      const availability = await pool.query(
        `
        SELECT day, start_time, end_time
        FROM availability
        WHERE user_id = $1
        `,
        [row.sender_id]
      );

      requests.push({
        requestId: row.request_id,
        created_at: row.created_at,
        sender: {
          id: row.sender_id,
          name: row.name,
          bio: row.bio || "",
          location: row.location || "",
          experience: row.experience || "",
          avatar_url: row.avatar_url,
          skills: skillsOffered.rows.map(r => r.name),
          skills_wanted: skillsWanted.rows.map(r => r.name),
          availability: availability.rows,
        },
      });
    }

    res.status(200).json(requests);
  } catch (err) {
    console.error("❌ Incoming requests error:", err);
    res.status(500).json({ error: "Failed to fetch incoming requests" });
  }
});

/* =====================================================
   3️⃣ ACCEPT REQUEST
===================================================== */
router.post("/:id/accept", protect, async (req, res) => {
  const userId = req.user.id;
  const requestId = req.params.id;

  try {
    const result = await pool.query(
      `
      UPDATE match_requests
      SET status = 'accepted'
      WHERE id = $1 AND receiver_id = $2
      RETURNING *
      `,
      [requestId, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Request not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Accept request error:", err);
    res.status(500).json({ error: "Failed to accept request" });
  }
});

/* =====================================================
   4️⃣ REJECT REQUEST
===================================================== */
router.post("/:id/reject", protect, async (req, res) => {
  const userId = req.user.id;
  const requestId = req.params.id;

  try {
    const result = await pool.query(
      `
      UPDATE match_requests
      SET status = 'rejected'
      WHERE id = $1 AND receiver_id = $2
      RETURNING *
      `,
      [requestId, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Request not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Reject request error:", err);
    res.status(500).json({ error: "Failed to reject request" });
  }
});

export default router;
