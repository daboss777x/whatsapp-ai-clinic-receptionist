// ============================================================================
// Chat simulator for stress tests. Talks to Emma's REAL brain (same instructions,
// clinic files, booking tool and booking rules) but with NO WhatsApp, NO Supabase
// and NO Airtable: history lives in a local JSON file, bookings are only recorded.
//
// Usage (one patient message per call):
//   npx tsx --env-file=.env scripts/simulate-chat.ts <session.json> "patient message"
// Prints Emma's reply, plus any booking attempt as [BOOKING ...].
// Mirrors askEmma() in src/trigger/whatsapp-agent.ts. Keep the two in sync.
// ============================================================================
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import OpenAI from "openai";
import { decideBooking, saveBookingTool, type BookingInput } from "../src/trigger/lib/booking.js";
import { nowInNewYork } from "../src/trigger/lib/clinic-hours.js";
import { loadKnowledge } from "../src/trigger/lib/knowledge.js";
import { buildInstructions } from "../src/trigger/lib/prompt.js";

const [sessionFile, message] = process.argv.slice(2);
if (!sessionFile || !message) {
  console.error('Usage: simulate-chat.ts <session.json> "message"');
  process.exit(1);
}

type Session = { phone: string; history: { role: "user" | "assistant"; content: string }[]; bookings: any[] };
const session: Session = existsSync(sessionFile)
  ? JSON.parse(readFileSync(sessionFile, "utf8"))
  : { phone: "1555000" + String(Math.floor(Math.random() * 9000) + 1000), history: [], bookings: [] };

session.history.push({ role: "user", content: message });

// Same rules as handleSaveBooking() (shared decideBooking), but "Airtable" is this session file.
function fakeSaveBooking(input: BookingInput) {
  const today = nowInNewYork().date;
  const existing = session.bookings.find((b) => b.stored && b.stored.day >= today)?.stored ?? null;
  const decision = decideBooking(input, existing);
  return { result: decision.result, stored: decision.save ? { day: input.day, time: decision.time12h } : null };
}

function finalAnswerText(output: any[]): string {
  const messages = output.filter((o) => o.type === "message");
  const final = messages.filter((m) => m.phase === "final_answer").at(-1) ?? messages.at(-1);
  return (final?.content ?? []).filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("").trim();
}

const openai = new OpenAI();
const instructions = buildInstructions(await loadKnowledge(), "Test Patient");
const input: any[] = session.history.map((m) => ({ role: m.role, content: m.content }));
let reply = "";

for (let round = 0; round < 4 && !reply; round++) {
  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-6-luna",
    instructions,
    input,
    tools: [saveBookingTool],
    reasoning: { effort: "low" },
  });
  const calls = response.output.filter((o: any) => o.type === "function_call") as any[];
  if (calls.length === 0) {
    reply = finalAnswerText(response.output) || "(EMPTY REPLY)";
    break;
  }
  input.push(...response.output);
  for (const call of calls) {
    const args = JSON.parse(call.arguments);
    const { result, stored } = call.name === "save_booking" ? fakeSaveBooking(args) : { result: { error: "unknown tool" }, stored: null };
    session.bookings.push({ requested: args, result, stored });
    console.log(`[BOOKING ATTEMPT] args=${JSON.stringify(args)} result=${JSON.stringify(result)}`);
    input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
  }
}
if (!reply) reply = "(NO REPLY: too many tool rounds)";

session.history.push({ role: "assistant", content: reply });
writeFileSync(sessionFile, JSON.stringify(session, null, 2));
console.log(`EMMA: ${reply}`);
