import pool from "../config/db.js";

/* ======================================================
   GET /api/profile
====================================================== */
export const getProfile = async (req, res) => {
  try {
    // ✅ FIX 1: correct user id
    const userId = req.user.id;

    /* ---------- USER + PROFILE DATA ---------- */
    const userResult = await pool.query(
      `
      SELECT
        id,
        name,
        bio,
        avatar_url,
        location,
        experience
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    /* ---------- OFFERED SKILLS ---------- */
    const offeredSkillsRes = await pool.query(
      `
      SELECT s.name
      FROM skill_offers so
      JOIN skills s ON s.id = so.offered_skill
      WHERE so.user_id = $1
      `,
      [userId]
    );

    /* ---------- WANTED SKILLS ---------- */
    const wantedSkillsRes = await pool.query(
      `
      SELECT s.name
      FROM user_skills us
      JOIN skills s ON s.id = us.skill_id
      WHERE us.user_id = $1
      `,
      [userId]
    );

    /* ---------- AVAILABILITY ---------- */
    const availabilityRes = await pool.query(
      `
      SELECT day, start_time, end_time
      FROM availability
      WHERE user_id = $1
      `,
      [userId]
    );

    /* ---------- RESPONSE ---------- */
    res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        profile: {
          bio: user.bio || "",
          avatar_url: user.avatar_url || null,
          location: user.location || "",
          experience: user.experience || "",
          skills: offeredSkillsRes.rows.map(r => r.name),
          skills_wanted: wantedSkillsRes.rows.map(r => r.name),
          availability: availabilityRes.rows,
        },
      },
    });
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ error: "Server error while fetching profile" });
  }
};

/* ======================================================
   POST /api/profile
====================================================== */
export const createProfile = async (req, res) => {
  // ✅ FIX 1 AGAIN
  const userId = req.user.id;

  const {
    name,
    bio = "",
    skills_offered = [],
    skills_wanted = [],
    availability = [],
    location = "",
    experience = "",
  } = req.body;

  const offeredSkills = Array.isArray(skills_offered)
    ? skills_offered
    : skills_offered.split(",").map(s => s.trim()).filter(Boolean);

  const wantedSkills = Array.isArray(skills_wanted)
    ? skills_wanted
    : skills_wanted.split(",").map(s => s.trim()).filter(Boolean);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /* ---------- UPDATE USER ---------- */
    await client.query(
      `
      UPDATE users
      SET
        name = $1,
        bio = $2,
        location = $3,
        experience = $4
      WHERE id = $5
      `,
      [name, bio, location, experience, userId]
    );

    /* ---------- CLEAR OLD DATA ---------- */
    await client.query(`DELETE FROM skill_offers WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM user_skills WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM availability WHERE user_id = $1`, [userId]);

    /* ---------- OFFERED SKILLS ---------- */
    for (const skill of offeredSkills) {
      await client.query(
        `INSERT INTO skills (name) VALUES ($1)
         ON CONFLICT (name) DO NOTHING`,
        [skill]
      );

      const skillRes = await client.query(
        `SELECT id FROM skills WHERE name = $1`,
        [skill]
      );

      if (skillRes.rows.length) {
        await client.query(
          `INSERT INTO skill_offers (user_id, offered_skill)
           VALUES ($1, $2)`,
          [userId, skillRes.rows[0].id]
        );
      }
    }

    /* ---------- WANTED SKILLS ---------- */
    for (const skill of wantedSkills) {
      await client.query(
        `INSERT INTO skills (name) VALUES ($1)
         ON CONFLICT (name) DO NOTHING`,
        [skill]
      );

      const skillRes = await client.query(
        `SELECT id FROM skills WHERE name = $1`,
        [skill]
      );

      if (skillRes.rows.length) {
        await client.query(
          `INSERT INTO user_skills (user_id, skill_id)
           VALUES ($1, $2)`,
          [userId, skillRes.rows[0].id]
        );
      }
    }

    /* ---------- AVAILABILITY ---------- */
    for (const slot of availability) {
      if (!slot.day || !slot.start_time || !slot.end_time) continue;

      await client.query(
        `INSERT INTO availability (user_id, day, start_time, end_time)
         VALUES ($1, $2, $3, $4)`,
        [userId, slot.day, slot.start_time, slot.end_time]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Profile created successfully",
      success: true,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error creating profile:", err);
    res.status(500).json({ error: "Failed to create profile" });
  } finally {
    client.release();
  }
};
