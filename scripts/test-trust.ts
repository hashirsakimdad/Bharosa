/**
 * Offline tests for phase 3: Bitcoin anchoring, PayPal webhooks, paying sellers directly.
 * PayPal and the OpenTimestamps calendars are simulated; no keys, no network.
 *   npm run test:trust
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { buildOtsFile, otsDigest, stamp, submitDigest, HEADER_MAGIC, type Fetcher } from "../lib/anchor/ots";
import { anchorText } from "../lib/anchor";
import { buildVerifyBody, verifyWebhook, captureIdOf } from "../lib/paypal";
import { handlePayPalEvent, type WebhookDeps } from "../lib/paypal-webhook";
import { extractPaypalEmail } from "../lib/check/heuristics";
import { runCheck } from "../lib/check";
import type { Lookups } from "../lib/check/lookups";
import type { PaymentRow } from "../lib/db";

const digest = createHash("sha256").update("hello bharosa").digest();
const proof = (n: number) => Buffer.from([0xf0, 0x10, ...Array(16).fill(n), 0x08, 0x00, 0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e, 0x00]);

// ---------- OpenTimestamps ----------

test(".ots file: header, digest, and fork markers between calendar proofs", () => {
  const one = buildOtsFile(digest, [proof(1)]);
  assert.ok(one.subarray(0, HEADER_MAGIC.length).equals(HEADER_MAGIC));
  assert.ok(otsDigest(one).equals(digest));
  assert.equal(one.length, HEADER_MAGIC.length + 2 + 32 + proof(1).length);

  const three = buildOtsFile(digest, [proof(1), proof(2), proof(3)]);
  const body = three.subarray(HEADER_MAGIC.length + 2 + 32);
  // 0xff p1 0xff p2 p3
  assert.equal(body[0], 0xff);
  assert.equal(body[1 + proof(1).length], 0xff);
  assert.equal(body.length, 2 + 3 * proof(1).length);
  assert.throws(() => buildOtsFile(Buffer.alloc(31), [proof(1)]), /32 bytes/);
});

test("a calendar proof that is itself a fork is only used alone", () => {
  const forked = Buffer.from([0xff, ...proof(9)]);
  const f = buildOtsFile(digest, [forked, proof(1)]);
  assert.equal(f.subarray(HEADER_MAGIC.length + 34)[0], 0xf0, "uses the linear proof, drops the forked one");
});

test("submitDigest posts the raw 32 bytes to /digest with the OTS Accept header", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const fetcher: Fetcher = async (url, init) => {
    seen = { url, init };
    return new Response(new Uint8Array(proof(1)));
  };
  const out = await submitDigest("https://a.pool.opentimestamps.org", digest, fetcher);
  assert.ok(out.equals(proof(1)));
  assert.equal(seen!.url, "https://a.pool.opentimestamps.org/digest");
  assert.equal(seen!.init.method, "POST");
  assert.equal((seen!.init.headers as Record<string, string>).Accept, "application/vnd.opentimestamps.v1");
  assert.ok(Buffer.from(seen!.init.body as Uint8Array).equals(digest));
});

test("stamp succeeds if at least one calendar answers, fails if none do", async () => {
  const cals = ["https://a.example", "https://b.example", "https://c.example"];
  const someDown: Fetcher = async (url) =>
    url.startsWith("https://b.") ? new Response("down", { status: 503 }) : new Response(new Uint8Array(proof(url.length)));
  const ok = await stamp(digest, cals, someDown);
  assert.deepEqual(ok.calendars, ["https://a.example", "https://c.example"]);
  assert.deepEqual(ok.failed, ["https://b.example"]);
  assert.ok(otsDigest(ok.ots).equals(digest));

  const allDown: Fetcher = async () => new Response("down", { status: 500 });
  await assert.rejects(stamp(digest, cals, allDown), /No OpenTimestamps calendar answered/);
});

test("anchor file names the entry count and head hash", () => {
  const t = anchorText(42, "ab".repeat(32), new Date("2026-10-18T00:00:00Z"));
  assert.match(t, /entries: 42/);
  assert.match(t, new RegExp(`head: ${"ab".repeat(32)}`));
  assert.match(t, /opentimestamps\.org/);
});

// ---------- PayPal webhook verification ----------

const hdrs = {
  authAlgo: "SHA256withRSA",
  certUrl: "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42",
  transmissionId: "69cd13f0-d67a-11e5-baa3-778b53f4ae55",
  transmissionSig: "lmI95Jx3Y9nhR5SJWlHVIWpg4AgFk7n9bCHSRxbrd8A9zrhdu2rMyFrmz+Zjh3s3boXB07VXCXUZy/UFzUlnGJn0wDugt7FlSvdKeIJenLRemUxYCPVoEZzg9VFNqOa48gMkvF+XTpxBeUx/kWy6B5cp7GkT2+pOowfRK7OaynuxUoKW3JcMWw272VKjLTtTAShncla7tGF+55rxyt2KNZIIqxNMJ48RDZheGU5w1npu9dZHnPgTXB9iomeVRoD8O/jhRpnKsGrDschyNdkeh81BJJMH4Ctc6lnCCquoP/GzCzz33MMsNdid7vL/NIWaCsekQpW26FpWPi/tfj8nLA==",
  transmissionTime: "2016-02-18T20:01:35Z",
};

test("verify body embeds the raw event exactly (no re-serializing)", () => {
  const raw = '{"id":"WH-1","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"amount":{"value":"10.10"},"n":1.10}}';
  const body = buildVerifyBody(hdrs, "WH-ID", raw);
  assert.ok(body.endsWith(`"webhook_event":${raw}}`), "raw event bytes preserved, e.g. 1.10 stays 1.10");
  const parsed = JSON.parse(body);
  assert.equal(parsed.webhook_id, "WH-ID");
  assert.equal(parsed.transmission_id, hdrs.transmissionId);
  assert.equal(parsed.webhook_event.event_type, "PAYMENT.CAPTURE.COMPLETED");
});

test("webhooks without PayPal headers, or with a non-PayPal cert URL, are rejected before any call", async () => {
  process.env.PAYPAL_WEBHOOK_ID = "WH-ID";
  const missing = await verifyWebhook({ ...hdrs, transmissionSig: null }, "{}");
  assert.deepEqual(missing, { ok: true, data: false });
  const evil = await verifyWebhook({ ...hdrs, certUrl: "https://evil.example/cert" }, "{}");
  assert.deepEqual(evil, { ok: true, data: false });
  const lookalike = await verifyWebhook({ ...hdrs, certUrl: "https://paypal.com.evil.example/cert" }, "{}");
  assert.deepEqual(lookalike, { ok: true, data: false });
  delete process.env.PAYPAL_WEBHOOK_ID;
});

// ---------- PayPal webhook events ----------

function fakeDeps(rows: Record<string, PaymentRow>) {
  const appended: Array<{ kind: string; ref: string | null }> = [];
  const reported: string[] = [];
  const deps: WebhookDeps = {
    transition: async (match, status, captureId) => {
      const key = match.orderId ?? Object.keys(rows).find((k) => rows[k].capture_id === match.captureId);
      const row = key ? rows[key] : undefined;
      if (!row || row.status === status) return null; // unchanged -> null, like the real one
      row.status = status;
      if (captureId) row.capture_id = captureId;
      return { ...row };
    },
    append: async (kind, ref) => {
      appended.push({ kind, ref });
      return null;
    },
    report: async (checkId, reporter) => {
      reported.push(`${checkId}|${reporter}`);
      return { ok: true, alreadyReported: false };
    },
  };
  return { deps, appended, reported };
}

const row = (): Record<string, PaymentRow> => ({
  ORDER1: { check_id: "check-1", paypal_order_id: "ORDER1", capture_id: null, status: "CREATED" },
});

test("PAYMENT.CAPTURE.COMPLETED records the capture once, even if delivered twice", async () => {
  const rows = row();
  const { deps, appended } = fakeDeps(rows);
  const event = {
    id: "WH-A",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: { id: "CAP1", supplementary_data: { related_ids: { order_id: "ORDER1" } } },
  };
  await handlePayPalEvent(event, deps);
  await handlePayPalEvent(event, deps);
  assert.equal(rows.ORDER1.status, "COMPLETED");
  assert.equal(rows.ORDER1.capture_id, "CAP1");
  assert.deepEqual(appended, [{ kind: "payment_captured", ref: "check-1" }]);
});

test("PAYMENT.CAPTURE.REFUNDED finds the capture through the refund's 'up' link", async () => {
  const rows = row();
  rows.ORDER1.status = "COMPLETED";
  rows.ORDER1.capture_id = "CAP1";
  const { deps, appended } = fakeDeps(rows);
  await handlePayPalEvent(
    {
      event_type: "PAYMENT.CAPTURE.REFUNDED",
      resource: {
        id: "REF1",
        links: [
          { rel: "self", href: "https://api.sandbox.paypal.com/v2/payments/refunds/REF1" },
          { rel: "up", href: "https://api.sandbox.paypal.com/v2/payments/captures/CAP1" },
        ],
      },
    },
    deps,
  );
  assert.equal(rows.ORDER1.status, "REFUNDED");
  assert.deepEqual(appended, [{ kind: "payment_refunded", ref: "check-1" }]);
});

test("CUSTOMER.DISPUTE.CREATED marks the payment and reports the seller to the scam network", async () => {
  const rows = row();
  rows.ORDER1.status = "COMPLETED";
  rows.ORDER1.capture_id = "CAP1";
  const { deps, appended, reported } = fakeDeps(rows);
  const out = await handlePayPalEvent(
    {
      event_type: "CUSTOMER.DISPUTE.CREATED",
      resource: { dispute_id: "PP-D-1", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", disputed_transactions: [{ seller_transaction_id: "CAP1" }] },
    },
    deps,
  );
  assert.equal(rows.ORDER1.status, "DISPUTED");
  assert.deepEqual(appended, [{ kind: "payment_disputed", ref: "check-1" }]);
  assert.deepEqual(reported, ["check-1|paypal-dispute:PP-D-1"]);
  assert.ok(out.actions.some((a) => a.startsWith("reported seller")));
});

test("unknown events are acknowledged but ignored; unknown payments change nothing", async () => {
  const { deps, appended } = fakeDeps(row());
  assert.equal((await handlePayPalEvent({ event_type: "BILLING.PLAN.CREATED" }, deps)).handled, false);
  await handlePayPalEvent({ event_type: "CUSTOMER.DISPUTE.CREATED", resource: { disputed_transactions: [{ seller_transaction_id: "NOPE" }] } }, deps);
  assert.equal(appended.length, 0);
});

test("capture id is read from a captured order", () => {
  assert.equal(captureIdOf({ purchase_units: [{ payments: { captures: [{ id: "CAP9" }] } }] }), "CAP9");
  assert.equal(captureIdOf({}), null);
});

// ---------- paying the seller directly ----------

test("seller PayPal email is picked up only when it's about PayPal", () => {
  assert.equal(extractPaypalEmail("Pay on PayPal: Ali.Khan@gmail.com thanks"), "ali.khan@gmail.com");
  assert.equal(extractPaypalEmail("send via paypal to shop@example.pk"), "shop@example.pk");
  assert.equal(extractPaypalEmail("my email is ali@gmail.com, pay by bank transfer"), null);
});

const noLookups: Lookups = { domainAgeDays: async () => null, unsafeUrls: async () => null, reportCount: async () => null };

/** A fake PayPal sandbox that rejects one payee email, like PayPal does for unknown accounts. */
function fakePayPal(rejectPayee: string | null) {
  const orders: Array<Record<string, unknown>> = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "T", expires_in: 3600 });
    if (url.endsWith("/v2/checkout/orders")) {
      const body = JSON.parse(String(init?.body));
      orders.push(body);
      const payee = body.purchase_units[0].payee?.email_address;
      if (payee && payee === rejectPayee) return Response.json({ message: "PAYEE_ACCOUNT_INVALID" }, { status: 422 });
      return Response.json(
        { id: `O${orders.length}`, status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: `https://sandbox.paypal.com/checkoutnow?token=O${orders.length}` }] },
        { status: 201 },
      );
    }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  return { orders, restore: () => (globalThis.fetch = real) };
}

test("pay link goes straight to the seller's PayPal when they gave an email", async () => {
  delete process.env.GEMINI_API_KEY;
  process.env.PAYPAL_CLIENT_ID = "id";
  process.env.PAYPAL_CLIENT_SECRET = "secret";
  const pp = fakePayPal(null);
  try {
    const r = await runCheck({ text: "Sony WH-1000XM5, sealed, $329. PayPal: seller.ok@example.com, or cash on delivery." }, noLookups);
    assert.equal(r.verdict, "safe");
    assert.equal(r.pay?.payee, "seller.ok@example.com");
    assert.equal((pp.orders[0].purchase_units as Array<{ payee?: { email_address: string } }>)[0].payee?.email_address, "seller.ok@example.com");
  } finally {
    pp.restore();
  }
});

test("if PayPal rejects the seller's email, the pay link still works through Bharosa", async () => {
  const pp = fakePayPal("bad@example.com");
  try {
    const r = await runCheck({ text: "Sony WH-1000XM5, sealed, $329. PayPal: bad@example.com, or cash on delivery." }, noLookups);
    assert.ok(r.payLink, "still has a pay link");
    assert.equal(r.pay?.payee, undefined);
    assert.equal(pp.orders.length, 2);
    assert.ok(r.notes.some((n) => n.includes("couldn't pay bad@example.com directly")));
  } finally {
    pp.restore();
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
  }
});
