"use client";

// «Вы это учли?»: situations a business of this kind usually has to decide on. The owner knows the business, not the
// usual practice, so every question shows the answer most businesses choose. The answer becomes a rule of the process;
// the platform writes it into the rules itself.
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import styles from "../../../journey.module.css";

export type SituationOption = { value: string; label: string; rule: string; typical?: boolean };
export type Situation = { key: string; level: "blocking" | "important" | "minor"; question: string; why: string; options: SituationOption[] };
export type SituationAnswer = { key: string; answer: string; custom?: string; rule?: string };

const levelText = () => ({ blocking: t("Без ответа дальше нельзя"), important: t("Клиенты спросят"), minor: t("Полезно решить") });
const levelTone = { blocking: "attention", important: "active", minor: "closed" } as const;
const levelRank = { blocking: 0, important: 1, minor: 2 } as const;

/** Rules that came from answers: the owner edits them by changing the answer, not in the list of own rules. */
export function answerRules(answers: SituationAnswer[] | undefined): Set<string> {
  return new Set((answers ?? []).flatMap((item) => [item.rule, item.answer === "custom" ? item.custom : undefined]).filter((rule): rule is string => Boolean(rule)));
}

/** What the answer will add to the rules, as the owner sees it before saving. */
export function ruleOfAnswer(situation: Situation, answer: SituationAnswer): string | null {
  if (answer.answer === "custom") return answer.custom?.trim() || null;
  return situation.options.find((option) => option.value === answer.answer)?.rule ?? null;
}

export function SituationsCard({ items, answers, onChange, disabled }: {
  items: Situation[]; answers: SituationAnswer[]; onChange: (next: SituationAnswer[]) => void; disabled: boolean;
}) {
  const byKey = new Map(answers.map((item) => [item.key, item]));
  const decided = (key: string) => { const answer = byKey.get(key)?.answer; return Boolean(answer && answer !== "later"); };
  // Open questions first, the most important of them on top; answered ones go down.
  const order = [...items].sort((a, b) => Number(decided(a.key)) - Number(decided(b.key)) || levelRank[a.level] - levelRank[b.level]);
  const [open, setOpen] = useState<string[]>(() => order.filter((item) => !decided(item.key)).slice(0, 1).map((item) => item.key));
  // «Answer» in the quality review opens the question.
  useEffect(() => {
    const show = (event: Event) => {
      const target = (event as CustomEvent<string>).detail;
      if (target.startsWith("situation:")) setOpen((list) => [...new Set([...list, target.slice("situation:".length)])]);
    };
    window.addEventListener("buildpath:review-target", show);
    return () => window.removeEventListener("buildpath:review-target", show);
  }, []);
  if (!items.length) return null;

  const level = levelText();
  const answered = items.filter((item) => decided(item.key)).length;
  const blockingLeft = items.filter((item) => item.level === "blocking" && !decided(item.key)).length;

  const answer = (key: string, patch: Omit<SituationAnswer, "key" | "rule">) => {
    const previous = byKey.get(key);
    // The previous rule goes along so the server knows which rule to replace.
    const next: SituationAnswer = { key, ...patch, ...(previous?.rule ? { rule: previous.rule } : {}) };
    onChange([...answers.filter((item) => item.key !== key), next]);
  };
  const choose = (situation: Situation, value: string) => {
    answer(situation.key, { answer: value });
    // Go on to the next open question, so answering feels like a short conversation.
    const nextOpen = order.find((item) => item.key !== situation.key && !decided(item.key));
    setOpen(nextOpen ? [nextOpen.key] : []);
  };
  const typicalForRest = () => {
    const rest = items.filter((item) => !decided(item.key));
    const added = rest.flatMap((item) => { const typical = item.options.find((option) => option.typical); return typical ? [{ key: item.key, answer: typical.value, ...(byKey.get(item.key)?.rule ? { rule: byKey.get(item.key)!.rule } : {}) }] : []; });
    onChange([...answers.filter((item) => !added.some((next) => next.key === item.key)), ...added]);
    setOpen([]);
  };
  const toggle = (key: string) => setOpen((list) => (list.includes(key) ? list.filter((item) => item !== key) : [...list, key]));

  return (
    <section className={styles.card} aria-labelledby="situations-title">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <p id="situations-title" className={styles.cardTitle} style={{ margin: 0 }}>{t("Вы это учли?")}</p>
        <span className={`${styles.chip} ${styles[answered === items.length ? "done" : "active"]}`} style={{ marginTop: 0 }}>{t("Ответов: {0} из {1}", [answered, items.length])}</span>
      </div>
      <p className={styles.small}>{t("Ситуации, которые бывают у такого бизнеса. Выберите, как вы поступаете: ответ станет правилом процесса, по нему ИИ напишет тексты сайта. Не знаете — берите вариант «Обычно так делают».")}</p>
      {blockingLeft > 0 && <p className={`${styles.notice} ${styles.warn}`} role="status">{t("Без ответа на важные вопросы ({0}) этап не принять.", [blockingLeft])}</p>}

      <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 8 }}>
        {order.map((situation) => {
          const current = byKey.get(situation.key);
          const isOpen = open.includes(situation.key);
          const chosen = current && current.answer !== "later" ? (current.answer === "custom" ? current.custom : situation.options.find((option) => option.value === current.answer)?.label) : null;
          return (
            <li key={situation.key} id={`review-target-situation:${situation.key}`} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px" }}>
              <button type="button" onClick={() => toggle(situation.key)} aria-expanded={isOpen}
                style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {!decided(situation.key) && <span className={`${styles.chip} ${styles[levelTone[situation.level]]}`} style={{ marginTop: 0, fontSize: 13 }}>{current?.answer === "later" ? t("Отложено") : level[situation.level]}</span>}
                  {decided(situation.key) && <span className={`${styles.chip} ${styles.done}`} style={{ marginTop: 0, fontSize: 13 }}>{t("Решено")}</span>}
                </span>
                <strong style={{ display: "block", marginTop: 6 }}>{situation.question}</strong>
                {chosen && !isOpen && <span className={styles.small} style={{ display: "block", margin: "4px 0 0" }}>{t("Ваш ответ:")} {chosen}</span>}
              </button>
              {isOpen && (
                <div style={{ marginTop: 8 }}>
                  <p className={styles.small} style={{ marginTop: 0 }}>{situation.why}</p>
                  <div className={styles.choices} role="radiogroup" aria-label={situation.question}>
                    {situation.options.map((option) => (
                      <button key={option.value} type="button" role="radio" aria-checked={current?.answer === option.value} className={styles.choice} aria-pressed={current?.answer === option.value} disabled={disabled}
                        onClick={() => choose(situation, option.value)}>
                        <strong>{option.label}</strong>
                        {option.typical && <span className={`${styles.chip} ${styles.done}`} style={{ marginTop: 4, fontSize: 13 }}>{t("Обычно так делают")}</span>}
                        <span className={styles.small} style={{ display: "block", marginTop: 4 }}>{t("Правило:")} {option.rule}</span>
                      </button>
                    ))}
                    <button type="button" role="radio" aria-checked={current?.answer === "custom"} className={styles.choice} aria-pressed={current?.answer === "custom"} disabled={disabled}
                      onClick={() => answer(situation.key, { answer: "custom", custom: current?.custom ?? "" })}>
                      <strong>{t("У меня по-другому")}</strong>
                      <span className={styles.small}>{t("Напишите своё правило одной фразой.")}</span>
                    </button>
                  </div>
                  {current?.answer === "custom" && (
                    <input className={styles.input} style={{ marginTop: 8 }} autoFocus maxLength={200} disabled={disabled} value={current.custom ?? ""} aria-label={t("Ваше правило")}
                      placeholder={t("Например: опоздавшего ждём 10 минут")} onChange={(event) => answer(situation.key, { answer: "custom", custom: event.target.value })} />
                  )}
                  {situation.level !== "blocking" && current?.answer !== "later" && !disabled && (
                    <button type="button" className={styles.ghost} style={{ marginTop: 6, minHeight: 36 }} onClick={() => choose(situation, "later")}>{t("Пока не знаю — решу позже")}</button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!disabled && answered < items.length && (
        <div style={{ marginTop: 12 }}>
          <button type="button" className={styles.secondary} onClick={typicalForRest}>{t("Ответить на остальные как обычно")}</button>
          <p className={styles.small} style={{ margin: "4px 0 0" }}>{t("Поставим ответы «Обычно так делают». Проверьте их перед сохранением — любой можно поменять.")}</p>
        </div>
      )}
    </section>
  );
}
