import {
  scoreSkillReciprocity,
  scoreRating,
  scoreCandidate,
} from "../utils/scoring.js";

describe("scoreSkillReciprocity", () => {
  test("scores 1 for a perfect two-way match", () => {
    const me = { skills: ["guitar"], skills_wanted: ["python"] };
    const candidate = { skills: ["python"], skills_wanted: ["guitar"] };
    expect(scoreSkillReciprocity(me, candidate)).toBe(1);
  });

  test("scores lower for a one-way match", () => {
    const me = { skills: ["guitar"], skills_wanted: ["python"] };
    const candidate = { skills: ["python"], skills_wanted: ["excel"] };
    // I can learn from them (1.0), they can't learn from me (0.0) -> avg 0.5
    expect(scoreSkillReciprocity(me, candidate)).toBe(0.5);
  });

  test("is case-insensitive and trims whitespace", () => {
    const me = { skills: [" Guitar "], skills_wanted: ["Python"] };
    const candidate = { skills: ["python"], skills_wanted: ["guitar"] };
    expect(scoreSkillReciprocity(me, candidate)).toBe(1);
  });

  test("scores 0 when neither side has anything the other wants", () => {
    const me = { skills: ["guitar"], skills_wanted: ["python"] };
    const candidate = { skills: ["excel"], skills_wanted: ["cooking"] };
    expect(scoreSkillReciprocity(me, candidate)).toBe(0);
  });

  test("treats an empty wanted-list as trivially satisfied (0 contribution, not a crash)", () => {
    const me = { skills: [], skills_wanted: [] };
    const candidate = { skills: ["python"], skills_wanted: ["guitar"] };
    expect(scoreSkillReciprocity(me, candidate)).toBe(0);
  });
});

describe("scoreRating", () => {
  test("normalizes a 5-star rating to 1", () => {
    expect(scoreRating({ average_rating: 5 })).toBe(1);
  });

  test("normalizes a 0 rating to 0", () => {
    expect(scoreRating({ average_rating: 0 })).toBe(0);
  });

  test("uses a neutral default when there's no rating yet", () => {
    expect(scoreRating({})).toBeCloseTo(3.5 / 5, 5);
  });
});

describe("scoreCandidate", () => {
  const availabilityA = [{ day: "monday", start_time: "09:00", end_time: "13:00" }];
  const availabilityB = [{ day: "monday", start_time: "10:00", end_time: "14:00" }];

  test("returns null when there's no overlapping availability", () => {
    const me = {
      skills: ["guitar"],
      skills_wanted: ["python"],
      availability: [{ day: "monday", start_time: "09:00", end_time: "10:00" }],
    };
    const candidate = {
      skills: ["python"],
      skills_wanted: ["guitar"],
      availability: [{ day: "tuesday", start_time: "09:00", end_time: "10:00" }],
      average_rating: 5,
    };
    expect(scoreCandidate(me, candidate)).toBeNull();
  });

  test("scores a strong two-way, well-rated, wide-overlap match highly", () => {
    const me = { skills: ["guitar"], skills_wanted: ["python"], availability: availabilityA };
    const candidate = {
      skills: ["python"],
      skills_wanted: ["guitar"],
      availability: availabilityB,
      average_rating: 5,
    };

    const result = scoreCandidate(me, candidate);
    expect(result).not.toBeNull();
    expect(result.score).toBeGreaterThan(80);
    expect(result.breakdown.skillReciprocity).toBe(100);
    expect(result.breakdown.rating).toBe(100);
    expect(result.bestSlot).toEqual({
      day: "monday",
      start_time: "10:00",
      end_time: "13:00",
    });
  });

  test("ranks a two-way match above an equally-available one-way match", () => {
    const me = { skills: ["guitar"], skills_wanted: ["python"], availability: availabilityA };

    const twoWay = scoreCandidate(me, {
      skills: ["python"],
      skills_wanted: ["guitar"],
      availability: availabilityB,
      average_rating: 4,
    });

    const oneWay = scoreCandidate(me, {
      skills: ["python"],
      skills_wanted: ["excel"],
      availability: availabilityB,
      average_rating: 4,
    });

    expect(twoWay.score).toBeGreaterThan(oneWay.score);
  });
});
