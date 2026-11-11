// Interface language. Texts are written in Russian in the code and wrapped in t(); the English dictionary maps each
// Russian text to its translation, and anything not yet translated falls back to Russian. The choice lives in the
// «bp_locale» cookie (and in the account, for e-mails), so it is known before the first render.
import en from "@/i18n/en.json";

export type Locale = "ru" | "en";
export const LOCALES: Array<{ key: Locale; label: string }> = [{ key: "ru", label: "Русский" }, { key: "en", label: "English" }];
const dictionaries: Record<Locale, Record<string, string>> = { ru: {}, en: en as Record<string, string> };
export const LOCALE_COOKIE = "bp_locale";

export function parseLocale(value: string | null | undefined): Locale | null {
  return value === "en" || value === "ru" ? value : null;
}

/** Russian for Russian and Kazakh speakers, English for everyone else. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  return /(^|,)\s*(ru|kk)\b/i.test(header ?? "") ? "ru" : header ? "en" : "ru";
}

function cookieLocale(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`));
  return parseLocale(match?.[1]);
}

let current: Locale = cookieLocale() ?? (typeof navigator !== "undefined" ? localeFromAcceptLanguage(navigator.languages?.join(",") ?? navigator.language) : "ru");

export const getLocale = (): Locale => current;
export function setCurrentLocale(locale: Locale) { current = locale; }

/** Saves the choice and reloads, so every text — including module-level ones — is shown in the new language. */
export function switchLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}

function fill(text: string, vars?: Record<string, unknown> | unknown[]): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = Array.isArray(vars) ? vars[Number(key)] : vars[key];
    return value === undefined ? whole : String(value);
  });
}

/** Text in the given language; {0} or {name} are filled from vars. */
export function tl(locale: Locale, text: string, vars?: Record<string, unknown> | unknown[]): string {
  return fill(dictionaries[locale][text] ?? text, vars);
}

export function t(text: string, vars?: Record<string, unknown> | unknown[]): string {
  return tl(current, text, vars);
}

/** For toLocaleDateString and friends. */
export const dateLocale = (): string => (current === "en" ? "en-GB" : "ru-RU");
