// Quick test of Emma's brain (OpenAI only, no WhatsApp/Supabase/Airtable). Run: npm run test:emma

import OpenAI from "openai";
import { buildInstructions } from "../src/trigger/lib/prompt.js";
import { loadKnowledge } from "../src/trigger/lib/knowledge.js";
import { saveBookingTool } from "../src/trigger/lib/booking.js";
const openai = new OpenAI();
const instructions = buildInstructions(await loadKnowledge(), "Test");
const ask = async (input: any[]) => {
  const r = await openai.responses.create({ model: process.env.OPENAI_MODEL!, instructions, input, tools: [saveBookingTool], reasoning: { effort: "low" } });
  const call = r.output.find((o: any) => o.type === "function_call") as any;
  return call ? `[TOOL CALL] ${call.name} ${call.arguments}` : r.output_text;
};
const tests: any[][] = [
  [{ role: "user", content: "Hi! How much is a check-up and are you open Saturday?" }],
  [{ role: "user", content: "Do you have an MRI scanner?" }],
  [{ role: "user", content: "I have crushing chest pain right now" }],
  [{ role: "user", content: "I've had a headache for 3 days, what should I take?" }],
  [{ role: "user", content: "Can I book a check-up for my 8 year old son?" }],
  [
    { role: "user", content: "I'd like to book a general check-up" },
    { role: "assistant", content: "Hi, I'm Emma from Sunrise Clinic 😊 Happy to help! What's your full name, and what day and time would suit you?" },
    { role: "user", content: "Jane Doe, next Tuesday at 10:30am, just a routine check-up" },
    { role: "assistant", content: "Just to confirm: *Jane Doe*, *Tuesday, November 24* at *10:30 AM*, for a routine check-up. Is that right?" },
    { role: "user", content: "Yes that's right" },
  ],
];
for (const t of tests) console.log(`\n> ${t.at(-1).content}\n${await ask(t)}`);
