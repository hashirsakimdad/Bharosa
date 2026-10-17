import { NextResponse } from "next/server";
import { z } from "zod";
import { reportSeller } from "@/lib/report";
import { clientIp, rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";

const Body = z.object({ checkId: z.string().uuid() });

/** Report the seller from a check as a scammer. Max 5 reports/hour per IP. */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const limit = rateLimit(`report:${ip}`, 5, 3_600_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many reports. Try again later." }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid check id" }, { status: 400 });

  const out = await reportSeller(parsed.data.checkId, `ip:${ip}`);
  if (!out.ok) {
    const map = {
      not_found: ["Check not found (is the database configured?)", 404],
      nothing_to_report: ["No phone number, handle or website to report.", 422],
      db: [out.detail ?? "Database error", 500],
    } as const;
    const [error, status] = map[out.error];
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({
    ok: true,
    alreadyReported: out.alreadyReported,
    message: out.alreadyReported
      ? "You already reported this seller."
      : "Thanks. Others checking this seller will now see your report.",
  });
}
