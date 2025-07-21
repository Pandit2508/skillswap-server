import express from "express";
import pool from "../config/db.js"; // Make sure your PostgreSQL pool is set up here

const router = express.Router();

//  GET /api/users?skill=React → fetch users (optionally filter by skill)
router.get("/", async (req, res) => {
  const { skill } = req.query;

  try {
    let query = `
      SELECT u.id, u.name, u.bio, u.avatar_url, array_agg(s.name) AS skills
      FROM users u
      JOIN user_skills us ON us.user_id = u.id
      JOIN skills s ON s.id = us.skill_id
    `;
    const values = [];

    if (skill) {
      query += ` WHERE s.name ILIKE $1`;
      values.push(`%${skill}%`);
    }

    query += ` GROUP BY u.id LIMIT 30`;

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

export default router;
