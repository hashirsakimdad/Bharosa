import type { CheckResult, Lang, ReasonCode, Signal, Verdict } from "../../types";
import { PHRASES } from "../../check/explain";

/**
 * WhatsApp message text, in the sender's language.
 * Kept short: a verdict, the reason, the top warning signs, the pay link, and what to reply next.
 */

type Strings = {
  title: Record<Verdict, string>;
  signs: string;
  pay: string;
  converted: string;
  why: string;
  report: string;
  welcome: string;
  noLast: string;
  reported: string;
  already: string;
  nothingToReport: string;
  reportFailed: string;
  error: string;
  unsupported: string;
  heard: string;
  working: string;
  slowDown: string;
  evidence: string;
  record: string;
};

export const STRINGS: Record<Lang, Strings> = {
  en: {
    title: { danger: "Don't pay", careful: "Be careful", safe: "Looks safe" },
    signs: "Warning signs:",
    pay: "Pay safely with PayPal",
    converted: "converted from",
    why: "Reply *WHY* to see the evidence",
    report: "Reply *REPORT* to warn others about this seller",
    welcome:
      "Assalam o alaikum! I'm *Bharosa*.\n\nBefore you pay anyone online, forward me the seller's message, a screenshot, a link, or a voice note. I'll tell you in seconds if it's safe.\n\n🟢 safe  🟡 be careful  🔴 don't pay",
    noLast: "Send me a seller's message, screenshot, link or voice note first.",
    reported: "Thanks. Anyone who checks this seller will now see your report.",
    already: "You've already reported this seller.",
    nothingToReport: "There's no phone number, handle or website in that check to report.",
    reportFailed: "Couldn't save the report right now. Please try again in a minute.",
    error: "Something went wrong checking that. Please try again, or send the text instead of a screenshot.",
    unsupported: "I can read text, screenshots and voice notes. Please send one of those.",
    heard: "I heard",
    working: "Checking... I'll reply in a few seconds.",
    slowDown: "You're sending a lot of checks. Please wait a minute and try again.",
    evidence: "Evidence",
    record: "Tamper-proof record",
  },
  roman_ur: {
    title: { danger: "Paise mat bhejein", careful: "Ehtiyat karein", safe: "Theek lag raha hai" },
    signs: "Khatre ki nishaniyan:",
    pay: "PayPal se mehfooz payment karein",
    converted: "is se convert kiya:",
    why: "Saboot dekhne ke liye *WHY* likhein",
    report: "Doosron ko khabardar karne ke liye *REPORT* likhein",
    welcome:
      "Assalam o alaikum! Main *Bharosa* hoon.\n\nKisi ko bhi online paise bhejne se pehle seller ka message, screenshot, link ya voice note mujhe forward karein. Main kuch seconds mein bata doon ga ke safe hai ya nahi.\n\n🟢 safe  🟡 ehtiyat  🔴 paise mat bhejein",
    noLast: "Pehle seller ka message, screenshot, link ya voice note bhejein.",
    reported: "Shukriya. Ab jo bhi is seller ko check karega usay aap ki report nazar aayegi.",
    already: "Aap is seller ko pehle hi report kar chuke hain.",
    nothingToReport: "Is check mein report karne ke liye koi number, handle ya website nahi hai.",
    reportFailed: "Abhi report save nahi ho saki. Ek minute baad dobara koshish karein.",
    error: "Check karte hue masla hua. Dobara bhejein, ya screenshot ki jagah text bhejein.",
    unsupported: "Main text, screenshot aur voice note parh sakta hoon. In mein se kuch bhejein.",
    heard: "Main ne suna",
    working: "Check ho raha hai... kuch seconds mein jawab deta hoon.",
    slowDown: "Aap bohat zyada checks bhej rahe hain. Ek minute ruk kar dobara bhejein.",
    evidence: "Saboot",
    record: "Mehfooz record",
  },
  ur: {
    title: { danger: "پیسے مت بھیجیں", careful: "احتیاط کریں", safe: "بظاہر محفوظ ہے" },
    signs: "خطرے کی نشانیاں:",
    pay: "پے پال سے محفوظ ادائیگی کریں",
    converted: "سے تبدیل شدہ",
    why: "ثبوت دیکھنے کے لیے *WHY* لکھیں",
    report: "دوسروں کو خبردار کرنے کے لیے *REPORT* لکھیں",
    welcome:
      "السلام علیکم! میں *بھروسہ* ہوں۔\n\nکسی کو بھی آن لائن پیسے بھیجنے سے پہلے بیچنے والے کا میسج، اسکرین شاٹ، لنک یا وائس نوٹ مجھے فارورڈ کریں۔ میں چند سیکنڈ میں بتا دوں گا کہ یہ محفوظ ہے یا نہیں۔\n\n🟢 محفوظ  🟡 احتیاط  🔴 پیسے مت بھیجیں",
    noLast: "پہلے بیچنے والے کا میسج، اسکرین شاٹ، لنک یا وائس نوٹ بھیجیں۔",
    reported: "شکریہ۔ اب جو بھی اس بیچنے والے کو چیک کرے گا اسے آپ کی رپورٹ نظر آئے گی۔",
    already: "آپ اس بیچنے والے کو پہلے ہی رپورٹ کر چکے ہیں۔",
    nothingToReport: "اس چیک میں رپورٹ کرنے کے لیے کوئی نمبر، ہینڈل یا ویب سائٹ نہیں ہے۔",
    reportFailed: "ابھی رپورٹ محفوظ نہیں ہو سکی۔ ایک منٹ بعد دوبارہ کوشش کریں۔",
    error: "چیک کرتے ہوئے مسئلہ ہوا۔ دوبارہ بھیجیں، یا اسکرین شاٹ کی جگہ متن بھیجیں۔",
    unsupported: "میں متن، اسکرین شاٹ اور وائس نوٹ پڑھ سکتا ہوں۔ ان میں سے کچھ بھیجیں۔",
    heard: "میں نے سنا",
    working: "چیک ہو رہا ہے... چند سیکنڈ میں جواب دیتا ہوں۔",
    slowDown: "آپ بہت زیادہ چیک بھیج رہے ہیں۔ ایک منٹ رک کر دوبارہ بھیجیں۔",
    evidence: "ثبوت",
    record: "محفوظ ریکارڈ",
  },
  ar: {
    title: { danger: "لا ترسل المال", careful: "كن حذرًا", safe: "يبدو آمنًا" },
    signs: "علامات الخطر:",
    pay: "ادفع بأمان عبر PayPal",
    converted: "محوّل من",
    why: "أرسل *WHY* لرؤية الأدلة",
    report: "أرسل *REPORT* لتحذير الآخرين من هذا البائع",
    welcome:
      "السلام عليكم! أنا *بهروسا*.\n\nقبل أن تدفع لأي شخص عبر الإنترنت، أرسل لي رسالة البائع أو لقطة شاشة أو رابطًا أو رسالة صوتية، وسأخبرك خلال ثوانٍ إن كان آمنًا.\n\n🟢 آمن  🟡 حذر  🔴 لا تدفع",
    noLast: "أرسل أولًا رسالة البائع أو لقطة شاشة أو رابطًا أو رسالة صوتية.",
    reported: "شكرًا. كل من يتحقق من هذا البائع سيرى بلاغك الآن.",
    already: "لقد أبلغت عن هذا البائع من قبل.",
    nothingToReport: "لا يوجد رقم أو حساب أو موقع في هذا الفحص للإبلاغ عنه.",
    reportFailed: "تعذّر حفظ البلاغ الآن. حاول مرة أخرى بعد دقيقة.",
    error: "حدثت مشكلة أثناء الفحص. حاول مرة أخرى أو أرسل النص بدل لقطة الشاشة.",
    unsupported: "أستطيع قراءة النصوص ولقطات الشاشة والرسائل الصوتية. أرسل أحدها.",
    heard: "سمعت",
    working: "جارٍ الفحص... سأرد خلال ثوانٍ.",
    slowDown: "أرسلت فحوصات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.",
    evidence: "الأدلة",
    record: "سجل غير قابل للتلاعب",
  },
};

const DOT: Record<Verdict, string> = { danger: "🔴", careful: "🟡", safe: "🟢" };
const MARK: Record<Signal["result"], string> = { danger: "❌", warn: "⚠️", ok: "✅", unknown: "❔" };

/** Localized warning-sign bullets, most serious first, without repeats. */
function warningBullets(signals: Signal[], lang: Lang, max = 3): string[] {
  const seen = new Set<ReasonCode>();
  const codes: ReasonCode[] = [];
  for (const s of signals) {
    if ((s.result === "danger" || s.result === "warn") && s.code && !seen.has(s.code)) {
      seen.add(s.code);
      codes.push(s.code);
    }
  }
  // the wallet line already says crypto
  const list = codes.includes("crypto_wallet") ? codes.filter((c) => c !== "risky_payment") : codes;
  return list.slice(0, max).map((c) => {
    const p = PHRASES[c][lang];
    return `• ${lang === "en" || lang === "roman_ur" ? p.charAt(0).toUpperCase() + p.slice(1) : p}`;
  });
}

export function formatResult(r: CheckResult, opts: { heard?: string } = {}): string {
  const t = STRINGS[r.language];
  const lines: string[] = [];
  if (opts.heard) lines.push(`🎙️ _${t.heard}: "${opts.heard.slice(0, 200)}${opts.heard.length > 200 ? "..." : ""}"_`, "");
  // The headline already says the verdict; don't repeat it at the start of the reason.
  const title = t.title[r.verdict];
  let reason = r.reason.trim();
  if (reason.toLowerCase().startsWith(title.toLowerCase())) {
    reason = reason.slice(title.length).replace(/^[\s.,!،۔:-]+/, "");
    if (r.language === "en" || r.language === "roman_ur") reason = reason.charAt(0).toUpperCase() + reason.slice(1);
  }
  lines.push(`${DOT[r.verdict]} *${title}*`);
  if (reason) lines.push("", reason);

  // The reason covers the top two; list the signs only when there are more to show.
  const bullets = r.verdict === "safe" ? [] : warningBullets(r.signals, r.language);
  if (bullets.length >= 3) lines.push("", t.signs, ...bullets);

  if (r.pay) {
    const conv = r.pay.convertedFrom
      ? ` (${t.converted} ${r.pay.convertedFrom.currency} ${r.pay.convertedFrom.amount.toLocaleString("en-US")})`
      : "";
    lines.push("", `💳 ${t.pay}: ${r.pay.currency} ${r.pay.amount}${conv}`, r.pay.url);
  }

  lines.push("", `_${t.why}_`);
  if (r.verdict !== "safe") lines.push(`_${t.report}_`);
  return lines.join("\n");
}

/** The "WHY" reply: every signal with its evidence (details are in English). */
export function formatWhy(check: { verdict: string; signals: Signal[]; language: Lang }, record?: { seq: number; entryHash: string } | null): string {
  const t = STRINGS[check.language] ?? STRINGS.en;
  const lines = [`*${t.evidence}*`, ""];
  for (const s of check.signals) {
    if (s.result === "unknown") continue;
    lines.push(`${MARK[s.result]} *${s.label}*${s.estimated ? " _(AI estimate)_" : ""}`, s.detail, "");
  }
  if (record) lines.push(`🔗 _${t.record} #${record.seq} · ${record.entryHash.slice(0, 12)}…_`);
  return lines.join("\n").trim();
}
