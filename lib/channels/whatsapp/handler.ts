import { runCheck } from "../../check";
import { detectLanguage } from "../../check/heuristics";
import { isAudio, transcribe } from "../../check/transcribe";
import { getCheck, getLastCheckId, setLastCheck } from "../../db";
import { reportSeller } from "../../report";
import { fingerprint } from "../../security/hash";
import { rateLimit } from "../../security/ratelimit";
import type { CheckInput, Lang, LedgerRecord, Signal, Verdict } from "../../types";
import { fetchTwilioMedia } from "./twilio";
import { formatResult, formatWhy, STRINGS } from "./format";

/**
 * Turns one incoming WhatsApp message into reply messages.
 * Channel-specific only at the edges: the check itself is the same runCheck() the web page uses.
 */

export interface IncomingMessage {
  from: string; // "whatsapp:+923001234567"
  body: string;
  media: Array<{ url: string; contentType: string }>;
}

export interface Deps {
  runCheck: typeof runCheck;
  fetchMedia: typeof fetchTwilioMedia;
  transcribe: typeof transcribe;
  report: typeof reportSeller;
}

const defaultDeps: Deps = { runCheck, fetchMedia: fetchTwilioMedia, transcribe, report: reportSeller };

// Last check per sender. Memory first (fast, works without a DB), Supabase as the durable copy.
interface Session {
  checkId: string;
  verdict: Verdict;
  signals: Signal[];
  language: Lang;
  record: LedgerRecord | null;
}
const sessions = new Map<string, Session>();
function remember(senderFp: string, s: Session) {
  sessions.delete(senderFp);
  sessions.set(senderFp, s);
  if (sessions.size > 2000) sessions.delete(sessions.keys().next().value as string);
}

const WHY = /^(why|kyun|kyon|kyu|kiun|wajah|details?|saboot|کیوں|وجہ|لماذا|ليش|الأدلة)[\s?!.]*$/i;
const REPORT = /^(report|shikayat|scam|fraud|رپورٹ|شکایت|إبلاغ|ابلاغ|بلاغ)[\s?!.]*$/i;
const HELP = /^(hi|hey|hello|helo|salam|salaam|assalam.*|aoa|start|help|menu|bharosa|سلام|السلام.*|مرحبا|مدد)[\s?!.]*$/i;

export function parseCommand(body: string): "why" | "report" | "help" | null {
  const t = body.trim();
  if (!t || t.length > 40) return null;
  if (WHY.test(t)) return "why";
  if (REPORT.test(t)) return "report";
  if (HELP.test(t)) return "help";
  return null;
}

export async function handleIncoming(msg: IncomingMessage, deps: Deps = defaultDeps): Promise<string[]> {
  const phone = msg.from.replace(/^whatsapp:/, "");
  const senderFp = fingerprint(phone);
  const last = sessions.get(senderFp);
  // Reply language: what they just wrote, else the language of their last check
  const textLang = msg.body.trim() ? detectLanguage(msg.body) : null;
  let lang: Lang = textLang && textLang !== "en" ? textLang : last?.language ?? "en";

  if (!rateLimit(`wa:${senderFp}`, 6).allowed) return [STRINGS[lang].slowDown];

  // ---------- commands ----------
  const command = msg.media.length === 0 ? parseCommand(msg.body) : null;
  if (command === "help") return [STRINGS[lang].welcome];

  if (command === "why" || command === "report") {
    const lastId = last?.checkId ?? (await getLastCheckId(senderFp));
    if (!lastId) return [STRINGS[lang].noLast];

    if (command === "why") {
      if (last && last.checkId === lastId) return [formatWhy(last, last.record)];
      const stored = await getCheck(lastId);
      if (!stored) return [STRINGS[lang].noLast];
      return [formatWhy({ verdict: stored.verdict, signals: stored.signals as Signal[], language: stored.language as Lang })];
    }

    if (!rateLimit(`wa-report:${senderFp}`, 5, 3_600_000).allowed) return [STRINGS[lang].slowDown];
    const out = await deps.report(lastId, `wa:${phone}`);
    if (out.ok) return [out.alreadyReported ? STRINGS[lang].already : STRINGS[lang].reported];
    if (out.error === "nothing_to_report") return [STRINGS[lang].nothingToReport];
    if (out.error === "not_found") return [STRINGS[lang].noLast];
    return [STRINGS[lang].reportFailed];
  }

  // ---------- a check ----------
  const input: CheckInput = { text: msg.body.trim() || undefined, channel: "whatsapp" };
  let heard: string | undefined;

  try {
    const media = msg.media[0];
    if (media) {
      const type = media.contentType.split(";")[0].trim().toLowerCase();
      if (type.startsWith("image/")) {
        const file = await deps.fetchMedia(media.url);
        input.imageBase64 = `data:${type};base64,${file.data}`;
        input.inputType = "image";
      } else if (isAudio(type)) {
        const file = await deps.fetchMedia(media.url);
        const t = await deps.transcribe({ mimeType: file.mimeType || type, data: file.data });
        heard = t.text;
        input.text = [input.text, t.text].filter(Boolean).join("\n");
        input.language = t.language;
        input.inputType = "voice";
        lang = t.language;
      } else {
        return [STRINGS[lang].unsupported];
      }
    }
    if (!input.text && !input.imageBase64) return [STRINGS[lang].welcome];

    const result = await deps.runCheck(input);
    remember(senderFp, {
      checkId: result.id,
      verdict: result.verdict,
      signals: result.signals,
      language: result.language,
      record: result.record,
    });
    await setLastCheck(senderFp, result.id).catch(() => undefined);
    return [formatResult(result, { heard })];
  } catch (e) {
    console.error("[whatsapp] check failed:", (e as Error).message);
    return [STRINGS[lang].error];
  }
}

/** For tests */
export function _resetSessions() {
  sessions.clear();
}
