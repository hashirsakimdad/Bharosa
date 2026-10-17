-- Bharosa phase 2: WhatsApp channel
-- Run after 0001_init.sql (SQL Editor -> paste -> Run)

-- Voice notes are a new input type, and we record which channel a check came from.
alter table public.checks drop constraint if exists checks_input_type_check;
alter table public.checks add constraint checks_input_type_check
  check (input_type in ('text', 'link', 'image', 'voice'));

alter table public.checks add column if not exists channel text not null default 'web'
  check (channel in ('web', 'whatsapp'));

-- Last check per WhatsApp sender, so replies like "WHY" and "REPORT" know what they refer to.
-- sender_fp is a salted fingerprint of the phone number, never the number itself.
create table if not exists public.wa_sessions (
  sender_fp      text primary key,
  last_check_id  uuid references public.checks(id) on delete set null,
  updated_at     timestamptz not null default now()
);

alter table public.wa_sessions enable row level security;
