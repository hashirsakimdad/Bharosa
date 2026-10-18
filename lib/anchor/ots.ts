/**
 * Minimal OpenTimestamps client: stamps a SHA-256 digest on Bitcoin, for free, no wallet.
 *
 * How it works: we send the digest to public "calendar" servers. Each one batches
 * thousands of digests into one Bitcoin transaction (within a few hours) and returns
 * a proof. We save the proofs as a standard .ots file. Anyone can then drop the
 * anchored file + .ots onto https://opentimestamps.org to see which Bitcoin block
 * proves it existed at that time.
 *
 * File format (same as the official clients):
 *   HEADER_MAGIC | version 0x01 | 0x08 (sha256) | 32-byte digest | timestamp
 * With several calendars, the timestamp is a fork: 0xff before every branch except the last.
 */

export const HEADER_MAGIC = Buffer.from([
  0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x73, 0x00, 0x00, 0x50, 0x72,
  0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94,
]);
const MAJOR_VERSION = 0x01;
const OP_SHA256 = 0x08;
const FORK = 0xff;
const MAX_RESPONSE = 10_000;

export const DEFAULT_CALENDARS = [
  "https://a.pool.opentimestamps.org",
  "https://b.pool.opentimestamps.org",
  "https://a.pool.eternitywall.com",
  "https://ots.btc.catallaxy.com",
];

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** Sends a digest to one calendar and returns its proof bytes. */
export async function submitDigest(calendar: string, digest: Buffer, fetcher: Fetcher = fetch): Promise<Buffer> {
  if (digest.length !== 32) throw new Error("digest must be 32 bytes");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetcher(new URL("/digest", calendar).toString(), {
      method: "POST",
      headers: {
        Accept: "application/vnd.opentimestamps.v1",
        "User-Agent": "bharosa",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new Uint8Array(digest),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${calendar} answered HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_RESPONSE) throw new Error(`${calendar} sent an invalid proof`);
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Builds a .ots file from calendar responses.
 * A response that is itself a fork (starts with 0xff) can't be safely merged without
 * parsing it, so it's only used when it's the only response.
 */
export function buildOtsFile(digest: Buffer, responses: Buffer[]): Buffer {
  if (digest.length !== 32) throw new Error("digest must be 32 bytes");
  const linear = responses.filter((r) => r.length > 0 && r[0] !== FORK);
  const branches = linear.length ? linear : responses.slice(0, 1);
  if (!branches.length) throw new Error("no calendar proofs");

  const parts: Buffer[] = [HEADER_MAGIC, Buffer.from([MAJOR_VERSION, OP_SHA256]), digest];
  branches.forEach((b, i) => {
    if (i < branches.length - 1) parts.push(Buffer.from([FORK]));
    parts.push(b);
  });
  return Buffer.concat(parts);
}

/** Reads back the digest a .ots file commits to (used by tests and the proof page). */
export function otsDigest(file: Buffer): Buffer {
  if (!file.subarray(0, HEADER_MAGIC.length).equals(HEADER_MAGIC)) throw new Error("not an OpenTimestamps file");
  const at = HEADER_MAGIC.length;
  if (file[at] !== MAJOR_VERSION || file[at + 1] !== OP_SHA256) throw new Error("unsupported .ots file");
  return file.subarray(at + 2, at + 34);
}

/** Submits to all calendars; succeeds when at least one answers. */
export async function stamp(
  digest: Buffer,
  calendars = DEFAULT_CALENDARS,
  fetcher: Fetcher = fetch,
): Promise<{ ots: Buffer; calendars: string[]; failed: string[] }> {
  const results = await Promise.allSettled(calendars.map((c) => submitDigest(c, digest, fetcher)));
  const ok: Array<{ calendar: string; proof: Buffer }> = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") ok.push({ calendar: calendars[i], proof: r.value });
    else failed.push(calendars[i]);
  });
  if (!ok.length) throw new Error(`No OpenTimestamps calendar answered (${failed.join(", ")})`);
  const usable = ok.filter((o) => o.proof[0] !== FORK);
  const used = usable.length ? usable : ok.slice(0, 1);
  return { ots: buildOtsFile(digest, used.map((o) => o.proof)), calendars: used.map((o) => o.calendar), failed };
}
