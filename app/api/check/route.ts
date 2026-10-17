import { NextResponse } from "next/server";
import { z } from "zod";
import { runCheck } from "@/lib/check";
import { clientIp, rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z
  .object({
    text: z.string().max(8000).optional(),
    url: z.string().max(2000).optional(),
    imageUrl: z.string().url().max(2000).optional(),
    imageBase64: z.string().max(7_500_000).optional(), // ~5 MB image
    language: z.enum(["en", "ur", "roman_ur", "ar"]).optional(),
  })
  .refine((b) => Boolean(b.text?.trim() || b.url?.trim() || b.imageUrl || b.imageBase64), {
    message: "Send a message, a link, or a screenshot to check.",
  });

export async function POST(req: Request) {
  const limit = rateLimit(`check:${clientIp(req.headers)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many checks. Try again in ${limit.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0]?.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const result = await runCheck(body);
    return NextResponse.json(result);
  } catch (e) {
    // Only input problems (bad image, blocked link) reach here; checks themselves fail safe.
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
