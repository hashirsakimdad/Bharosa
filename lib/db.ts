import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CheckResult } from "./types";

/**
 * Server-only Supabase access. If Supabase isn't configured, every function is a
 * no-op so the checker still works (the database is for history, not for the verdict).
 */

let client: SupabaseClient | null | undefined;

export function db(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}

export async function saveCheck(result: CheckResult, inputType: string, channel = "web"): Promise<string | null> {
  const supabase = db();
  if (!supabase) return null;
  const row = {
    id: result.id,
    input_type: inputType,
    channel,
    extracted: result.extracted,
    signals: result.signals,
    verdict: result.verdict,
    reason: result.reason,
    language: result.language,
  };
  let { error } = await supabase.from("checks").insert(row);
  if (error && /channel/.test(error.message)) {
    // 0002_whatsapp.sql not applied yet: save without the new column rather than lose the check
    const { channel: _omit, ...legacy } = row;
    void _omit;
    ({ error } = await supabase.from("checks").insert({ ...legacy, input_type: inputType === "voice" ? "text" : inputType }));
  }
  return error ? `Could not save check: ${error.message}` : null;
}

export async function savePayment(p: {
  checkId: string;
  orderId: string;
  amount: string;
  currency: string;
  status: string;
  payeeEmail?: string;
}): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  const row = {
    check_id: p.checkId,
    paypal_order_id: p.orderId,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    payee_email: p.payeeEmail ?? null,
  };
  const { error } = await supabase.from("payments").insert(row);
  if (error && /payee_email/.test(error.message)) {
    // 0003_trust.sql not applied yet
    const { payee_email: _omit, ...legacy } = row;
    void _omit;
    await supabase.from("payments").insert(legacy);
  }
}

export interface PaymentRow {
  check_id: string | null;
  paypal_order_id: string;
  capture_id: string | null;
  status: string;
}

/**
 * Moves a payment to a new status, only if it isn't already there.
 * Returns the payment when it changed, null when nothing changed (or no DB).
 * PayPal sends the same event to the return URL and the webhook, and can retry
 * webhooks, so this is what keeps the ledger free of duplicate entries.
 */
export async function transitionPayment(
  match: { orderId?: string; captureId?: string },
  status: string,
  captureId?: string | null,
): Promise<PaymentRow | null> {
  const supabase = db();
  if (!supabase || (!match.orderId && !match.captureId)) return null;
  let q = supabase
    .from("payments")
    .update({ status, ...(captureId ? { capture_id: captureId } : {}) })
    .neq("status", status);
  q = match.orderId ? q.eq("paypal_order_id", match.orderId) : q.eq("capture_id", match.captureId!);
  const { data, error } = await q.select("check_id, paypal_order_id, capture_id, status").maybeSingle();
  if (error && /capture_id/.test(error.message) && match.orderId) {
    // 0003 not applied yet: update status only
    const { data: d2 } = await supabase
      .from("payments")
      .update({ status })
      .neq("status", status)
      .eq("paypal_order_id", match.orderId)
      .select("check_id, paypal_order_id, status")
      .maybeSingle();
    return d2 ? ({ ...(d2 as object), capture_id: null } as PaymentRow) : null;
  }
  return (data as PaymentRow | null) ?? null;
}

// ---------- proof page stats ----------

export interface Stats {
  checks: number;
  danger: number;
  careful: number;
  safe: number;
  whatsapp: number;
  reports: number;
  paymentsCompleted: number;
}

export async function getStats(): Promise<Stats | null> {
  const supabase = db();
  if (!supabase) return null;
  const count = async (table: string, col?: string, val?: string) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (col && val) q = q.eq(col, val);
    const { count: n } = await q;
    return n ?? 0;
  };
  const [checks, danger, careful, safe, whatsapp, reports, paymentsCompleted] = await Promise.all([
    count("checks"),
    count("checks", "verdict", "danger"),
    count("checks", "verdict", "careful"),
    count("checks", "verdict", "safe"),
    count("checks", "channel", "whatsapp").catch(() => 0),
    count("reports"),
    count("payments", "status", "COMPLETED"),
  ]);
  return { checks, danger, careful, safe, whatsapp, reports, paymentsCompleted };
}

export async function recentLedger(limit = 12): Promise<Array<{ seq: number; kind: string; entry_hash: string; created_at: string }>> {
  const supabase = db();
  if (!supabase) return [];
  const { data } = await supabase
    .from("ledger")
    .select("seq, kind, entry_hash, created_at")
    .order("seq", { ascending: false })
    .limit(limit);
  return (data ?? []) as Array<{ seq: number; kind: string; entry_hash: string; created_at: string }>;
}

// ---------- scam report network ----------

/** Distinct people (by hashed IP) who reported any of these seller fingerprints. */
export async function reportCount(sellerFingerprints: string[]): Promise<number | null> {
  const supabase = db();
  if (!supabase || sellerFingerprints.length === 0) return null;
  const { data, error } = await supabase
    .from("reports")
    .select("reporter_fp")
    .in("seller_fp", sellerFingerprints)
    .limit(1000);
  if (error) return null;
  return new Set((data ?? []).map((r: { reporter_fp: string }) => r.reporter_fp)).size;
}

export interface ReportRow {
  id: string;
  check_id: string | null;
  seller_fp: string;
  reporter_fp: string;
  platform: string | null;
}

/** Returns only the rows that were actually new (duplicates are skipped). */
export async function saveReport(rows: ReportRow[]): Promise<{ inserted: ReportRow[]; error: string | null }> {
  const supabase = db();
  if (!supabase) return { inserted: [], error: "Database is not configured" };
  // unique (seller_fp, reporter_fp): one person can't report the same seller twice
  const { data, error } = await supabase
    .from("reports")
    .upsert(rows, { onConflict: "seller_fp,reporter_fp", ignoreDuplicates: true })
    .select("id, check_id, seller_fp, reporter_fp, platform");
  return { inserted: (data ?? []) as ReportRow[], error: error ? error.message : null };
}

export interface StoredCheck {
  id: string;
  extracted: unknown;
  signals: unknown;
  verdict: string;
  reason: string;
  language: string;
}

export async function getCheck(id: string): Promise<StoredCheck | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data } = await supabase
    .from("checks")
    .select("id, extracted, signals, verdict, reason, language")
    .eq("id", id)
    .maybeSingle();
  return data as StoredCheck | null;
}

// ---------- WhatsApp sessions: the last check per sender, so "WHY" and "REPORT" work ----------

export async function setLastCheck(senderFp: string, checkId: string): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  await supabase
    .from("wa_sessions")
    .upsert({ sender_fp: senderFp, last_check_id: checkId, updated_at: new Date().toISOString() });
}

export async function getLastCheckId(senderFp: string): Promise<string | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data } = await supabase.from("wa_sessions").select("last_check_id").eq("sender_fp", senderFp).maybeSingle();
  return (data as { last_check_id?: string } | null)?.last_check_id ?? null;
}
