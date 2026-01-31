import express from "express";
import pool from "../config/db.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/* =========================================
   GET UPCOMING MEETINGS
========================================= */
router.get("/my-meetings", protect, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `
      SELECT 
        b.id,
        b.session_time,
        b.meeting_link,
        u.id AS other_user_id,
        u.name,
        u.bio,
        u.location,
        u.experience
      FROM bookings b
      JOIN users u
        ON (u.id = CASE 
            WHEN b.user1_id = $1 THEN b.user2_id 
            ELSE b.user1_id 
        END)
      WHERE b.user1_id = $1 OR b.user2_id = $1
      ORDER BY b.session_time ASC
      `,
      [userId]
    );

    const meetings = [];

    for (const row of result.rows) {
      const skillsOffered = await pool.query(
        `SELECT s.name
         FROM skill_offers so
         JOIN skills s ON s.id = so.offered_skill
         WHERE so.user_id = $1`,
        [row.other_user_id]
      );

      const skillsWanted = await pool.query(
        `SELECT s.name
         FROM user_skills us
         JOIN skills s ON s.id = us.skill_id
         WHERE us.user_id = $1`,
        [row.other_user_id]
      );

      const availability = await pool.query(
        `SELECT day, start_time, end_time
         FROM availability
         WHERE user_id = $1`,
        [row.other_user_id]
      );

      meetings.push({
        id: row.id,
        session_time: row.session_time,
        meeting_link: row.meeting_link,
        person: {
          id: row.other_user_id,
          name: row.name,
          bio: row.bio || "",
          location: row.location || "",
          experience: row.experience || "",
          skills: skillsOffered.rows.map(r => r.name),
          skills_wanted: skillsWanted.rows.map(r => r.name),
          availability: availability.rows
        }
      });
    }

    res.json(meetings);
  } catch (err) {
    console.error("Fetch meetings error:", err);
    res.status(500).json({ error: "Failed to fetch meetings" });
  }
});


export default router;
