import { waitUntil } from "@vercel/functions";
import { handleIncoming } from "@/lib/channels/whatsapp/handler";
import { STRINGS } from "@/lib/channels/whatsapp/format";
import { sendWhatsApp, twiml, twilioConfigured, validTwilioSignature } from "@/lib/channels/whatsapp/twilio";
import { detectLanguage } from "@/lib/check/heuristics";

export const runtime = "nodejs";
export const maxDuration = 60;

// Twilio gives up on a webhook after 15s. If a check is still running at 12s we send
// "checking..." right away and deliver the verdict as a follow-up message.
const INLINE_BUDGET_MS = 12_000;

// Twilio can deliver the same message twice; don't check it twice.
const seen = new Map<string, number>();
function firstTime(sid: string): boolean {
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > 10 * 60_000) seen.delete(k);
  if (seen.has(sid)) return false;
  seen.set(sid, now);
  return true;
}

function xml(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

/** The public URL Twilio called. Must match exactly for the signature to verify. */
function webhookUrl(req: Request): string {
  if (process.env.TWILIO_WEBHOOK_URL) return process.env.TWILIO_WEBHOOK_URL;
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  return `${proto}://${host}${u.pathname}${u.search}`;
}

export async function POST(req: Request) {
  if (!twilioConfigured()) return new Response("WhatsApp is not configured", { status: 503 });

  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") params[k] = v;
  });

  const skipSig = process.env.TWILIO_SKIP_SIGNATURE === "true" && process.env.NODE_ENV !== "production";
  if (!skipSig && !validTwilioSignature(process.env.TWILIO_AUTH_TOKEN!, req.headers.get("x-twilio-signature"), webhookUrl(req), params)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const from = params.From ?? "";
  if (!from.startsWith("whatsapp:")) return xml(twiml([]));
  if (params.MessageSid && !firstTime(params.MessageSid)) return xml(twiml([]));

  const media: Array<{ url: string; contentType: string }> = [];
  const n = Math.min(Number(params.NumMedia || 0), 3);
  for (let i = 0; i < n; i++) {
    if (params[`MediaUrl${i}`]) media.push({ url: params[`MediaUrl${i}`], contentType: params[`MediaContentType${i}`] ?? "" });
  }

  const work = handleIncoming({ from, body: (params.Body ?? "").slice(0, 8000), media });
  const timeout = new Promise<"slow">((r) => setTimeout(() => r("slow"), INLINE_BUDGET_MS));
  const first = await Promise.race([work, timeout]);

  if (first !== "slow") return xml(twiml(first));

  // Too slow for an inline reply: acknowledge now, send the verdict when it's ready.
  waitUntil(
    work
      .then(async (replies) => {
        for (const r of replies) await sendWhatsApp(from, r);
      })
      .catch((e) => console.error("[whatsapp] follow-up failed:", (e as Error).message)),
  );
  const lang = detectLanguage(params.Body ?? "");
  return xml(twiml([STRINGS[lang].working]));
}
