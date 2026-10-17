import { NextResponse } from "next/server";
import { captureOrder } from "@/lib/paypal";
import { updatePaymentStatus } from "@/lib/db";
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
    await updatePaymentStatus(orderId, "FAILED");
    return NextResponse.redirect(`${appUrl}/?payment=failed`);
  }

  const status = captured.data.status; // COMPLETED
  const checkId = await updatePaymentStatus(orderId, status);
  await appendLedger("payment_captured", checkId, { orderId, status });
  return NextResponse.redirect(`${appUrl}/?payment=${status === "COMPLETED" ? "success" : "pending"}`);
}
