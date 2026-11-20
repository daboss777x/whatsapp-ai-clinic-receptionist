# WhatsApp AI Clinic Receptionist ("Emma")

## What it is
A WhatsApp AI receptionist ("Emma") for a small adults-only clinic (the sample clinic is a fictional
Sunrise Clinic in New York). It answers questions **only** from `context/*.md`, books check-up *requests*
into Airtable, remembers 3 days of chat per phone number in Supabase, never gives medical advice, and sends
possible emergencies to 911 / the nearest ER.

## Message flow
1. A patient messages on WhatsApp. Meta POSTs to the Supabase Edge Function `whatsapp-webhook`.
2. The webhook checks `X-Hub-Signature-256` with `META_APP_SECRET` and ignores status updates. For each
   message it calls the Trigger.dev REST API to trigger `whatsapp-agent`, with `idempotencyKey = WhatsApp
   message id`, `concurrencyKey = phone` and `ttl 10m`. It answers Meta with 200, or 500 so Meta retries.
3. `whatsapp-agent` (a `schemaTask` with a zod payload) runs these steps:
   - shows read ticks and the typing indicator;
   - sends a "text only" reply for non-text messages;
   - otherwise saves the user message, loads the last 3 days of history and builds the instructions
     (rules + 14-day labelled calendar + `context/*.md`);
   - calls the OpenAI Responses API with the `save_booking` tool, looping up to 4 tool rounds;
   - sends the reply and saves it.
   If every retry fails, `onFailure` sends an apology.
4. `save_booking` → `decideBooking()` makes 3 checks: the slot rules (`checkBookingSlot`), one upcoming
   booking per phone, and duplicates. If they pass, it creates an Airtable record with `Status=Requested`.
5. The `cleanup-old-messages` schedule (3 AM America/New_York) deletes messages older than 3 days.

## Key files
| File | Role |
|---|---|
| `src/trigger/whatsapp-agent.ts` | Main task, OpenAI tool loop (`askEmma`), `finalAnswerText` (only the final_answer block) |
| `src/trigger/lib/prompt.ts` | System instructions: safety, language, tone, booking steps, stay-on-topic |
| `src/trigger/lib/booking.ts` | Tool schema (strict), `decideBooking` (shared with the simulator), Airtable calls |
| `src/trigger/lib/clinic-hours.ts` | Hours, US holidays (computed by rule), `upcomingCalendar`, `checkBookingSlot`, NY time |
| `src/trigger/lib/memory.ts` | Supabase save/load/delete (`MEMORY_DAYS = 3`) |
| `src/trigger/lib/knowledge.ts` | Reads `context/*.md` via `process.cwd()` |
| `src/trigger/lib/whatsapp.ts` | Graph API v26.0 send + typing indicator |
| `src/trigger/cleanup-old-messages.ts` | Nightly schedule |
| `supabase/functions/whatsapp-webhook/index.ts` | Meta webhook (Deno, no imports) |
| `supabase/migrations/20261120000000_messages.sql` | `messages` table, RLS on, grants for `service_role` |
| `scripts/simulate-chat.ts` | Multi-turn simulator: real prompt and rules, no WhatsApp/Supabase/Airtable. Keep it in sync with `askEmma()` |
| `scripts/test-emma.ts` | Six quick prompt checks |
| `dashboard/index.html` | Static HITL demo with sample data (not connected) |
| `context/*.md` | Knowledge base (fictional sample clinic) |

## Commands
- `npm run dev`: Trigger.dev dev mode (the agent runs locally; the webhook must hold the DEV key).
- `npm run typecheck`: `tsc -p .`
- `npm run test:emma`: six sample prompts to OpenAI.
- `npm run simulate -- <session.json> "message"`: one simulated patient turn.
- `npx supabase functions deploy whatsapp-webhook --project-ref <ref> --no-verify-jwt`
- `npx supabase secrets set --env-file <file> --project-ref <ref>`

## Conventions and rules
- **Behaviour:** Emma never gives medical advice; emergencies go to 911 / Mount Sinai West (from
  `context/about.md`). Unknown answers point to the clinic phone. There's no staff follow-up queue.
- **Bookings:** check-ups only, adults only, one upcoming booking per phone, no changes or cancellations
  in chat, `Status = Requested`. Code enforces Sundays, US holidays, hours (last slot 30 minutes before
  closing), past dates, 60 days ahead, and weekday matching the date.
- **Language:** replies in the patient's language. Booking records (name, reason) are in English and
  third person, for staff.
- **Keep two places in sync:** hours and holidays in `clinic-hours.ts` (enforced) and in
  `context/opening-hours.md` (what Emma says).
- **After any prompt change:** re-run the simulator personas (angry, broken English, other language,
  indecisive booker, misuse, diagnosis-pusher). A prompt fix once broke "stay on topic".
- **Code style:** comments in plain English, for a non-developer owner.

## Trigger.dev (SDK v4.8.8)
Examples live in [.claude/commands/trigger-ref.md](.claude/commands/trigger-ref.md) (`/trigger-ref`).
- **Imports:** always from `@trigger.dev/sdk`, never `/v3` or v2 `client.defineJob`.
- **Tasks:** in `src/trigger/`. Use `schemaTask` for outside payloads.
- **Schedules:** use the cron object form with a timezone.
- **Concurrency:** per-patient ordering uses `concurrency: { perKey: 1 }` plus a `concurrencyKey` at
  trigger time.
- **Bundled files:** `/context` is bundled with `additionalFiles`, and `legacyDevProcessCwdBehaviour: false`.
- **Env vars:** dev reads `.env`. Production values go in the dashboard (Environment Variables →
  Production). Never put secrets in payloads.
- **Deploy:** through the GitHub integration (a push to `main` deploys). Go-live means swapping the
  webhook's `TRIGGER_SECRET_KEY` from `tr_dev_…` to `tr_prod_…` (a Supabase secret, with no code change).
- **MCP tools:** `get_current_worker`, `trigger_task`, `list_runs`, `get_run_details`, `list_deploys`,
  `search_docs`.

## Env and secrets
- Every key is listed and explained in `.env.example`. Never commit `.env`, never print key values, and
  never ask the owner to paste keys into chat.
- Split by where each key lives:
  - **Agent (Trigger.dev):** OPENAI_*, SUPABASE_URL / SERVICE_ROLE_KEY, WHATSAPP_ACCESS_TOKEN /
    PHONE_NUMBER_ID, AIRTABLE_*.
  - **Webhook (Supabase secrets):** TRIGGER_SECRET_KEY, WHATSAPP_VERIFY_TOKEN, META_APP_SECRET.
  - **Local CLI only:** SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, TRIGGER_PROD_SECRET_KEY.

## Known shortcuts and gotchas
- **Webhook login:** the webhook has `verify_jwt = false`, and its only protection is the Meta signature.
- **Dashboard:** it's a mock-up with no auth.
- **Patient data:** it goes to OpenAI, Supabase and Airtable. That's not HIPAA-ready as-is.
- **Trigger.dev keys:** use a secret key (`tr_dev_` / `tr_prod_`), not a personal access token (`tr_pat_`).
- **New Supabase projects:** they need explicit `grant`s for `service_role` on new tables.
- **Real WhatsApp numbers:** the app must be subscribed to the WABA (`/{WABA_ID}/subscribed_apps`).
- **Networks that block Facebook:** in dev mode, replies time out (graph.facebook.com is unreachable).
  Production in the cloud is unaffected.
- **OpenAI output:** `response.output_text` can join several message blocks, so use `finalAnswerText()`.

## Credits
- The Trigger.dev starter files (`.claude/commands/trigger-ref.md`, `trigger.config.ts`, `tsconfig.json`)
  come from Nate Herk's AI Automation Society Skool community: https://www.skool.com/ai-automation-society
