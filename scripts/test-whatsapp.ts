/**
 * Offline tests for the WhatsApp channel: no Twilio, no AI, no network.
 *   npm run test:whatsapp
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTwilioSignature, validTwilioSignature, twiml, fetchTwilioMedia } from "../lib/channels/whatsapp/twilio";
import { handleIncoming, parseCommand, _resetSessions, type Deps } from "../lib/channels/whatsapp/handler";
import { runCheck } from "../lib/check";
import type { Lookups } from "../lib/check/lookups";

delete process.env.GEMINI_API_KEY;

const lookups: Lookups = { domainAgeDays: async () => null, unsafeUrls: async () => null, reportCount: async () => null };
const deps = (over: Partial<Deps> = {}): Deps => ({
  runCheck: (input) => runCheck(input, lookups),
  fetchMedia: async () => ({ mimeType: "audio/ogg", data: "AAAA" }),
  transcribe: async () => ({ text: "Bhai iPhone sirf 20k, pehle advance JazzCash pe bhejo, COD nahi hai", language: "roman_ur" }),
  report: async () => ({ ok: true, alreadyReported: false }),
  ...over,
});
let n = 0;
const sender = () => `whatsapp:+9230000000${String(n++).padStart(2, "0")}`;

// ---------- signature ----------

test("Twilio signature: valid passes, tampered body or URL fails", () => {
  const token = "test-token";
  const url = "https://example.ngrok-free.app/api/whatsapp";
  const params = { Body: "hello", From: "whatsapp:+923001234567", NumMedia: "0" };
  const sig = computeTwilioSignature(token, url, params);
  assert.equal(validTwilioSignature(token, sig, url, params), true);
  assert.equal(validTwilioSignature(token, sig, url, { ...params, Body: "hello!" }), false);
  assert.equal(validTwilioSignature(token, sig, "https://evil.example/api/whatsapp", params), false);
  assert.equal(validTwilioSignature("other-token", sig, url, params), false);
  assert.equal(validTwilioSignature(token, null, url, params), false);
});

test("signature does not depend on parameter order", () => {
  const a = computeTwilioSignature("t", "https://x.dev/w", { b: "2", a: "1" });
  const b = computeTwilioSignature("t", "https://x.dev/w", { a: "1", b: "2" });
  assert.equal(a, b);
});

test("TwiML escapes message text", () => {
  assert.equal(
    twiml(["a < b & \"c\""]),
    '<?xml version="1.0" encoding="UTF-8"?><Response><Message>a &lt; b &amp; &quot;c&quot;</Message></Response>',
  );
});

test("media can only be fetched from api.twilio.com", async () => {
  await assert.rejects(fetchTwilioMedia("https://evil.example/x.jpg"), /api.twilio.com/);
  await assert.rejects(fetchTwilioMedia("http://api.twilio.com/x"), /api.twilio.com/);
});

// ---------- commands ----------

test("command parsing", () => {
  assert.equal(parseCommand("WHY"), "why");
  assert.equal(parseCommand("kyun?"), "why");
  assert.equal(parseCommand("report"), "report");
  assert.equal(parseCommand("Assalam o alaikum"), "help");
  assert.equal(parseCommand("hi is this iphone for $200 legit"), null); // a real question, not a greeting
  assert.equal(parseCommand("why is the price so low on this listing at daraz"), null);
});

// ---------- conversations ----------

test("scam text -> red verdict in the same chat, then WHY shows evidence", async () => {
  _resetSessions();
  const from = sender();
  const [reply] = await handleIncoming(
    { from, body: "iPhone 15 Pro only $280, pay USDT to TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE, offer ends today", media: [] },
    deps(),
  );
  assert.match(reply, /🔴 \*Don't pay\*/);
  assert.match(reply, /REPORT/);
  assert.ok(!/PayPal: /.test(reply), "no pay link on red");

  const [why] = await handleIncoming({ from, body: "why", media: [] }, deps());
  assert.match(why, /\*Evidence\*/);
  assert.match(why, /Crypto wallet/);
});

test("Roman Urdu message gets a Roman Urdu reply", async () => {
  _resetSessions();
  const [reply] = await handleIncoming(
    { from: sender(), body: "Bhai PS5 bilkul new hai, pehle advance JazzCash pe bhejo, COD nahi hai, jaldi karo", media: [] },
    deps(),
  );
  assert.match(reply, /Paise mat bhejein/);
  assert.match(reply, /Khatre ki nishaniyan/);
});

test("voice note is transcribed, checked, and the reply shows what was heard", async () => {
  _resetSessions();
  const [reply] = await handleIncoming(
    { from: sender(), body: "", media: [{ url: "https://api.twilio.com/media/1", contentType: "audio/ogg; codecs=opus" }] },
    deps(),
  );
  assert.match(reply, /🎙️/);
  assert.match(reply, /Main ne suna/);
  assert.match(reply, /🔴/);
});

test("REPORT reports the last checked seller", async () => {
  _resetSessions();
  const from = sender();
  let reportedId: string | null = null;
  const d = deps({ report: async (id) => ((reportedId = id), { ok: true, alreadyReported: false }) });
  await handleIncoming({ from, body: "Send advance to 03001234567 via JazzCash, COD nahi hai", media: [] }, d);
  const [reply] = await handleIncoming({ from, body: "REPORT", media: [] }, d);
  assert.ok(reportedId, "report was called with the last check id");
  assert.match(reply, /report/i);
});

test("WHY with no previous check asks for a message first", async () => {
  _resetSessions();
  const [reply] = await handleIncoming({ from: sender(), body: "why", media: [] }, deps());
  assert.match(reply, /first/);
});

test("unsupported media gets a friendly answer, greeting gets the welcome", async () => {
  _resetSessions();
  const [pdf] = await handleIncoming({ from: sender(), body: "", media: [{ url: "https://api.twilio.com/m", contentType: "application/pdf" }] }, deps());
  assert.match(pdf, /screenshots and voice notes/);
  const [hi] = await handleIncoming({ from: sender(), body: "salam", media: [] }, deps());
  assert.match(hi, /Bharosa/);
});

test("a failing check never crashes the webhook", async () => {
  _resetSessions();
  const [reply] = await handleIncoming(
    { from: sender(), body: "some deal", media: [] },
    deps({ runCheck: async () => { throw new Error("boom"); } }),
  );
  assert.match(reply, /went wrong/);
});

test("per-sender rate limit", async () => {
  _resetSessions();
  const from = sender();
  const replies: string[] = [];
  for (let i = 0; i < 8; i++) replies.push(...(await handleIncoming({ from, body: "hi", media: [] }, deps())));
  assert.match(replies.at(-1)!, /wait a minute/);
});
