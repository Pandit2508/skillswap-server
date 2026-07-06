/**
 * Availability-matching and scheduling helpers.
 *
 * Extracted so this core logic (the thing that actually earns the
 * "overlap-based availability matching" claim) can be unit tested
 * independently of Express and the database.
 */

const DAY_MAP = {
  sun: "sunday",
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
};

const DAYS_OF_WEEK = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
];

export const normalizeDay = (day) => {
  if (!day || typeof day !== "string") return "";
  return DAY_MAP[day.toLowerCase().slice(0, 3)] || day.toLowerCase();
};

export const toMinutes = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export const toTime = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/**
 * Finds the first overlapping availability window between two sets of
 * weekly slots. Returns null if no day/time overlap exists.
 */
export const findCommonSlot = (senderSlots = [], receiverSlots = []) => {
  for (const s of senderSlots) {
    for (const r of receiverSlots) {
      const senderDay = normalizeDay(s.day);
      const receiverDay = normalizeDay(r.day);

      if (senderDay === receiverDay) {
        const sStart = toMinutes(s.start_time);
        const sEnd = toMinutes(s.end_time);
        const rStart = toMinutes(r.start_time);
        const rEnd = toMinutes(r.end_time);

        const start = Math.max(sStart, rStart);
        const end = Math.min(sEnd, rEnd);

        if (start < end) {
          return {
            day: senderDay,
            start_time: toTime(start),
            end_time: toTime(end),
          };
        }
      }
    }
  }
  return null;
};

/**
 * Returns the ISO date (YYYY-MM-DD) of the next upcoming occurrence
 * of the given weekday, relative to now. If today matches, rolls
 * forward to next week (mirrors original booking behaviour: a slot
 * for "today" that may have already passed still books next week).
 */
export const getNextDateForDay = (dayName, referenceDate = new Date()) => {
  const targetDay = DAYS_OF_WEEK.indexOf(normalizeDay(dayName));
  if (targetDay === -1) return null;

  const today = new Date(referenceDate);
  let diff = targetDay - today.getDay();
  if (diff < 0) diff += 7;

  const nextDate = new Date(today);
  nextDate.setDate(today.getDate() + diff);

  return nextDate.toISOString().split("T")[0];
};
