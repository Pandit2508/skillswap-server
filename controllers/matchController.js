import pool from "../config/db.js";

/* ======================================================
   HELPER: NORMALIZE DAY
====================================================== */
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

/* ======================================================
   HELPER: TIME → MINUTES
====================================================== */
const toMinutes = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const toTime = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/* ======================================================
   HELPER: FIND COMMON SLOT (FIXED)
====================================================== */
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

/* ======================================================
   HELPER: CONVERT DAY + TIME → TIMESTAMP
====================================================== */
const getNextDateTime = (dayName, time) => {
  const days = [
    "sunday","monday","tuesday","wednesday",
    "thursday","friday","saturday"
  ];

  const today = new Date();
  const targetDay = days.indexOf(normalizeDay(dayName));
  const currentDay = today.getDay();

  let diff = targetDay - currentDay;
  if (diff <= 0) diff += 7;

  const nextDate = new Date(today);
  nextDate.setDate(today.getDate() + diff);

  const [hours, minutes] = time.split(":").map(Number);
  nextDate.setHours(hours, minutes, 0, 0);

  return nextDate;
};

/* ======================================================
   SEND MATCH REQUEST
====================================================== */
export const sendMatchRequest = async (req, res) => {
  const senderId = req.user.id;
  const { receiverId } = req.params;

  if (senderId === Number(receiverId)) {
    return res.status(400).json({ error: "You cannot send a request to yourself" });
  }

  try {
    /* ---------- CHECK DUPLICATE ---------- */
    const existing = await pool.query(
      `SELECT id FROM match_requests
       WHERE sender_id = $1 AND receiver_id = $2 AND status = 'pending'`,
      [senderId, receiverId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Request already sent" });
    }

    /* ---------- FETCH AVAILABILITY ---------- */
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

    /* ---------- CREATE REQUEST ---------- */
    await pool.query(
      `INSERT INTO match_requests (sender_id, receiver_id, status)
       VALUES ($1, $2, 'pending')`,
      [senderId, receiverId]
    );

    res.status(201).json({
      success: true,
      message: "Match request sent",
      slot: commonSlot
    });

  } catch (err) {
    console.error("Send request error:", err);
    res.status(500).json({ error: "Failed to send match request" });
  }
};

/* ======================================================
   GET INCOMING MATCH REQUESTS
====================================================== */
export const getIncomingRequests = async (req, res) => {
  const userId = req.user.id;

  try {
    const requestsRes = await pool.query(
      `SELECT mr.id AS request_id, mr.created_at,
              u.id AS sender_id, u.name, u.bio,
              u.location, u.experience, u.avatar_url
       FROM match_requests mr
       JOIN users u ON u.id = mr.sender_id
       WHERE mr.receiver_id = $1
         AND mr.status = 'pending'
       ORDER BY mr.created_at DESC`,
      [userId]
    );

    const requests = [];

    for (const row of requestsRes.rows) {
      const availability = await pool.query(
        `SELECT day, start_time, end_time
         FROM availability WHERE user_id = $1`,
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
          avatar_url: row.avatar_url || null,
          availability: availability.rows,
        },
      });
    }

    res.status(200).json(requests);
  } catch (err) {
    console.error("Incoming requests error:", err);
    res.status(500).json({ error: "Failed to fetch incoming requests" });
  }
};

/* ======================================================
   ACCEPT MATCH REQUEST + BOOK MEETING
====================================================== */
export const acceptRequest = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    const requestRes = await pool.query(
      `SELECT * FROM match_requests
       WHERE id = $1 AND receiver_id = $2`,
      [id, userId]
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

    const sessionTime = getNextDateTime(
      commonSlot.day,
      commonSlot.start_time
    );

    const meetingLink = `https://meet.jit.si/skillswap-${id}-${Date.now()}`;

    await pool.query(
      `INSERT INTO bookings
       (sender_id, receiver_id, meeting_link, session_time)
       VALUES ($1, $2, $3, $4)`,
      [request.sender_id, request.receiver_id, meetingLink, sessionTime]
    );

    await pool.query(
      `UPDATE match_requests SET status = 'accepted'
       WHERE id = $1`,
      [id]
    );

    res.status(200).json({
      success: true,
      meetingLink,
      slot: commonSlot
    });

  } catch (err) {
    console.error("Accept request error:", err);
    res.status(500).json({ error: "Failed to accept request" });
  }
};

/* ======================================================
   REJECT MATCH REQUEST
====================================================== */
export const rejectRequest = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE match_requests
       SET status = 'rejected'
       WHERE id = $1 AND receiver_id = $2`,
      [id, userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Request not found" });
    }

    res.status(200).json({
      success: true,
      message: "Request rejected"
    });

  } catch (err) {
    console.error("Reject request error:", err);
    res.status(500).json({ error: "Failed to reject request" });
  }
};