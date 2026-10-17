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
}): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  await supabase.from("payments").insert({
    check_id: p.checkId,
    paypal_order_id: p.orderId,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
  });
}

export async function updatePaymentStatus(orderId: string, status: string): Promise<string | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data } = await supabase
    .from("payments")
    .update({ status })
    .eq("paypal_order_id", orderId)
    .select("check_id")
    .maybeSingle();
  return (data as { check_id?: string } | null)?.check_id ?? null;
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
