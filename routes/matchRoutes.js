import express from "express";
import pool from "../config/db.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/* =====================================================
   HELPER: FIND COMMON SLOT
===================================================== */
const findCommonSlot = (senderSlots, receiverSlots) => {
  for (let s of senderSlots) {
    for (let r of receiverSlots) {
      const senderDay = s.day.toLowerCase().trim();
      const receiverDay = r.day.toLowerCase().trim();

      if (senderDay === receiverDay) {
        const start = s.start_time > r.start_time ? s.start_time : r.start_time;
        const end = s.end_time < r.end_time ? s.end_time : r.end_time;

        if (start < end) {
          return {
            day: senderDay,
            start_time: start,
            end_time: end
          };
        }
      }
    }
  }
  return null;
};

/* =====================================================
   HELPER: CONVERT DAY TO REAL DATE
===================================================== */
const getNextDateForDay = (dayName) => {
  const days = [
    "sunday","monday","tuesday","wednesday",
    "thursday","friday","saturday"
  ];

  const today = new Date();
  const targetDay = days.indexOf(dayName.toLowerCase());

  let diff = targetDay - today.getDay();
  if (diff < 0) diff += 7;

  const nextDate = new Date(today);
  nextDate.setDate(today.getDate() + diff);

  return nextDate.toISOString().split("T")[0]; // YYYY-MM-DD
};

/* =====================================================
   1️⃣ SEND MATCH REQUEST (CHECK OVERLAP FIRST)
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

    const senderAvailability = await pool.query(
      `SELECT day, start_time, end_time FROM availability WHERE user_id = $1`,
      [senderId]
    );

    const receiverAvailability = await pool.query(
      `SELECT day, start_time, end_time FROM availability WHERE user_id = $1`,
      [receiver_id]
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
   2️⃣ GET INCOMING REQUESTS
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
      const availability = await pool.query(
        `SELECT day, start_time, end_time FROM availability WHERE user_id = $1`,
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
   3️⃣ ACCEPT REQUEST (BOOK COMMON SLOT)
===================================================== */
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
      `
      INSERT INTO bookings 
      (user1_id, user2_id, session_time, end_time, meeting_link, status)
      VALUES ($1, $2, $3, $4, $5, 'scheduled')
      `,
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

    res.json({
      success: true,
      meetingLink,
      slot: commonSlot
    });

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
      `UPDATE match_requests SET status = 'rejected'
       WHERE id = $1 AND receiver_id = $2 RETURNING *`,
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
