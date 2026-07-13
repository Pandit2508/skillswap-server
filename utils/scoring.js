/**
 * Weighted match scoring.
 *
 * Replaces the old "first overlap wins, otherwise unranked" approach
 * to suggesting matches with an actual score, combining three signals
 * the README already called out as the right ones:
 *
 *   1. Skill relevance — do the two users' offered/wanted skills
 *      actually line up for a *two-way* exchange, not just a one-way one?
 *   2. Rating — is this person's track record from past sessions good?
 *   3. Slot size — how much overlapping availability do they share
 *      (bigger windows are easier to actually schedule and use)?
 *
 * Pure functions, no DB/HTTP here, so this is unit-testable in
 * isolation the same way utils/matching.js is.
 */

import { findCommonSlot } from "./matching.js";

const WEIGHTS = {
  skillReciprocity: 0.5,
  rating: 0.2,
  slotSize: 0.3,
};

// A shared window this long or longer counts as "fully flexible" for
// scoring purposes; longer windows don't add further benefit.
const FULL_CREDIT_SLOT_MINUTES = 240; // 4 hours

// Rating shown for users with no reviews yet: neutral-positive rather
// than 0, so brand-new users aren't scored as if they were untrustworthy.
const DEFAULT_RATING = 3.5;
const MAX_RATING = 5;

const normalizeSkillList = (skills = []) =>
  new Set((skills || []).filter(Boolean).map((s) => s.toLowerCase().trim()));

const overlapRatio = (wanted, offered) => {
  if (!wanted.size) return 0;
  let hits = 0;
  for (const skill of wanted) {
    if (offered.has(skill)) hits += 1;
  }
  return hits / wanted.size;
};

/**
 * Skill reciprocity: the average of "how much of what I want to learn
 * do they teach" and "how much of what they want to learn do I teach".
 * A one-way match (I can learn from them, but I have nothing they
 * want) still scores something, but a genuine two-way swap scores
 * much higher — which is the whole point of a *skill swap* platform.
 */
export const scoreSkillReciprocity = (me, candidate) => {
  const mySkillsWanted = normalizeSkillList(me.skills_wanted);
  const mySkillsOffered = normalizeSkillList(me.skills);
  const theirSkillsWanted = normalizeSkillList(candidate.skills_wanted);
  const theirSkillsOffered = normalizeSkillList(candidate.skills);

  const iCanLearnFromThem = overlapRatio(mySkillsWanted, theirSkillsOffered);
  const theyCanLearnFromMe = overlapRatio(theirSkillsWanted, mySkillsOffered);

  return (iCanLearnFromThem + theyCanLearnFromMe) / 2;
};

export const scoreRating = (candidate) => {
  const rating =
    candidate.average_rating === undefined || candidate.average_rating === null
      ? DEFAULT_RATING
      : Number(candidate.average_rating);

  return Math.max(0, Math.min(1, rating / MAX_RATING));
};

export const scoreSlotSize = (me, candidate) => {
  const overlaps = findCommonSlot(me.availability || [], candidate.availability || []);
  if (!overlaps) return { score: 0, slot: null };

  // findCommonSlot already returns the single best (longest) slot;
  // recompute its duration for scoring purposes.
  const [sh, sm] = overlaps.start_time.split(":").map(Number);
  const [eh, em] = overlaps.end_time.split(":").map(Number);
  const duration = eh * 60 + em - (sh * 60 + sm);

  return {
    score: Math.max(0, Math.min(1, duration / FULL_CREDIT_SLOT_MINUTES)),
    slot: overlaps,
  };
};

/**
 * Computes an overall 0-100 match score between the current user
 * ("me") and a candidate, plus a breakdown so the UI can explain
 * *why* someone was recommended, not just show a bare number.
 *
 * Expects:
 *   me / candidate: { skills: string[], skills_wanted: string[],
 *                      availability: {day,start_time,end_time}[] }
 *   candidate additionally: { average_rating?: number|string }
 *
 * Returns null if there's no schedulable overlap at all — a
 * candidate you can never actually meet with isn't a match, no
 * matter how well the skills line up.
 */
export const scoreCandidate = (me, candidate) => {
  const { score: slotScore, slot } = scoreSlotSize(me, candidate);
  if (!slot) return null;

  const skillScore = scoreSkillReciprocity(me, candidate);
  const ratingScore = scoreRating(candidate);

  const weighted =
    skillScore * WEIGHTS.skillReciprocity +
    ratingScore * WEIGHTS.rating +
    slotScore * WEIGHTS.slotSize;

  return {
    score: Math.round(weighted * 100),
    breakdown: {
      skillReciprocity: Math.round(skillScore * 100),
      rating: Math.round(ratingScore * 100),
      slotSize: Math.round(slotScore * 100),
    },
    bestSlot: slot,
  };
};
