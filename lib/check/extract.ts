import { z } from "zod";
import type { Extracted, Lang } from "../types";
import { generate, geminiConfigured, parseJsonReply, type GeminiImage } from "../llm/gemini";
import { heuristicExtract, normalizePaymentMethods, extractWalletAddresses, detectLanguage } from "./heuristics";

/**
 * Pulls structured facts out of whatever the user forwarded.
 * AI (Gemini, with vision for screenshots) does the reading; rule-based extraction runs
 * alongside and is merged in, so obvious red flags are never lost and the check still
 * works when the AI is unavailable.
 */

const num = z.preprocess((v) => (typeof v === "string" ? Number(v.replace(/,/g, "")) : v), z.number().finite().nullable().catch(null));
const str = z.string().trim().min(1).nullable().catch(null);
const strArr = z.array(z.string()).catch([]);

const LlmSchema = z.object({
  seller_name: str,
  seller_handle: str,
  platform: str,
  account_age_days: num,
  product: str,
  price: num,
  currency: str,
  market_price_low: num,
  market_price_high: num,
  market_price_currency: str,
  payment_methods: strArr,
  advance_payment_requested: z.boolean().catch(false),
  refuses_buyer_protection: z.boolean().catch(false),
  links: strArr,
  phone_numbers: strArr,
  wallet_addresses: strArr,
  seller_paypal_email: str,
  urgency_phrases: strArr,
  language: z.enum(["en", "ur", "roman_ur", "ar"]).catch("en"),
  visible_text: z.string().catch(""),
});

const PROMPT = `You read messages, chat screenshots, product listings and payment requests that someone received from an online seller, before they pay.
Extract the facts below. Use ONLY what is actually shown. Never invent a price, link, number or name. If something isn't there, use null or [].

Return JSON with exactly these keys:
{
  "seller_name": string|null,
  "seller_handle": string|null,            // e.g. "@gadgets_pk"
  "platform": string|null,                 // instagram, facebook, whatsapp, olx, daraz, website, ...
  "account_age_days": number|null,         // only if the screenshot shows when the account/page was created
  "product": string|null,                  // specific, e.g. "iPhone 15 Pro 256GB"
  "price": number|null,                    // asking price as a plain number. "45k" = 45000
  "currency": string|null,                 // ISO code: PKR, USD, AED, SAR, INR, EUR, GBP. "Rs" = PKR
  "market_price_low": number|null,         // typical price of this product NEW from a legit seller in that currency/country.
  "market_price_high": number|null,        //   Only fill if the product is specific enough to know. Otherwise null.
  "market_price_currency": string|null,
  "payment_methods": string[],             // as written: "bank transfer", "JazzCash", "USDT", "PayPal friends and family", "cash on delivery"...
  "advance_payment_requested": boolean,    // wants money before delivery / before you see the item
  "refuses_buyer_protection": boolean,     // refuses PayPal, cards or cash on delivery
  "links": string[],
  "phone_numbers": string[],
  "wallet_addresses": string[],            // crypto wallet addresses, copied exactly
  "seller_paypal_email": string|null,      // the email the seller says to send PayPal payments to, if any
  "urgency_phrases": string[],             // exact pressure phrases: "only today", "3 people waiting", "jaldi confirm karo"
  "language": "en"|"ur"|"roman_ur"|"ar",   // language the SELLER/USER wrote in. roman_ur = Urdu typed in English letters
  "visible_text": string                   // for screenshots: the chat text you can read, max 1500 chars. For text input: ""
}`;

export async function extract(params: {
  text: string;
  images: GeminiImage[];
  language?: Lang;
}): Promise<{ extracted: Extracted; notes: string[] }> {
  const notes: string[] = [];
  const heuristic = heuristicExtract(params.text, params.language);

  if (!geminiConfigured()) {
    notes.push("AI is not configured (GEMINI_API_KEY missing), so only rule-based checks ran.");
    if (params.images.length) notes.push("Screenshots need the AI to be read. Paste the chat text instead.");
    return { extracted: heuristic, notes };
  }

  let parsed: z.infer<typeof LlmSchema>;
  try {
    const input = params.text ? `\n\nMESSAGE FROM USER:\n"""\n${params.text.slice(0, 6000)}\n"""` : "\n\n(The input is the attached image.)";
    const reply = await generate(PROMPT + input, { images: params.images, json: true });
    parsed = LlmSchema.parse(parseJsonReply(reply));
  } catch (e) {
    notes.push(`AI was unavailable (${(e as Error).message.slice(0, 120)}), so only rule-based checks ran.`);
    return { extracted: heuristic, notes };
  }

  // Run the rules over what the AI read from the screenshot too.
  const fromImage = parsed.visible_text ? heuristicExtract(parsed.visible_text) : null;

  const methods = new Set([
    ...normalizePaymentMethods(parsed.payment_methods),
    ...heuristic.paymentMethods,
    ...(fromImage?.paymentMethods ?? []),
  ]);
  const wallets = new Set([
    ...extractWalletAddresses(parsed.wallet_addresses.join(" ")),
    ...heuristic.walletAddresses,
    ...(fromImage?.walletAddresses ?? []),
  ]);
  if (wallets.size) methods.add("crypto");

  const marketOk =
    parsed.market_price_low != null &&
    parsed.market_price_high != null &&
    parsed.market_price_low > 0 &&
    parsed.market_price_high >= parsed.market_price_low;

  const extracted: Extracted = {
    seller: {
      name: parsed.seller_name,
      handle: parsed.seller_handle ?? heuristic.seller.handle ?? fromImage?.seller.handle ?? null,
      platform: parsed.platform ?? heuristic.seller.platform,
      accountAgeDays: parsed.account_age_days ?? heuristic.seller.accountAgeDays ?? fromImage?.seller.accountAgeDays ?? null,
    },
    product: parsed.product,
    price: parsed.price ?? heuristic.price ?? fromImage?.price ?? null,
    currency: (parsed.currency ?? heuristic.currency ?? fromImage?.currency ?? null)?.toUpperCase() ?? null,
    marketPrice: marketOk
      ? {
          low: parsed.market_price_low as number,
          high: parsed.market_price_high as number,
          currency: (parsed.market_price_currency ?? parsed.currency ?? "USD").toUpperCase(),
        }
      : null,
    paymentMethods: [...methods],
    advancePaymentRequested:
      parsed.advance_payment_requested || heuristic.advancePaymentRequested || Boolean(fromImage?.advancePaymentRequested),
    refusesBuyerProtection:
      parsed.refuses_buyer_protection || heuristic.refusesBuyerProtection || Boolean(fromImage?.refusesBuyerProtection),
    links: uniq([...parsed.links, ...heuristic.links, ...(fromImage?.links ?? [])]).slice(0, 10),
    phones: uniq([...parsed.phone_numbers.map((p) => p.replace(/[^\d+]/g, "")), ...heuristic.phones, ...(fromImage?.phones ?? [])])
      .filter((p) => p.replace("+", "").length >= 10)
      .slice(0, 5),
    walletAddresses: [...wallets].slice(0, 5),
    sellerPaypalEmail: validEmail(parsed.seller_paypal_email) ?? heuristic.sellerPaypalEmail ?? fromImage?.sellerPaypalEmail ?? null,
    urgencyPhrases: uniq([...parsed.urgency_phrases, ...heuristic.urgencyPhrases, ...(fromImage?.urgencyPhrases ?? [])]).slice(0, 6),
    language: params.language ?? pickLanguage(params.text, parsed.language),
    source: "llm",
  };
  return { extracted, notes };
}

/** Script-based detection is reliable for Urdu/Arabic; for Latin text the AI is better at spotting Roman Urdu. */
function pickLanguage(text: string, aiLang: Lang): Lang {
  const rule = text.trim() ? detectLanguage(text) : "en";
  return rule !== "en" ? rule : aiLang;
}

function validEmail(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(t) ? t : null;
}

function uniq(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((s) => {
    const k = s.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
