import pool from "../config/db.js";

/**
 * Chat is only allowed between two users who have (or have had) an
 * accepted match request — you can message someone once you're
 * actually matched, not any arbitrary user on the platform.
 */
const isConnected = async (userA, userB) => {
  const result = await pool.query(
    `SELECT 1 FROM match_requests
     WHERE status = 'accepted'
       AND ((sender_id = $1 AND receiver_id = $2)
         OR (sender_id = $2 AND receiver_id = $1))
     LIMIT 1`,
    [userA, userB]
  );
  return result.rows.length > 0;
};

/* =========================================================
   GET /api/messages/conversations
   One row per user the current user has an accepted match with,
   including the last message (if any) and unread count, so the
   client can render a conversation list without N+1 requests.
========================================================= */
export const getConversations = async (req, res) => {
  const userId = req.user.id;

  try {
    const matchesRes = await pool.query(
      `SELECT DISTINCT
         CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS other_id
       FROM match_requests
       WHERE status = 'accepted' AND (sender_id = $1 OR receiver_id = $1)`,
      [userId]
    );

    const otherIds = matchesRes.rows.map((r) => r.other_id);

    if (!otherIds.length) {
      return res.json([]);
    }

    const conversations = await Promise.all(
      otherIds.map(async (otherId) => {
        const [userRes, lastMsgRes, unreadRes] = await Promise.all([
          pool.query(
            `SELECT id, name, avatar_url FROM users WHERE id = $1`,
            [otherId]
          ),
          pool.query(
            `SELECT content, sender_id, created_at FROM messages
             WHERE (sender_id = $1 AND receiver_id = $2)
                OR (sender_id = $2 AND receiver_id = $1)
             ORDER BY created_at DESC LIMIT 1`,
            [userId, otherId]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS count FROM messages
             WHERE sender_id = $1 AND receiver_id = $2 AND read_at IS NULL`,
            [otherId, userId]
          ),
        ]);

        if (!userRes.rows.length) return null;

        return {
          user: userRes.rows[0],
          lastMessage: lastMsgRes.rows[0] || null,
          unreadCount: unreadRes.rows[0].count,
        };
      })
    );

    const filtered = conversations.filter(Boolean);

    // Most recently active conversations first; conversations with no
    // messages yet (a fresh match with nothing said) sort to the end.
    filtered.sort((a, b) => {
      const aTime = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
      const bTime = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
      return bTime - aTime;
    });

    res.json(filtered);
  } catch (err) {
    console.error("Get conversations error:", err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

/* =========================================================
   GET /api/messages/:userId
   Full thread with one other user, oldest first. Also marks any
   messages *they* sent *to me* as read.
========================================================= */
export const getMessages = async (req, res) => {
  const userId = req.user.id;
  const otherId = Number(req.params.userId);

  if (!Number.isInteger(otherId)) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  try {
    if (!(await isConnected(userId, otherId))) {
      return res.status(403).json({
        error: "You can only message users you have an accepted match with",
      });
    }

    const result = await pool.query(
      `SELECT id, sender_id, receiver_id, content, read_at, created_at
       FROM messages
       WHERE (sender_id = $1 AND receiver_id = $2)
          OR (sender_id = $2 AND receiver_id = $1)
       ORDER BY created_at ASC`,
      [userId, otherId]
    );

    await pool.query(
      `UPDATE messages SET read_at = NOW()
       WHERE sender_id = $1 AND receiver_id = $2 AND read_at IS NULL`,
      [otherId, userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

/* =========================================================
   POST /api/messages/:userId
   Body: { content }
   Persists the message, then pushes it over the receiver's
   (and sender's other tabs') socket room in real time.
========================================================= */
export const sendMessage = async (req, res) => {
  const senderId = req.user.id;
  const receiverId = Number(req.params.userId);
  const { content } = req.body;

  if (!Number.isInteger(receiverId)) {
    return res.status(400).json({ error: "Invalid user id" });
  }
  if (receiverId === senderId) {
    return res.status(400).json({ error: "You cannot message yourself" });
  }

  const trimmed = (content || "").trim();
  if (!trimmed) {
    return res.status(400).json({ error: "Message cannot be empty" });
  }
  if (trimmed.length > 2000) {
    return res.status(400).json({ error: "Message is too long (max 2000 characters)" });
  }

  try {
    if (!(await isConnected(senderId, receiverId))) {
      return res.status(403).json({
        error: "You can only message users you have an accepted match with",
      });
    }

    const result = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, sender_id, receiver_id, content, read_at, created_at`,
      [senderId, receiverId, trimmed]
    );

    const message = result.rows[0];

    const io = req.app.get("io");
    if (io) {
      // Receiver gets it live; also echo to the sender's own room so
      // any other open tab/device stays in sync.
      io.to(`user_${receiverId}`).emit("new_message", message);
      io.to(`user_${senderId}`).emit("new_message", message);
    }

    res.status(201).json({ success: true, message });
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
};
