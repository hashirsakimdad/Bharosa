import type { Lang, Verdict } from "../types";

/**
 * Verdict words in each language. Shared by the explanation (server) and the
 * result card (browser), so this file must stay free of server-only imports.
 */
export const VERDICT_TITLE: Record<Lang, Record<Verdict, string>> = {
  en: { danger: "Don't pay", careful: "Be careful", safe: "Looks safe" },
  ur: { danger: "پیسے مت بھیجیں", careful: "احتیاط کریں", safe: "بظاہر محفوظ ہے" },
  roman_ur: { danger: "Paise mat bhejein", careful: "Ehtiyat karein", safe: "Theek lag raha hai" },
  ar: { danger: "لا ترسل المال", careful: "كن حذرًا", safe: "يبدو آمنًا" },
};

/**
 * The headline already says the verdict, so drop it from the start of the reason.
 * "Don't pay. They want crypto..." -> "They want crypto..."
 */
export function reasonWithoutVerdict(reason: string, verdict: Verdict, lang: Lang): string {
  const trimmed = reason.trim();
  for (const title of new Set([VERDICT_TITLE[lang][verdict], VERDICT_TITLE.en[verdict]])) {
    if (trimmed.toLowerCase().startsWith(title.toLowerCase())) {
      let rest = trimmed.slice(title.length).replace(/^[\s.,!،۔:-]+/, "");
      if (lang === "en" || lang === "roman_ur") rest = rest.charAt(0).toUpperCase() + rest.slice(1);
      return rest || trimmed;
    }
  }
  return trimmed;
}
