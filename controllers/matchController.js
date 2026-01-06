import pool from "../config/db.js";

/* ======================================================
   SEND MATCH REQUEST
   POST /api/match-requests/:receiverId
====================================================== */
export const sendMatchRequest = async (req, res) => {
  const senderId = req.user.id;
  const { receiverId } = req.params;

  if (senderId === Number(receiverId)) {
    return res.status(400).json({ error: "You cannot send a request to yourself" });
  }

  try {
    // Prevent duplicate requests
    const existing = await pool.query(
      `
      SELECT id FROM match_requests
      WHERE sender_id = $1 AND receiver_id = $2
      `,
      [senderId, receiverId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Request already sent" });
    }

    await pool.query(
      `
      INSERT INTO match_requests (sender_id, receiver_id)
      VALUES ($1, $2)
      `,
      [senderId, receiverId]
    );

    res.status(201).json({
      success: true,
      message: "Match request sent",
    });
  } catch (err) {
    console.error("Send request error:", err);
    res.status(500).json({ error: "Failed to send match request" });
  }
};

/* ======================================================
   GET INCOMING MATCH REQUESTS
   GET /api/match-requests/incoming
====================================================== */
export const getIncomingRequests = async (req, res) => {
  const userId = req.user.id;

  try {
    const requestsRes = await pool.query(
      `
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
      ORDER BY mr.created_at DESC
      `,
      [userId]
    );

    const requests = [];

    for (const row of requestsRes.rows) {
      /* ---------- OFFERED SKILLS ---------- */
      const offeredSkills = await pool.query(
        `
        SELECT s.name
        FROM skill_offers so
        JOIN skills s ON s.id = so.offered_skill
        WHERE so.user_id = $1
        `,
        [row.sender_id]
      );

      /* ---------- WANTED SKILLS ---------- */
      const wantedSkills = await pool.query(
        `
        SELECT s.name
        FROM user_skills us
        JOIN skills s ON s.id = us.skill_id
        WHERE us.user_id = $1
        `,
        [row.sender_id]
      );

      /* ---------- AVAILABILITY ---------- */
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
          avatar_url: row.avatar_url || null,
          skills: offeredSkills.rows.map(r => r.name),
          skills_wanted: wantedSkills.rows.map(r => r.name),
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
   ACCEPT MATCH REQUEST
   POST /api/match-requests/:id/accept
====================================================== */
export const acceptRequest = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    await pool.query(
      `
      DELETE FROM match_requests
      WHERE id = $1 AND receiver_id = $2
      `,
      [id, userId]
    );

    res.status(200).json({ success: true, message: "Request accepted" });
  } catch (err) {
    console.error("Accept request error:", err);
    res.status(500).json({ error: "Failed to accept request" });
  }
};

/* ======================================================
   REJECT MATCH REQUEST
   POST /api/match-requests/:id/reject
====================================================== */
export const rejectRequest = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    await pool.query(
      `
      DELETE FROM match_requests
      WHERE id = $1 AND receiver_id = $2
      `,
      [id, userId]
    );

    res.status(200).json({ success: true, message: "Request rejected" });
  } catch (err) {
    console.error("Reject request error:", err);
    res.status(500).json({ error: "Failed to reject request" });
  }
};
