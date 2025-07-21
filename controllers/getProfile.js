
import pool from "../config/db.js";

const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      "SELECT id, name, email, avatar_url, created_at FROM users WHERE id = $1",
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching profile:", err.message);
    res.status(500).json({ error: "Server error while fetching profile" });
  }
};

export default getProfile;
