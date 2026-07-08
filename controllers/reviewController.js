import pool from "../config/db.js";

/* =========================================================
   ELIGIBLE SESSIONS
   Bookings the current user was part of, whose end_time has
   passed, and which they haven't already reviewed.
========================================================= */
export const getEligibleSessions = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT b.id AS booking_id, b.session_time, b.end_time,
              CASE WHEN b.user1_id = $1 THEN b.user2_id ELSE b.user1_id END AS other_user_id,
              u.name AS other_user_name
       FROM bookings b
       JOIN users u
         ON u.id = CASE WHEN b.user1_id = $1 THEN b.user2_id ELSE b.user1_id END
       WHERE (b.user1_id = $1 OR b.user2_id = $1)
         AND b.end_time < NOW()
         AND NOT EXISTS (
           SELECT 1 FROM reviews r
           WHERE r.booking_id = b.id AND r.reviewer_id = $1
         )
       ORDER BY b.end_time DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Get eligible sessions error:", err);
    res.status(500).json({ error: "Failed to fetch eligible sessions" });
  }
};

/* =========================================================
   CREATE REVIEW
========================================================= */
export const createReview = async (req, res) => {
  const reviewerId = req.user.id;
  const { bookingId } = req.params;
  const { rating, comment } = req.body;

  const numericRating = Number(rating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ error: "Rating must be an integer between 1 and 5" });
  }
  if (comment && comment.length > 1000) {
    return res.status(400).json({ error: "Comment is too long (max 1000 characters)" });
  }

  try {
    const bookingRes = await pool.query(
      `SELECT * FROM bookings WHERE id = $1`,
      [bookingId]
    );

    if (!bookingRes.rows.length) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = bookingRes.rows[0];

    if (booking.user1_id !== reviewerId && booking.user2_id !== reviewerId) {
      return res.status(403).json({ error: "You were not part of this session" });
    }

    if (new Date(booking.end_time) > new Date()) {
      return res.status(400).json({ error: "You can only review a session after it has ended" });
    }

    const revieweeId = booking.user1_id === reviewerId ? booking.user2_id : booking.user1_id;

    const result = await pool.query(
      `INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (booking_id, reviewer_id) DO NOTHING
       RETURNING *`,
      [bookingId, reviewerId, revieweeId, numericRating, comment || null]
    );

    if (!result.rows.length) {
      return res.status(409).json({ error: "You already reviewed this session" });
    }

    res.status(201).json({ success: true, review: result.rows[0] });
  } catch (err) {
    console.error("Create review error:", err);
    res.status(500).json({ error: "Failed to submit review" });
  }
};

/* =========================================================
   GET REVIEWS FOR A USER (public profile view)
========================================================= */
export const getUserReviews = async (req, res) => {
  const { userId } = req.params;

  try {
    const reviewsRes = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at,
              u.id AS reviewer_id, u.name AS reviewer_name, u.avatar_url AS reviewer_avatar
       FROM reviews r
       JOIN users u ON u.id = r.reviewer_id
       WHERE r.reviewee_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );

    const summaryRes = await pool.query(
      `SELECT COUNT(*)::int AS review_count,
              COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS average_rating
       FROM reviews
       WHERE reviewee_id = $1`,
      [userId]
    );

    res.json({
      summary: summaryRes.rows[0],
      reviews: reviewsRes.rows,
    });
  } catch (err) {
    console.error("Get user reviews error:", err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
};
