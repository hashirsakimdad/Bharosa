import { createHash, createHmac } from "crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Turns a phone number / handle / domain into a salted fingerprint.
 * We store fingerprints, never the raw identifier, so a database leak
 * doesn't expose anyone's number. Same identifier + same salt = same fingerprint,
 * which is all the report network needs to count reports.
 */
export function fingerprint(identifier: string): string {
  const salt = process.env.HASH_SALT || "bharosa-dev-salt-change-me";
  return createHmac("sha256", salt).update(normalizeIdentifier(identifier)).digest("hex");
}

export function normalizeIdentifier(id: string): string {
  const t = id.trim().toLowerCase();
  // phone: keep digits, use last 10 so +92 300... and 0300... match
  const digits = t.replace(/[^\d]/g, "");
  if (digits.length >= 10 && /^[+\d\s()-]+$/.test(t)) return `phone:${digits.slice(-10)}`;
  if (t.startsWith("@")) return `handle:${t.slice(1)}`;
  return `id:${t.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")}`;
}

/** Stable JSON (sorted keys) so the same payload always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}
