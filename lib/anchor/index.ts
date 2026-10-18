import { createHash } from "crypto";
import { db } from "../db";
import { verifyLedger } from "../ledger";
import { stamp, type Fetcher } from "./ots";

/**
 * Anchors the ledger's latest hash on Bitcoin.
 *
 * Because every ledger entry includes the hash before it, stamping the newest
 * hash ("head") proves the whole history up to that point existed at that time.
 * After that, rewriting any old check or report would break the chain AND
 * contradict a record that's on Bitcoin, which nobody (including us) controls.
 */

export interface AnchorRow {
  id: string;
  ledger_seq: number;
  head_hash: string;
  anchor_text: string;
  digest: string;
  ots_b64: string;
  calendars: string[];
  created_at: string;
}

/** The small text file that gets stamped. People verify this file + its .ots. */
export function anchorText(seq: number, headHash: string, at: Date): string {
  return [
    "Bharosa ledger anchor",
    `entries: ${seq}`,
    `head: ${headHash}`,
    `time: ${at.toISOString()}`,
    "verify: drop this file and its .ots onto https://opentimestamps.org",
    "",
  ].join("\n");
}

export type AnchorOutcome =
  | { status: "anchored"; anchor: AnchorRow; failedCalendars: string[] }
  | { status: "skipped"; reason: string }
  | { status: "error"; reason: string };

export async function anchorLedger(fetcher?: Fetcher): Promise<AnchorOutcome> {
  const supabase = db();
  if (!supabase) return { status: "skipped", reason: "Database is not configured" };

  // Never anchor a chain that doesn't verify.
  const v = await verifyLedger();
  if (!v) return { status: "skipped", reason: "Database is not configured" };
  if (!v.valid) return { status: "error", reason: `Ledger is broken at #${v.problem?.seq}: ${v.problem?.reason}` };
  if (v.length === 0) return { status: "skipped", reason: "Ledger is empty" };

  const { data: last } = await supabase
    .from("anchors")
    .select("ledger_seq, head_hash")
    .order("ledger_seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last && (last as { head_hash: string }).head_hash === v.headHash) {
    return { status: "skipped", reason: `Head #${v.length} is already anchored` };
  }

  const text = anchorText(v.length, v.headHash, new Date());
  const digest = createHash("sha256").update(text, "utf8").digest();
  let stamped;
  try {
    stamped = await stamp(digest, undefined, fetcher);
  } catch (e) {
    return { status: "error", reason: (e as Error).message };
  }

  const { data, error } = await supabase
    .from("anchors")
    .insert({
      ledger_seq: v.length,
      head_hash: v.headHash,
      anchor_text: text,
      digest: digest.toString("hex"),
      ots_b64: stamped.ots.toString("base64"),
      calendars: stamped.calendars,
    })
    .select("*")
    .single();
  if (error) return { status: "error", reason: error.message };
  return { status: "anchored", anchor: data as AnchorRow, failedCalendars: stamped.failed };
}

export async function listAnchors(limit = 10): Promise<AnchorRow[]> {
  const supabase = db();
  if (!supabase) return [];
  const { data } = await supabase.from("anchors").select("*").order("ledger_seq", { ascending: false }).limit(limit);
  return (data ?? []) as AnchorRow[];
}

export async function getAnchor(id: string): Promise<AnchorRow | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data } = await supabase.from("anchors").select("*").eq("id", id).maybeSingle();
  return (data as AnchorRow | null) ?? null;
}
