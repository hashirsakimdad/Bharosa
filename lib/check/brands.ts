/** Brands scammers commonly imitate, with their real domains. */
export const BRANDS: Array<{ name: string; domains: string[] }> = [
  { name: "paypal", domains: ["paypal.com", "paypal.me"] },
  { name: "apple", domains: ["apple.com", "icloud.com"] },
  { name: "amazon", domains: ["amazon.com", "amazon.ae", "amazon.sa", "amazon.in", "amazon.co.uk"] },
  { name: "daraz", domains: ["daraz.pk", "daraz.com"] },
  { name: "olx", domains: ["olx.com.pk", "olx.com"] },
  { name: "samsung", domains: ["samsung.com"] },
  { name: "jazzcash", domains: ["jazzcash.com.pk"] },
  { name: "easypaisa", domains: ["easypaisa.com.pk"] },
  { name: "netflix", domains: ["netflix.com"] },
  { name: "facebook", domains: ["facebook.com", "fb.com"] },
  { name: "instagram", domains: ["instagram.com"] },
  { name: "whatsapp", domains: ["whatsapp.com", "wa.me"] },
  { name: "microsoft", domains: ["microsoft.com", "live.com", "outlook.com"] },
  { name: "google", domains: ["google.com", "google.com.pk"] },
  { name: "nike", domains: ["nike.com"] },
  { name: "binance", domains: ["binance.com"] },
  { name: "meezan", domains: ["meezanbank.com"] },
  { name: "hbl", domains: ["hbl.com"] },
  { name: "noon", domains: ["noon.com"] },
];

const MULTI_PART_TLDS = new Set(["com.pk", "gov.pk", "edu.pk", "org.pk", "net.pk", "co.uk", "com.sa", "co.in", "com.au"]);

export function hostOf(link: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** "shop.apple-store.com.pk" -> "apple-store.com.pk" */
export function registrableDomain(host: string): string {
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  return MULTI_PART_TLDS.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

/** Undo common look-alike tricks: paypa1 -> paypal, rn -> m, 0 -> o. */
export function deconfuse(s: string): string {
  return s
    .toLowerCase()
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/0/g, "o")
    .replace(/[1|!]/g, "l")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t");
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

/**
 * Returns the imitated brand if the domain pretends to be one, else null.
 * Official domains (and their subdomains) are never flagged.
 */
export function imitatedBrandForDomain(host: string): string | null {
  const reg = registrableDomain(host);
  for (const brand of BRANDS) {
    if (brand.domains.some((d) => reg === d || host.endsWith(`.${d}`))) return null;
  }
  const label = reg.split(".")[0];
  const clean = deconfuse(label);
  const tokens = clean.split(/[^a-z]+/).filter(Boolean);
  for (const brand of BRANDS) {
    // short names (hbl, olx, noon) must be a whole token, so "afternoon.com" is fine
    const hit = brand.name.length >= 5 ? clean.includes(brand.name) : tokens.includes(brand.name);
    if (hit) return brand.name; // apple-store-pk.shop
    if (brand.name.length >= 5 && levenshtein(clean, brand.name) <= 1) return brand.name; // paypai.com
  }
  return null;
}

/** Handles like @apple_official_pk: weaker signal, resellers use brand names too. */
export function imitatedBrandForHandle(handle: string): string | null {
  const clean = deconfuse(handle.replace(/^@/, ""));
  if (!/official|support|store|helpdesk|care|verified|team/.test(clean)) return null;
  return BRANDS.find((b) => clean.includes(b.name))?.name ?? null;
}
