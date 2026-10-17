/**
 * Offline tests: no API keys, no network.
 * Covers extraction rules, every signal, the verdict rules, explanations,
 * the hash chain, fingerprinting, currency conversion and SSRF guards.
 *
 *   npm run test:rules
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";

import { heuristicExtract, detectLanguage, extractWalletAddresses, extractPrice } from "../lib/check/heuristics";
import { runSignals } from "../lib/check/signals";
import { decideVerdict } from "../lib/check/verdict";
import { templateReason } from "../lib/check/explain";
import { imitatedBrandForDomain } from "../lib/check/brands";
import { entryHash, GENESIS, payloadHash } from "../lib/ledger";
import { fingerprint, canonicalJson } from "../lib/security/hash";
import { safeFetchImage, parseImageBase64 } from "../lib/security/safeFetch";
import { toPayPalAmount } from "../lib/paypal";
import { runCheck } from "../lib/check";
import type { Lookups } from "../lib/check/lookups";
import type { Extracted, Lang, Verdict } from "../lib/types";

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, "..", "fixtures", name), "utf8")) as {
    name: string;
    expected: Verdict[];
    input: { text: string };
  };

const fakeLookups = (over: Partial<Lookups> = {}): Lookups => ({
  domainAgeDays: async () => null,
  unsafeUrls: async () => null,
  reportCount: async () => null,
  ...over,
});

// AI market-price estimates, as Gemini would give them, so the price rule is exercised offline.
const MARKET: Record<string, Extracted["marketPrice"]> = {
  "01-obvious-scam.json": { low: 1100, high: 1300, currency: "USD" },
  "02-subtle-scam.json": { low: 230000, high: 300000, currency: "PKR" },
  "03-safe-seller.json": { low: 300, high: 400, currency: "USD" },
  "04-roman-urdu-scam.json": { low: 140000, high: 170000, currency: "PKR" },
};

// ---------- extraction ----------

test("price parsing handles Rs, $, k suffix", () => {
  assert.deepEqual(extractPrice("only Rs 45,000"), { price: 45000, currency: "PKR" });
  assert.deepEqual(extractPrice("sirf 45k mein"), null); // no currency word: don't guess
  assert.deepEqual(extractPrice("45k pkr"), { price: 45000, currency: "PKR" });
  assert.deepEqual(extractPrice("price $280 today"), { price: 280, currency: "USD" });
});

test("language detection", () => {
  assert.equal(detectLanguage("Is this still available?"), "en");
  assert.equal(detectLanguage("Bhai pehle advance bhejo, jaldi karo"), "roman_ur");
  assert.equal(detectLanguage("بھائی پہلے پیسے بھیجیں"), "ur");
  assert.equal(detectLanguage("أرسل المال الآن"), "ar");
});

test("crypto wallets are detected, plain numbers are not", () => {
  assert.deepEqual(extractWalletAddresses("send to 0x52908400098527886E0F7030069857D2E4169EE7"), [
    "0x52908400098527886E0F7030069857D2E4169EE7",
  ]);
  assert.equal(extractWalletAddresses("TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE").length, 1);
  assert.equal(extractWalletAddresses("call 03001234567 or 12345678901234567890123456").length, 0);
});

test("look-alike brand domains", () => {
  assert.equal(imitatedBrandForDomain("apple-store-pk.shop"), "apple");
  assert.equal(imitatedBrandForDomain("paypa1-secure.com"), "paypal");
  assert.equal(imitatedBrandForDomain("www.apple.com"), null);
  assert.equal(imitatedBrandForDomain("support.apple.com"), null);
  assert.equal(imitatedBrandForDomain("afternoon.com"), null); // short brand "noon" must be a whole word
  assert.equal(imitatedBrandForDomain("daraz.pk"), null);
});

// ---------- verdict rules ----------

test("verdict rules: any danger = red, 2 warns = yellow, nothing known = yellow", () => {
  const s = (result: "ok" | "warn" | "danger" | "unknown", name = "priceCheck") => ({ name, label: name, result, detail: "" });
  assert.equal(decideVerdict([s("danger"), s("ok", "paymentMethodCheck")]).verdict, "danger");
  assert.equal(decideVerdict([s("warn"), s("warn", "linkCheck")]).verdict, "careful");
  assert.equal(decideVerdict([s("warn"), s("ok", "linkCheck")]).verdict, "safe");
  assert.equal(decideVerdict([s("ok", "linkCheck")]).verdict, "safe");
  const blind = decideVerdict([s("unknown"), s("ok", "pressureCheck"), s("ok", "walletCheck")]);
  assert.equal(blind.verdict, "careful");
  assert.equal(blind.enoughInfo, false);
});

// ---------- the four demo fixtures, offline ----------

for (const file of Object.keys(MARKET)) {
  test(`fixture ${file} -> expected verdict`, async () => {
    const f = fixture(file);
    const x = heuristicExtract(f.input.text);
    if (x.price == null && file === "04-roman-urdu-scam.json") {
      // "45k" with no currency word: the AI reads this as PKR from context
      x.price = 45000;
      x.currency = "PKR";
    }
    x.marketPrice = MARKET[file];
    const lookups = fakeLookups({
      domainAgeDays: async (d) => (d === "dellxps-deals.store" ? 12 : d === "apple-store-pk.shop" ? 3 : null),
    });
    const signals = await runSignals(x, lookups);
    const { verdict } = decideVerdict(signals);
    const flagged = signals.filter((s) => s.result === "warn" || s.result === "danger").map((s) => `${s.name}:${s.result}`);
    assert.ok(f.expected.includes(verdict), `${f.name}: got ${verdict} (${flagged.join(", ")})`);
  });
}

test("reports from the community push a seller to red", async () => {
  const x = heuristicExtract("Selling iPhone 13, $500, PayPal ok. Call +92 300 1234567");
  const signals = await runSignals(x, fakeLookups({ reportCount: async () => 4 }));
  assert.equal(decideVerdict(signals).verdict, "danger");
});

test("Safe Browsing hit is red", async () => {
  const x = heuristicExtract("Order here https://totally-normal-shop.com, PayPal accepted, $40");
  const signals = await runSignals(x, fakeLookups({ unsafeUrls: async (u) => [u[0]], domainAgeDays: async () => 2000 }));
  assert.equal(decideVerdict(signals).verdict, "danger");
});

// ---------- explanations ----------

test("template reasons exist in every language", async () => {
  const x = heuristicExtract(fixture("01-obvious-scam.json").input.text);
  const signals = await runSignals(x, fakeLookups());
  for (const lang of ["en", "ur", "roman_ur", "ar"] as Lang[]) {
    const r = templateReason("danger", signals, lang, true);
    assert.ok(r.length > 15, `${lang}: ${r}`);
    assert.ok(!r.includes("undefined"), `${lang}: ${r}`);
  }
  assert.match(templateReason("careful", [], "en", false), /enough information/i);
});

// ---------- end to end without any keys ----------

test("runCheck works with no API keys (rules-only mode) and never pays on red", async () => {
  delete process.env.GEMINI_API_KEY;
  const res = await runCheck({ text: fixture("01-obvious-scam.json").input.text }, fakeLookups());
  assert.equal(res.verdict, "danger");
  assert.equal(res.payLink, undefined);
  assert.ok(res.reason.startsWith("Don't pay"), res.reason);
  assert.equal(res.extracted.source, "heuristic");
});

// ---------- hash chain ----------

test("hash chain detects tampering", () => {
  const payloads = [{ verdict: "danger" }, { verdict: "safe" }, { verdict: "careful" }];
  let prev = GENESIS;
  const chain = payloads.map((p, i) => {
    const ph = payloadHash(p);
    const h = entryHash(prev, i + 1, "check", ph, 1700000000000 + i);
    const row = { seq: i + 1, prev, ph, h, ms: 1700000000000 + i };
    prev = h;
    return row;
  });
  const verify = (rows: typeof chain) => {
    let p = GENESIS;
    for (const r of rows) {
      if (r.prev !== p || entryHash(p, r.seq, "check", r.ph, r.ms) !== r.h) return false;
      p = r.h;
    }
    return true;
  };
  assert.equal(verify(chain), true);
  const tampered = chain.map((r) => ({ ...r }));
  tampered[1].ph = payloadHash({ verdict: "danger" }); // someone flips "safe" to "danger"
  assert.equal(verify(tampered), false);
  assert.equal(verify([chain[0], chain[2]]), false); // someone deletes a record
});

test("payload hash ignores key order (jsonb round-trip safe)", () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
});

// ---------- privacy ----------

test("phone fingerprints match across formats and hide the number", () => {
  const a = fingerprint("+92 300 1234567");
  assert.equal(a, fingerprint("03001234567"));
  assert.equal(a, fingerprint("+923001234567"));
  assert.ok(!a.includes("3001234567"));
  assert.notEqual(fingerprint("@seller_a"), fingerprint("@seller_b"));
});

// ---------- PayPal amounts ----------

test("PayPal amount conversion", () => {
  process.env.FX_TO_USD = '{"PKR":0.0036}';
  assert.deepEqual(toPayPalAmount(329, "USD"), { value: "329.00", currency: "USD" });
  const pkr = toPayPalAmount(210000, "PKR");
  assert.equal(pkr?.currency, "USD");
  assert.equal(pkr?.value, "756.00");
  assert.equal(toPayPalAmount(100, "XYZ"), null);
  assert.equal(toPayPalAmount(-5, "USD"), null);
});

// ---------- SSRF guards ----------

test("image fetch blocks http and private addresses", async () => {
  await assert.rejects(safeFetchImage("http://example.com/a.png"), /https/);
  await assert.rejects(safeFetchImage("https://127.0.0.1/a.png"), /private/);
  await assert.rejects(safeFetchImage("https://169.254.169.254/latest/meta-data"), /private/);
  await assert.rejects(safeFetchImage("https://10.0.0.5/a.png"), /private/);
  await assert.rejects(safeFetchImage("https://[::1]/a.png"), /private/);
  await assert.rejects(safeFetchImage("https://example.com:8443/a.png"), /port/);
});

test("base64 uploads are validated", () => {
  assert.throws(() => parseImageBase64("data:text/html;base64,PGh0bWw+"), /Unsupported/);
  assert.throws(() => parseImageBase64("data:image/png;base64,<script>"), /base64/);
  assert.equal(parseImageBase64("data:image/png;base64,iVBORw0KGgo=").mimeType, "image/png");
});
