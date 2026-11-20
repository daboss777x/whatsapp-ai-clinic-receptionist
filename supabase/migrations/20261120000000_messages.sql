-- The "messages" table: every WhatsApp message in and out, so Emma remembers the chat.
create table if not exists public.messages (
  id            bigint generated always as identity primary key,
  phone         text        not null,                 -- patient's WhatsApp number (e.g. 15551234567)
  role          text        not null check (role in ('user', 'assistant')), -- who said it
  content       text        not null,                 -- the message text
  wa_message_id text        unique,                   -- WhatsApp's own id for incoming messages (stops duplicates)
  created_at    timestamptz not null default now()
);

-- Makes "load this patient's recent messages" fast.
create index if not exists messages_phone_created_at_idx on public.messages (phone, created_at);

-- Lock the table: Row Level Security ON with no policies means ONLY the secret
-- service-role key (used by our agent) can read or write it. The public anon key can't.
alter table public.messages enable row level security;

-- New Supabase projects don't automatically let the service-role key use new tables.
-- Give our agent (service_role) permission to read, add and delete messages. Nobody else gets access.
grant select, insert, update, delete on table public.messages to service_role;
grant usage, select on all sequences in schema public to service_role;
