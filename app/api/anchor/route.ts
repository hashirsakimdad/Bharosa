import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { anchorLedger } from "@/lib/anchor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Stamps the ledger head on Bitcoin. Runs daily via Vercel Cron (vercel.json),
 * or by hand: curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/anchor
 * Locked behind CRON_SECRET so strangers can't spam the public calendars in our name.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

async function run(req: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const out = await anchorLedger();
  const status = out.status === "error" ? 502 : 200;
  if (out.status === "anchored") {
    const { anchor, failedCalendars } = out;
    return NextResponse.json(
      { status: out.status, id: anchor.id, entries: anchor.ledger_seq, head: anchor.head_hash, calendars: anchor.calendars, failedCalendars },
      { status },
    );
  }
  return NextResponse.json(out, { status });
}

export const GET = run; // Vercel Cron calls GET
export const POST = run;
