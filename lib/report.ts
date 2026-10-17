import { randomUUID } from "crypto";
import { getCheck, saveReport, type ReportRow } from "./db";
import { sellerIdentifiers } from "./check/signals";
import { fingerprint } from "./security/hash";
import { appendLedger, reportPayload } from "./ledger";
import type { Extracted } from "./types";

/**
 * Report the seller behind a stored check. Shared by the web page and WhatsApp.
 * - Only real stored checks can be reported (no reporting arbitrary numbers)
 * - Seller identifiers and the reporter are stored as salted fingerprints
 * - One report per reporter per seller; counts use distinct reporters
 */
export type ReportOutcome =
  | { ok: true; alreadyReported: boolean }
  | { ok: false; error: "not_found" | "nothing_to_report" | "db"; detail?: string };

export async function reportSeller(checkId: string, reporterKey: string): Promise<ReportOutcome> {
  const check = await getCheck(checkId);
  if (!check) return { ok: false, error: "not_found" };

  const extracted = check.extracted as Extracted;
  const ids = sellerIdentifiers(extracted);
  if (!ids.length) return { ok: false, error: "nothing_to_report" };

  const reporterFp = fingerprint(reporterKey);
  const rows: ReportRow[] = ids.map((id) => ({
    id: randomUUID(),
    check_id: check.id,
    seller_fp: fingerprint(id),
    reporter_fp: reporterFp,
    platform: extracted.seller?.platform ?? null,
  }));

  const { inserted, error } = await saveReport(rows);
  if (error) return { ok: false, error: "db", detail: error };
  for (const row of inserted) await appendLedger("report", row.id, reportPayload(row));
  return { ok: true, alreadyReported: inserted.length === 0 };
}
