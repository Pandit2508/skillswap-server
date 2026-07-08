/**
 * Benchmarks three things and prints a report you can quote directly:
 *
 *   1. Query latency for the availability lookup, WITH vs WITHOUT the
 *      index (idx_availability_user) — quantifies why the index exists.
 *   2. Percentile (p50/p95/p99) latency for that same query under load,
 *      using the currently-indexed state.
 *   3. How many valid matches the matching algorithm actually finds
 *      across the seeded user pool, and how long that computation takes.
 *
 * Usage: node scripts/benchmark.js
 * Requires the DB to already be seeded (see scripts/seed.js).
 */

import dotenv from "dotenv";
import pool from "../config/db.js";
import { findCommonSlot } from "../utils/matching.js";

dotenv.config();

const ITERATIONS = 200;

const percentile = (sortedArr, p) => {
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(idx, sortedArr.length - 1))];
};

const timeQuery = async (client, userId) => {
  const start = process.hrtime.bigint();
  await client.query(
    `SELECT day, start_time, end_time FROM availability WHERE user_id = $1`,
    [userId]
  );
  const end = process.hrtime.bigint();
  return Number(end - start) / 1_000_000; // ms
};

async function run() {
  const client = await pool.connect();

  try {
    const usersRes = await client.query(
      `SELECT id FROM users WHERE email LIKE '%@seed.skillswap.test' LIMIT 500`
    );
    const userIds = usersRes.rows.map((r) => r.id);

    if (userIds.length < 10) {
      console.log(
        "Not enough seeded users found. Run `node scripts/seed.js` first."
      );
      return;
    }

    console.log(`Benchmarking against ${userIds.length} seeded users.\n`);

    /* =========================================================
       1. INDEX vs NO INDEX
    ========================================================= */
    console.log("=== Availability query: WITH index ===");
    const withIndexTimes = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const uid = userIds[i % userIds.length];
      withIndexTimes.push(await timeQuery(client, uid));
    }
    withIndexTimes.sort((a, b) => a - b);
    console.log(`  avg: ${(withIndexTimes.reduce((a, b) => a + b, 0) / ITERATIONS).toFixed(3)}ms`);
    console.log(`  p50: ${percentile(withIndexTimes, 50).toFixed(3)}ms`);
    console.log(`  p95: ${percentile(withIndexTimes, 95).toFixed(3)}ms`);
    console.log(`  p99: ${percentile(withIndexTimes, 99).toFixed(3)}ms\n`);

    console.log("Dropping idx_availability_user to measure the unindexed cost...");
    await client.query(`DROP INDEX IF EXISTS idx_availability_user`);

    console.log("=== Availability query: WITHOUT index ===");
    const noIndexTimes = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const uid = userIds[i % userIds.length];
      noIndexTimes.push(await timeQuery(client, uid));
    }
    noIndexTimes.sort((a, b) => a - b);
    console.log(`  avg: ${(noIndexTimes.reduce((a, b) => a + b, 0) / ITERATIONS).toFixed(3)}ms`);
    console.log(`  p50: ${percentile(noIndexTimes, 50).toFixed(3)}ms`);
    console.log(`  p95: ${percentile(noIndexTimes, 95).toFixed(3)}ms`);
    console.log(`  p99: ${percentile(noIndexTimes, 99).toFixed(3)}ms\n`);

    console.log("Recreating idx_availability_user...");
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_availability_user ON availability(user_id)`
    );

    const avgWith = withIndexTimes.reduce((a, b) => a + b, 0) / ITERATIONS;
    const avgWithout = noIndexTimes.reduce((a, b) => a + b, 0) / ITERATIONS;
    const speedup = avgWithout / avgWith;
    console.log(`>>> Index speedup: ~${speedup.toFixed(1)}x faster with the index in place.\n`);

    /* =========================================================
       2. MATCHING ALGORITHM THROUGHPUT
    ========================================================= */
    console.log("=== Matching algorithm: pairwise scan over seeded users ===");

    const availabilityRes = await client.query(
      `SELECT user_id, day, start_time, end_time
       FROM availability
       WHERE user_id = ANY($1::int[])`,
      [userIds]
    );

    const availabilityByUser = new Map();
    for (const row of availabilityRes.rows) {
      if (!availabilityByUser.has(row.user_id)) availabilityByUser.set(row.user_id, []);
      availabilityByUser.get(row.user_id).push(row);
    }

    const sampleSize = Math.min(userIds.length, 100);
    const sample = userIds.slice(0, sampleSize);

    let matchCount = 0;
    let pairsChecked = 0;

    const algoStart = process.hrtime.bigint();
    for (let i = 0; i < sample.length; i++) {
      for (let j = i + 1; j < sample.length; j++) {
        pairsChecked++;
        const slotsA = availabilityByUser.get(sample[i]) || [];
        const slotsB = availabilityByUser.get(sample[j]) || [];
        if (findCommonSlot(slotsA, slotsB)) matchCount++;
      }
    }
    const algoEnd = process.hrtime.bigint();
    const algoMs = Number(algoEnd - algoStart) / 1_000_000;

    console.log(`  Users sampled: ${sampleSize}`);
    console.log(`  Pairs checked: ${pairsChecked}`);
    console.log(`  Valid overlapping matches found: ${matchCount} (${((matchCount / pairsChecked) * 100).toFixed(1)}% of pairs)`);
    console.log(`  Total compute time: ${algoMs.toFixed(2)}ms`);
    console.log(`  Avg per pair: ${(algoMs / pairsChecked).toFixed(4)}ms\n`);

    console.log("=== Summary (safe to quote) ===");
    console.log(
      `Indexed availability lookups run ~${speedup.toFixed(1)}x faster ` +
      `(p95 ${percentile(withIndexTimes, 95).toFixed(2)}ms vs ${percentile(noIndexTimes, 95).toFixed(2)}ms unindexed) ` +
      `across a ${userIds.length}-user seeded dataset. The matching algorithm evaluated ` +
      `${pairsChecked} user pairs in ${algoMs.toFixed(1)}ms, finding ${matchCount} valid overlapping slots.`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
