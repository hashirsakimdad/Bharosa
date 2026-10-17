import type { Extracted, PaymentMethod, Signal } from "../types";
import { hostOf, imitatedBrandForDomain, imitatedBrandForHandle, registrableDomain } from "./brands";
import type { Lookups } from "./lookups";

/**
 * Independent checks. Each returns one Signal and must never throw:
 * if its data source is unavailable it returns "unknown".
 */

const PROTECTED: PaymentMethod[] = ["paypal", "card", "cash_on_delivery"];
const UNRECOVERABLE: PaymentMethod[] = ["crypto", "gift_card", "western_union"];
const DIRECT: PaymentMethod[] = ["bank_transfer", "jazzcash", "easypaisa"];

const fmt = (n: number, cur: string | null) =>
  `${cur ?? ""} ${Math.round(n).toLocaleString("en-US")}`.trim();

export function priceCheck(x: Extracted): Signal {
  const base = { name: "priceCheck", label: "Price" };
  if (x.price == null) return { ...base, result: "unknown", detail: "No price found in the message." };
  const mp = x.marketPrice;
  if (!mp || mp.low <= 0 || (x.currency && mp.currency && mp.currency.toUpperCase() !== x.currency.toUpperCase())) {
    return { ...base, result: "unknown", detail: `Asking ${fmt(x.price, x.currency)}. Couldn't find a typical market price to compare.` };
  }
  const typical = (mp.low + mp.high) / 2;
  const below = 1 - x.price / typical;
  const pct = Math.round(below * 100);
  const range = `${fmt(mp.low, mp.currency)} to ${fmt(mp.high, mp.currency)}`;
  if (below > 0.6) {
    return { ...base, result: "danger", code: "price_far_below", estimated: true,
      detail: `Asking ${fmt(x.price, x.currency)}, about ${pct}% below the usual ${range}. Prices this low are a classic bait.` };
  }
  if (below > 0.4) {
    return { ...base, result: "warn", code: "price_below", estimated: true,
      detail: `Asking ${fmt(x.price, x.currency)}, about ${pct}% below the usual ${range}.` };
  }
  return { ...base, result: "ok", estimated: true, detail: `Asking ${fmt(x.price, x.currency)}, normal for this item (usually ${range}).` };
}

export function paymentMethodCheck(x: Extracted): Signal {
  const base = { name: "paymentMethodCheck", label: "How they want to be paid" };
  const m = x.paymentMethods;
  const risky = m.filter((p) => UNRECOVERABLE.includes(p));
  if (risky.length) {
    return { ...base, result: "danger", code: "risky_payment",
      detail: `Asks for ${risky.map(label).join(" / ")}. Money sent this way can't be traced or refunded.` };
  }
  if (x.refusesBuyerProtection) {
    return { ...base, result: "danger", code: "no_protection", detail: "Refuses PayPal or cash on delivery, so you'd have no protection." };
  }
  if (m.includes("friends_family")) {
    return { ...base, result: "warn", code: "friends_family",
      detail: "Asks for a 'friends & family' payment, which skips buyer protection." };
  }
  const hasProtected = m.some((p) => PROTECTED.includes(p));
  const direct = m.filter((p) => DIRECT.includes(p));
  if (direct.length && !hasProtected) {
    return { ...base, result: "warn", code: "direct_transfer_only",
      detail: `Only accepts ${direct.map(label).join(" / ")}. If something goes wrong, getting money back is very hard.` };
  }
  if (hasProtected) return { ...base, result: "ok", detail: `Accepts ${m.filter((p) => PROTECTED.includes(p)).map(label).join(" / ")}, which protects you.` };
  return { ...base, result: "unknown", detail: "Payment method not mentioned." };
}

export function advancePaymentCheck(x: Extracted): Signal {
  const base = { name: "advancePaymentCheck", label: "Advance payment" };
  if (x.advancePaymentRequested && !x.paymentMethods.some((p) => p === "paypal" || p === "card")) {
    return { ...base, result: "warn", code: "advance_payment", detail: "Wants money before you get anything, with no protection." };
  }
  return { ...base, result: "ok", detail: "No unprotected advance payment requested." };
}

export function pressureCheck(x: Extracted): Signal {
  const base = { name: "pressureCheck", label: "Pressure tactics" };
  if (x.urgencyPhrases.length) {
    const quoted = x.urgencyPhrases.slice(0, 3).map((p) => `"${p}"`).join(", ");
    return { ...base, result: "warn", code: "pressure", detail: `Rushing you: ${quoted}. Scammers push so you don't stop to check.` };
  }
  return { ...base, result: "ok", detail: "No rushing or pressure language." };
}

export function walletCheck(x: Extracted): Signal {
  const base = { name: "walletCheck", label: "Crypto wallet" };
  if (x.walletAddresses.length) {
    const short = x.walletAddresses.map((w) => `${w.slice(0, 6)}...${w.slice(-4)}`).join(", ");
    return { ...base, result: "danger", code: "crypto_wallet",
      detail: `Contains a crypto wallet address (${short}). Payments to a wallet are permanent and anonymous.` };
  }
  return { ...base, result: "ok", detail: "No crypto wallet address in the message." };
}

export function accountAgeCheck(x: Extracted): Signal {
  const base = { name: "accountAgeCheck", label: "Seller account age" };
  const d = x.seller.accountAgeDays;
  if (d == null) return { ...base, result: "unknown", detail: "Account age not visible." };
  if (d < 30) return { ...base, result: "warn", code: "new_account", detail: `The seller's account is only ${d} day${d === 1 ? "" : "s"} old.` };
  return { ...base, result: "ok", detail: `Account is about ${d} days old.` };
}

export async function linkCheck(x: Extracted, lookups: Lookups): Promise<Signal> {
  const base = { name: "linkCheck", label: "Website" };
  const hosts = [...new Set(x.links.map(hostOf).filter((h): h is string => Boolean(h)))];
  if (!hosts.length) return { ...base, result: "unknown", detail: "No website link to check." };

  const [unsafe, ...ages] = await Promise.all([
    lookups.unsafeUrls(x.links).catch(() => null),
    ...hosts.map((h) => lookups.domainAgeDays(registrableDomain(h)).catch(() => null)),
  ]);

  if (unsafe && unsafe.length) {
    return { ...base, result: "danger", code: "unsafe_link", detail: `Google Safe Browsing flags ${unsafe[0]} as dangerous.` };
  }
  const known = hosts.map((h, i) => ({ h, age: ages[i] as number | null })).filter((a) => a.age != null);
  const youngest = known.sort((a, b) => (a.age as number) - (b.age as number))[0];
  if (youngest && (youngest.age as number) < 7) {
    return { ...base, result: "danger", code: "very_new_domain", detail: `${youngest.h} was registered only ${youngest.age} days ago.` };
  }
  if (youngest && (youngest.age as number) < 30) {
    return { ...base, result: "warn", code: "new_domain", detail: `${youngest.h} was registered ${youngest.age} days ago. Real shops are usually older.` };
  }
  if (youngest) {
    return { ...base, result: "ok", detail: `${youngest.h} has existed for ${Math.round((youngest.age as number) / 365 * 10) / 10} years${unsafe ? ", not on any blocklist" : ""}.` };
  }
  return { ...base, result: "unknown", detail: `Couldn't look up ${hosts[0]}.` };
}

export function lookalikeCheck(x: Extracted): Signal {
  const base = { name: "lookalikeCheck", label: "Fake brand" };
  for (const link of x.links) {
    const host = hostOf(link);
    const brand = host ? imitatedBrandForDomain(host) : null;
    if (brand) {
      return { ...base, result: "danger", code: "lookalike",
        detail: `${host} pretends to be ${cap(brand)} but isn't ${cap(brand)}'s real website.` };
    }
  }
  const handle = x.seller.handle;
  const hb = handle ? imitatedBrandForHandle(handle) : null;
  if (hb) {
    return { ...base, result: "warn", code: "lookalike_handle", detail: `${handle} looks like an "official ${cap(hb)}" account. Real brands rarely sell through DMs.` };
  }
  if (!x.links.length && !handle) return { ...base, result: "unknown", detail: "No website or handle to compare." };
  return { ...base, result: "ok", detail: "Doesn't imitate a known brand." };
}

export async function reportsCheck(x: Extracted, lookups: Lookups): Promise<Signal> {
  const base = { name: "reportsCheck", label: "Community reports" };
  const ids = sellerIdentifiers(x);
  if (!ids.length) return { ...base, result: "unknown", detail: "No phone or handle to look up." };
  const n = await lookups.reportCount(ids).catch(() => null);
  if (n == null) return { ...base, result: "unknown", detail: "Report network unavailable." };
  if (n >= 3) return { ...base, result: "danger", code: "reported_many", detail: `Reported as a scammer by ${n} people.` };
  if (n >= 1) return { ...base, result: "warn", code: "reported", detail: `Reported by ${n} ${n === 1 ? "person" : "people"} before.` };
  return { ...base, result: "ok", detail: "No one has reported this seller yet." };
}

/** Phone numbers, handle and link domains that identify a seller. */
export function sellerIdentifiers(x: Extracted): string[] {
  const ids = [...x.phones];
  if (x.seller.handle) ids.push(x.seller.handle.startsWith("@") ? x.seller.handle : `@${x.seller.handle}`);
  for (const l of x.links) {
    const h = hostOf(l);
    if (h) ids.push(registrableDomain(h));
  }
  return [...new Set(ids)].slice(0, 10);
}

export async function runSignals(x: Extracted, lookups: Lookups): Promise<Signal[]> {
  const [link, reports] = await Promise.all([linkCheck(x, lookups), reportsCheck(x, lookups)]);
  return [
    priceCheck(x),
    paymentMethodCheck(x),
    walletCheck(x),
    lookalikeCheck(x),
    link,
    reports,
    advancePaymentCheck(x),
    pressureCheck(x),
    accountAgeCheck(x),
  ];
}

function label(p: PaymentMethod): string {
  return {
    paypal: "PayPal", card: "card", cash_on_delivery: "cash on delivery", bank_transfer: "bank transfer",
    jazzcash: "JazzCash", easypaisa: "Easypaisa", crypto: "crypto", gift_card: "gift cards",
    western_union: "Western Union / MoneyGram", friends_family: "friends & family", other: "other",
  }[p];
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
