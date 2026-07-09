/**
 * Seeds the database with a configurable number of fake users, skills,
 * availability windows, using BATCHED bulk inserts (not one row per
 * round trip). Over a remote DB connection, each round trip costs
 * ~300ms — inserting 5000 users one query at a time would mean tens
 * of thousands of round trips and take hours. Batching cuts that to a
 * handful of round trips total.
 *
 * Usage:
 *   node scripts/seed.js            # seeds 150 users (default)
 *   node scripts/seed.js 5000       # seeds 5000 users
 *   node scripts/seed.js 5000 --reset   # wipes previously seeded data first
 *
 * Safe to re-run without --reset: it only adds new rows on top of
 * whatever's already there (useful for resuming after an interruption
 * — just run it again with however many MORE users you want).
 */

import dotenv from "dotenv";
import bcrypt from "bcrypt";
import pool from "../config/db.js";

dotenv.config();

const SEED_EMAIL_DOMAIN = "seed.skillswap.test";
const USER_COUNT = Number(process.argv[2]) || 150;
const SHOULD_RESET = process.argv.includes("--reset");
const BATCH_SIZE = 500;

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

/**
 * Inserts one batch of users plus their skills/availability using
 * bulk UNNEST inserts — a handful of round trips total per batch,
 * regardless of batch size.
 */
async function seedBatch(client, batchSize, skills, passwordHash, batchStartIndex) {
  const names = [];
  const emails = [];
  const bios = [];
  const locations = [];
  const experiences = [];

  for (let i = 0; i < batchSize; i++) {
    const name = `${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)}`;
    names.push(name);
    emails.push(`seeduser${batchStartIndex + i}_${Date.now()}_${i}@${SEED_EMAIL_DOMAIN}`);
    bios.push(`Hi, I'm ${name.split(" ")[0]} and I love learning new things.`);
    locations.push(randomFrom(["Delhi", "Mumbai", "Bangalore", "Noida", "Pune", "Hyderabad"]));
    experiences.push(randomFrom(["Beginner", "Intermediate", "Advanced"]));
  }

  const passwordHashes = new Array(batchSize).fill(passwordHash);

  // 1 round trip: bulk-insert all users in this batch, get their new ids back.
  const insertedUsers = await client.query(
    `INSERT INTO users (name, email, password_hash, bio, location, experience)
     SELECT * FROM UNNEST(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[]
     )
     RETURNING id`,
    [names, emails, passwordHashes, bios, locations, experiences]
  );
  const userIds = insertedUsers.rows.map((r) => r.id);

  // Build skill_offers / user_skills / availability rows in memory,
  // then insert each as ONE bulk statement instead of per-user queries.
  const offerUserIds = [];
  const offerSkillIds = [];
  const wantUserIds = [];
  const wantSkillIds = [];
  const availUserIds = [];
  const availDays = [];
  const availStarts = [];
  const availEnds = [];

  for (const userId of userIds) {
    const shuffled = [...skills].sort(() => Math.random() - 0.5);
    const offered = shuffled.slice(0, randomInt(1, 3));
    const wanted = shuffled.slice(3, 3 + randomInt(1, 3));

    for (const skill of offered) {
      offerUserIds.push(userId);
      offerSkillIds.push(skill.id);
    }
    for (const skill of wanted) {
      wantUserIds.push(userId);
      wantSkillIds.push(skill.id);
    }

    const usedDays = new Set();
    const availabilityCount = randomInt(1, 4);
    for (let j = 0; j < availabilityCount; j++) {
      const day = randomFrom(DAYS);
      if (usedDays.has(day)) continue;
      usedDays.add(day);

      const startHour = randomInt(6, 20);
      const endHour = Math.min(startHour + randomInt(1, 3), 23);

      availUserIds.push(userId);
      availDays.push(day);
      availStarts.push(`${String(startHour).padStart(2, "0")}:00`);
      availEnds.push(`${String(endHour).padStart(2, "0")}:00`);
    }
  }

  // 3 more round trips total for this whole batch (not per-user).
  if (offerUserIds.length) {
    await client.query(
      `INSERT INTO skill_offers (user_id, offered_skill)
       SELECT * FROM UNNEST($1::int[], $2::int[])
       ON CONFLICT DO NOTHING`,
      [offerUserIds, offerSkillIds]
    );
  }
  if (wantUserIds.length) {
    await client.query(
      `INSERT INTO user_skills (user_id, skill_id)
       SELECT * FROM UNNEST($1::int[], $2::int[])
       ON CONFLICT DO NOTHING`,
      [wantUserIds, wantSkillIds]
    );
  }
  if (availUserIds.length) {
    await client.query(
      `INSERT INTO availability (user_id, day, start_time, end_time)
       SELECT * FROM UNNEST($1::int[], $2::text[], $3::time[], $4::time[])`,
      [availUserIds, availDays, availStarts, availEnds]
    );
  }

  return userIds.length;
}

async function seed() {
  const client = await pool.connect();

  try {
    if (SHOULD_RESET) {
      await resetSeedData(client);
    }

    const skills = await ensureSkills(client);
    const passwordHash = await bcrypt.hash("SeedPassword123!", 10);

    console.log(`Seeding ${USER_COUNT} users in batches of ${BATCH_SIZE}...`);

    let seeded = 0;
    while (seeded < USER_COUNT) {
      const thisBatch = Math.min(BATCH_SIZE, USER_COUNT - seeded);
      const count = await seedBatch(client, thisBatch, skills, passwordHash, seeded);
      seeded += count;
      console.log(`  ...${seeded}/${USER_COUNT} users created`);
    }

    console.log("Seeding complete.");
    console.log(`Total seeded users: ${seeded}`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
