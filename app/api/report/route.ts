import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getCheck, saveReport, type ReportRow } from "@/lib/db";
import { sellerIdentifiers } from "@/lib/check/signals";
import { fingerprint } from "@/lib/security/hash";
import { clientIp, rateLimit } from "@/lib/security/ratelimit";
import { appendLedger, reportPayload } from "@/lib/ledger";
import type { Extracted } from "@/lib/types";

export const runtime = "nodejs";

const Body = z.object({ checkId: z.string().uuid() });

/**
 * Report the seller from a check as a scammer.
 * - Only works on a real stored check (no reporting random numbers)
 * - Seller phone/handle/domain stored as salted fingerprints, never raw
 * - One report per person per seller (reporter = hashed IP), 5 reports/hour per IP
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const limit = rateLimit(`report:${ip}`, 5, 3_600_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many reports. Try again later." }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid check id" }, { status: 400 });

  const check = await getCheck(parsed.data.checkId);
  if (!check) return NextResponse.json({ error: "Check not found (is the database configured?)" }, { status: 404 });

  const extracted = check.extracted as Extracted;
  const ids = sellerIdentifiers(extracted);
  if (!ids.length) return NextResponse.json({ error: "No phone number, handle or website to report." }, { status: 422 });

  const reporterFp = fingerprint(`ip:${ip}`);
  const rows: ReportRow[] = ids.map((id) => ({
    id: randomUUID(),
    check_id: check.id,
    seller_fp: fingerprint(id),
    reporter_fp: reporterFp,
    platform: extracted.seller?.platform ?? null,
  }));

  const { inserted, error } = await saveReport(rows);
  if (error) return NextResponse.json({ error }, { status: 500 });

  for (const row of inserted) await appendLedger("report", row.id, reportPayload(row));

  return NextResponse.json({
    ok: true,
    alreadyReported: inserted.length === 0,
    message: inserted.length ? "Thanks. Others checking this seller will now see your report." : "You already reported this seller.",
  });
}
