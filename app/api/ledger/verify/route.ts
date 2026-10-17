import { NextResponse } from "next/server";
import { verifyLedger } from "@/lib/ledger";
import { clientIp, rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Walks the whole hash chain and re-hashes the stored records. Public on purpose: anyone can audit. */
export async function GET(req: Request) {
  const limit = rateLimit(`verify:${clientIp(req.headers)}`, 6);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const result = await verifyLedger();
    if (!result) return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
