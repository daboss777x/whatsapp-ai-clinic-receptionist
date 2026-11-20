// ============================================================================
// Memory: saves and loads chat messages in the Supabase "messages" table.
// Emma only remembers the last 3 days; older messages are deleted every night.
// ============================================================================
import { createClient } from "@supabase/supabase-js";

export const MEMORY_DAYS = 3;
const MAX_MESSAGES = 200; // safety cap so one huge chat can't blow up the AI bill

// Uses the secret service-role key, so it can read the locked table.
function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Save one message. For incoming messages, waMessageId stops the same one being saved twice. */
export async function saveMessage(phone: string, role: ChatMessage["role"], content: string, waMessageId?: string) {
  const { error } = await db()
    .from("messages")
    .upsert(
      { phone, role, content, wa_message_id: waMessageId ?? null },
      { onConflict: "wa_message_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`Could not save message: ${error.message}`);
}

/** Load this patient's messages from the last 3 days, oldest first. */
export async function loadRecentHistory(phone: string): Promise<ChatMessage[]> {
  const since = new Date(Date.now() - MEMORY_DAYS * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("messages")
    .select("role, content")
    .eq("phone", phone)
    .gte("created_at", since)
    .order("created_at", { ascending: false }) // newest first, so the cap keeps the latest...
    .limit(MAX_MESSAGES);
  if (error) throw new Error(`Could not load history: ${error.message}`);
  return (data ?? []).reverse() as ChatMessage[]; // ...then flip back to oldest first
}

/** Delete every message older than 3 days. Returns how many were deleted. */
export async function deleteOldMessages() {
  const cutoff = new Date(Date.now() - MEMORY_DAYS * 86_400_000).toISOString();
  const { count, error } = await db().from("messages").delete({ count: "exact" }).lt("created_at", cutoff);
  if (error) throw new Error(`Could not delete old messages: ${error.message}`);
  return count ?? 0;
}
