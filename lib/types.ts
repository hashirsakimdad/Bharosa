export type SignalResult = "ok" | "warn" | "danger" | "unknown";
export type Verdict = "safe" | "careful" | "danger";
export type VerdictColor = "green" | "yellow" | "red";
export type Lang = "en" | "ur" | "roman_ur" | "ar";

/** Short, language-independent reason codes. Used for template explanations. */
export type ReasonCode =
  | "price_far_below"
  | "price_below"
  | "risky_payment"
  | "no_protection"
  | "direct_transfer_only"
  | "friends_family"
  | "advance_payment"
  | "new_domain"
  | "very_new_domain"
  | "unsafe_link"
  | "lookalike"
  | "lookalike_handle"
  | "new_account"
  | "pressure"
  | "crypto_wallet"
  | "reported"
  | "reported_many"
  | "not_enough_info"
  | "all_clear";

export interface Signal {
  /** Machine name, e.g. "priceCheck" */
  name: string;
  /** Human label shown in the "Why?" list */
  label: string;
  result: SignalResult;
  /** One plain-English line of evidence */
  detail: string;
  /** Present when result is warn/danger */
  code?: ReasonCode;
  /** True when the evidence is an AI estimate rather than a hard lookup */
  estimated?: boolean;
}

export type PaymentMethod =
  | "paypal"
  | "card"
  | "cash_on_delivery"
  | "bank_transfer"
  | "jazzcash"
  | "easypaisa"
  | "crypto"
  | "gift_card"
  | "western_union"
  | "friends_family"
  | "other";

export interface Extracted {
  seller: {
    name: string | null;
    handle: string | null;
    platform: string | null;
    /** Days since the seller's account was created, if visible */
    accountAgeDays: number | null;
  };
  product: string | null;
  price: number | null;
  currency: string | null;
  /** Typical market price range, estimated by the AI. Null if unknown. */
  marketPrice: { low: number; high: number; currency: string } | null;
  paymentMethods: PaymentMethod[];
  advancePaymentRequested: boolean;
  refusesBuyerProtection: boolean;
  links: string[];
  phones: string[];
  /** Crypto wallet addresses found in the message (BTC / ETH / TRON) */
  walletAddresses: string[];
  /** Seller's PayPal email, if they gave one. Payments then go straight to them. */
  sellerPaypalEmail: string | null;
  urgencyPhrases: string[];
  language: Lang;
  /** Where these facts came from. "heuristic" means the AI was unavailable. */
  source: "llm" | "heuristic";
}

export interface CheckInput {
  text?: string;
  url?: string;
  imageUrl?: string;
  imageBase64?: string;
  language?: Lang;
  /** Where the input came from, for history. Defaults from the fields above. */
  inputType?: "text" | "link" | "image" | "voice";
  /** Messaging channel, for history */
  channel?: "web" | "whatsapp";
}

export interface PayInfo {
  url: string;
  orderId: string;
  amount: string;
  currency: string;
  /** Set when the price was converted (e.g. PKR -> USD) */
  convertedFrom?: { amount: number; currency: string };
  /** Seller's PayPal email when the money goes straight to them */
  payee?: string;
}

export interface CheckResult {
  id: string;
  verdict: Verdict;
  color: VerdictColor;
  reason: string;
  language: Lang;
  signals: Signal[];
  extracted: Extracted;
  payLink?: string;
  pay?: PayInfo;
  /** Tamper-evident record of this check in the hash chain (null if DB is off) */
  record: LedgerRecord | null;
  /** Non-fatal problems (AI fallback used, PayPal not configured, ...) */
  notes: string[];
}

export interface LedgerRecord {
  seq: number;
  entryHash: string;
  prevHash: string;
}
