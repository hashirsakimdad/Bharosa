import { NextResponse } from "next/server";
import { captureIdOf, captureOrder } from "@/lib/paypal";
import { transitionPayment } from "@/lib/db";
import { appendLedger } from "@/lib/ledger";

export const runtime = "nodejs";

/** PayPal redirects the buyer here after approval: ?token=<orderId>&checkId=<id> */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const appUrl = process.env.APP_URL || url.origin;
  const orderId = url.searchParams.get("token");
  if (!orderId || !/^[A-Z0-9]{5,40}$/i.test(orderId)) {
    return NextResponse.redirect(`${appUrl}/?payment=failed`);
  }

  const captured = await captureOrder(orderId);
  if (!captured.ok) {
    await transitionPayment({ orderId }, "FAILED");
    return NextResponse.redirect(`${appUrl}/?payment=failed`);
  }

  const status = captured.data.status; // COMPLETED
  const captureId = captureIdOf(captured.data);
  // The webhook may have recorded this already; only chain it once.
  const changed = await transitionPayment({ orderId }, status, captureId);
  if (changed) await appendLedger("payment_captured", changed.check_id, { orderId, captureId, status });
  return NextResponse.redirect(`${appUrl}/?payment=${status === "COMPLETED" ? "success" : "pending"}`);
}
