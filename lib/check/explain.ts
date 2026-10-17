import type { Lang, ReasonCode, Signal, Verdict } from "../types";
import { generate, geminiConfigured } from "../llm/gemini";
import { rankSignals } from "./verdict";

/**
 * One short sentence, in the user's language, explaining the verdict.
 * The AI writes it when available; built-in templates are the fallback,
 * so a reason is always returned.
 */

const LANG_NAME: Record<Lang, string> = {
  en: "simple English",
  ur: "Urdu (in Urdu script)",
  roman_ur: "Roman Urdu (Urdu written in English letters, like WhatsApp chats in Pakistan)",
  ar: "simple Arabic",
};

const PREFIX: Record<Lang, Record<Verdict, string>> = {
  en: { danger: "Don't pay.", careful: "Be careful.", safe: "Looks safe." },
  ur: { danger: "پیسے مت بھیجیں۔", careful: "احتیاط کریں۔", safe: "بظاہر محفوظ ہے۔" },
  roman_ur: { danger: "Paise mat bhejein.", careful: "Ehtiyat karein.", safe: "Theek lag raha hai." },
  ar: { danger: "لا ترسل المال.", careful: "كن حذرًا.", safe: "يبدو آمنًا." },
};

const PHRASES: Record<ReasonCode, Record<Lang, string>> = {
  price_far_below: { en: "the price is far below the normal price", ur: "قیمت بازار سے بہت کم ہے", roman_ur: "price market se bohat kam hai", ar: "السعر أقل بكثير من سعر السوق" },
  price_below: { en: "the price is much lower than usual", ur: "قیمت عام سے کافی کم ہے", roman_ur: "price aam se kaafi kam hai", ar: "السعر أقل من المعتاد بكثير" },
  risky_payment: { en: "they want crypto or gift cards, which can't be refunded", ur: "یہ کرپٹو یا گفٹ کارڈ میں پیسے مانگ رہا ہے جو واپس نہیں ہو سکتے", roman_ur: "ye crypto ya gift card mein paise maang raha hai jo wapis nahi hote", ar: "يطلب الدفع بالعملات الرقمية أو بطاقات الهدايا ولا يمكن استردادها" },
  no_protection: { en: "they refuse any payment that protects you", ur: "یہ ایسی ادائیگی سے انکار کر رہا ہے جس میں آپ محفوظ رہیں", roman_ur: "ye protected payment se inkaar kar raha hai", ar: "يرفض أي طريقة دفع تحميك" },
  direct_transfer_only: { en: "they only take direct bank or wallet transfers", ur: "یہ صرف براہِ راست بینک یا موبائل والٹ ٹرانسفر لیتا ہے", roman_ur: "ye sirf direct bank ya JazzCash/Easypaisa transfer leta hai", ar: "يقبل التحويل المباشر فقط" },
  friends_family: { en: "they ask for a friends & family payment that skips protection", ur: "یہ فرینڈز اینڈ فیملی ادائیگی مانگ رہا ہے جس میں تحفظ نہیں", roman_ur: "ye friends & family payment maang raha hai jismein protection nahi", ar: "يطلب دفعة أصدقاء وعائلة بدون حماية" },
  advance_payment: { en: "they want money upfront", ur: "یہ پہلے ایڈوانس پیسے مانگ رہا ہے", roman_ur: "ye pehle advance maang raha hai", ar: "يطلب دفعة مقدمة" },
  new_domain: { en: "the website is very new", ur: "ویب سائٹ بالکل نئی ہے", roman_ur: "website bilkul nayi hai", ar: "الموقع جديد جدًا" },
  very_new_domain: { en: "the website was made just days ago", ur: "ویب سائٹ چند دن پہلے بنی ہے", roman_ur: "website kuch din pehle bani hai", ar: "تم إنشاء الموقع قبل أيام فقط" },
  unsafe_link: { en: "the link is flagged as dangerous", ur: "یہ لنک خطرناک قرار دیا گیا ہے", roman_ur: "ye link khatarnak hai", ar: "الرابط مُصنّف كخطير" },
  lookalike: { en: "the website copies a famous brand", ur: "یہ ویب سائٹ کسی مشہور برانڈ کی نقل ہے", roman_ur: "ye website kisi mashhoor brand ki naqal hai", ar: "الموقع يقلد علامة تجارية معروفة" },
  lookalike_handle: { en: "the account pretends to be an official brand page", ur: "یہ اکاؤنٹ کسی برانڈ کا آفیشل پیج ہونے کا دعویٰ کرتا ہے", roman_ur: "ye account official brand page banne ki koshish kar raha hai", ar: "الحساب يدّعي أنه صفحة رسمية لعلامة تجارية" },
  new_account: { en: "the seller's account is only days old", ur: "بیچنے والے کا اکاؤنٹ چند دن پرانا ہے", roman_ur: "seller ka account sirf kuch din purana hai", ar: "حساب البائع عمره أيام فقط" },
  pressure: { en: "they're rushing you", ur: "یہ آپ پر جلدی کا دباؤ ڈال رہا ہے", roman_ur: "ye aap ko jaldi karne ka pressure de raha hai", ar: "يضغط عليك للاستعجال" },
  crypto_wallet: { en: "they want payment to a crypto wallet, which can never be refunded", ur: "انہوں نے کرپٹو والٹ ایڈریس دیا ہے، وہاں بھیجے پیسے واپس نہیں آتے", roman_ur: "inhon ne crypto wallet address diya hai, wahan bheje paise wapis nahi aate", ar: "أعطاك عنوان محفظة رقمية والدفع إليها لا يُسترد" },
  reported: { en: "someone has reported this seller before", ur: "اس بیچنے والے کی پہلے شکایت ہو چکی ہے", roman_ur: "is seller ki pehle complaint ho chuki hai", ar: "تم الإبلاغ عن هذا البائع من قبل" },
  reported_many: { en: "several people have reported this seller as a scammer", ur: "کئی لوگ اس بیچنے والے کو فراڈ رپورٹ کر چکے ہیں", roman_ur: "kai log is seller ko fraud report kar chuke hain", ar: "أبلغ عدة أشخاص عن هذا البائع كمحتال" },
  not_enough_info: { en: "there isn't enough information to judge, so send the seller's link, number or a screenshot", ur: "فیصلے کے لیے معلومات کم ہیں، بیچنے والے کا لنک، نمبر یا اسکرین شاٹ بھیجیں", roman_ur: "faisle ke liye info kam hai, seller ka link, number ya screenshot bhejein", ar: "المعلومات غير كافية، أرسل رابط البائع أو رقمه أو لقطة شاشة" },
  all_clear: { en: "we found no warning signs, and paying through PayPal keeps you protected", ur: "کوئی خطرے کی علامت نہیں ملی، پے پال سے ادائیگی آپ کو محفوظ رکھتی ہے", roman_ur: "koi khatre ki nishani nahi mili, PayPal se payment aap ko protected rakhti hai", ar: "لم نجد علامات خطر، والدفع عبر PayPal يحميك" },
};

const AND: Record<Lang, string> = { en: " and ", ur: " اور ", roman_ur: " aur ", ar: " و" };
const BUT_NOTE: Record<Lang, string> = { en: "One thing to note: ", ur: "البتہ ", roman_ur: "Bas ye dhyan rakhein: ", ar: "لكن انتبه: " };

export function templateReason(verdict: Verdict, signals: Signal[], lang: Lang, enoughInfo: boolean): string {
  const prefix = PREFIX[lang][verdict];
  if (!enoughInfo) return `${prefix} ${cap(PHRASES.not_enough_info[lang], lang)}.`;

  let flagged = rankSignals(signals).filter((s) => (s.result === "danger" || s.result === "warn") && s.code);
  // a wallet address already says "crypto"; don't repeat it
  if (flagged.some((s) => s.code === "crypto_wallet")) flagged = flagged.filter((s) => s.code !== "risky_payment");
  if (verdict === "safe") {
    if (flagged.length) return `${prefix} ${BUT_NOTE[lang]}${PHRASES[flagged[0].code!][lang]}.`;
    return `${prefix} ${cap(PHRASES.all_clear[lang], lang)}.`;
  }
  const top = flagged.slice(0, 2).map((s) => PHRASES[s.code!][lang]);
  return `${prefix} ${cap(top.join(AND[lang]), lang)}.`;
}

export async function explain(
  verdict: Verdict,
  signals: Signal[],
  lang: Lang,
  enoughInfo: boolean,
): Promise<{ reason: string; usedAi: boolean }> {
  const fallback = templateReason(verdict, signals, lang, enoughInfo);
  if (!geminiConfigured() || process.env.EXPLAIN_WITH_LLM === "false" || !enoughInfo) {
    return { reason: fallback, usedAi: false };
  }

  const evidence = rankSignals(signals)
    .filter((s) => s.result !== "unknown")
    .slice(0, 4)
    .map((s) => `- [${s.result}] ${s.label}: ${s.detail}`)
    .join("\n");

  const prompt = `You explain a scam-check result to an ordinary person who is about to pay someone online.

The verdict is already decided by fixed rules. Do NOT change it or soften it.
Verdict: ${verdict === "danger" ? "DANGER, don't pay" : verdict === "careful" ? "CAREFUL, risky" : "SAFE"}

Evidence:
${evidence}

Write exactly ONE short sentence (max 25 words) in ${LANG_NAME[lang]}.
- Start with the verdict in plain words (like "Don't pay" / "Be careful" / "Looks safe").
- Then give the one or two most important reasons using the real numbers above.
- No jargon, no emojis, no quotes, no markdown. Speak like a friend warning a friend.
Return only the sentence.`;

  try {
    const text = (await generate(prompt, { timeoutMs: 8000 })).trim().replace(/^["']|["']$/g, "");
    if (text.length < 8 || text.length > 300) return { reason: fallback, usedAi: false };
    return { reason: text, usedAi: true };
  } catch {
    return { reason: fallback, usedAi: false };
  }
}

function cap(s: string, lang: Lang): string {
  return lang === "en" || lang === "roman_ur" ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
