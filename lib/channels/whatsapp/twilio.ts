import { createHmac, timingSafeEqual } from "crypto";

/**
 * Twilio WhatsApp helpers: verify incoming webhooks, fetch media, send messages.
 * Free to start with the Twilio WhatsApp sandbox.
 */

export function twilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

/**
 * Twilio signs every webhook: base64(HMAC-SHA1(authToken, url + sorted key/value pairs)).
 * Without this check anyone could post fake messages to the webhook and burn the AI quota
 * or file fake scam reports.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function computeTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

export function validTwilioSignature(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(computeTwilioSignature(authToken, url, params));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

/**
 * Downloads a media file Twilio received (screenshot or voice note).
 * Only Twilio's own API host is allowed, so the webhook can't be used to fetch arbitrary URLs.
 */
export async function fetchTwilioMedia(mediaUrl: string): Promise<{ mimeType: string; data: string }> {
  const url = new URL(mediaUrl);
  if (url.protocol !== "https:" || url.hostname !== "api.twilio.com") {
    throw new Error("Media must come from api.twilio.com");
  }
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN ?? "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    // Twilio answers with a redirect to its media CDN; fetch follows it.
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Media download failed (HTTP ${res.status})`);
    const mimeType = (res.headers.get("content-type") || "application/octet-stream").split(";")[0].trim().toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_MEDIA_BYTES) throw new Error("Media file is too large");
    return { mimeType, data: buf.toString("base64") };
  } finally {
    clearTimeout(timer);
  }
}

/** Sends a WhatsApp message through the Twilio REST API (used when a check outlives the webhook). */
export async function sendWhatsApp(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) return { ok: false, error: "Twilio is not configured" };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body.slice(0, 1600) }).toString(),
    });
    if (!res.ok) return { ok: false, error: `Twilio send failed (HTTP ${res.status})` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** TwiML reply. WhatsApp messages are capped at 1600 characters. */
export function twiml(messages: string[]): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const body = messages.map((m) => `<Message>${esc(m.slice(0, 1600))}</Message>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}
