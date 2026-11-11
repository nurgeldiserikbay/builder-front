"use client";

import { LOCALES, getLocale, switchLocale } from "@/lib/i18n";
import { api } from "@/lib/api";

/** Russian / English. Signed-in people also get e-mails and Telegram messages in the chosen language. */
export default function LanguageSwitch({ style }: { style?: React.CSSProperties }) {
  const current = getLocale();
  return (
    <span role="group" aria-label="Language / Язык" style={{ display: "inline-flex", gap: 4, fontSize: 14, ...style }}>
      {LOCALES.map((locale) => (
        <button key={locale.key} type="button" aria-pressed={current === locale.key} lang={locale.key}
          onClick={() => { if (locale.key === current) return; void api("/me/locale", { method: "PUT", body: JSON.stringify({ locale: locale.key }) }).catch(() => undefined).finally(() => switchLocale(locale.key)); }}
          style={{ border: "1px solid var(--line-strong)", borderRadius: 8, padding: "7px 10px", background: current === locale.key ? "var(--ink)" : "transparent", color: current === locale.key ? "#fff" : "inherit", font: "inherit", fontWeight: 700, cursor: "pointer" }}>
          {locale.key.toUpperCase()}
        </button>
      ))}
    </span>
  );
}
