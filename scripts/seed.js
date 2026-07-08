/**
 * Seeds the database with a configurable number of fake users, skills,
 * availability windows, and a handful of match requests / bookings.
 *
 * Usage:
 *   node scripts/seed.js            # seeds 150 users (default)
 *   node scripts/seed.js 200        # seeds 200 users
 *
 * Safe to re-run: it only adds new rows, it doesn't wipe existing data.
 * Run `node scripts/seed.js --reset` to wipe seeded data first (only
 * deletes rows tagged as seed data via the email domain below).
 */

import dotenv from "dotenv";
import bcrypt from "bcrypt";
import pool from "../config/db.js";

dotenv.config();

const SEED_EMAIL_DOMAIN = "seed.skillswap.test";
const USER_COUNT = Number(process.argv[2]) || 150;
const SHOULD_RESET = process.argv.includes("--reset");

const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan",
  "Krishna", "Ishaan", "Ananya", "Diya", "Saanvi", "Aadhya", "Kiara", "Myra",
  "Riya", "Anika", "Navya", "Pari",
];
const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Singh", "Kumar", "Patel", "Reddy", "Rao",
  "Mehta", "Joshi", "Nair", "Iyer", "Chopra", "Malhotra", "Kapoor",
];
const SKILLS = [
  "JavaScript", "Python", "React", "Node.js", "SQL", "Machine Learning",
  "UI/UX Design", "Public Speaking", "Guitar", "Photography", "Spanish",
  "French", "Data Structures", "System Design", "Video Editing",
  "Excel", "Copywriting", "Cooking", "Yoga", "Chess",
];
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function ensureSkills(client) {
  for (const skill of SKILLS) {
    await client.query(
      `INSERT INTO skills (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
      [skill]
    );
  }
  const res = await client.query(`SELECT id, name FROM skills`);
  return res.rows;
}

async function resetSeedData(client) {
  console.log("Removing previously seeded data...");
  await client.query(
    `DELETE FROM users WHERE email LIKE '%@${SEED_EMAIL_DOMAIN}'`
  );
}

async function seed() {
  const client = await pool.connect();

  try {
    if (SHOULD_RESET) {
      await resetSeedData(client);
    }

    const skills = await ensureSkills(client);
    const passwordHash = await bcrypt.hash("SeedPassword123!", 10);

    console.log(`Seeding ${USER_COUNT} users...`);
    const userIds = [];

    for (let i = 0; i < USER_COUNT; i++) {
      const name = `${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)}`;
      const email = `seeduser${i}_${Date.now()}@${SEED_EMAIL_DOMAIN}`;

      const userRes = await client.query(
        `INSERT INTO users (name, email, password_hash, bio, location, experience)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          name,
          email,
          passwordHash,
          `Hi, I'm ${name.split(" ")[0]} and I love learning new things.`,
          randomFrom(["Delhi", "Mumbai", "Bangalore", "Noida", "Pune", "Hyderabad"]),
          randomFrom(["Beginner", "Intermediate", "Advanced"]),
        ]
      );

      const userId = userRes.rows[0].id;
      userIds.push(userId);

      // 1-3 skills offered, 1-3 skills wanted (kept disjoint-ish for realism)
      const shuffledSkills = [...skills].sort(() => Math.random() - 0.5);
      const offered = shuffledSkills.slice(0, randomInt(1, 3));
      const wanted = shuffledSkills.slice(3, 3 + randomInt(1, 3));

      for (const skill of offered) {
        await client.query(
          `INSERT INTO skill_offers (user_id, offered_skill) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [userId, skill.id]
        );
      }
      for (const skill of wanted) {
        await client.query(
          `INSERT INTO user_skills (user_id, skill_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [userId, skill.id]
        );
      }

      // 1-4 availability windows per user
      const availabilityCount = randomInt(1, 4);
      const usedDays = new Set();
      for (let j = 0; j < availabilityCount; j++) {
        const day = randomFrom(DAYS);
        if (usedDays.has(day)) continue;
        usedDays.add(day);

        const startHour = randomInt(6, 20);
        const duration = randomInt(1, 3);
        const endHour = Math.min(startHour + duration, 23);

        await client.query(
          `INSERT INTO availability (user_id, day, start_time, end_time)
           VALUES ($1, $2, $3, $4)`,
          [
            userId,
            day,
            `${String(startHour).padStart(2, "0")}:00`,
            `${String(endHour).padStart(2, "0")}:00`,
          ]
        );
      }

      if ((i + 1) % 25 === 0) {
        console.log(`  ...${i + 1}/${USER_COUNT} users created`);
      }
    }

    console.log("Seeding complete.");
    console.log(`Total seeded users: ${userIds.length}`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
