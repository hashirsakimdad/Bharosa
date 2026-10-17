/**
 * Talk to the WhatsApp webhook from your terminal, no phone or Twilio account needed.
 * Sends a correctly signed Twilio-style request, so it tests the real security path too.
 *
 *   npm run dev
 *   npm run wa -- "Bhai PS5 sirf 45k, pehle advance JazzCash pe bhejo"
 *   npm run wa -- WHY
 *   npm run wa -- REPORT
 *
 * Uses TWILIO_AUTH_TOKEN from .env.local (any value works locally if you set one).
 * WA_URL overrides the target (default http://localhost:3000/api/whatsapp).
 */
import { existsSync, readFileSync } from "fs";
import { computeTwilioSignature } from "../lib/channels/whatsapp/twilio";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

async function main() {
  loadEnv();
  const body = process.argv.slice(2).join(" ").trim();
  if (!body) {
    console.log('Usage: npm run wa -- "message"   (or WHY / REPORT / hi)');
    process.exit(1);
  }
  const url = process.env.WA_URL || process.env.TWILIO_WEBHOOK_URL || "http://localhost:3000/api/whatsapp";
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    console.log("Set TWILIO_AUTH_TOKEN in .env.local (and TWILIO_ACCOUNT_SID) first.");
    process.exit(1);
  }

  const params: Record<string, string> = {
    MessageSid: `SMsim${Date.now()}`,
    From: process.env.WA_FROM || "whatsapp:+923001112233",
    To: process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886",
    Body: body,
    NumMedia: "0",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": computeTwilioSignature(token, url, params),
    },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    console.log(`HTTP ${res.status}: ${text}`);
    process.exit(1);
  }
  const messages = [...text.matchAll(/<Message>([\s\S]*?)<\/Message>/g)].map((m) =>
    m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
  );
  console.log(`\nYou: ${body}\n`);
  for (const m of messages) console.log(`Bharosa:\n${m}\n`);
  if (!messages.length) console.log("(no reply)");
}

main();
