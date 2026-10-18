import { NextResponse } from "next/server";
import { verifyWebhook, webhookHeaders } from "@/lib/paypal";
import { handlePayPalEvent, type PayPalEvent } from "@/lib/paypal-webhook";

export const runtime = "nodejs";

// PayPal can deliver the same event more than once.
const seen = new Map<string, number>();
function firstTime(id: string): boolean {
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > 60 * 60_000) seen.delete(k);
  if (seen.has(id)) return false;
  seen.set(id, now);
  return true;
}

/**
 * PayPal webhook. Register this URL in the PayPal developer dashboard
 * (your app -> Webhooks) for PAYMENT.CAPTURE.*, CUSTOMER.DISPUTE.CREATED,
 * then put the webhook id in PAYPAL_WEBHOOK_ID.
 */
export async function POST(req: Request) {
  if (!process.env.PAYPAL_WEBHOOK_ID) {
    return NextResponse.json({ error: "PAYPAL_WEBHOOK_ID is not set" }, { status: 503 });
  }

  const raw = await req.text();
  if (raw.length > 200_000) return NextResponse.json({ error: "Too large" }, { status: 413 });

  const verified = await verifyWebhook(webhookHeaders(req.headers), raw);
  if (!verified.ok) {
    // Couldn't reach PayPal to check: ask PayPal to retry later.
    return NextResponse.json({ error: verified.error }, { status: 503 });
  }
  if (!verified.data) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  let event: PayPalEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (event.id && !firstTime(event.id)) return NextResponse.json({ ok: true, duplicate: true });

  try {
    const result = await handlePayPalEvent(event);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[paypal webhook]", (e as Error).message);
    // 500 makes PayPal retry; handlers are idempotent so a retry is safe.
    if (event.id) seen.delete(event.id);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
