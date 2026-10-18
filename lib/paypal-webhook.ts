import { transitionPayment, type PaymentRow } from "./db";
import { appendLedger, type LedgerKind } from "./ledger";
import { reportSeller } from "./report";

/**
 * What Bharosa does with each PayPal webhook event (after the signature is verified).
 *
 *  PAYMENT.CAPTURE.COMPLETED   payment -> COMPLETED, chained (covers buyers who close the tab before the redirect)
 *  PAYMENT.CAPTURE.DENIED      payment -> FAILED
 *  PAYMENT.CAPTURE.REFUNDED    payment -> REFUNDED, chained
 *  CUSTOMER.DISPUTE.CREATED    payment -> DISPUTED, chained, and the seller from that check is reported
 *                              to the scam network (each dispute counts as one reporter)
 *
 * Everything is idempotent: PayPal retries webhooks, and a repeat changes nothing.
 */

export interface WebhookDeps {
  transition: typeof transitionPayment;
  append: (kind: LedgerKind, refId: string | null, payload: unknown) => Promise<unknown>;
  report: typeof reportSeller;
}

const defaults: WebhookDeps = { transition: transitionPayment, append: appendLedger, report: reportSeller };

export interface PayPalEvent {
  id?: string;
  event_type?: string;
  resource?: Record<string, unknown>;
}

export interface HandleResult {
  handled: boolean;
  actions: string[];
}

export async function handlePayPalEvent(event: PayPalEvent, deps: WebhookDeps = defaults): Promise<HandleResult> {
  const r = (event.resource ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const actions: string[] = [];

  switch (event.event_type) {
    case "PAYMENT.CAPTURE.COMPLETED": {
      const captureId = str(r.id);
      const orderId = str(r.supplementary_data?.related_ids?.order_id);
      const changed = orderId
        ? await deps.transition({ orderId }, "COMPLETED", captureId)
        : captureId
          ? await deps.transition({ captureId }, "COMPLETED")
          : null;
      if (changed) {
        await deps.append("payment_captured", changed.check_id, { orderId: changed.paypal_order_id, captureId, status: "COMPLETED" });
        actions.push(`captured ${changed.paypal_order_id}`);
      }
      return { handled: true, actions };
    }

    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.DECLINED": {
      const orderId = str(r.supplementary_data?.related_ids?.order_id);
      const captureId = str(r.id);
      const changed = await deps.transition(orderId ? { orderId } : { captureId: captureId ?? undefined }, "FAILED");
      if (changed) actions.push(`failed ${changed.paypal_order_id}`);
      return { handled: true, actions };
    }

    case "PAYMENT.CAPTURE.REFUNDED": {
      // The resource is the refund; its "up" link points at the original capture.
      const captureId = captureIdFromLinks(r.links) ?? str(r.capture_id);
      if (!captureId) return { handled: true, actions };
      const changed = await deps.transition({ captureId }, "REFUNDED");
      if (changed) {
        await deps.append("payment_refunded", changed.check_id, { captureId, refundId: str(r.id) });
        actions.push(`refunded ${captureId}`);
      }
      return { handled: true, actions };
    }

    case "CUSTOMER.DISPUTE.CREATED": {
      const disputeId = str(r.dispute_id) ?? str(event.id) ?? "unknown";
      const txs = Array.isArray(r.disputed_transactions) ? r.disputed_transactions : [];
      for (const tx of txs) {
        const captureId = str(tx?.seller_transaction_id);
        if (!captureId) continue;
        const changed: PaymentRow | null = await deps.transition({ captureId }, "DISPUTED");
        if (!changed) continue;
        await deps.append("payment_disputed", changed.check_id, { captureId, disputeId, reason: str(r.reason) });
        actions.push(`disputed ${captureId}`);
        if (changed.check_id) {
          const rep = await deps.report(changed.check_id, `paypal-dispute:${disputeId}`);
          if (rep.ok && !rep.alreadyReported) actions.push(`reported seller of ${changed.check_id}`);
        }
      }
      return { handled: true, actions };
    }

    default:
      return { handled: false, actions };
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function captureIdFromLinks(links: unknown): string | null {
  if (!Array.isArray(links)) return null;
  for (const l of links) {
    const href = (l as { href?: string; rel?: string })?.href;
    const rel = (l as { rel?: string })?.rel;
    const m = href ? /\/captures\/([A-Z0-9]+)/i.exec(href) : null;
    if (m && rel === "up") return m[1];
  }
  return null;
}
