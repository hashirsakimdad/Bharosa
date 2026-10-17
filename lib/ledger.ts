import { db } from "./db";
import { canonicalJson, sha256Hex } from "./security/hash";
import type { LedgerRecord } from "./types";

/**
 * Tamper-evident hash chain ("mini blockchain") on top of Postgres.
 *
 * Every check, report and payment event becomes one entry:
 *   entry_hash = sha256(prev_hash | seq | kind | payload_hash | created_ms)
 * Each entry includes the previous entry's hash, so changing or deleting any old
 * record breaks every hash after it. verifyLedger() walks the chain and also
 * re-hashes the stored check/report rows to catch edits to the data itself.
 *
 * Appends go through the append_ledger() SQL function, which takes a lock so two
 * requests can never create a fork.
 */

export type LedgerKind = "check" | "report" | "payment_created" | "payment_captured";

export const GENESIS = "0".repeat(64);

export function payloadHash(payload: unknown): string {
  return sha256Hex(canonicalJson(payload));
}

export function entryHash(prevHash: string, seq: number, kind: string, payload: string, createdMs: number): string {
  return sha256Hex(`${prevHash}|${seq}|${kind}|${payload}|${createdMs}`);
}

/** What we hash for a check: the verdict and the evidence it was based on. */
export function checkPayload(row: { id: string; verdict: string; reason: string; signals: unknown; extracted: unknown }) {
  return { id: row.id, verdict: row.verdict, reason: row.reason, signals: row.signals, extracted: row.extracted };
}

export function reportPayload(row: { id: string; check_id: string | null; seller_fp: string; reporter_fp: string }) {
  return { id: row.id, check_id: row.check_id, seller_fp: row.seller_fp, reporter_fp: row.reporter_fp };
}

export async function appendLedger(kind: LedgerKind, refId: string | null, payload: unknown): Promise<LedgerRecord | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("append_ledger", {
    p_kind: kind,
    p_ref_id: refId,
    p_payload_hash: payloadHash(payload),
  });
  if (error || !data) return null;
  const row = (Array.isArray(data) ? data[0] : data) as { r_seq: number; r_prev: string; r_hash: string };
  return { seq: Number(row.r_seq), prevHash: row.r_prev, entryHash: row.r_hash };
}

export interface LedgerVerification {
  valid: boolean;
  length: number;
  headHash: string;
  checkedRecords: number;
  problem?: { seq: number; reason: string };
}

interface LedgerRow {
  seq: number;
  kind: LedgerKind;
  ref_id: string | null;
  payload_hash: string;
  prev_hash: string;
  entry_hash: string;
  created_ms: number;
}

export async function verifyLedger(): Promise<LedgerVerification | null> {
  const supabase = db();
  if (!supabase) return null;

  const rows: LedgerRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("ledger")
      .select("seq, kind, ref_id, payload_hash, prev_hash, entry_hash, created_ms")
      .order("seq", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as LedgerRow[]));
    if (!data || data.length < 1000) break;
  }

  let prev = GENESIS;
  let checkedRecords = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const seq = Number(r.seq);
    if (seq !== i + 1) return fail(rows, prev, checkedRecords, seq, `Entry #${i + 1} is missing (deleted?)`);
    if (r.prev_hash !== prev) return fail(rows, prev, checkedRecords, seq, "Link to the previous entry is broken");
    const expected = entryHash(prev, seq, r.kind, r.payload_hash, Number(r.created_ms));
    if (expected !== r.entry_hash) return fail(rows, prev, checkedRecords, seq, "Entry was modified after it was written");
    prev = r.entry_hash;
  }

  // Re-hash the actual data rows the chain points to.
  const checkIds = rows.filter((r) => r.kind === "check" && r.ref_id).map((r) => r.ref_id as string);
  const reportIds = rows.filter((r) => r.kind === "report" && r.ref_id).map((r) => r.ref_id as string);
  const checks = await fetchByIds("checks", "id, verdict, reason, signals, extracted", checkIds);
  const reports = await fetchByIds("reports", "id, check_id, seller_fp, reporter_fp", reportIds);

  for (const r of rows) {
    if (r.kind !== "check" && r.kind !== "report") continue;
    const source = r.kind === "check" ? checks.get(r.ref_id ?? "") : reports.get(r.ref_id ?? "");
    if (!source) return fail(rows, prev, checkedRecords, Number(r.seq), `The ${r.kind} this entry points to was deleted`);
    const payload = r.kind === "check" ? checkPayload(source as never) : reportPayload(source as never);
    if (payloadHash(payload) !== r.payload_hash) {
      return fail(rows, prev, checkedRecords, Number(r.seq), `The ${r.kind} data was edited after it was recorded`);
    }
    checkedRecords++;
  }

  return { valid: true, length: rows.length, headHash: prev, checkedRecords };
}

function fail(rows: LedgerRow[], head: string, checked: number, seq: number, reason: string): LedgerVerification {
  return { valid: false, length: rows.length, headHash: rows.at(-1)?.entry_hash ?? head, checkedRecords: checked, problem: { seq, reason } };
}

async function fetchByIds(table: string, cols: string, ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const supabase = db();
  const out = new Map<string, Record<string, unknown>>();
  if (!supabase) return out;
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from(table).select(cols).in("id", ids.slice(i, i + 200));
    for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) out.set(String(row.id), row);
  }
  return out;
}
