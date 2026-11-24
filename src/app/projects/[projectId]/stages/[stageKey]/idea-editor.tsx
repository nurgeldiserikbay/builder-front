"use client";

import { t } from "@/lib/i18n";
import styles from "../../../journey.module.css";

// «Разбор идеи»: the idea on one screen (a canvas like Lean Canvas) and the fields below it. The server normalizes and
// checks the same shape (builder-back src/journey/idea.ts); the limits here only keep the form from growing past them.

export type RiskImpact = "high" | "medium" | "low";
export type RiskDecision = "open" | "accepted" | "mitigate";
export type IdeaSegment = { key: string; name: string; need: string };
export type IdeaAlternative = { key: string; name: string; how: string; source: "owner" | "ai"; confirmed: boolean };
export type IdeaRisk = { key: string; text: string; impact: RiskImpact; decision: RiskDecision; note: string };
export type IdeaMetric = { key: string; text: string };
export type IdeaReview = {
  problem: string; segments: IdeaSegment[]; value: string; alternatives: IdeaAlternative[]; revenue: string;
  risks: IdeaRisk[]; metrics: IdeaMetric[]; constraints: { deadline: string; budget: string; legal: string; dataLocation: string };
};

const LIMITS = { segments: 5, alternatives: 8, risks: 12, metrics: 3 };

export const blankIdea = (): IdeaReview => ({
  problem: "", segments: [{ key: "seg1", name: "", need: "" }], value: "", alternatives: [], revenue: "", risks: [], metrics: [{ key: "m1", text: "" }],
  constraints: { deadline: "", budget: "", legal: "", dataLocation: "" },
});

/** Older or partial content (an import, the AI) gets every field, so the form never breaks on a missing list. */
function complete(value: Partial<IdeaReview>): IdeaReview {
  const blank = blankIdea();
  return { ...blank, ...value, segments: value.segments ?? [], alternatives: value.alternatives ?? [], risks: value.risks ?? [], metrics: value.metrics ?? [], constraints: { ...blank.constraints, ...(value.constraints ?? {}) } };
}

function nextKey(items: Array<{ key: string }>, prefix: string): string {
  let number = items.length + 1;
  while (items.some((item) => item.key === `${prefix}${number}`)) number += 1;
  return `${prefix}${number}`;
}

const impactLabel = (): Record<RiskImpact, string> => ({ high: t("Сильно"), medium: t("Заметно"), low: t("Слабо") });
const decisionLabel = (): Record<RiskDecision, string> => ({ open: t("Не решено"), accepted: t("Принимаем риск"), mitigate: t("Есть план") });
const measurable = (text: string) => /\d/.test(text);

/** The idea at a glance: what an investor or a developer reads first. Empty cells say what is missing. */
export function IdeaCanvas({ value }: { value: IdeaReview }) {
  const idea = complete(value);
  const empty = <span style={{ color: "var(--muted)" }}>{t("не заполнено")}</span>;
  const cell = (title: string, body: React.ReactNode, wide = false) => (
    <div style={{ border: "1.5px solid var(--line, #d9ddd9)", borderRadius: 12, padding: "10px 12px", background: "#fff", gridColumn: wide ? "1 / -1" : undefined, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, color: "var(--muted)", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 16, overflowWrap: "anywhere" }}>{body}</div>
    </div>
  );
  const segments = idea.segments.filter((segment) => segment.name);
  const alternatives = idea.alternatives.filter((item) => item.name && item.confirmed);
  const openHigh = idea.risks.filter((risk) => risk.impact === "high" && risk.decision === "open").length;
  return (
    <div role="group" aria-label={t("Идея на одном экране")} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
      {cell(t("Проблема"), idea.problem || empty, true)}
      {cell(t("Для кого"), segments.length ? <ul className={styles.list} style={{ margin: 0 }}>{segments.map((segment) => <li key={segment.key}>{segment.name}{segment.need ? ` — ${segment.need}` : ""}</li>)}</ul> : empty)}
      {cell(t("Почему выберут вас"), idea.value || empty)}
      {cell(t("Как справляются сейчас"), alternatives.length ? <ul className={styles.list} style={{ margin: 0 }}>{alternatives.map((item) => <li key={item.key}>{item.name}</li>)}</ul> : empty)}
      {cell(t("Как зарабатывает или экономит"), idea.revenue || empty)}
      {cell(t("Цели"), idea.metrics.some((metric) => metric.text) ? <ul className={styles.list} style={{ margin: 0 }}>{idea.metrics.filter((metric) => metric.text).map((metric) => <li key={metric.key}>{metric.text}</li>)}</ul> : empty)}
      {cell(t("Риски"), idea.risks.length ? (
        <>{t("Всего: {0}", [idea.risks.length])}{openHigh > 0 && <strong style={{ color: "#a33a2a" }}> · {t("сильных без решения: {0}", [openHigh])}</strong>}</>
      ) : empty)}
    </div>
  );
}

export function IdeaEditor({ value: raw, onChange, disabled, issues }: { value: IdeaReview; onChange: (next: IdeaReview) => void; disabled: boolean; issues: string[] }) {
  const value = complete(raw);
  const set = (patch: Partial<IdeaReview>) => onChange({ ...value, ...patch });
  const setItem = <K extends "segments" | "alternatives" | "risks" | "metrics">(list: K, index: number, patch: Partial<IdeaReview[K][number]>) =>
    set({ [list]: (value[list] as Array<IdeaReview[K][number]>).map((item, position) => (position === index ? { ...item, ...patch } : item)) } as Partial<IdeaReview>);
  const remove = (list: "segments" | "alternatives" | "risks" | "metrics", index: number) =>
    set({ [list]: (value[list] as unknown[]).filter((_, position) => position !== index) } as Partial<IdeaReview>);
  const removeButton = (list: "segments" | "alternatives" | "risks" | "metrics", index: number, label: string) => (
    <button type="button" className={styles.iconButton} disabled={disabled} aria-label={label} onClick={() => remove(list, index)}>✕</button>
  );
  const area = (label: string, why: string, field: "problem" | "value" | "revenue", max: number, placeholder: string) => (
    <label className={styles.field}><span className={styles.label}>{label}</span>
      <span className={styles.why}>{why}</span>
      <textarea className={styles.textarea} style={{ minHeight: 72 }} value={value[field]} maxLength={max} disabled={disabled} placeholder={placeholder} onChange={(event) => set({ [field]: event.target.value })} />
    </label>
  );
  const unconfirmed = value.alternatives.filter((item) => item.source === "ai" && !item.confirmed).length;

  return (
    <div>
      <section className={styles.card} aria-label={t("Идея на одном экране")}>
        <p className={styles.cardTitle}>{t("Идея на одном экране")}</p>
        <IdeaCanvas value={value} />
      </section>
      {issues.length > 0 && (
        <div className={`${styles.notice} ${styles.warn}`}><ul className={styles.list}>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>
      )}

      <section className={styles.card} aria-label={t("Проблема и ценность")}>
        <p className={styles.cardTitle}>{t("Проблема и ценность")}</p>
        {area(t("Какую проблему решает продукт"), t("Опишите боль людей, а не сам продукт: что у них сейчас не получается."), "problem", 600, t("Например: мастера на дом ищут через знакомых и ждут ответа часами"))}
        {area(t("Почему выберут вас"), t("Чем вы лучше того, как люди справляются сейчас."), "value", 600, t("Например: мастер приезжает в тот же день, цена известна заранее"))}
        {area(t("Как продукт зарабатывает или экономит"), t("Кто платит и за что. Если не знаете — так и напишите, это станет вопросом."), "revenue", 400, t("Например: комиссия 10% с каждого заказа"))}
      </section>

      <section className={styles.card} aria-label={t("Для кого")}>
        <p className={styles.cardTitle}>{t("Для кого")}</p>
        <p className={styles.small}>{t("Группы людей, которые будут пользоваться продуктом, и что каждой нужно.")}</p>
        {value.segments.map((segment, index) => (
          <article key={segment.key} className={styles.section} aria-label={t("Группа {0}", [index + 1])}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionType}>{t("Группа {0}", [index + 1])}</span>
              <div className={styles.spacer} />
              {removeButton("segments", index, t("Убрать группу"))}
            </div>
            <label className={styles.field}><span className={styles.label}>{t("Кто это")}</span>
              <input className={styles.input} value={segment.name} maxLength={80} disabled={disabled} placeholder={t("Например: жители Астаны с поломкой техники")} onChange={(event) => setItem("segments", index, { name: event.target.value })} /></label>
            <label className={styles.field}><span className={styles.label}>{t("Что им нужно")}</span>
              <input className={styles.input} value={segment.need} maxLength={300} disabled={disabled} placeholder={t("Например: быстро вызвать мастера")} onChange={(event) => setItem("segments", index, { need: event.target.value })} /></label>
          </article>
        ))}
        {!disabled && value.segments.length < LIMITS.segments && (
          <button type="button" className={`${styles.secondary} ${styles.block}`} onClick={() => set({ segments: [...value.segments, { key: nextKey(value.segments, "seg"), name: "", need: "" }] })}>{t("+ Добавить группу")}</button>
        )}
      </section>

      <section className={styles.card} aria-label={t("Как справляются сейчас")}>
        <p className={styles.cardTitle}>{t("Как справляются сейчас")}</p>
        <p className={styles.small}>{t("Конкуренты, ручные способы, «никак». Варианты от ИИ попадут в документы, только когда вы их подтвердите.")}</p>
        {unconfirmed > 0 && <p className={`${styles.notice} ${styles.info}`}>{t("ИИ предложил вариантов: {0}. Отметьте те, что правда есть, остальные уберите.", [unconfirmed])}</p>}
        {value.alternatives.map((item, index) => (
          <article key={item.key} className={styles.section} aria-label={t("Вариант {0}", [index + 1])}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionType}>{item.source === "ai" ? t("Предложил ИИ") : t("Вариант {0}", [index + 1])}</span>
              <div className={styles.spacer} />
              {removeButton("alternatives", index, t("Убрать вариант"))}
            </div>
            <label className={styles.field}><span className={styles.label}>{t("Что это")}</span>
              <input className={styles.input} value={item.name} maxLength={80} disabled={disabled} placeholder={t("Например: группы в WhatsApp")} onChange={(event) => setItem("alternatives", index, { name: event.target.value })} /></label>
            <label className={styles.field}><span className={styles.label}>{t("Как это работает и чем неудобно")}</span>
              <input className={styles.input} value={item.how} maxLength={300} disabled={disabled} onChange={(event) => setItem("alternatives", index, { how: event.target.value })} /></label>
            {item.source === "ai" && (
              <label className={styles.field} style={{ flexDirection: "row", alignItems: "center", gap: 10, display: "flex" }}>
                <input type="checkbox" style={{ width: 22, height: 22 }} checked={item.confirmed} disabled={disabled} onChange={(event) => setItem("alternatives", index, { confirmed: event.target.checked })} />
                <span>{t("Подтверждаю: так действительно делают")}</span>
              </label>
            )}
          </article>
        ))}
        {!disabled && value.alternatives.length < LIMITS.alternatives && (
          <button type="button" className={`${styles.secondary} ${styles.block}`} onClick={() => set({ alternatives: [...value.alternatives, { key: nextKey(value.alternatives, "alt"), name: "", how: "", source: "owner", confirmed: true }] })}>{t("+ Добавить вариант")}</button>
        )}
      </section>

      <section className={styles.card} aria-label={t("Риски и допущения")}>
        <p className={styles.cardTitle}>{t("Риски и допущения")}</p>
        <p className={styles.small}>{t("Что может пойти не так и во что вы верите без проверки. Для сильных рисков нужно решение — иначе этап не принять.")}</p>
        {value.risks.map((risk, index) => {
          const blocking = risk.impact === "high" && risk.decision === "open";
          return (
            <article key={risk.key} className={styles.section} aria-label={t("Риск {0}", [index + 1])} style={blocking ? { borderColor: "#a33a2a" } : undefined}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionType}>{t("Риск {0}", [index + 1])}</span>
                <div className={styles.spacer} />
                {removeButton("risks", index, t("Убрать риск"))}
              </div>
              <label className={styles.field}><span className={styles.label}>{t("Что может пойти не так")}</span>
                <textarea className={styles.textarea} style={{ minHeight: 56 }} value={risk.text} maxLength={300} disabled={disabled} placeholder={t("Например: мастеров будет мало в первые месяцы")} onChange={(event) => setItem("risks", index, { text: event.target.value })} /></label>
              <div className={styles.field}><span className={styles.label}>{t("Насколько повлияет")}</span>
                <div className={styles.chips} role="group" aria-label={t("Насколько повлияет")}>
                  {(Object.keys(impactLabel()) as RiskImpact[]).map((impact) => (
                    <button key={impact} type="button" className={risk.impact === impact ? styles.button : styles.ghost} style={{ minHeight: 40, padding: "4px 12px" }} aria-pressed={risk.impact === impact} disabled={disabled} onClick={() => setItem("risks", index, { impact })}>{impactLabel()[impact]}</button>
                  ))}
                </div>
              </div>
              <div className={styles.field}><span className={styles.label}>{t("Решение")}</span>
                <div className={styles.chips} role="group" aria-label={t("Решение")}>
                  {(Object.keys(decisionLabel()) as RiskDecision[]).map((decision) => (
                    <button key={decision} type="button" className={risk.decision === decision ? styles.button : styles.ghost} style={{ minHeight: 40, padding: "4px 12px" }} aria-pressed={risk.decision === decision} disabled={disabled} onClick={() => setItem("risks", index, { decision })}>{decisionLabel()[decision]}</button>
                  ))}
                </div>
              </div>
              {risk.decision !== "open" && (
                <label className={styles.field}><span className={styles.label}>{risk.decision === "mitigate" ? t("Какой план") : t("Почему принимаем")}</span>
                  <input className={styles.input} value={risk.note} maxLength={300} disabled={disabled} onChange={(event) => setItem("risks", index, { note: event.target.value })} /></label>
              )}
              {blocking && <p className={`${styles.notice} ${styles.warn}`}>{t("Сильный риск без решения: выберите «Принимаем риск» или «Есть план».")}</p>}
            </article>
          );
        })}
        {!disabled && value.risks.length < LIMITS.risks && (
          <button type="button" className={`${styles.secondary} ${styles.block}`} onClick={() => set({ risks: [...value.risks, { key: nextKey(value.risks, "risk"), text: "", impact: "medium", decision: "open", note: "" }] })}>{t("+ Добавить риск")}</button>
        )}
      </section>

      <section className={styles.card} aria-label={t("Цели")}>
        <p className={styles.cardTitle}>{t("Цели")}</p>
        <p className={styles.small}>{t("До трёх целей с числом и сроком — по ним через месяц будет видно, работает ли продукт.")}</p>
        {value.metrics.map((metric, index) => (
          <div key={metric.key} className={styles.field}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input className={styles.input} style={{ flex: 1 }} value={metric.text} maxLength={200} disabled={disabled} aria-label={t("Цель {0}", [index + 1])} placeholder={t("Например: 50 заказов в первый месяц")} onChange={(event) => setItem("metrics", index, { text: event.target.value })} />
              {removeButton("metrics", index, t("Убрать цель"))}
            </div>
            {metric.text && !measurable(metric.text) && <span className={styles.why} style={{ color: "#8a5a00" }}>{t("Добавьте число: сколько и к какому сроку.")}</span>}
          </div>
        ))}
        {!disabled && value.metrics.length < LIMITS.metrics && (
          <button type="button" className={`${styles.secondary} ${styles.block}`} onClick={() => set({ metrics: [...value.metrics, { key: nextKey(value.metrics, "m"), text: "" }] })}>{t("+ Добавить цель")}</button>
        )}
      </section>

      <section className={styles.card} aria-label={t("Ограничения")}>
        <p className={styles.cardTitle}>{t("Ограничения")}</p>
        <p className={styles.small}>{t("Необязательно, но от этого зависят архитектура и план работ.")}</p>
        {([
          ["deadline", t("Срок"), t("Например: запуститься до 1 марта"), 120],
          ["budget", t("Бюджет"), t("Например: до 2 млн ₸ на первую версию"), 120],
          ["legal", t("Законы и правила"), t("Например: храним персональные данные клиентов"), 300],
          ["dataLocation", t("Где хранить данные"), t("Например: только в Казахстане"), 120],
        ] as const).map(([field, label, placeholder, max]) => (
          <label key={field} className={styles.field}><span className={styles.label}>{label}</span>
            <input className={styles.input} value={value.constraints[field]} maxLength={max} disabled={disabled} placeholder={placeholder} onChange={(event) => set({ constraints: { ...value.constraints, [field]: event.target.value } })} /></label>
        ))}
      </section>
    </div>
  );
}
