// ============================================================================
// Opening hours, public holidays + New York time helpers.
//
// ⚠️ Keep these hours and holidays in sync with context/opening-hours.md. That
// file is what Emma TELLS patients; this file is what the booking tool CHECKS.
// ============================================================================

export const CLINIC_TIMEZONE = "America/New_York";
export const CLINIC_PHONE = "(212) 555-0147";
export const MAX_DAYS_AHEAD = 60;
const LAST_SLOT_MINUTES_BEFORE_CLOSE = 30;
const CALENDAR_DAYS = 14; // how many upcoming days Emma gets as a ready-made calendar

// 0 = Sunday ... 6 = Saturday. Times are minutes after midnight. null = closed.
const HOURS: Record<number, { open: number; close: number } | null> = {
  0: null,                              // Sunday: closed
  1: { open: 8 * 60, close: 18 * 60 },  // Mon 8am–6pm
  2: { open: 8 * 60, close: 18 * 60 },
  3: { open: 8 * 60, close: 18 * 60 },
  4: { open: 8 * 60, close: 18 * 60 },
  5: { open: 8 * 60, close: 18 * 60 },  // Fri
  6: { open: 9 * 60, close: 13 * 60 },  // Sat 9am–1pm
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ---- Public holidays (clinic closed) ----------------------------------------
// Worked out for any year, so this never needs updating.

/** The n-th given weekday of a month, e.g. 4th Thursday of November. n = -1 means the last one. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
    return iso(year, month, day);
  }
  const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastWeekday = new Date(Date.UTC(year, month - 1, lastDate)).getUTCDay();
  return iso(year, month, lastDate - ((lastWeekday - weekday + 7) % 7));
}
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Returns the holiday name if the clinic is closed for a holiday on that date, otherwise null. */
export function holidayOn(day: string): string | null {
  const year = Number(day.slice(0, 4));
  const holidays: Record<string, string> = {
    [iso(year, 1, 1)]: "New Year's Day",
    [nthWeekday(year, 5, 1, -1)]: "Memorial Day",
    [iso(year, 7, 4)]: "Independence Day (July 4th)",
    [nthWeekday(year, 9, 1, 1)]: "Labor Day",
    [nthWeekday(year, 11, 4, 4)]: "Thanksgiving Day",
    [iso(year, 12, 25)]: "Christmas Day",
  };
  return holidays[day] ?? null;
}

/** Opening hours for a date, or null if closed (Sunday or a holiday). */
function hoursOn(day: string) {
  if (holidayOn(day)) return null;
  return HOURS[new Date(`${day}T12:00:00Z`).getUTCDay()];
}

/** Adds n days to a YYYY-MM-DD date. */
function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---- "Now" in New York ---------------------------------------------------------

/** "Now" in New York: date as YYYY-MM-DD, weekday number and minutes after midnight. */
export function nowInNewYork(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CLINIC_TIMEZONE,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false, weekday: "long",
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour) % 24; // Intl can return "24" for midnight
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: DAY_NAMES.indexOf(parts.weekday),
    minutes: hour * 60 + Number(parts.minute),
    // Human-friendly, e.g. "Friday, November 20, 2026, 9:41 PM"
    pretty: new Intl.DateTimeFormat("en-US", {
      timeZone: CLINIC_TIMEZONE, dateStyle: "full", timeStyle: "short",
    }).format(now),
  };
}

/** Is the clinic open right now? If not, when does it next open (e.g. "Monday at 8:00 AM")? */
export function clinicStatusNow(now = new Date()) {
  const ny = nowInNewYork(now);
  const today = hoursOn(ny.date);
  const isOpen = !!today && ny.minutes >= today.open && ny.minutes < today.close;

  let nextOpening = "";
  if (!isOpen) {
    if (today && ny.minutes < today.open) {
      nextOpening = `today at ${formatMinutes(today.open)}`;
    } else {
      // The next day with opening hours (skips Sundays AND holidays).
      for (let i = 1; i <= 10; i++) {
        const day = addDays(ny.date, i);
        const hours = hoursOn(day);
        if (hours) {
          const name = DAY_NAMES[new Date(`${day}T12:00:00Z`).getUTCDay()];
          nextOpening = `${i === 1 ? "tomorrow" : name} (${name}) at ${formatMinutes(hours.open)}`;
          break;
        }
      }
    }
  }
  return { isOpen, nextOpening, nowPretty: ny.pretty, todayDate: ny.date };
}

/**
 * A ready-made calendar of the next 14 days, so the AI never has to work out
 * dates itself (it once turned "Wednesday next week" into the wrong week).
 */
export function upcomingCalendar(now = new Date()) {
  const ny = nowInNewYork(now);
  // Weeks run Monday to Sunday. Label each day so the AI never has to work out "next week".
  const daysSinceMonday = (ny.weekday + 6) % 7;
  const WEEK_LABELS = ["THIS WEEK", "NEXT WEEK", "THE WEEK AFTER NEXT"];
  const lines: string[] = [];
  for (let i = 0; i < CALENDAR_DAYS; i++) {
    const day = addDays(ny.date, i);
    const name = DAY_NAMES[new Date(`${day}T12:00:00Z`).getUTCDay()];
    const week = WEEK_LABELS[Math.floor((daysSinceMonday + i) / 7)] ?? "LATER";
    const label = ` [${week}]` + (i === 0 ? " (TODAY)" : i === 1 ? " (TOMORROW)" : "");
    const holiday = holidayOn(day);
    const hours = hoursOn(day);
    const status = holiday
      ? `CLOSED (${holiday})`
      : !hours
        ? "CLOSED"
        : `open ${formatMinutes(hours.open)}–${formatMinutes(hours.close)}, last check-up ${formatMinutes(hours.close - LAST_SLOT_MINUTES_BEFORE_CLOSE)}`;
    lines.push(`- ${name} ${prettyShort(day)} = ${day}${label}: ${status}`);
  }
  return lines.join("\n");
}

// ---- Booking checks --------------------------------------------------------------

/**
 * Checks a requested booking. Returns null if it's fine, or a short reason
 * (for Emma to explain to the patient) if it isn't.
 * day = "YYYY-MM-DD", time = "HH:MM" (24-hour), weekday = the weekday Emma told the patient.
 */
export function checkBookingSlot(day: string, time: string, weekday?: string, now = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "The day must be a real date (YYYY-MM-DD).";
  if (!/^\d{2}:\d{2}$/.test(time)) return "The time must be like 14:30.";

  const date = new Date(`${day}T12:00:00Z`); // noon UTC avoids timezone edge cases
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    return "That date doesn't exist.";
  }

  // Safety net for date mix-ups: the weekday Emma confirmed must match the date.
  const actualWeekday = DAY_NAMES[date.getUTCDay()];
  if (weekday && weekday.trim().toLowerCase() !== actualWeekday.toLowerCase()) {
    return `Date mix-up: ${day} is a ${actualWeekday}, not a ${weekday}. Check the calendar, then confirm the correct date with the patient again before booking.`;
  }

  const ny = nowInNewYork(now);
  const daysAhead = Math.round((date.getTime() - new Date(`${ny.date}T12:00:00Z`).getTime()) / 86_400_000);
  if (daysAhead < 0) return "That day is in the past.";
  if (daysAhead > MAX_DAYS_AHEAD) return `We only take bookings up to ${MAX_DAYS_AHEAD} days ahead.`;

  const holiday = holidayOn(day);
  if (holiday) return `The clinic is closed on ${prettyDate(day)} for ${holiday}.`;

  const hours = HOURS[date.getUTCDay()];
  if (!hours) return `The clinic is closed on ${actualWeekday}s.`;

  const [h, m] = time.split(":").map(Number);
  const minutes = h * 60 + m;
  const lastSlot = hours.close - LAST_SLOT_MINUTES_BEFORE_CLOSE;
  if (minutes < hours.open || minutes > lastSlot) {
    return `On ${actualWeekday}s check-ups can start between ${formatMinutes(hours.open)} and ${formatMinutes(lastSlot)}.`;
  }
  if (daysAhead === 0 && minutes <= ny.minutes) return "That time today has already passed.";

  return null; // all good
}

// ---- Formatting ---------------------------------------------------------------------

/** 510 → "8:30 AM" */
export function formatMinutes(total: number) {
  const h = Math.floor(total / 60), m = total % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "2026-11-24" → "Tuesday, November 24, 2026" */
export function prettyDate(day: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: "UTC" })
    .format(new Date(`${day}T12:00:00Z`));
}

/** "2026-11-24" → "Nov 24" */
function prettyShort(day: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${day}T12:00:00Z`));
}
