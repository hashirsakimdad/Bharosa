import { randomUUID } from "crypto";
import type { CheckInput, CheckResult, Lang } from "../types";
import { safeFetchImage, parseImageBase64 } from "../security/safeFetch";
import { fingerprint } from "../security/hash";
import type { GeminiImage } from "../llm/gemini";
import { extract } from "./extract";
import { runSignals, sellerIdentifiers } from "./signals";
import { decideVerdict, rankSignals } from "./verdict";
import { explain } from "./explain";
import { rdapDomainAgeDays, safeBrowsingUnsafe, type Lookups } from "./lookups";
import { createOrder, paypalConfigured, toPayPalAmount } from "../paypal";
import { reportCount, saveCheck, savePayment } from "../db";
import { appendLedger, checkPayload } from "../ledger";

/**
 * The whole check, channel-agnostic. The web page uses it today;
 * the WhatsApp webhook (phase 2) will call the same function.
 */

export const defaultLookups: Lookups = {
  domainAgeDays: rdapDomainAgeDays,
  unsafeUrls: safeBrowsingUnsafe,
  reportCount: (ids) => reportCount(ids.map(fingerprint)),
};

export async function runCheck(input: CheckInput, lookups: Lookups = defaultLookups): Promise<CheckResult> {
  const id = randomUUID();
  const notes: string[] = [];

  // 1. Gather the input
  const text = [input.text, input.url].filter(Boolean).join("\n").trim();
  const images: GeminiImage[] = [];
  if (input.imageBase64) images.push(parseImageBase64(input.imageBase64));
  if (input.imageUrl) images.push(await safeFetchImage(input.imageUrl));

  // 2. Read it
  const { extracted, notes: extractNotes } = await extract({ text, images, language: input.language });
  notes.push(...extractNotes);

  // 3. Check it
  const signals = rankSignals(await runSignals(extracted, lookups));

  // 4. Decide (rules only)
  const { verdict, color, enoughInfo } = decideVerdict(signals);

  // 5. Explain (AI, with template fallback)
  const lang: Lang = extracted.language;
  const { reason } = await explain(verdict, signals, lang, enoughInfo);

  const result: CheckResult = { id, verdict, color, reason, language: lang, signals, extracted, record: null, notes };

  // 6. Save + chain it (non-blocking for the verdict: failures become notes)
  const inputType = images.length ? "image" : input.url && !input.text ? "link" : "text";
  const saveError = await saveCheck(result, inputType);
  if (saveError) notes.push(saveError);
  else result.record = await appendLedger("check", id, checkPayload(result));

  // 7. Safe pay link. Hard rule: never for "danger".
  if (verdict !== "danger" && extracted.price != null) {
    if (!paypalConfigured()) {
      notes.push("PayPal is not configured, so no pay link was created.");
    } else {
      const amount = toPayPalAmount(extracted.price, extracted.currency);
      if (!amount) {
        notes.push(`Can't pay in ${extracted.currency ?? "this currency"} yet. Add a rate to FX_TO_USD.`);
      } else {
        const order = await createOrder({
          value: amount.value,
          currency: amount.currency,
          description: extracted.product ? `Bharosa safe pay: ${extracted.product}` : "Bharosa safe pay",
          checkId: id,
        });
        if (order.ok) {
          result.payLink = order.data.approveUrl;
          result.pay = {
            url: order.data.approveUrl,
            orderId: order.data.orderId,
            amount: amount.value,
            currency: amount.currency,
            convertedFrom: amount.convertedFrom,
          };
          await savePayment({ checkId: id, orderId: order.data.orderId, amount: amount.value, currency: amount.currency, status: "CREATED" });
          await appendLedger("payment_created", id, { orderId: order.data.orderId, amount: amount.value, currency: amount.currency });
        } else {
          notes.push(order.error);
        }
      }
    }
  }

  return result;
}

export { sellerIdentifiers };
