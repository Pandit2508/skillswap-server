import express from "express";
import pool from "../config/db.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ================= HELPERS ================= */

const normalizeDay = (day) => {
  const map = {
    sun: "sunday",
    mon: "monday",
    tue: "tuesday",
    wed: "wednesday",
    thu: "thursday",
    fri: "friday",
    sat: "saturday",
  };
  return map[day.toLowerCase().slice(0, 3)] || day.toLowerCase();
};

const toMinutes = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const toTime = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const findCommonSlot = (senderSlots, receiverSlots) => {
  for (let s of senderSlots) {
    for (let r of receiverSlots) {
      const senderDay = normalizeDay(s.day);
      const receiverDay = normalizeDay(r.day);

      if (senderDay === receiverDay) {
        const sStart = toMinutes(s.start_time);
        const sEnd = toMinutes(s.end_time);
        const rStart = toMinutes(r.start_time);
        const rEnd = toMinutes(r.end_time);

        const start = Math.max(sStart, rStart);
        const end = Math.min(sEnd, rEnd);

        if (start < end) {
          return {
            day: senderDay,
            start_time: toTime(start),
            end_time: toTime(end),
          };
        }
      }
    }
  }
  return null;
};

const getNextDateForDay = (dayName) => {
  const days = [
    "sunday","monday","tuesday","wednesday",
    "thursday","friday","saturday"
  ];

  const today = new Date();
  const targetDay = days.indexOf(normalizeDay(dayName));

  let diff = targetDay - today.getDay();
  if (diff < 0) diff += 7;

  const nextDate = new Date(today);
  nextDate.setDate(today.getDate() + diff);

  return nextDate.toISOString().split("T")[0];
};

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
    
    console.log("Sender:", senderAvailability.rows);
console.log("Receiver:", receiverAvailability.rows);
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

    res.status(201).json({
      success: true,
      request: result.rows[0],
      slot: commonSlot
    });

  } catch (err) {
    console.error("❌ Send request error:", err);
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

    res.json(result.rows);
  } catch (err) {
    console.error(err);
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

    res.json({ success: true, meetingLink, slot: commonSlot });

  } catch (err) {
    console.error(err);
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
    console.error(err);
    res.status(500).json({ error: "Failed to reject request" });
  }
});

export default router;