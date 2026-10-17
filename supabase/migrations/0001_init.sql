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
