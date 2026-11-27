"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import styles from "../../../journey.module.css";

// «Предложения функций»: typical capabilities sorted by the owner into the first version, later or not needed. The server
// owns the honesty of «who builds it» (builder-back src/journey/suggestions.ts); here it is only shown.

export type SuggestionDecision = "now" | "later" | "no" | "";
export type SuggestionSupport = "site" | "code" | "account" | "not_yet";
export type Suggestion = {
  key: string; title: string; value: string; basis: string; source: "catalog" | "ai" | "owner"; catalogKey: string | null;
  support: SuggestionSupport; effort: "small" | "medium" | "large"; decision: SuggestionDecision; reason: string;
};
export type Suggestions = { items: Suggestion[]; rate?: number | null };
export type EstimateOptions = { hours: Record<Suggestion["effort"], [number, number]>; hoursPerDay: number; maxRate: number; rateHints: Array<{ label: string; rate: number }> };

// The same rough estimate the server writes into the ТЗ and the concept (builder-back suggestions.ts estimateSuggestion).
const days = (hours: number, perDay: number) => (hours ? Math.max(1, Math.ceil(hours / perDay)) : 0);
const money = (value: number) => `${value.toLocaleString("ru-RU")} ₸`;
const range = ([low, high]: [number, number], show: (value: number) => string | number = (value) => value) => (low === high ? `${show(low)}` : `${show(low)}–${show(high)}`);
function estimate(items: Suggestion[], rate: number | null | undefined, options: EstimateOptions) {
  const hours: [number, number] = [0, 0];
  for (const item of items) if (item.support !== "site") { hours[0] += options.hours[item.effort][0]; hours[1] += options.hours[item.effort][1]; }
  return { hours, days: [days(hours[0], options.hoursPerDay), days(hours[1], options.hoursPerDay)] as [number, number], price: rate ? [hours[0] * rate, hours[1] * rate] as [number, number] : null, fees: items.filter((item) => item.support === "account").length };
}
function estimateText(value: ReturnType<typeof estimate>, platformOnly: boolean): string {
  if (platformOnly) return t("делает платформа, без разработчика");
  const parts = [t("≈ {0} ч", [range(value.hours)]), t("{0} раб. дн.", [range(value.days)])];
  if (value.price) parts.push(range(value.price, money));
  if (value.fees === 1) parts.push(t("плюс плата сервиса по его тарифу"));
  else if (value.fees > 1) parts.push(t("плюс плата сервисов по их тарифам ({0})", [value.fees]));
  return parts.join(" · ");
}

const LIMIT = 20;
const FIRST_VERSION_EXTRAS = 6;

const decisionLabel = (): Record<Exclude<SuggestionDecision, "">, string> => ({ now: t("В первую версию"), later: t("Потом"), no: t("Не нужно") });
const supportLabel = (): Record<SuggestionSupport, string> => ({
  site: t("Делает платформа"), code: t("Войдёт в код приложения"), account: t("Нужен ваш аккаунт в сервисе"), not_yet: t("Платформа пока не делает"),
});
const supportHint = (): Record<SuggestionSupport, string> => ({
  site: t("Платформа сама сделает это на сайте."), code: t("Будет в коде приложения и пройдёт проверки."),
  account: t("Работает через сторонний сервис: подключим только с вашего согласия, у сервиса могут быть свои тарифы."),
  not_yet: t("Платформа пока этого не делает: в ТЗ пойдёт задачей для разработчика."),
});
const effortLabel = (): Record<Suggestion["effort"], string> => ({ small: t("Немного работы"), medium: t("Заметная работа"), large: t("Большая работа") });
const supportColor: Record<SuggestionSupport, string> = { site: "#1f6f43", code: "#1f4f8f", account: "#8a5a00", not_yet: "#6b6f6b" };

function nextKey(items: Suggestion[]): string {
  let number = items.length + 1;
  while (items.some((item) => item.key === `own${number}`)) number += 1;
  return `own${number}`;
}

type Filter = "all" | "open" | "now" | "later" | "no";

export function SuggestionsEditor({ value, onChange, disabled, issues, estimates }: { value: Suggestions; onChange: (next: Suggestions) => void; disabled: boolean; issues: string[]; estimates?: EstimateOptions }) {
  const items = value.items ?? [];
  const rate = value.rate ?? null;
  const [rateText, setRateText] = useState(rate ? String(rate) : "");
  const setItems = (next: Suggestion[]) => onChange({ ...value, items: next });
  const [filter, setFilter] = useState<Filter>("all");
  const set = (index: number, patch: Partial<Suggestion>) => setItems(items.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  const count = (decision: SuggestionDecision) => items.filter((item) => item.decision === decision).length;
  const now = count("now");
  const shown = items.map((item, index) => ({ item, index })).filter(({ item }) => filter === "all" || (filter === "open" ? !item.decision : item.decision === filter));
  const tabs: Array<[Filter, string, number]> = [
    ["all", t("Все"), items.length], ["open", t("Не решено"), count("")], ["now", t("В первую версию"), now], ["later", t("Потом"), count("later")], ["no", t("Не нужно"), count("no")],
  ];

  return (
    <div>
      <section className={styles.card} aria-label={t("Решения")}>
        <div className={styles.chips} role="tablist" aria-label={t("Показать")} style={{ flexWrap: "wrap", gap: 6 }}>
          {tabs.map(([key, label, number]) => (
            <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? styles.button : styles.ghost}
              style={{ minHeight: 40, padding: "4px 12px" }} onClick={() => setFilter(key)}>{label} · {number}</button>
          ))}
        </div>
        {now > FIRST_VERSION_EXTRAS && (
          <p className={`${styles.notice} ${styles.warn}`} style={{ marginTop: 10 }}>{t("В первой версии уже {0} дополнительных возможностей. Она станет дольше и дороже — подумайте, что можно «потом».", [now])}</p>
        )}
        {issues.length > 0 && <ul className={styles.list} style={{ marginTop: 10 }}>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
      </section>

      {estimates && (
        <section className={styles.card} aria-labelledby="estimate-title">
          <p id="estimate-title" className={styles.cardTitle}>{t("Срок и цена")}</p>
          {now > 0
            ? <p style={{ margin: "0 0 6px", fontSize: 17 }}><b>{t("Дополнительное в первой версии: {0}", [estimateText(estimate(items.filter((item) => item.decision === "now"), rate, estimates), false)])}</b></p>
            : <p className={styles.small}>{t("Отметьте, что пойдёт в первую версию, — здесь появится, сколько это добавит.")}</p>}
          <p className={styles.small} style={{ margin: "0 0 10px" }}>{t("Это оценка по типу работы, а не смета: «немного» — {0} ч, «заметная» — {1} ч, «большая» — {2} ч работы разработчика с ИИ; день — {3} ч, один разработчик. Точнее скажет архитектура и разработчик.", [range(estimates.hours.small), range(estimates.hours.medium), range(estimates.hours.large), estimates.hoursPerDay])}</p>
          <label className={styles.field}><span className={styles.label}>{t("Ставка разработчика, ₸ в час (необязательно)")}</span>
            <span className={styles.why}>{t("С ней рядом с часами появится цена. Ставка видна всем, кто видит этот этап, и попадает в ТЗ и концепцию.")}</span>
            <input className={styles.input} inputMode="numeric" value={rateText} disabled={disabled} placeholder={t("Например: 5000")}
              onChange={(event) => {
                const clean = event.target.value.replace(/\D/g, "").slice(0, 7);
                setRateText(clean);
                const number = clean ? Math.min(Number(clean), estimates.maxRate) : null;
                onChange({ ...value, rate: number || null });
              }} /></label>
          {!disabled && estimates.rateHints.length > 0 && (
            <div className={styles.row} style={{ gap: 6, flexWrap: "wrap" }}>
              {estimates.rateHints.map((hint) => (
                <button key={hint.label} type="button" className={styles.ghost} onClick={() => { setRateText(String(hint.rate)); onChange({ ...value, rate: hint.rate }); }}>{t("Ставка {0}: {1}", [hint.label, money(hint.rate)])}</button>
              ))}
            </div>
          )}
        </section>
      )}

      {items.length === 0 && <p className={styles.small}>{t("Предложений пока нет. Добавьте своё или попросите ИИ подобрать.")}</p>}
      {items.length > 0 && shown.length === 0 && <p className={styles.small}>{t("Здесь пока пусто.")}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 12 }}>
        {shown.map(({ item, index }) => (
          <article key={item.key} className={styles.card} style={{ margin: 0, borderLeft: `4px solid ${item.decision === "now" ? "#1f6f43" : item.decision === "later" ? "#1f4f8f" : item.decision === "no" ? "#b9bdb9" : "#d08a00"}` }}
            aria-label={item.title || t("Новое предложение")}>
            {item.source === "owner" && item.catalogKey === null ? (
              <>
                <label className={styles.field}><span className={styles.label}>{t("Что добавить")}</span>
                  <input className={styles.input} value={item.title} maxLength={80} disabled={disabled} placeholder={t("Например: бонусы за повторный визит")} onChange={(event) => set(index, { title: event.target.value })} /></label>
                <label className={styles.field}><span className={styles.label}>{t("Что это даст")}</span>
                  <input className={styles.input} value={item.value} maxLength={300} disabled={disabled} onChange={(event) => set(index, { value: event.target.value })} /></label>
              </>
            ) : (
              <>
                <p className={styles.cardTitle} style={{ marginBottom: 4 }}>{item.title}{item.source === "ai" && <span className={styles.small}> · {t("предложил ИИ")}</span>}</p>
                {item.value && <p style={{ margin: "0 0 6px" }}>{item.value}</p>}
              </>
            )}
            {item.basis && <p className={styles.small} style={{ margin: "0 0 8px" }}>{t("Откуда: {0}", [item.basis])}</p>}
            <p className={styles.small} style={{ margin: "0 0 10px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              <span title={supportHint()[item.support]} style={{ color: supportColor[item.support], fontWeight: 600 }}>● {supportLabel()[item.support]}</span>
              {item.source === "catalog" || disabled
                ? <span>· {effortLabel()[item.effort]}</span>
                : <select aria-label={t("Сколько работы: «{0}»", [item.title || t("своё")])} value={item.effort} onChange={(event) => set(index, { effort: event.target.value as Suggestion["effort"] })}
                    style={{ font: "inherit", border: "1px solid var(--line, #d6dad7)", borderRadius: 8, padding: "2px 6px", background: "#fff" }}>
                    {(Object.keys(effortLabel()) as Array<Suggestion["effort"]>).map((effort) => <option key={effort} value={effort}>{effortLabel()[effort]}</option>)}
                  </select>}
            </p>
            {estimates && item.decision !== "no" && (
              <p className={styles.small} style={{ margin: "-4px 0 10px" }}>{t("Оценка: {0}", [estimateText(estimate([item], rate, estimates), item.support === "site")])}</p>
            )}
            {(item.support === "account" || item.support === "not_yet") && item.decision === "now" && <p className={styles.small} style={{ margin: "0 0 10px" }}>{supportHint()[item.support]}</p>}
            <div role="group" aria-label={t("Решение по «{0}»", [item.title])} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {(Object.keys(decisionLabel()) as Array<Exclude<SuggestionDecision, "">>).map((decision) => (
                <button key={decision} type="button" disabled={disabled} aria-pressed={item.decision === decision}
                  className={item.decision === decision ? styles.button : styles.secondary} style={{ minHeight: 44, padding: "6px 4px", fontSize: 15 }}
                  onClick={() => set(index, { decision: item.decision === decision ? "" : decision, reason: decision === "now" ? "" : item.reason })}>{decisionLabel()[decision]}</button>
              ))}
            </div>
            {item.decision === "no" && (
              <label className={styles.field} style={{ marginTop: 8 }}><span className={styles.label}>{t("Почему не нужно")}</span>
                <input className={styles.input} value={item.reason} maxLength={300} disabled={disabled} placeholder={t("Например: клиенты платят на месте")} onChange={(event) => set(index, { reason: event.target.value })} /></label>
            )}
            {!disabled && item.source !== "catalog" && (
              <button type="button" className={styles.ghost} style={{ marginTop: 6 }} onClick={() => setItems(items.filter((_, position) => position !== index))}>{t("Убрать")}</button>
            )}
          </article>
        ))}
      </div>

      {!disabled && items.length < LIMIT && (
        <button type="button" className={`${styles.secondary} ${styles.block}`} style={{ marginTop: 12 }}
          onClick={() => { setFilter("all"); setItems([...items, { key: nextKey(items), title: "", value: "", basis: "", source: "owner", catalogKey: null, support: "not_yet", effort: "medium", decision: "", reason: "" }]); }}>
          {t("+ Добавить своё")}
        </button>
      )}
    </div>
  );
}
