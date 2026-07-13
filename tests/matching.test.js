import {
  normalizeDay,
  toMinutes,
  toTime,
  findCommonSlot,
  findAllOverlaps,
  getNextDateForDay,
} from "../utils/matching.js";

describe("normalizeDay", () => {
  test("expands common abbreviations", () => {
    expect(normalizeDay("Mon")).toBe("monday");
    expect(normalizeDay("tue")).toBe("tuesday");
    expect(normalizeDay("SAT")).toBe("saturday");
  });

  test("passes through already-full day names", () => {
    expect(normalizeDay("wednesday")).toBe("wednesday");
  });

  test("handles empty/invalid input safely", () => {
    expect(normalizeDay("")).toBe("");
    expect(normalizeDay(undefined)).toBe("");
  });
});

describe("toMinutes / toTime", () => {
  test("converts HH:MM to minutes and back", () => {
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("00:00")).toBe(0);
    expect(toTime(570)).toBe("09:30");
    expect(toTime(0)).toBe("00:00");
  });
});

describe("findCommonSlot", () => {
  test("finds an overlapping window on a shared day", () => {
    const sender = [{ day: "mon", start_time: "09:00", end_time: "12:00" }];
    const receiver = [{ day: "monday", start_time: "10:00", end_time: "14:00" }];

    expect(findCommonSlot(sender, receiver)).toEqual({
      day: "monday",
      start_time: "10:00",
      end_time: "12:00",
    });
  });

  test("returns null when days don't match", () => {
    const sender = [{ day: "mon", start_time: "09:00", end_time: "12:00" }];
    const receiver = [{ day: "tue", start_time: "09:00", end_time: "12:00" }];

    expect(findCommonSlot(sender, receiver)).toBeNull();
  });

  test("returns null when days match but times don't overlap", () => {
    const sender = [{ day: "mon", start_time: "09:00", end_time: "10:00" }];
    const receiver = [{ day: "mon", start_time: "10:00", end_time: "11:00" }];

    // 10:00-10:00 is a zero-width window, not a real overlap
    expect(findCommonSlot(sender, receiver)).toBeNull();
  });

  test("checks all slot combinations, not just the first", () => {
    const sender = [
      { day: "mon", start_time: "09:00", end_time: "10:00" },
      { day: "wed", start_time: "14:00", end_time: "16:00" },
    ];
    const receiver = [
      { day: "tue", start_time: "09:00", end_time: "10:00" },
      { day: "wed", start_time: "15:00", end_time: "17:00" },
    ];

    expect(findCommonSlot(sender, receiver)).toEqual({
      day: "wednesday",
      start_time: "15:00",
      end_time: "16:00",
    });
  });

  test("returns null for empty availability lists", () => {
    expect(findCommonSlot([], [])).toBeNull();
    expect(findCommonSlot([{ day: "mon", start_time: "09:00", end_time: "10:00" }], [])).toBeNull();
  });

  test("picks the largest overlap, not the first one found", () => {
    const sender = [
      // Compared first, but only a 30-minute overlap.
      { day: "mon", start_time: "09:00", end_time: "09:30" },
      // Compared second, but a full 2-hour overlap.
      { day: "wed", start_time: "10:00", end_time: "13:00" },
    ];
    const receiver = [
      { day: "mon", start_time: "09:15", end_time: "10:00" },
      { day: "wed", start_time: "11:00", end_time: "13:00" },
    ];

    expect(findCommonSlot(sender, receiver)).toEqual({
      day: "wednesday",
      start_time: "11:00",
      end_time: "13:00",
    });
  });

  test("breaks ties deterministically by day order then start time", () => {
    const sender = [
      { day: "wed", start_time: "09:00", end_time: "10:00" }, // 1hr
      { day: "mon", start_time: "09:00", end_time: "10:00" }, // 1hr, earlier day
    ];
    const receiver = [
      { day: "wed", start_time: "09:00", end_time: "10:00" },
      { day: "mon", start_time: "09:00", end_time: "10:00" },
    ];

    // Both overlaps are exactly 1 hour; Monday should win the tie.
    expect(findCommonSlot(sender, receiver)).toEqual({
      day: "monday",
      start_time: "09:00",
      end_time: "10:00",
    });
  });
});

describe("findAllOverlaps", () => {
  test("returns every overlapping window with its duration", () => {
    const sender = [
      { day: "mon", start_time: "09:00", end_time: "09:30" },
      { day: "wed", start_time: "10:00", end_time: "13:00" },
    ];
    const receiver = [
      { day: "mon", start_time: "09:15", end_time: "10:00" },
      { day: "wed", start_time: "11:00", end_time: "13:00" },
    ];

    const overlaps = findAllOverlaps(sender, receiver);
    expect(overlaps).toHaveLength(2);
    expect(overlaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ day: "monday", duration_minutes: 15 }),
        expect.objectContaining({ day: "wednesday", duration_minutes: 120 }),
      ])
    );
  });

  test("returns an empty array when nothing overlaps", () => {
    expect(findAllOverlaps([], [])).toEqual([]);
  });
});

describe("getNextDateForDay", () => {
  test("rolls forward to the next occurrence of a future day", () => {
    // Reference: Monday, July 6, 2026
    const monday = new Date("2026-07-06T00:00:00Z");
    expect(getNextDateForDay("friday", monday)).toBe("2026-07-10");
  });

  test("returns today's date when the target day is today", () => {
    // Matches existing booking behaviour: date-only comparison, no
    // time-of-day check. Documented here so it's an intentional,
    // tested contract rather than an accidental edge case.
    const monday = new Date("2026-07-06T00:00:00Z");
    expect(getNextDateForDay("monday", monday)).toBe("2026-07-06");
  });

  test("returns null for an unrecognized day", () => {
    expect(getNextDateForDay("someday")).toBeNull();
  });
});
