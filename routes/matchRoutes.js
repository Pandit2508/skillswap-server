import express from "express";
import pool from "../config/db.js";
import { protect } from "../middleware/authMiddleware.js";
import { findCommonSlot, getNextDateForDay } from "../utils/matching.js";
import { scoreCandidate } from "../utils/scoring.js";

const router = express.Router();

/* ================= SUGGESTED MATCHES ================= */
router.get("/suggestions", protect, async (req, res) => {
  const userId = req.user.id;
  const limit = Math.min(Number(req.query.limit) || 10, 50);

  try {
    const meRes = await pool.query(
      `SELECT
        array_agg(DISTINCT so.name) FILTER (WHERE so.name IS NOT NULL) AS skills,
        array_agg(DISTINCT sw.name) FILTER (WHERE sw.name IS NOT NULL) AS skills_wanted,
        json_agg(DISTINCT jsonb_build_object('day', a.day, 'start_time', a.start_time, 'end_time', a.end_time))
          FILTER (WHERE a.day IS NOT NULL) AS availability
       FROM users u
       LEFT JOIN skill_offers sk ON sk.user_id = u.id
       LEFT JOIN skills so ON so.id = sk.offered_skill
       LEFT JOIN user_skills usk ON usk.user_id = u.id
       LEFT JOIN skills sw ON sw.id = usk.skill_id
       LEFT JOIN availability a ON a.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [userId]
    );

    if (!meRes.rows.length) {
      return res.status(404).json({ error: "Complete your profile first" });
    }

    const me = {
      skills: meRes.rows[0].skills || [],
      skills_wanted: meRes.rows[0].skills_wanted || [],
      availability: meRes.rows[0].availability || [],
    };

    if (!me.availability.length) {
      return res.status(400).json({
        error: "Add your availability to your profile to get match suggestions",
      });
    }

    const candidatesRes = await pool.query(
      `SELECT
        u.id, u.name, u.avatar_url, u.location, u.experience,
        array_agg(DISTINCT so.name) FILTER (WHERE so.name IS NOT NULL) AS skills,
        array_agg(DISTINCT sw.name) FILTER (WHERE sw.name IS NOT NULL) AS skills_wanted,
        json_agg(DISTINCT jsonb_build_object('day', a.day, 'start_time', a.start_time, 'end_time', a.end_time))
          FILTER (WHERE a.day IS NOT NULL) AS availability,
        COALESCE(rv.average_rating, 0) AS average_rating,
        COALESCE(rv.review_count, 0)::int AS review_count
       FROM users u
       LEFT JOIN skill_offers sk ON sk.user_id = u.id
       LEFT JOIN skills so ON so.id = sk.offered_skill
       LEFT JOIN user_skills usk ON usk.user_id = u.id
       LEFT JOIN skills sw ON sw.id = usk.skill_id
       LEFT JOIN availability a ON a.user_id = u.id
       LEFT JOIN (
         SELECT reviewee_id, AVG(rating)::numeric AS average_rating, COUNT(*) AS review_count
         FROM reviews GROUP BY reviewee_id
       ) rv ON rv.reviewee_id = u.id
       WHERE u.id <> $1
       GROUP BY u.id, rv.average_rating, rv.review_count`,
      [userId]
    );

    const existingRes = await pool.query(
      `SELECT sender_id, receiver_id FROM match_requests
       WHERE (sender_id = $1 OR receiver_id = $1) AND status IN ('pending', 'accepted')`,
      [userId]
    );
    const alreadyConnected = new Set(
      existingRes.rows.map((r) => (r.sender_id === userId ? r.receiver_id : r.sender_id))
    );

    const suggestions = candidatesRes.rows
      .filter((c) => !alreadyConnected.has(c.id))
      .map((c) => {
        const result = scoreCandidate(me, {
          skills: c.skills || [],
          skills_wanted: c.skills_wanted || [],
          availability: c.availability || [],
          average_rating: c.average_rating,
        });

        if (!result) return null;

        return {
          user: {
            id: c.id,
            name: c.name,
            avatar_url: c.avatar_url,
            location: c.location || "",
            experience: c.experience || "",
            skills: c.skills || [],
            skills_wanted: c.skills_wanted || [],
            average_rating: Number(c.average_rating) || null,
            review_count: c.review_count,
          },
          score: result.score,
          breakdown: result.breakdown,
          bestSlot: result.bestSlot,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    res.json(suggestions);
  } catch (err) {
    console.error("Suggestions error:", err);
    res.status(500).json({ error: "Failed to compute match suggestions" });
  }
});

/* ================= SEND MATCH REQUEST ================= */

router.post("/:receiverId", protect, async (req, res) => {
  const senderId = req.user.id;
  const { receiverId } = req.params;

  if (!receiverId) {
    return res.status(400).json({ error: "receiverId is required" });
  }

  if (Number(receiverId) === senderId) {
    return res.status(400).json({ error: "You cannot send a request to yourself" });
  }

  try {
    /* DUPLICATE CHECK */
    const existing = await pool.query(
      `SELECT id FROM match_requests
       WHERE sender_id = $1 AND receiver_id = $2 AND status = 'pending'`,
      [senderId, receiverId]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Match request already sent" });
    }

    /* FETCH AVAILABILITY */
    const senderAvailability = await pool.query(
      `SELECT day, start_time, end_time FROM availability WHERE user_id = $1`,
      [senderId]
    );

    const receiverAvailability = await pool.query(
      `SELECT day, start_time, end_time FROM availability WHERE user_id = $1`,
      [receiverId]
    );

    const commonSlot = findCommonSlot(
      senderAvailability.rows,
      receiverAvailability.rows
    );

    if (!commonSlot) {
      return res.status(400).json({
        error: "No overlapping time slot found"
      });
    }

    /* INSERT REQUEST */
    const result = await pool.query(
      `INSERT INTO match_requests (sender_id, receiver_id, status)
       VALUES ($1, $2, 'pending') RETURNING *`,
      [senderId, receiverId]
    );

    // Notify the receiver in real time if they're connected.
    const io = req.app.get("io");
    if (io) {
      const senderRes = await pool.query(
        `SELECT id, name, avatar_url FROM users WHERE id = $1`,
        [senderId]
      );

      io.to(`user_${receiverId}`).emit("new_match_request", {
        requestId: result.rows[0].id,
        slot: commonSlot,
        sender: senderRes.rows[0],
        created_at: result.rows[0].created_at,
      });
    }

    res.status(201).json({
      success: true,
      request: result.rows[0],
      slot: commonSlot
    });

  } catch (err) {
    console.error("Send request error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ================= INCOMING ================= */

router.get("/incoming", protect, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT mr.id AS request_id, mr.created_at,
              u.id AS sender_id, u.name, u.bio,
              u.location, u.experience, u.avatar_url
       FROM match_requests mr
       JOIN users u ON u.id = mr.sender_id
       WHERE mr.receiver_id = $1 AND mr.status = 'pending'
       ORDER BY mr.created_at DESC`,
      [userId]
    );

    const requests = result.rows.map((row) => ({
      requestId: row.request_id,
      created_at: row.created_at,
      sender: {
        id: row.sender_id,
        name: row.name,
        bio: row.bio || "",
        location: row.location || "",
        experience: row.experience || "",
        avatar_url: row.avatar_url || null,
      },
    }));

    res.status(200).json(requests);

  } catch (err) {
    console.error("Incoming requests error:", err);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

/* ================= ACCEPT ================= */

router.post("/:id/accept", protect, async (req, res) => {
  const userId = req.user.id;
  const requestId = req.params.id;

  try {
    const requestRes = await pool.query(
      `SELECT * FROM match_requests WHERE id = $1 AND receiver_id = $2`,
      [requestId, userId]
    );

    if (!requestRes.rows.length) {
      return res.status(404).json({ error: "Request not found" });
    }

    const request = requestRes.rows[0];

    const senderAvailability = await pool.query(
      `SELECT day, start_time, end_time FROM availability WHERE user_id = $1`,
      [request.sender_id]
    );

    const receiverAvailability = await pool.query(
      `SELECT day, start_time, end_time FROM availability WHERE user_id = $1`,
      [request.receiver_id]
    );

    const commonSlot = findCommonSlot(
      senderAvailability.rows,
      receiverAvailability.rows
    );

    if (!commonSlot) {
      return res.status(400).json({
        error: "No overlapping time slot found"
      });
    }

    const meetingDate = getNextDateForDay(commonSlot.day);

    const sessionTime = `${meetingDate} ${commonSlot.start_time}`;
    const endTime = `${meetingDate} ${commonSlot.end_time}`;

    const meetingLink = `https://meet.jit.si/skillswap-${requestId}-${Date.now()}`;

    await pool.query(
      `INSERT INTO bookings 
       (user1_id, user2_id, session_time, end_time, meeting_link, status)
       VALUES ($1, $2, $3, $4, $5, 'scheduled')`,
      [
        request.sender_id,
        request.receiver_id,
        sessionTime,
        endTime,
        meetingLink
      ]
    );

    await pool.query(
      `UPDATE match_requests SET status = 'accepted' WHERE id = $1`,
      [requestId]
    );

    const io = req.app.get("io");
    if (io) {
      io.to(`user_${request.sender_id}`).emit("match_request_accepted", {
        requestId,
        meetingLink,
        slot: commonSlot,
      });
    }

    res.json({ success: true, meetingLink, slot: commonSlot });

  } catch (err) {
    console.error("Accept request error:", err);
    res.status(500).json({ error: "Failed to accept request" });
  }
});

/* ================= REJECT ================= */

router.post("/:id/reject", protect, async (req, res) => {
  const userId = req.user.id;
  const requestId = req.params.id;

  try {
    const result = await pool.query(
      `UPDATE match_requests SET status = 'rejected'
       WHERE id = $1 AND receiver_id = $2 RETURNING *`,
      [requestId, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Request not found" });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("Reject request error:", err);
    res.status(500).json({ error: "Failed to reject request" });
  }
});

export default router;
