/**
 * PayPal REST client, SANDBOX by default.
 * Every function returns { ok, data, error } and never throws to callers.
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const BASE = () => process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";

let cachedToken: { value: string; expiresAt: number } | null = null;

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

async function getToken(): Promise<Result<string>> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return { ok: true, data: cachedToken.value };
  }
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) return { ok: false, error: "PayPal credentials are not set" };

  try {
    const res = await fetch(`${BASE()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return { ok: false, error: `PayPal auth failed (HTTP ${res.status})` };
    const json = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return { ok: true, data: json.access_token };
  } catch (e) {
    return { ok: false, error: `PayPal auth error: ${(e as Error).message}` };
  }
}

async function paypalFetch<T>(path: string, init: RequestInit): Promise<Result<T>> {
  const token = await getToken();
  if (!token.ok) return token;
  try {
    const res = await fetch(`${BASE()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token.data}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (body as { message?: string }).message ?? `HTTP ${res.status}`;
      return { ok: false, error: `PayPal ${path} failed: ${msg}` };
    }
    return { ok: true, data: body as T };
  } catch (e) {
    return { ok: false, error: `PayPal ${path} error: ${(e as Error).message}` };
  }
}

/** Currencies PayPal accepts for orders. */
export const PAYPAL_CURRENCIES = new Set([
  "AUD", "BRL", "CAD", "CNY", "CZK", "DKK", "EUR", "HKD", "HUF", "ILS", "JPY", "MYR", "MXN",
  "TWD", "NZD", "NOK", "PHP", "PLN", "GBP", "SGD", "SEK", "CHF", "THB", "USD",
]);
const ZERO_DECIMAL = new Set(["HUF", "JPY", "TWD"]);

/**
 * Turns an extracted price into something PayPal accepts.
 * Unsupported currencies (PKR, AED, ...) are converted to USD using FX_TO_USD.
 */
export function toPayPalAmount(
  amount: number,
  currency: string | null,
): { value: string; currency: string; convertedFrom?: { amount: number; currency: string } } | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cur = (currency || "USD").toUpperCase();

  const format = (v: number, c: string) =>
    ZERO_DECIMAL.has(c) ? String(Math.max(1, Math.round(v))) : Math.max(0.01, v).toFixed(2);

  if (PAYPAL_CURRENCIES.has(cur)) return { value: format(amount, cur), currency: cur };

  let rates: Record<string, number> = {};
  try {
    rates = JSON.parse(process.env.FX_TO_USD || "{}");
  } catch {
    rates = {};
  }
  const rate = rates[cur];
  if (!rate) return null;
  return { value: format(amount * rate, "USD"), currency: "USD", convertedFrom: { amount, currency: cur } };
}

interface PayPalOrder {
  id: string;
  status: string;
  links?: Array<{ href: string; rel: string }>;
}

export async function createOrder(params: {
  value: string;
  currency: string;
  description: string;
  checkId: string;
  /** Seller's PayPal email. When set, the money goes straight to the seller. */
  payeeEmail?: string;
}): Promise<Result<{ orderId: string; approveUrl: string }>> {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const order = await paypalFetch<PayPalOrder>("/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": `bharosa-${params.checkId}${params.payeeEmail ? "-p" : ""}` },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: params.checkId,
          description: params.description.slice(0, 127),
          amount: { currency_code: params.currency, value: params.value },
          ...(params.payeeEmail ? { payee: { email_address: params.payeeEmail } } : {}),
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Bharosa",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: `${appUrl}/api/paypal/return?checkId=${params.checkId}`,
            cancel_url: `${appUrl}/?payment=cancelled`,
          },
        },
      },
    }),
  });
  if (!order.ok) return order;
  const link = order.data.links?.find((l) => l.rel === "payer-action" || l.rel === "approve");
  if (!link) return { ok: false, error: "PayPal order has no approval link" };
  return { ok: true, data: { orderId: order.data.id, approveUrl: link.href } };
}

export async function captureOrder(orderId: string): Promise<Result<PayPalOrder>> {
  return paypalFetch<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    body: "{}",
  });
}

/** The capture id inside a captured order (refunds and disputes refer to it). */
export function captureIdOf(order: unknown): string | null {
  const o = order as { purchase_units?: Array<{ payments?: { captures?: Array<{ id?: string }> } }> };
  return o.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;
}

// ---------- webhooks ----------

export interface WebhookHeaders {
  authAlgo: string | null;
  certUrl: string | null;
  transmissionId: string | null;
  transmissionSig: string | null;
  transmissionTime: string | null;
}

export function webhookHeaders(h: Headers): WebhookHeaders {
  return {
    authAlgo: h.get("paypal-auth-algo"),
    certUrl: h.get("paypal-cert-url"),
    transmissionId: h.get("paypal-transmission-id"),
    transmissionSig: h.get("paypal-transmission-sig"),
    transmissionTime: h.get("paypal-transmission-time"),
  };
}

/**
 * Builds the body for PayPal's verify-webhook-signature call.
 * The event goes in exactly as received (raw text): re-serializing it can change
 * number formats or key order and make a genuine event fail verification.
 */
export function buildVerifyBody(h: WebhookHeaders, webhookId: string, rawEvent: string): string {
  const head = JSON.stringify({
    auth_algo: h.authAlgo,
    cert_url: h.certUrl,
    transmission_id: h.transmissionId,
    transmission_sig: h.transmissionSig,
    transmission_time: h.transmissionTime,
    webhook_id: webhookId,
  });
  return `${head.slice(0, -1)},"webhook_event":${rawEvent.trim()}}`;
}

/**
 * Asks PayPal whether a webhook really came from PayPal.
 * https://developer.paypal.com/docs/api/webhooks/v1/#verify-webhook-signature_post
 */
export async function verifyWebhook(h: WebhookHeaders, rawEvent: string): Promise<Result<boolean>> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return { ok: false, error: "PAYPAL_WEBHOOK_ID is not set" };
  if (!h.authAlgo || !h.certUrl || !h.transmissionId || !h.transmissionSig || !h.transmissionTime) {
    return { ok: true, data: false };
  }
  // PayPal's certificates only ever come from PayPal hosts.
  try {
    const host = new URL(h.certUrl).hostname;
    if (!/(^|\.)paypal\.com$/.test(host)) return { ok: true, data: false };
  } catch {
    return { ok: true, data: false };
  }
  const res = await paypalFetch<{ verification_status?: string }>("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: buildVerifyBody(h, webhookId, rawEvent),
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.verification_status === "SUCCESS" };
}
