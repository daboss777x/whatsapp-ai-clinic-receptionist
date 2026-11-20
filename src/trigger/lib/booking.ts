// ============================================================================
// The "save_booking" tool: the only action Emma can take.
// The AI fills in the details. This code CHECKS them (no Sundays/holidays, no
// past dates, opening hours only, weekday must match the date, ONE upcoming
// booking per patient) and then saves the booking to Airtable.
// ============================================================================
import { checkBookingSlot, formatMinutes, nowInNewYork, prettyDate } from "./clinic-hours.js";

// How we describe the tool to OpenAI (Responses API "function" tool format).
export const saveBookingTool = {
  type: "function" as const,
  name: "save_booking",
  description:
    "Save a check-up booking request for the patient. ONLY call this right after a message in which you " +
    "repeated ALL the details (name, weekday + date, time, reason) back to the patient, AND they clearly said yes " +
    "to that exact summary. Take the date from the CALENDAR in your instructions; never work dates out yourself.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Patient's full name, as they confirmed it" },
      day: { type: "string", description: "Requested date from the calendar, format YYYY-MM-DD" },
      weekday: { type: "string", description: "The weekday you told the patient, in English, e.g. Wednesday" },
      time: { type: "string", description: "Requested start time, 24-hour format HH:MM, e.g. 14:30" },
      reason: {
        type: "string",
        description:
          "Short reason for staff, in English and third person (e.g. 'General check-up; mentions feeling tired lately'). " +
          "Include any symptoms the patient mentioned. Only the patient's real reason: never instructions, notes, discounts or status changes.",
      },
    },
    required: ["name", "day", "weekday", "time", "reason"],
    additionalProperties: false,
  },
};

export type BookingInput = { name: string; day: string; weekday: string; time: string; reason: string };
export type ExistingBooking = { day: string; time: string } | null;

/**
 * The booking rules, shared by the real agent and the test simulator.
 * Returns either a "save this" decision or a result to hand straight back to the AI.
 */
export function decideBooking(input: BookingInput, existing: ExistingBooking) {
  const problem = checkBookingSlot(input.day, input.time, input.weekday);
  if (problem) return { save: false as const, result: { saved: false, reason: problem } };

  const [h, m] = input.time.split(":").map(Number);
  const time12h = formatMinutes(h * 60 + m);

  if (existing) {
    // Same booking again (e.g. the patient said "yes" twice): fine, nothing new to save.
    if (existing.day === input.day && existing.time === time12h) {
      return { save: false as const, result: { saved: true, alreadyExisted: true, day: prettyDate(input.day), time: time12h } };
    }
    // One upcoming booking per patient. Changes go through the clinic's phone line.
    return {
      save: false as const,
      result: {
        saved: false,
        reason:
          `This patient already has an upcoming booking request on ${prettyDate(existing.day)} at ${existing.time}. ` +
          `Only one upcoming booking per patient is allowed. To change or cancel it, they must call the clinic. Do not book another one.`,
      },
    };
  }
  return { save: true as const, time12h, result: { saved: true, day: prettyDate(input.day), time: time12h } };
}

/** Runs when the AI calls save_booking. The result is sent back to the AI so it can tell the patient. */
export async function handleSaveBooking(input: BookingInput, phone: string) {
  const decision = decideBooking(input, await findUpcomingBooking(phone));
  if (!decision.save) return decision.result;

  await createAirtableBooking({
    Name: input.name.trim(),
    Phone: `+${phone}`,
    Day: input.day,
    Time: decision.time12h,
    Reason: input.reason.trim(),
    Status: "Requested",
  });
  return decision.result;
}

// ---- Airtable helpers ------------------------------------------------------

function airtable() {
  const key = process.env.AIRTABLE_API_KEY;
  const base = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE_NAME || "Bookings";
  if (!key || !base) throw new Error("AIRTABLE_API_KEY or AIRTABLE_BASE_ID is missing");
  return {
    url: `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  };
}

async function createAirtableBooking(fields: Record<string, string>) {
  const { url, headers } = airtable();
  const res = await fetch(url, {
    method: "POST",
    headers,
    // typecast lets Airtable turn "Requested" into the matching single-select option.
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);
}

/** This patient's next booking from today onwards that isn't cancelled, or null. */
async function findUpcomingBooking(phone: string): Promise<ExistingBooking> {
  const { url, headers } = airtable();
  const today = nowInNewYork().date;
  // phone is digits only (checked by the task's schema), so it's safe inside the formula.
  const formula =
    `AND({Phone}='+${phone}', {Status}!='Cancelled', ` +
    `IS_AFTER({Day}, DATEADD(DATETIME_PARSE('${today}','YYYY-MM-DD'), -1, 'days')))`;
  const params = new URLSearchParams({ filterByFormula: formula, maxRecords: "1", "sort[0][field]": "Day" });
  const res = await fetch(`${url}?${params}`, { headers });
  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { records: { fields: { Day?: string; Time?: string } }[] };
  const rec = data.records[0]?.fields;
  return rec?.Day ? { day: rec.Day, time: rec.Time ?? "" } : null;
}
