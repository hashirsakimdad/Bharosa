import type { Extracted, Lang, PaymentMethod } from "../types";

/**
 * Rule-based extraction. Two jobs:
 * 1. Fallback when the AI is down or rate-limited, so a check never fails.
 * 2. Backstop: merged with AI output so obvious red flags are never missed.
 */

// ---------- language ----------

const URDU_ONLY_CHARS = /[ٹڈڑںےھۓگچپژک]/;
const ARABIC_SCRIPT = /[؀-ۿ]/;
const ROMAN_URDU_WORDS =
  /\b(hai|hain|bhai|bhi|kya|nahi|nahin|karo|kardo|kar do|paise|paisay|pehle|pehlay|abhi|jaldi|wala|wali|aap|ap|mujhe|hum|tum|yeh|ye|kal|sirf|bhejo|bhej do|rupay|rupees|acha|theek|haan|lena|lelo)\b/gi;

export function detectLanguage(text: string): Lang {
  if (!text) return "en";
  if (ARABIC_SCRIPT.test(text)) return URDU_ONLY_CHARS.test(text) ? "ur" : "ar";
  const hits = text.match(ROMAN_URDU_WORDS)?.length ?? 0;
  return hits >= 2 ? "roman_ur" : "en";
}

// ---------- price ----------

const CURRENCY_ALIASES: Record<string, string> = {
  rs: "PKR", "rs.": "PKR", pkr: "PKR", "₨": "PKR", rupees: "PKR", rupay: "PKR", rupay_: "PKR",
  $: "USD", usd: "USD", dollars: "USD", dollar: "USD",
  aed: "AED", dirham: "AED", dirhams: "AED",
  sar: "SAR", riyal: "SAR", riyals: "SAR",
  inr: "INR", "₹": "INR",
  "£": "GBP", gbp: "GBP", "€": "EUR", eur: "EUR",
};

function parseAmount(raw: string, kSuffix: boolean): number | null {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return kSuffix ? n * 1000 : n;
}

export function extractPrice(text: string): { price: number; currency: string } | null {
  const t = text.toLowerCase();
  // currency before number: "Rs 45,000", "$200", "PKR 12k"
  const before = /(rs\.?|pkr|₨|\$|usd|aed|sar|inr|₹|£|€|gbp|eur)\s?([\d][\d,]*(?:\.\d+)?)\s?(k\b)?/i.exec(t);
  if (before) {
    const amount = parseAmount(before[2], Boolean(before[3]));
    if (amount) return { price: amount, currency: CURRENCY_ALIASES[before[1]] ?? "USD" };
  }
  // number before currency: "45000 rupees", "200 dollars", "12k pkr"
  const after = /([\d][\d,]*(?:\.\d+)?)\s?(k)?\s?(rs\.?|pkr|rupees|rupay|usd|dollars?|aed|dirhams?|sar|riyals?|inr|gbp|eur)\b/i.exec(t);
  if (after) {
    const amount = parseAmount(after[1], Boolean(after[2]));
    if (amount) return { price: amount, currency: CURRENCY_ALIASES[after[3]] ?? "USD" };
  }
  return null;
}

// ---------- payment methods ----------

const PAYMENT_PATTERNS: Array<[PaymentMethod, RegExp]> = [
  ["crypto", /\b(crypto|usdt|bitcoin|btc|eth|ethereum|binance|trc20|erc20|wallet address)\b/i],
  ["gift_card", /\b(gift ?cards?|itunes card|google play card|steam card|amazon card)\b/i],
  ["western_union", /\b(western union|moneygram)\b/i],
  ["friends_family", /\b(friends? (and|&) family|f&f|send as friend|personal payment)\b/i],
  ["paypal", /\bpaypal\b/i],
  ["card", /\b(credit card|debit card|card payment|visa|mastercard)\b/i],
  ["cash_on_delivery", /\b(cash on delivery|cod|pay on delivery|delivery pe payment|delivery par)\b/i],
  ["jazzcash", /\bjazz ?cash\b/i],
  ["easypaisa", /\beasy ?paisa\b/i],
  ["bank_transfer", /\b(bank transfer|wire transfer|iban|account number|account no|a\/c|ibft|raast|transfer to my account)\b/i],
];

export function extractPaymentMethods(text: string): PaymentMethod[] {
  const found = new Set<PaymentMethod>();
  for (const [method, re] of PAYMENT_PATTERNS) if (re.test(text)) found.add(method);
  return [...found];
}

/** Maps free-form strings (e.g. from the AI) to our canonical list. */
export function normalizePaymentMethods(values: unknown[]): PaymentMethod[] {
  const joined = values.filter((v) => typeof v === "string").join(" | ");
  return extractPaymentMethods(joined);
}

// ---------- pressure / advance / protection ----------

const URGENCY = [
  /only today/i, /today only/i, /last (one|piece|chance|day)/i, /\bhurry\b/i, /\burgent(ly)?\b/i,
  /limited (time|stock)/i, /(many|other|\d+) (buyers|people) (are )?(waiting|asking|interested)/i,
  /\bbefore (someone|anyone) else\b/i, /confirm (now|today|fast|quickly)/i, /offer (ends|expires)/i,
  /\bjaldi\b/i, /\babhi (bhejo|karo|confirm|payment)\b/i, /\baaj hi\b/i, /\bsirf aaj\b/i,
  /\bwarna\b/i, /\bforan\b/i, /فوراً/, /جلدی/, /آج ہی/, /عاجل/, /اليوم فقط/,
];

export function extractUrgency(text: string): string[] {
  const out: string[] = [];
  for (const re of URGENCY) {
    const m = re.exec(text);
    if (m) out.push(m[0]);
  }
  return [...new Set(out.map((s) => s.toLowerCase()))];
}

export function detectAdvancePayment(text: string): boolean {
  return /\b(advance|pay first|payment first|send (the )?money first|deposit first|booking (fee|amount)|token money|pehle (payment|paise|paisay|advance)|advance (bhejo|bhej do|dena))\b/i.test(
    text,
  ) || /پہلے (ادائیگی|پیسے)|ایڈوانس|دفعة مقدمة|مقدما/.test(text);
}

export function detectRefusesProtection(text: string): boolean {
  return /\b(no (paypal|buyer protection|cod|cash on delivery)|don'?t use (paypal|cod)|not (accept|accepting) (paypal|cod)|cod (not|nahi) (available|hai)|no returns?,? no refunds?)\b/i.test(
    text,
  );
}

// ---------- links, phones, seller ----------

export function extractLinks(text: string): string[] {
  const re = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|pk|shop|store|online|site|xyz|top|info|biz|co|io|me|app|link|click|ae|sa|in|uk|us)(?:\.[a-z]{2})?(?:\/[^\s)"'<>]*)?)/gi;
  const out = new Set<string>();
  for (const m of text.matchAll(re)) {
    const raw = m[1].replace(/[.,;:!?]+$/, "");
    if (/@/.test(text.slice(Math.max(0, (m.index ?? 0) - 1), m.index ?? 0))) continue; // skip emails
    out.add(raw);
  }
  return [...out].slice(0, 10);
}

export function extractPhones(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(\+?\d[\d\s-]{8,}\d)/g)) {
    const digits = m[1].replace(/[^\d+]/g, "");
    if (digits.replace("+", "").length >= 10 && digits.replace("+", "").length <= 15) out.add(digits);
  }
  return [...out].slice(0, 5);
}

/** BTC (legacy + bech32), ETH/EVM, and TRON (where USDT-TRC20 scams live). */
export function extractWalletAddresses(text: string): string[] {
  const patterns = [
    /\b0x[a-fA-F0-9]{40}\b/g, // Ethereum / EVM
    /\bbc1[a-z0-9]{25,62}\b/g, // Bitcoin bech32
    /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g, // Bitcoin legacy
    /\bT[1-9A-HJ-NP-Za-km-z]{33}\b/g, // TRON
  ];
  const out = new Set<string>();
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      // real addresses mix letters and digits; skips long plain numbers and words
      if (/[a-zA-Z]/.test(m[0]) && /\d/.test(m[0])) out.add(m[0]);
    }
  }
  return [...out].slice(0, 5);
}

export function extractHandle(text: string): string | null {
  const m = /(?:^|\s)@([a-z0-9._]{3,30})/i.exec(text);
  return m ? `@${m[1]}` : null;
}

export function extractPlatform(text: string): string | null {
  const platforms = ["instagram", "facebook", "whatsapp", "tiktok", "olx", "daraz", "telegram", "snapchat", "marketplace", "ebay", "amazon"];
  const t = text.toLowerCase();
  return platforms.find((p) => t.includes(p)) ?? null;
}

export function extractAccountAgeDays(text: string): number | null {
  const t = text.toLowerCase();
  const m =
    /(?:joined|created|account (?:is |was )?(?:created|made|opened)|member since)\s*(\d{1,4})\s*(day|days|week|weeks|month|months)\s*ago/.exec(t) ||
    /(\d{1,4})\s*(day|days|week|weeks|month|months)\s*old (?:account|page|profile)/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  if (unit.startsWith("week")) return n * 7;
  if (unit.startsWith("month")) return n * 30;
  return n;
}

// ---------- full heuristic extraction ----------

export function heuristicExtract(text: string, language?: Lang): Extracted {
  const price = extractPrice(text);
  const wallets = extractWalletAddresses(text);
  const methods = extractPaymentMethods(text);
  if (wallets.length && !methods.includes("crypto")) methods.push("crypto");
  return {
    seller: {
      name: null,
      handle: extractHandle(text),
      platform: extractPlatform(text),
      accountAgeDays: extractAccountAgeDays(text),
    },
    product: null,
    price: price?.price ?? null,
    currency: price?.currency ?? null,
    marketPrice: null,
    paymentMethods: methods,
    advancePaymentRequested: detectAdvancePayment(text),
    refusesBuyerProtection: detectRefusesProtection(text),
    links: extractLinks(text),
    phones: extractPhones(text),
    walletAddresses: wallets,
    urgencyPhrases: extractUrgency(text),
    language: language ?? detectLanguage(text),
    source: "heuristic",
  };
}
