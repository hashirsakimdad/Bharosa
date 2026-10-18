-- Bharosa: full database setup in one file (all migrations combined).
-- Supabase -> SQL Editor -> New query -> paste all of this -> Run. Safe to run more than once.
-- Only creates Bharosa's own tables; existing tables are not touched.

-- Bharosa: initial schema
-- Run in Supabase: SQL Editor -> paste -> Run (or `supabase db push`)

create extension if not exists pgcrypto with schema extensions;

-- ---------- checks ----------
create table if not exists public.checks (
  id          uuid primary key,
  input_type  text not null check (input_type in ('text', 'link', 'image')),
  extracted   jsonb not null,
  signals     jsonb not null,
  verdict     text not null check (verdict in ('safe', 'careful', 'danger')),
  reason      text not null,
  language    text not null,
  created_at  timestamptz not null default now()
);

-- ---------- payments ----------
create table if not exists public.payments (
  id               uuid primary key default gen_random_uuid(),
  check_id         uuid references public.checks(id) on delete restrict,
  paypal_order_id  text not null unique,
  amount           text not null,
  currency         text not null,
  status           text not null,
  created_at       timestamptz not null default now()
);

-- ---------- scam reports ----------
-- seller_fp / reporter_fp are salted HMAC fingerprints. Raw numbers/handles/IPs are never stored.
create table if not exists public.reports (
  id           uuid primary key,
  check_id     uuid references public.checks(id) on delete restrict,
  seller_fp    text not null,
  reporter_fp  text not null,
  platform     text,
  created_at   timestamptz not null default now(),
  unique (seller_fp, reporter_fp)
);
create index if not exists reports_seller_fp_idx on public.reports (seller_fp);

-- ---------- tamper-evident ledger (hash chain) ----------
create table if not exists public.ledger (
  seq           bigint primary key,
  kind          text not null check (kind in ('check', 'report', 'payment_created', 'payment_captured')),
  ref_id        uuid,
  payload_hash  text not null,
  prev_hash     text not null,
  entry_hash    text not null unique,
  created_ms    bigint not null,
  created_at    timestamptz not null default now()
);

-- Append-only: block updates and deletes at the database level.
create or replace function public.ledger_block_changes() returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'ledger is append-only';
end $$;

drop trigger if exists ledger_no_change on public.ledger;
create trigger ledger_no_change before update or delete on public.ledger
for each row execute function public.ledger_block_changes();

-- Atomic append: lock, read the last hash, compute the new one, insert.
-- entry_hash = sha256(prev_hash | seq | kind | payload_hash | created_ms)  (must match lib/ledger.ts)
create or replace function public.append_ledger(p_kind text, p_ref_id uuid, p_payload_hash text)
returns table (r_seq bigint, r_prev text, r_hash text, r_ms bigint)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_prev text;
  v_seq  bigint;
  v_ms   bigint;
  v_hash text;
begin
  perform pg_advisory_xact_lock(7343101);

  select l.entry_hash, l.seq into v_prev, v_seq
  from public.ledger l
  order by l.seq desc
  limit 1;

  if v_prev is null then
    v_prev := repeat('0', 64);
    v_seq  := 0;
  end if;

  v_seq  := v_seq + 1;
  v_ms   := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_hash := encode(
    extensions.digest(v_prev || '|' || v_seq::text || '|' || p_kind || '|' || p_payload_hash || '|' || v_ms::text, 'sha256'),
    'hex'
  );

  insert into public.ledger (seq, kind, ref_id, payload_hash, prev_hash, entry_hash, created_ms)
  values (v_seq, p_kind, p_ref_id, p_payload_hash, v_prev, v_hash, v_ms);

  return query select v_seq, v_prev, v_hash, v_ms;
end $$;

-- Only the server (service role) may call it.
revoke all on function public.append_ledger(text, uuid, text) from public, anon, authenticated;
grant execute on function public.append_ledger(text, uuid, text) to service_role;

-- ---------- row level security ----------
-- RLS on with no policies = the public anon key can read/write nothing.
-- The Next.js server uses the service role key, which bypasses RLS.
alter table public.checks   enable row level security;
alter table public.payments enable row level security;
alter table public.reports  enable row level security;
alter table public.ledger   enable row level security;


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
