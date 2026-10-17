import { lookup } from "dns/promises";
import { isIP } from "net";

/**
 * Fetches a user-supplied image URL without letting it reach internal services (SSRF).
 * - https only, standard port
 * - every resolved IP must be public
 * - redirects are followed manually and re-checked
 * - response must be an image under the size limit
 */

const MAX_BYTES = 5 * 1024 * 1024;

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateIp(mapped[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

async function assertPublicHttps(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("Only https image links are allowed");
  if (url.port && url.port !== "443") throw new Error("Non-standard ports are not allowed");
  if (url.username || url.password) throw new Error("Links with credentials are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("That link points to a private network address");
  }
  return url;
}

export async function safeFetchImage(raw: string): Promise<{ mimeType: string; data: string }> {
  let current = raw;
  for (let hop = 0; hop < 3; hop++) {
    const url = await assertPublicHttps(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(url, { redirect: "manual", signal: controller.signal });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) throw new Error("Redirect without location");
        current = new URL(next, url).toString();
        continue;
      }
      if (!res.ok) throw new Error(`Image link returned HTTP ${res.status}`);
      const type = (res.headers.get("content-type") || "").split(";")[0].trim();
      if (!/^image\/(png|jpe?g|webp|heic|heif|gif)$/i.test(type)) throw new Error("Link is not an image");
      const declared = Number(res.headers.get("content-length") || 0);
      if (declared > MAX_BYTES) throw new Error("Image is too large (max 5 MB)");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Empty image");
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          controller.abort();
          throw new Error("Image is too large (max 5 MB)");
        }
        chunks.push(value);
      }
      return { mimeType: type.toLowerCase(), data: Buffer.concat(chunks).toString("base64") };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Too many redirects");
}

/** Validates a base64 / data-URL upload from the browser. */
export function parseImageBase64(input: string): { mimeType: string; data: string } {
  const trimmed = input.trim();
  if (/^data:/i.test(trimmed) && !/^data:image\//i.test(trimmed)) throw new Error("Unsupported image type");
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(trimmed);
  const mimeType = m ? m[1].toLowerCase() : "image/jpeg";
  const data = (m ? m[2] : input).replace(/\s/g, "");
  if (!/^image\/(png|jpe?g|webp|heic|heif|gif)$/.test(mimeType)) throw new Error("Unsupported image type");
  if (!/^[A-Za-z0-9+/]+=*$/.test(data)) throw new Error("Image data is not valid base64");
  if ((data.length * 3) / 4 > MAX_BYTES) throw new Error("Image is too large (max 5 MB)");
  return { mimeType, data };
}
