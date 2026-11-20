# WhatsApp AI Clinic Receptionist ("Emma")

A WhatsApp assistant for a small clinic. Patients message the clinic's WhatsApp number. Emma answers their
questions using **only** the clinic's own markdown files and books check-ups into an Airtable table that staff
work from. She remembers each conversation for 3 days, never gives medical advice, and points anyone with a
possible emergency to 911 and the nearest ER.

It runs as a [Trigger.dev](https://trigger.dev) task. The WhatsApp Cloud API delivers messages through a Supabase
Edge Function webhook, OpenAI is the brain, Supabase holds chat memory and Airtable holds bookings.

> The clinic in `/context` (Sunrise Clinic, New York) is **fictional sample data**. Replace it with your own.

---

## Who it's for

| Business type | What it takes off their plate |
|---|---|
| Small GP / primary-care clinics | Repetitive "are you open Saturday?", "how much is a check-up?", "do you take my insurance?" messages, plus after-hours booking requests |
| Dental, physio, chiropractic and optometry practices | Collecting name, day, time and reason for appointment requests around the clock, then handing a clean list to the front desk |
| Med spas, beauty and wellness clinics | Price and service questions in several languages, booking requests outside opening hours |
| Vet clinics | Opening hours, location and service FAQs, and booking requests (the emergency rule can point to an emergency vet instead) |
| Any appointment-based local business on WhatsApp | A first-line receptionist that answers only from your own facts and never makes things up |

## How it creates value

- **Time saved at the front desk:** FAQs that would otherwise take a staff reply are answered instantly
  from your own files. Staff only see booking requests and conversations that need a person.
- **Bookings captured out of hours:** a patient messaging at 11 PM gets a reply and a booking request saved,
  instead of waiting until morning (and maybe booking elsewhere).
- **Fewer errors in booking details:** Emma reads every detail back and waits for a clear "yes". Code then
  checks the request: it rejects closed days, US public holidays, times outside opening hours, past dates,
  dates more than 60 days ahead, and a weekday that doesn't match the date.
- **Safer than a generic chatbot:** no medical advice, no invented prices or discounts, emergencies sent to
  911, and only clinic topics.
- **Better patient experience:** replies in the patient's own language, usually within about 10 seconds.

These are qualitative benefits. How much time it saves depends on your message volume.

---

## Features

- Answers questions only from markdown files in `/context`, with no RAG and no vector database.
  If the answer isn't there, Emma says she doesn't know and gives the clinic phone number.
- Books check-ups with a `save_booking` tool. The tool needs name, date, weekday, time and reason, and is
  only called after the patient confirms. Bookings are saved to Airtable with `Status = Requested`.
- One upcoming booking per phone number. Changes and cancellations go through the clinic phone line.
- Conversation memory in Supabase: the last 3 days per phone number. A nightly scheduled task deletes
  older messages.
- Safety rules: no diagnosis, medicines, doses or home remedies. Possible emergencies get a 911 / ER
  message with a plain reason, repeated in every reply until the patient says they've been checked.
- Resists prompt injection: ignores "ignore your instructions", fake admin or system messages and requests
  to reveal its instructions. It never shares other patients' data and stays on clinic topics.
- Replies in the patient's language. Booking records are always saved in English.
- Duplicate-safe: Meta's webhook retries never cause double replies, because the WhatsApp message id is
  used as the idempotency key. Each patient's messages are processed in order, one at a time.
- Shows the "read" ticks and "typing…" indicator while Emma thinks. Voice notes and photos get a polite
  "please type your message".
- If something fails after all retries, the patient gets a friendly apology with the clinic phone number.
- Testing tools: a chat simulator that talks to Emma's real prompt and booking rules without touching
  WhatsApp, Supabase or Airtable.
- A demo human-in-the-loop dashboard (`dashboard/index.html`). This is a **front-end mock-up with sample
  data**, not connected to the system.

### Architecture

```
Patient's WhatsApp
      │  message
      ▼
Meta (WhatsApp Cloud API)
      │  webhook (signed with your App Secret)
      ▼
Supabase Edge Function  "whatsapp-webhook"
      │  verifies signature → triggers task (idempotencyKey = message id, concurrencyKey = phone)
      ▼
Trigger.dev task  "whatsapp-agent"
      ├─ save message + load last 3 days ......... Supabase "messages" table
      ├─ read clinic knowledge ................... context/*.md (bundled with the task)
      ├─ OpenAI Responses API + save_booking tool
      │        └─ rules check → one-booking check → Airtable "Bookings"
      └─ reply via WhatsApp Cloud API, save reply

Trigger.dev schedule "cleanup-old-messages" (3 AM New York): delete messages older than 3 days
```

## Project structure

| Path | What's in it |
|---|---|
| `context/` | The knowledge base: hours, prices, FAQs, location, booking policy. **Edit these to change what Emma knows.** |
| `src/trigger/whatsapp-agent.ts` | The main task: one incoming message → one reply |
| `src/trigger/cleanup-old-messages.ts` | Nightly scheduled task that deletes messages older than 3 days |
| `src/trigger/hello-world.ts` | Tiny test task to prove Trigger.dev is connected |
| `src/trigger/lib/prompt.ts` | Emma's instructions: personality, safety rules, booking steps |
| `src/trigger/lib/booking.ts` | The `save_booking` tool, its rules and the Airtable calls |
| `src/trigger/lib/clinic-hours.ts` | Opening hours, US holidays, the 14-day calendar, booking slot checks |
| `src/trigger/lib/memory.ts` | Supabase chat memory (save, load, cleanup) |
| `src/trigger/lib/knowledge.ts` | Loads `context/*.md` |
| `src/trigger/lib/whatsapp.ts` | Sends replies and the typing indicator |
| `supabase/functions/whatsapp-webhook/` | The Meta webhook (GET verify + POST messages) |
| `supabase/migrations/` | The `messages` table |
| `scripts/test-emma.ts` | Quick test of six sample messages against OpenAI |
| `scripts/simulate-chat.ts` | Multi-turn chat simulator for stress tests (no WhatsApp/Supabase/Airtable) |
| `dashboard/index.html` | Demo HITL inbox (static mock-up with sample data) |
| `.claude/commands/trigger-ref.md` | Trigger.dev v4 quick reference for Claude Code |
| `docs/trigger-setup-prompt.md` | A prompt for setting up Trigger.dev with Claude Code |

---

## Step-by-step setup guide

You'll need Node.js 22 or newer and free accounts on GitHub, Trigger.dev, Supabase, OpenAI (paid API usage),
Airtable and Meta for Developers. See [REQUIREMENTS.md](REQUIREMENTS.md) for the full list.

**1. Get the code**
```bash
git clone https://github.com/<you>/whatsapp-ai-clinic-receptionist.git
cd whatsapp-ai-clinic-receptionist
npm install
cp .env.example .env      # every key is explained inside .env
```

**2. Trigger.dev project**
1. Sign up at [cloud.trigger.dev](https://cloud.trigger.dev) and create a project.
2. `npx trigger.dev@latest login`
3. Copy the project ref (`proj_…`) from Project settings into `trigger.config.ts` (and `.mcp.json` if you use
   the Trigger.dev MCP server with Claude Code).
4. From **API Keys**, copy the **Development** secret key (`tr_dev_…`) into `TRIGGER_SECRET_KEY`. Copy the
   **Production** key (`tr_prod_…`) into `TRIGGER_PROD_SECRET_KEY` for later. Use the secret key, not a
   personal access token (`tr_pat_…`).

**3. OpenAI**: create an API key at [platform.openai.com](https://platform.openai.com/api-keys), put it in
`OPENAI_API_KEY`, and set `OPENAI_MODEL` (default `gpt-6-luna`).

**4. Airtable**
1. Create a base with a table called **Bookings** and these fields: **Name** (text), **Phone** (text),
   **Day** (date), **Time** (text), **Reason** (long text), **Status** (single select: Requested / Confirmed /
   Cancelled), **Created** (created time).
2. Create a personal access token at [airtable.com/create/tokens](https://airtable.com/create/tokens) with
   `data.records:read` and `data.records:write`, with access to that base. It goes in `AIRTABLE_API_KEY`.
3. Copy the base id (`app…`, from the base URL) into `AIRTABLE_BASE_ID`.

**5. Supabase**
1. Create a project at [supabase.com](https://supabase.com). From Project Settings → API, copy the URL and the
   **service_role / secret** key into `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Put the project ref
   (the subdomain) in `SUPABASE_PROJECT_REF`.
2. Create an access token at [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
   and put it in `SUPABASE_ACCESS_TOKEN` (used only by the CLI on your machine).
3. Create the table. Either paste `supabase/migrations/20261120000000_messages.sql` into the SQL Editor
   and run it, or run `npx supabase db push`. The migration includes the `grant` for `service_role`: newer
   Supabase projects don't give it access to new tables automatically.

**6. Meta / WhatsApp Cloud API**
1. At [developers.facebook.com](https://developers.facebook.com), create an app with the **WhatsApp** product
   and connect your business phone number.
2. Copy the **Phone number ID** into `WHATSAPP_PHONE_NUMBER_ID` and the **App secret** (App settings → Basic)
   into `META_APP_SECRET`. Make up any phrase for `WHATSAPP_VERIFY_TOKEN`.
3. Create a **permanent** token: Business Settings → Users → System users → Generate token (expiry "Never",
   permissions `whatsapp_business_messaging` + `whatsapp_business_management`). Put it in `WHATSAPP_ACCESS_TOKEN`.

**7. Deploy the webhook (Supabase Edge Function)**
```bash
set -a; source .env; set +a
npx supabase functions deploy whatsapp-webhook --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
# set the function's secrets (start with the DEV Trigger.dev key)
printf 'TRIGGER_SECRET_KEY=%s\nWHATSAPP_VERIFY_TOKEN=%s\nMETA_APP_SECRET=%s\n' \
  "$TRIGGER_SECRET_KEY" "$WHATSAPP_VERIFY_TOKEN" "$META_APP_SECRET" > /tmp/fn.env
npx supabase secrets set --env-file /tmp/fn.env --project-ref "$SUPABASE_PROJECT_REF" && rm /tmp/fn.env
```
Your webhook URL is `https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/whatsapp-webhook`.

**8. Connect the webhook in Meta**
1. Go to WhatsApp → Configuration → Webhook → Edit. Paste the URL and your verify token, then click
   **Verify and save**.
2. Under Webhook fields, **subscribe to `messages`**.
3. With a real (non-test) number, also make sure your app is subscribed to your WhatsApp Business Account:
   ```bash
   curl -X POST "https://graph.facebook.com/v26.0/<WABA_ID>/subscribed_apps" -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN"
   ```

**9. Test locally (dev mode)**
```bash
npm run test:emma      # 6 sample messages straight to OpenAI (no WhatsApp)
npm run dev            # runs the agent on your machine; keep it running
```
Send a WhatsApp message to your business number. Emma should reply within about 10 seconds. Check the run in
the Trigger.dev dashboard (Development), the `messages` table in Supabase and, after a booking, the
Airtable table.

**10. Go live (production, 24/7)**
1. Push the repo to GitHub. In Trigger.dev → Project settings → GitHub, connect the repo and set the
   production branch to `main`. Every push to `main` now deploys.
2. In Trigger.dev → **Environment Variables**, add these for Production: `OPENAI_API_KEY`, `OPENAI_MODEL`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_NAME`.
3. Swap the webhook's key to production. Until you do this, messages still go to your laptop's dev server:
   ```bash
   printf 'TRIGGER_SECRET_KEY=%s\n' "$TRIGGER_PROD_SECRET_KEY" > /tmp/fn.env
   npx supabase secrets set --env-file /tmp/fn.env --project-ref "$SUPABASE_PROJECT_REF" && rm /tmp/fn.env
   ```
4. Stop `npm run dev`, send a WhatsApp message, and check the run appears under **Production** in Trigger.dev.

**Optional: stress test**
```bash
npm run simulate -- /tmp/chat1.json "Hi, I'd like a check-up next Tuesday at 10"
npm run simulate -- /tmp/chat1.json "Jane Doe, I'm 30, routine check-up"
```
Each call is one patient message, and the JSON file keeps the conversation.

**Demo dashboard:** `cd dashboard && python3 -m http.server 4321`, then open http://localhost:4321.

---

## Customise it for your business

| What | Where |
|---|---|
| Facts Emma knows (services, prices, FAQs, address, policies) | `context/*.md` (plain markdown, no code) |
| Opening hours and holidays the booking tool **enforces** | `src/trigger/lib/clinic-hours.ts` (keep in sync with `context/opening-hours.md`) |
| Assistant name, tone, emoji use, safety rules, booking steps | `src/trigger/lib/prompt.ts` |
| Clinic phone number used in fixed messages | `CLINIC_PHONE` in `src/trigger/lib/clinic-hours.ts` |
| Timezone | `CLINIC_TIMEZONE` in `clinic-hours.ts` and the cron timezone in `cleanup-old-messages.ts` |
| How far ahead bookings are allowed | `MAX_DAYS_AHEAD` in `clinic-hours.ts` |
| Memory length (days) | `MEMORY_DAYS` in `src/trigger/lib/memory.ts` |
| Booking fields / table | `createAirtableBooking()` in `src/trigger/lib/booking.ts` + `AIRTABLE_TABLE_NAME` |
| AI model | `OPENAI_MODEL` env var |
| Fixed "text only" and "something went wrong" replies | `TEXT_ONLY_REPLY` / `ERROR_REPLY` in `prompt.ts` |

## Security notes before real use

- **Patient data:** names, phone numbers, symptoms and booking reasons are stored in Supabase and Airtable,
  and sent to OpenAI. For a real clinic, check your obligations (e.g. HIPAA in the US) and sign the right
  agreements (BAAs) with each provider **before** using it with real patients. This demo is not a
  compliant system as-is.
- **The webhook** accepts calls without a Supabase login (`verify_jwt = false`), because Meta can't log in.
  Its security is the `X-Hub-Signature-256` check against your Meta App Secret. Keep that secret private.
- **The `messages` table** has Row Level Security on with no policies, so only the service-role key can use
  it. Never expose that key in a browser or app.
- **The dashboard** is a static mock-up with no login. If you connect it to real data, add authentication first.
- **Safety:** prompt rules and code checks reduce risk, but an AI can still make mistakes. Have staff
  review bookings (they're only *requests*), and keep the emergency wording reviewed by a clinician.
- **Tokens expire:** WhatsApp tokens made with an expiry date stop working on that date. Use a system user
  token with "Never" expiry.

## Credits

- The Trigger.dev starter files (`.claude/commands/trigger-ref.md`, `trigger.config.ts`, `tsconfig.json`)
  come from **Nate Herk's AI Automation Society** Skool community:
  https://www.skool.com/ai-automation-society
- Built with [Trigger.dev](https://trigger.dev), [Supabase](https://supabase.com),
  [OpenAI](https://platform.openai.com), [Airtable](https://airtable.com) and the
  [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/).
