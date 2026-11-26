"use client";

import { t } from "@/lib/i18n";
import type { CustomerPath, CustomerPaths, PathsOptions } from "@/lib/journey";
import styles from "../../../journey.module.css";

const chip = (text: string, kind: "from" | "step" | "action") => ({
  text,
  style: {
    border: `1.5px solid ${kind === "action" ? "var(--brand-ink)" : kind === "from" ? "#7a827d" : "#2d6da3"}`,
    background: kind === "action" ? "var(--brand-soft)" : "#fff",
    borderRadius: 10, padding: "4px 8px", fontSize: 14, fontWeight: kind === "action" ? 700 : 500, overflowWrap: "anywhere" as const,
  },
});

/** Each path as a chain: where the visitor comes from → the steps through the site → the action; the doubt under it. */
export function PathsDiagram({ value, options }: { value: CustomerPaths; options: PathsOptions }) {
  if (!value.paths.length) return <p className={styles.small}>{t("Путей пока нет.")}</p>;
  const source = (id: string) => options.sources.find((item) => item.id === id)?.label ?? id;
  const action = (id: string | null) => (id ? options.actions.find((item) => item.id === id)?.label ?? id : t("действие не выбрано"));
  return (
    <div role="img" aria-label={t("Схема путей клиентов: {0}", [value.paths.length])} style={{ display: "grid", gap: 14, margin: "8px 0 4px" }}>
      {value.paths.map((path) => {
        const items = [chip(source(path.from), "from"), ...path.steps.map((step) => chip(step.where || step.sees || "…", "step")), chip(action(path.action), "action")];
        return (
          <div key={path.key}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{path.who || t("Без названия")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
              {items.map((item, index) => (
                <span key={index} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {index > 0 && <span aria-hidden="true" style={{ color: "#7a827d" }}>→</span>}
                  <span style={item.style}>{item.text}</span>
                </span>
              ))}
            </div>
            {path.doubt && (
              <p className={styles.small} style={{ margin: "4px 0 0" }}>
                {path.answer ? t("Сомнение: {0} — ответ: {1}", [path.doubt, path.answer]) : t("Сомнение без ответа: {0}", [path.doubt])}
              </p>
            )}
          </div>
        );
      })}
      <p className={styles.small} style={{ margin: 0 }}>{t("Серым — откуда пришёл посетитель, синим — что он открывает на сайте, зелёным — чем заканчивается путь.")}</p>
    </div>
  );
}

export function PathsEditor({ value, onChange, options, disabled, issues }: {
  value: CustomerPaths; onChange: (next: CustomerPaths) => void; options: PathsOptions; disabled: boolean; issues: string[];
}) {
  const paths = value.paths;
  const set = (index: number, patch: Partial<CustomerPath>) => onChange({ paths: paths.map((path, position) => (position === index ? { ...path, ...patch } : path)) });
  const add = () => {
    let number = paths.length + 1;
    while (paths.some((path) => path.key === `path-${number}`)) number += 1;
    onChange({ paths: [...paths, { key: `path-${number}`, who: "", from: "search", wants: "", steps: [{ where: options.places[0] ?? "", sees: "" }], action: options.actions[0]?.id ?? null, doubt: "", answer: "" }] });
  };
  const long = (path: CustomerPath) => path.steps.length > options.limits.longPath;
  return (
    <div>
      <section className={styles.card} aria-label={t("Схема путей")}>
        <p className={styles.cardTitle}>{t("Схема путей")}</p>
        <PathsDiagram value={value} options={options} />
      </section>
      {issues.length > 0 && (
        <div className={`${styles.notice} ${styles.warn}`}><ul className={styles.list}>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>
      )}
      <datalist id="path-places">{options.places.map((place) => <option key={place} value={place} />)}</datalist>
      {paths.map((path, index) => {
        const name = path.who || String(index + 1);
        const setStep = (s: number, patch: Partial<CustomerPath["steps"][number]>) => set(index, { steps: path.steps.map((step, position) => (position === s ? { ...step, ...patch } : step)) });
        return (
          <article key={path.key} className={styles.section} aria-label={t("Путь {0}", [index + 1])}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionType}>{t("Путь {0}", [index + 1])}</span>
              <div className={styles.spacer} />
              <button type="button" className={styles.iconButton} disabled={disabled} aria-label={t("Убрать путь «{0}»", [name])}
                onClick={() => { if (window.confirm(t("Убрать путь «{0}»? Его можно вернуть из истории версий.", [name]))) onChange({ paths: paths.filter((_, position) => position !== index) }); }}>✕</button>
            </div>
            <label className={styles.field}><span className={styles.label}>{t("Кто этот посетитель")}</span>
              <span className={styles.why}>{t("Группа клиентов в нескольких словах — как вы о них говорите.")}</span>
              <input className={styles.input} value={path.who} maxLength={120} disabled={disabled} placeholder={t("Например: мама с ребёнком")} onChange={(event) => set(index, { who: event.target.value })} /></label>
            <label className={styles.field}><span className={styles.label}>{t("Откуда приходит")}</span>
              <span className={styles.why}>{t("От этого зависит, что посетитель уже знает о вас и с какого устройства открывает сайт.")}</span>
              <select className={styles.input} value={path.from} disabled={disabled} onChange={(event) => set(index, { from: event.target.value as CustomerPath["from"] })}>
                {options.sources.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select></label>
            <label className={styles.field}><span className={styles.label}>{t("Чего он хочет")}</span>
              <span className={styles.why}>{t("Одна фраза: с каким вопросом он пришёл. Первый экран должен на него ответить.")}</span>
              <textarea className={styles.textarea} style={{ minHeight: 56 }} value={path.wants} maxLength={200} disabled={disabled} placeholder={t("Например: узнать цену чистки дивана")} onChange={(event) => set(index, { wants: event.target.value })} /></label>
            <div className={styles.field}>
              <span className={styles.label}>{t("Шаги по сайту")}</span>
              <span className={styles.why}>{t("Что посетитель открывает по порядку и что там видит. Чем меньше шагов до действия, тем меньше людей уходит.")}</span>
              {path.steps.map((step, s) => (
                <div key={s} style={{ display: "grid", gap: 6, padding: "8px 0", borderTop: s ? "1px solid var(--line, #e3e6e4)" : "none" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span className={styles.small} style={{ minWidth: 22 }}>{s + 1}.</span>
                    <input className={styles.input} style={{ flex: 1 }} list="path-places" value={step.where} maxLength={60} disabled={disabled} aria-label={t("Где — шаг {0}", [s + 1])} placeholder={t("Страница или блок")} onChange={(event) => setStep(s, { where: event.target.value })} />
                    <button type="button" className={styles.iconButton} disabled={disabled} aria-label={t("Убрать шаг {0}", [s + 1])} onClick={() => set(index, { steps: path.steps.filter((_, position) => position !== s) })}>✕</button>
                  </div>
                  <input className={styles.input} value={step.sees} maxLength={200} disabled={disabled} aria-label={t("Что видит — шаг {0}", [s + 1])} placeholder={t("Что он там видит: цены, примеры работ, кнопку…")} onChange={(event) => setStep(s, { sees: event.target.value })} />
                </div>
              ))}
              {!disabled && path.steps.length < options.limits.steps && (
                <button type="button" className={styles.ghost} onClick={() => set(index, { steps: [...path.steps, { where: "", sees: "" }] })}>{t("+ Шаг")}</button>
              )}
              {long(path) && <p className={`${styles.notice} ${styles.warn}`}>{t("До действия {0} шагов: на телефоне часть посетителей уйдёт раньше.", [path.steps.length])}</p>}
            </div>
            <label className={styles.field}><span className={styles.label}>{t("Чем заканчивается путь")}</span>
              <span className={styles.why}>{t("Только то, что умеет этот сайт. К этому действию тексты будут вести посетителя.")}</span>
              <select className={styles.input} value={path.action ?? ""} disabled={disabled} onChange={(event) => set(index, { action: (event.target.value || null) as CustomerPath["action"] })}>
                <option value="">{t("Не выбрано")}</option>
                {options.actions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select></label>
            <label className={styles.field}><span className={styles.label}>{t("Что может его остановить (необязательно)")}</span>
              <span className={styles.why}>{t("Сомнение, из-за которого посетитель уходит: цена, доверие, расстояние, сроки.")}</span>
              <input className={styles.input} value={path.doubt} maxLength={200} disabled={disabled} placeholder={t("Например: вдруг испортят ткань")} onChange={(event) => set(index, { doubt: event.target.value })} /></label>
            <label className={styles.field}><span className={styles.label}>{t("Что на сайте на это отвечает")}</span>
              <span className={styles.why}>{t("Блок или фраза, которая снимает сомнение. Тексты используют только то, что вы здесь написали.")}</span>
              <input className={styles.input} value={path.answer} maxLength={200} disabled={disabled} placeholder={t("Например: блок «Как мы работаем» с гарантией")} onChange={(event) => set(index, { answer: event.target.value })} /></label>
          </article>
        );
      })}
      {!disabled && paths.length < options.limits.paths && <button type="button" className={`${styles.secondary} ${styles.block}`} style={{ marginBottom: 14 }} onClick={add}>{t("+ Добавить путь")}</button>}
    </div>
  );
}
