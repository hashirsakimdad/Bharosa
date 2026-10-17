/**
 * Simple per-IP sliding window limiter. In-memory, so it's per server instance:
 * enough to stop one person burning the free AI quota during the hackathon.
 * For multi-instance production, move this to Upstash Redis or a Supabase table.
 */

const hits = new Map<string, number[]>();

export function rateLimit(
  key: string,
  limit = Number(process.env.RATE_LIMIT_PER_MINUTE || 10),
  windowMs = 60_000,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { allowed: false, retryAfterSec: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
