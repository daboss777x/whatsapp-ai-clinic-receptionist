# Requirements

## Platforms and accounts

| Platform | What it's used for | Plan needed | Sign up |
|---|---|---|---|
| Meta for Developers + a Meta Business account | WhatsApp Cloud API: receiving and sending messages | Free to set up; messages are billed by Meta (see costs) | https://developers.facebook.com |
| A WhatsApp business phone number | The number patients message | A number not already registered on the WhatsApp app | Added inside the Meta app |
| Trigger.dev | Runs the agent task, retries, scheduled cleanup | Free tier works for testing; paid for higher volume | https://cloud.trigger.dev |
| Supabase | `messages` table (chat memory) + the webhook Edge Function | Free tier is enough to start | https://supabase.com |
| OpenAI | The AI model (`gpt-6-luna` by default) | Pay-as-you-go API billing | https://platform.openai.com |
| Airtable | "Bookings" table that staff work from | Free tier is enough to start | https://airtable.com |
| GitHub | Hosting the code; Trigger.dev deploys from pushes to `main` | Free | https://github.com |

## Local tools

| Tool | Version used | Purpose |
|---|---|---|
| Node.js | 24.x (22+ should work) | Runs the Trigger.dev CLI, scripts and type checks |
| npm | comes with Node | Installs packages |
| Trigger.dev CLI | `npx trigger.dev@latest` (4.8.8 at the time of writing) | Login, `dev` mode, MCP server |
| Supabase CLI | 3.2.0 (installed as a dev dependency, `npx supabase`) | Deploy the Edge Function, set its secrets |
| Python 3 (optional) | any | Serve the demo dashboard locally (`python3 -m http.server`) |
| `curl` (optional) | any | Subscribing the Meta app to your WhatsApp Business Account |

## Languages / runtimes

- **TypeScript** on Node.js (Trigger.dev runtime `node-24`) for the agent.
- **TypeScript on Deno** (Supabase Edge Runtime) for the webhook.
- **SQL** (Postgres) for the migration.
- Plain **HTML/CSS/JS** for the demo dashboard (no build step).

## npm packages

| Package | Version | Purpose |
|---|---|---|
| `@trigger.dev/sdk` | ^4.8.8 | Defining tasks, schedules, logging |
| `@trigger.dev/build` (dev) | ^4.8.8 | Build extensions (`additionalFiles` bundles `/context`) |
| `openai` | ^7.62.0 | OpenAI Responses API client |
| `@supabase/supabase-js` | ^2.119.2 | Reading/writing the `messages` table |
| `zod` | ^4.6.7 | Validating the webhook payload (`schemaTask`) |
| `supabase` (dev) | ^3.2.0 | Supabase CLI |
| `typescript` (dev) | ^5.9 | Type checking |
| `tsx` (dev) | ^4.23 | Running the test and simulator scripts |
| `@types/node` (dev) | ^26 | Node type definitions |

The Edge Function has no package imports. It uses only Deno built-ins (`fetch`, `crypto.subtle`).

## Environment variables

| Variable | Used by | Where to get it |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Agent (Trigger.dev) | Meta Business Settings → System users → Generate token ("Never" expiry, `whatsapp_business_messaging`) |
| `WHATSAPP_PHONE_NUMBER_ID` | Agent | Meta app → WhatsApp → API Setup |
| `WHATSAPP_VERIFY_TOKEN` | Webhook (Supabase secret) | You make it up; paste the same value in Meta's webhook settings |
| `META_APP_SECRET` | Webhook (Supabase secret) | Meta app → App settings → Basic → App secret |
| `SUPABASE_URL` | Agent | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Agent | Supabase → Project Settings → API (service_role / secret key) |
| `SUPABASE_PROJECT_REF` | Your machine (CLI) | The subdomain of `SUPABASE_URL` |
| `SUPABASE_ACCESS_TOKEN` | Your machine (CLI) | supabase.com/dashboard/account/tokens |
| `TRIGGER_SECRET_KEY` | Webhook (Supabase secret) | Trigger.dev → API Keys. Use `tr_dev_…` while building and `tr_prod_…` when live |
| `TRIGGER_PROD_SECRET_KEY` | Your machine (for the go-live swap) | Trigger.dev → API Keys → Production |
| `OPENAI_API_KEY` | Agent | platform.openai.com → API keys |
| `OPENAI_MODEL` | Agent | Default `gpt-6-luna` |
| `AIRTABLE_API_KEY` | Agent | airtable.com/create/tokens (`data.records:read` + `data.records:write`) |
| `AIRTABLE_BASE_ID` | Agent | The `app…` part of your base URL |
| `AIRTABLE_TABLE_NAME` | Agent | Default `Bookings` |

"Agent" variables go in `.env` for dev mode and in the Trigger.dev dashboard (Environment Variables →
Production) for production. "Webhook" variables are set as Supabase Edge Function secrets.

## Rough running costs (estimates; check each provider's current pricing)

- **OpenAI:** a few cents or less per conversation for a small, efficient model, depending on message
  length and the size of your `/context` files (they're sent with every message).
- **WhatsApp (Meta):** replies to messages a patient sends you, within 24 hours, are generally free or very
  cheap. Messages you start (templates) are charged per message, and the rate depends on country and
  category. This project only replies.
- **Trigger.dev, Supabase, Airtable:** the free tiers usually cover a small clinic's volume. Paid plans
  start at low monthly fees if you outgrow them.
