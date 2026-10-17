/**
 * Network lookups used by signals. All free, all fail safe (return null on any problem).
 * Kept behind an interface so tests can inject fake answers.
 */

export interface Lookups {
  /** Days since the domain was registered, or null if unknown */
  domainAgeDays(domain: string): Promise<number | null>;
  /** URLs flagged by Google Safe Browsing (empty if none / not configured / failed) */
  unsafeUrls(urls: string[]): Promise<string[] | null>;
  /** How many people reported any of these seller identifiers (null if DB off) */
  reportCount(identifiers: string[]): Promise<number | null>;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 4000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** RDAP is the free, keyless successor to WHOIS. rdap.org routes to the right registry. */
export async function rdapDomainAgeDays(domain: string): Promise<number | null> {
  try {
    const res = await fetchWithTimeout(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/rdap+json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { events?: Array<{ eventAction?: string; eventDate?: string }> };
    const reg = data.events?.find((e) => e.eventAction === "registration")?.eventDate;
    if (!reg) return null;
    const created = Date.parse(reg);
    if (Number.isNaN(created)) return null;
    return Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
  } catch {
    return null;
  }
}

export async function safeBrowsingUnsafe(urls: string[]): Promise<string[] | null> {
  const key = process.env.SAFE_BROWSING_API_KEY;
  if (!key || urls.length === 0) return null;
  try {
    const res = await fetchWithTimeout(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: { clientId: "bharosa", clientVersion: "0.1.0" },
          threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: urls.map((url) => ({ url: /^https?:/i.test(url) ? url : `http://${url}` })),
          },
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { matches?: Array<{ threat?: { url?: string } }> };
    return (data.matches ?? []).map((m) => m.threat?.url ?? "").filter(Boolean);
  } catch {
    return null;
  }
}
