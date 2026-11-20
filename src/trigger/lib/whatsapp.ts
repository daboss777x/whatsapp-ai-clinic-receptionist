// ============================================================================
// WhatsApp Cloud API: send Emma's replies back to the patient.
// ============================================================================

const GRAPH_API_VERSION = "v26.0";

function config() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error("WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is missing");
  return { token, url: `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages` };
}

async function callWhatsApp(body: unknown) {
  const { token, url } = config();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`WhatsApp API error ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Send a plain text message to a patient. */
export async function sendText(to: string, text: string) {
  return callWhatsApp({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: text, preview_url: false },
  });
}

/**
 * Shows the patient blue ticks + "typing…" while Emma thinks.
 * Nice to have only: if it fails we carry on.
 */
export async function markReadAndShowTyping(messageId: string) {
  try {
    await callWhatsApp({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: { type: "text" },
    });
  } catch (err) {
    console.warn("Typing indicator failed (not a problem):", err);
  }
}
