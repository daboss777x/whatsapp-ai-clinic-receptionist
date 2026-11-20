// ============================================================================
// WhatsApp webhook (Supabase Edge Function)
//
// Meta calls this public URL in two ways:
//   GET  → once, when you set up the webhook. We prove we own it by echoing a code.
//   POST → every time a patient sends a message (and for "delivered/read" updates).
//
// For each new patient message we start the "whatsapp-agent" task on Trigger.dev,
// then answer Meta with 200 straight away (Meta wants a reply within a few seconds).
// ============================================================================

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
// DEV key while building, PROD key when live. Swap the secret, not the code.
const TRIGGER_SECRET_KEY = Deno.env.get("TRIGGER_SECRET_KEY") ?? "";
const TRIGGER_TASK_ID = "whatsapp-agent";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ---- 1. GET: Meta's one-time "is this really your webhook?" check -------
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // ---- 2. POST: check the message really came from Meta --------------------
  // Meta signs every request with our App Secret. If the signature doesn't match,
  // someone else is pretending to be Meta, so we reject it.
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  if (!(await isValidSignature(rawBody, signature))) {
    console.warn("Rejected a request with a bad signature");
    return new Response("Invalid signature", { status: 401 });
  }

  // ---- 3. Pull out the patient messages ------------------------------------
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const incoming = extractMessages(body);
  // No messages = just a "delivered/read" status update. Nothing to do.
  if (incoming.length === 0) return new Response("OK", { status: 200 });

  // ---- 4. Start the agent for each message ---------------------------------
  try {
    for (const msg of incoming) await triggerAgent(msg);
  } catch (err) {
    // Returning 500 makes Meta retry later. The idempotency key stops duplicates.
    console.error("Could not trigger the agent:", err);
    return new Response("Trigger failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
});

// What we send to the agent for each WhatsApp message.
type IncomingMessage = {
  phone: string;        // patient's number, e.g. "15551234567"
  name: string | null;  // their WhatsApp profile name (may be empty)
  type: string;         // "text", "audio", "image", "sticker", ...
  text: string | null;  // the message text (only for type "text")
  waMessageId: string;  // WhatsApp's unique id for this message
};

// Meta's JSON is deeply nested. This digs out just the bits we need.
function extractMessages(body: any): IncomingMessage[] {
  const result: IncomingMessage[] = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const contacts = value?.contacts ?? [];
      for (const m of value?.messages ?? []) {
        const contact = contacts.find((c: any) => c.wa_id === m.from) ?? contacts[0];
        result.push({
          phone: m.from,
          name: contact?.profile?.name ?? null,
          type: m.type,
          text: m.type === "text" ? m.text?.body ?? null : null,
          waMessageId: m.id,
        });
      }
    }
  }
  return result;
}

// Starts the Trigger.dev task using its REST API (the simplest option inside Supabase).
async function triggerAgent(msg: IncomingMessage) {
  const res = await fetch(`https://api.trigger.dev/api/v1/tasks/${TRIGGER_TASK_ID}/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TRIGGER_SECRET_KEY}`,
    },
    body: JSON.stringify({
      payload: msg,
      options: {
        // Meta sometimes sends the same message twice. Same key = only one run = one reply.
        idempotencyKey: msg.waMessageId,
        // One run at a time per patient, so their messages are answered in order.
        concurrencyKey: msg.phone,
        // If the agent can't start within 10 minutes (e.g. dev server off), drop it.
        ttl: "10m",
      },
    }),
  });
  if (!res.ok) throw new Error(`Trigger.dev answered ${res.status}: ${await res.text()}`);
}

// Checks Meta's "x-hub-signature-256" header: sha256=<HMAC of the body using our App Secret>.
async function isValidSignature(rawBody: string, header: string): Promise<boolean> {
  if (!APP_SECRET || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const received = header.slice("sha256=".length);
  // Compare every character so timing doesn't leak how much matched.
  if (expected.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}
