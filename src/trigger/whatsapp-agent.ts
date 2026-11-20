// ============================================================================
// THE AGENT: one incoming WhatsApp message → one reply from Emma.
//
// Started by the Supabase webhook for every patient message. Steps:
//   1. Save the patient's message to memory (Supabase)
//   2. Load the last 3 days of this patient's chat
//   3. Ask OpenAI for a reply (with the clinic info + Emma's rules)
//      → if the AI wants to book, run the save_booking tool (Airtable)
//   4. Send the reply on WhatsApp and save it to memory
// If everything fails after retries, the patient gets a friendly apology.
// ============================================================================
import { logger, schemaTask } from "@trigger.dev/sdk";
import OpenAI from "openai";
import { z } from "zod";
import { handleSaveBooking, saveBookingTool, type BookingInput } from "./lib/booking.js";
import { loadKnowledge } from "./lib/knowledge.js";
import { loadRecentHistory, saveMessage } from "./lib/memory.js";
import { buildInstructions, ERROR_REPLY, TEXT_ONLY_REPLY } from "./lib/prompt.js";
import { markReadAndShowTyping, sendText } from "./lib/whatsapp.js";

// What the webhook sends us (checked automatically, so bad data never gets in).
const IncomingMessage = z.object({
  phone: z.string().regex(/^\d{6,15}$/),
  name: z.string().nullable(),
  type: z.string(),
  text: z.string().nullable(),
  waMessageId: z.string(),
});

const MAX_TOOL_ROUNDS = 4; // stops the AI looping forever on tool calls

export const whatsappAgent = schemaTask({
  id: "whatsapp-agent",
  schema: IncomingMessage,
  maxDuration: 120,
  // One run at a time PER PATIENT (the webhook passes concurrencyKey = phone),
  // so if someone sends 3 quick messages they're answered in order.
  concurrency: { perKey: 1, total: 20 },
  retry: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 8000, factor: 2 },

  run: async (msg) => {
    // Blue ticks + "typing…" so the patient knows Emma is on it.
    await markReadAndShowTyping(msg.waMessageId);

    // ---- Voice notes, photos, stickers etc: ask for text instead --------
    if (msg.type !== "text" || !msg.text?.trim()) {
      await saveMessage(msg.phone, "user", `[sent a ${msg.type} message]`, msg.waMessageId);
      await sendText(msg.phone, TEXT_ONLY_REPLY);
      await safeSave(msg.phone, TEXT_ONLY_REPLY);
      return { replied: "text-only notice" };
    }

    // ---- 1 + 2. Memory -----------------------------------------------------
    await saveMessage(msg.phone, "user", msg.text, msg.waMessageId);
    const history = await loadRecentHistory(msg.phone); // includes the message we just saved
    logger.log("Loaded history", { messages: history.length });

    // ---- 3. Ask the AI -----------------------------------------------------
    const reply = await askEmma(msg.phone, msg.name, history);

    // ---- 4. Reply + remember ----------------------------------------------
    await sendText(msg.phone, reply);
    await safeSave(msg.phone, reply);
    return { replied: reply };
  },

  // Runs once, only after ALL retries have failed. Let the patient know.
  onFailure: async ({ payload, error }) => {
    logger.error("Agent failed after all retries", { error });
    try {
      await sendText(payload.phone, ERROR_REPLY);
    } catch (err) {
      logger.error("Could not even send the apology", { err });
    }
  },
});

/** Talks to OpenAI, running the booking tool when the AI asks for it. Returns Emma's text reply. */
async function askEmma(phone: string, patientName: string | null, history: { role: "user" | "assistant"; content: string }[]) {
  const openai = new OpenAI(); // reads OPENAI_API_KEY from the environment
  const instructions = buildInstructions(await loadKnowledge(), patientName);

  // The conversation so far, in OpenAI's format.
  const input: any[] = history.map((m) => ({ role: m.role, content: m.content }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-6-luna",
      instructions,
      input,
      tools: [saveBookingTool],
      reasoning: { effort: "low" }, // quick replies; this is a chat, not a maths exam
    });

    const toolCalls = response.output.filter((item: any) => item.type === "function_call") as any[];
    if (toolCalls.length === 0) {
      const text = finalAnswerText(response.output);
      if (!text) throw new Error("OpenAI returned an empty reply");
      return text;
    }

    // The AI wants to use a tool. Run it and hand the result back.
    input.push(...response.output);
    for (const call of toolCalls) {
      let result: unknown;
      if (call.name === "save_booking") {
        const args = JSON.parse(call.arguments) as BookingInput;
        result = await handleSaveBooking(args, phone);
        logger.log("save_booking", { day: args.day, time: args.time, result });
      } else {
        result = { error: `Unknown tool ${call.name}` };
      }
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }
  }
  throw new Error("Too many tool rounds");
}

/**
 * Picks ONLY Emma's final answer from OpenAI's output.
 * The model can return more than one message block (e.g. an in-between "commentary"
 * one plus the "final_answer"). response.output_text glues them all together, which
 * made Emma send her reply twice in one message, so we take just the final one.
 */
function finalAnswerText(output: any[]): string {
  const messages = output.filter((o) => o.type === "message");
  const final = messages.filter((m) => m.phase === "final_answer").at(-1) ?? messages.at(-1);
  return (final?.content ?? [])
    .filter((c: any) => c.type === "output_text")
    .map((c: any) => c.text)
    .join("")
    .trim();
}

/** Saving Emma's reply must never cause a retry, because the patient already got the message. */
async function safeSave(phone: string, reply: string) {
  try {
    await saveMessage(phone, "assistant", reply);
  } catch (err) {
    logger.error("Reply sent but not saved to memory", { err });
  }
}
