/**
 * Minimal Gemini REST client (free tier friendly).
 * No SDK on purpose: fewer moving parts, and model names stay configurable via env.
 */

export interface GeminiImage {
  mimeType: string;
  /** base64, no data: prefix */
  data: string;
}

export class GeminiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function callModel(
  model: string,
  prompt: string,
  images: GeminiImage[],
  json: boolean,
  timeoutMs: number,
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("GEMINI_API_KEY is not set");

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  for (const img of images) {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.1,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GeminiError(`Gemini ${model} HTTP ${res.status}: ${body.slice(0, 300)}`, res.status);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) throw new GeminiError(`Gemini ${model} returned an empty response`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls the main model, and on rate limit / server error retries once on the fallback model.
 */
export async function generate(
  prompt: string,
  opts: { images?: GeminiImage[]; json?: boolean; timeoutMs?: number } = {},
): Promise<string> {
  const main = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const fallback = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash-lite";
  const images = opts.images ?? [];
  const json = opts.json ?? false;
  const timeoutMs = opts.timeoutMs ?? 20000;

  try {
    return await callModel(main, prompt, images, json, timeoutMs);
  } catch (err) {
    const status = err instanceof GeminiError ? err.status : undefined;
    const retryable = status === undefined || status === 429 || status >= 500;
    if (!retryable || fallback === main) throw err;
    return await callModel(fallback, prompt, images, json, timeoutMs);
  }
}

/** Parses JSON from a model reply, tolerating ```json fences. */
export function parseJsonReply(text: string): unknown {
  const cleaned = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(cleaned);
}
