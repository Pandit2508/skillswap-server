import express from "express";
import pool from "../config/db.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * GET /api/users?search=&filter=
 * filter = all | name | offered | wanted
 */
router.get("/", protect, async (req, res) => {
  const { search = "", filter = "all" } = req.query;

  try {
    let whereClause = "";
    const values = [];

    if (search) {
      values.push(`%${search}%`);

      if (filter === "name") {
        whereClause = `AND u.name ILIKE $1`;
      } 
      else if (filter === "offered") {
        whereClause = `AND so.name ILIKE $1`;
      } 
      else if (filter === "wanted") {
        whereClause = `AND sw.name ILIKE $1`;
      } 
      else {
        // all
        whereClause = `
          AND (
            u.name ILIKE $1
            OR so.name ILIKE $1
            OR sw.name ILIKE $1
          )
        `;
      }
    }

    const query = `
      SELECT 
        u.id,
        u.name,
        u.avatar_url,
        u.location,
        u.experience,

        array_agg(DISTINCT so.name)
          FILTER (WHERE so.name IS NOT NULL) AS skills,

        array_agg(DISTINCT sw.name)
          FILTER (WHERE sw.name IS NOT NULL) AS skills_wanted,

        json_agg(
          DISTINCT jsonb_build_object(
            'day', a.day,
            'start_time', a.start_time,
            'end_time', a.end_time
          )
        ) FILTER (WHERE a.day IS NOT NULL) AS availability

      FROM users u
      LEFT JOIN skill_offers sk ON sk.user_id = u.id
      LEFT JOIN skills so ON so.id = sk.offered_skill
      LEFT JOIN user_skills usk ON usk.user_id = u.id
      LEFT JOIN skills sw ON sw.id = usk.skill_id
      LEFT JOIN availability a ON a.user_id = u.id
      WHERE TRUE
      ${whereClause}
      GROUP BY u.id
      ORDER BY u.name
    `;

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

export default router;
