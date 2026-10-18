-- Bharosa phase 3: PayPal webhooks, paying sellers directly, Bitcoin anchoring
-- Run after 0002_whatsapp.sql (or just run supabase/setup.sql, which includes everything)

-- Payments: the PayPal capture id (refunds and disputes point at it) and who got paid.
alter table public.payments add column if not exists capture_id text unique;
alter table public.payments add column if not exists payee_email text;

-- Ledger: refunds and disputes become chained events too.
alter table public.ledger drop constraint if exists ledger_kind_check;
alter table public.ledger add constraint ledger_kind_check check (kind in (
  'check', 'report', 'payment_created', 'payment_captured', 'payment_refunded', 'payment_disputed'
));

-- Bitcoin anchors: the ledger head stamped through OpenTimestamps.
-- anchor_text is the small file people verify; digest = sha256(anchor_text).
-- ots_b64 is the OpenTimestamps proof (base64 of the .ots file).
create table if not exists public.anchors (
  id           uuid primary key default gen_random_uuid(),
  ledger_seq   bigint not null,
  head_hash    text not null,
  anchor_text  text not null,
  digest       text not null unique,
  ots_b64      text not null,
  calendars    text[] not null,
  created_at   timestamptz not null default now()
);
create index if not exists anchors_seq_idx on public.anchors (ledger_seq desc);

alter table public.anchors enable row level security;
