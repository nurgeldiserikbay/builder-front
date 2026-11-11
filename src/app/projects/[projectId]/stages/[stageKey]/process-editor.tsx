"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import styles from "../../../journey.module.css";
import { DataDiagram, KindLegend, SwimlaneDiagram, type ActorKind, type DataEntity, type ProcessActor, type ProcessScenario } from "./diagrams";

export type BusinessProcess = { actors: ProcessActor[]; scenarios: ProcessScenario[]; rules: string[]; data: Array<DataEntity & { fields: string[] }> };
export type ProcessOptions = { capabilities: Record<string, string>; actorKinds: Record<ActorKind, string>; limits: { actors: number; scenarios: number; steps: number; rules: number; entities: number; fields: number; links: number } };

let counter = 0;
const newKey = (prefix: string) => `${prefix}${Date.now().toString(36).slice(-4)}${(counter += 1)}`;
export const blankProcess: BusinessProcess = { actors: [{ key: "client", name: "", kind: "client" }], scenarios: [], rules: [], data: [] };

/** Diagram first, then the parts it is made of. Every change redraws the diagram at once. */
export function ProcessEditor({ value, onChange, options, disabled, issues }: { value: BusinessProcess; onChange: (next: BusinessProcess) => void; options: ProcessOptions; disabled: boolean; issues: string[] }) {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const scenario = value.scenarios[Math.min(scenarioIndex, value.scenarios.length - 1)];
  const set = (patch: Partial<BusinessProcess>) => onChange({ ...value, ...patch });
  const setScenario = (index: number, patch: Partial<ProcessScenario>) => set({ scenarios: value.scenarios.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const move = <T,>(list: T[], from: number, to: number) => { const next = [...list]; const [item] = next.splice(from, 1); next.splice(to, 0, item!); return next; };
  const capabilityKeys = Object.keys(options.capabilities);

  return (
    <>
      {issues.length > 0 && <div className={`${styles.notice} ${styles.warning}`}><ul className={styles.list} style={{ margin: 0 }}>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}

      <section className={styles.card} aria-labelledby="process-diagram">
        <p id="process-diagram" className={styles.cardTitle}>{t("Схема процесса по ролям")}</p>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("Каждая колонка — участник, каждый блок — шаг. Стрелки показывают, кто за кем действует. Схема широкая — листайте её вбок.")}</p>
        {value.scenarios.length > 1 && (
          <div className={styles.row} style={{ flexWrap: "wrap", gap: 6 }} role="tablist">
            {value.scenarios.map((item, i) => (
              <button key={item.key} role="tab" aria-selected={i === scenarioIndex} className={i === scenarioIndex ? styles.button : styles.ghost} style={{ minHeight: 36, padding: "4px 10px" }} onClick={() => setScenarioIndex(i)}>{item.title || t("Сценарий {0}", [i + 1])}</button>
            ))}
          </div>
        )}
        {scenario && scenario.steps.length > 0 ? (
          <>
            {scenario.goal && <p className={styles.small} style={{ margin: "6px 0 0" }}>{scenario.goal}</p>}
            <SwimlaneDiagram actors={value.actors} scenario={scenario} />
            <KindLegend />
          </>
        ) : <p className={styles.muted}>{t("Добавьте сценарий и шаги ниже — схема появится здесь.")}</p>}
      </section>

      <section className={styles.card} aria-labelledby="process-actors">
        <p id="process-actors" className={styles.cardTitle}>{t("Участники")}</p>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("Кто участвует в процессе: клиент, вы, сотрудники, сам сайт и внешние сервисы.")}</p>
        {value.actors.map((actor, i) => (
          <div key={actor.key} className={styles.row} style={{ gap: 6, marginBottom: 6 }}>
            <input className={styles.input} style={{ flex: 2 }} aria-label={t("Участник {0}", [i + 1])} value={actor.name} maxLength={40} disabled={disabled} placeholder={t("Например: Администратор")}
              onChange={(event) => set({ actors: value.actors.map((item, k) => (k === i ? { ...item, name: event.target.value } : item)) })} />
            <select className={styles.input} style={{ flex: 1.4 }} aria-label={t("Кто это")} value={actor.kind} disabled={disabled}
              onChange={(event) => set({ actors: value.actors.map((item, k) => (k === i ? { ...item, kind: event.target.value as ActorKind } : item)) })}>
              {(Object.keys(options.actorKinds) as ActorKind[]).map((kind) => <option key={kind} value={kind}>{options.actorKinds[kind]}</option>)}
            </select>
            {!disabled && value.actors.length > 1 && (
              <button className={styles.ghost} aria-label={t("Убрать участника {0}", [actor.name || i + 1])} style={{ minHeight: 40, padding: "4px 10px" }}
                onClick={() => {
                  const rest = value.actors.filter((_, k) => k !== i);
                  set({ actors: rest, scenarios: value.scenarios.map((item) => ({ ...item, steps: item.steps.map((step) => (step.actor === actor.key ? { ...step, actor: rest[0]!.key } : step)) })) });
                }}>×</button>
            )}
          </div>
        ))}
        {!disabled && value.actors.length < options.limits.actors && <button className={styles.ghost} onClick={() => set({ actors: [...value.actors, { key: newKey("a"), name: "", kind: "business" }] })}>{t("+ Участник")}</button>}
      </section>

      <section className={styles.card} aria-labelledby="process-scenarios">
        <p id="process-scenarios" className={styles.cardTitle}>{t("Сценарии")}</p>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("Сценарий — путь от начала до результата: запись, заказ, отмена. Для каждого шага выберите, что он делает, — по этому архитектура покажет, что сделает сайт, а что останется за вами.")}</p>
        {value.scenarios.map((item, index) => (
          <details key={item.key} open={index === scenarioIndex} style={{ borderTop: "1px solid #e3e7e3", padding: "8px 0" }} onToggle={(event) => { if ((event.target as HTMLDetailsElement).open) setScenarioIndex(index); }}>
            <summary style={{ fontWeight: 800 }}>{item.title || t("Сценарий {0}", [index + 1])} · {t("шагов: {0}", [item.steps.length])}</summary>
            <label className={styles.label} htmlFor={`sc-title-${item.key}`}>{t("Название")}</label>
            <input id={`sc-title-${item.key}`} className={styles.input} value={item.title} maxLength={80} disabled={disabled} placeholder={t("Например: Запись")} onChange={(event) => setScenario(index, { title: event.target.value })} />
            <label className={styles.label} htmlFor={`sc-goal-${item.key}`}>{t("Чем заканчивается (необязательно)")}</label>
            <input id={`sc-goal-${item.key}`} className={styles.input} value={item.goal} maxLength={200} disabled={disabled} onChange={(event) => setScenario(index, { goal: event.target.value })} />
            <ol style={{ paddingLeft: 18, margin: "10px 0" }}>
              {item.steps.map((step, s) => (
                <li key={step.key} style={{ marginBottom: 10 }}>
                  <div className={styles.row} style={{ gap: 6 }}>
                    <select className={styles.input} style={{ flex: 1 }} aria-label={t("Кто делает шаг {0}", [s + 1])} value={step.actor} disabled={disabled}
                      onChange={(event) => setScenario(index, { steps: item.steps.map((x, k) => (k === s ? { ...x, actor: event.target.value } : x)) })}>
                      {value.actors.map((actor) => <option key={actor.key} value={actor.key}>{actor.name || t("без имени")}</option>)}
                    </select>
                    {!disabled && (
                      <>
                        <button className={styles.ghost} style={{ minHeight: 40, padding: "4px 8px" }} aria-label={t("Шаг {0} выше", [s + 1])} disabled={s === 0} onClick={() => setScenario(index, { steps: move(item.steps, s, s - 1) })}>↑</button>
                        <button className={styles.ghost} style={{ minHeight: 40, padding: "4px 8px" }} aria-label={t("Убрать шаг {0}", [s + 1])} onClick={() => setScenario(index, { steps: item.steps.filter((_, k) => k !== s) })}>×</button>
                      </>
                    )}
                  </div>
                  <input className={styles.input} style={{ marginTop: 6 }} aria-label={t("Что происходит на шаге {0}", [s + 1])} value={step.action} maxLength={160} disabled={disabled} placeholder={t("Например: выбирает время")}
                    onChange={(event) => setScenario(index, { steps: item.steps.map((x, k) => (k === s ? { ...x, action: event.target.value } : x)) })} />
                  <select className={styles.input} style={{ marginTop: 6 }} aria-label={t("Что делает шаг {0}", [s + 1])} value={step.capability} disabled={disabled}
                    onChange={(event) => setScenario(index, { steps: item.steps.map((x, k) => (k === s ? { ...x, capability: event.target.value } : x)) })}>
                    {capabilityKeys.map((key) => <option key={key} value={key}>{options.capabilities[key]}</option>)}
                  </select>
                </li>
              ))}
            </ol>
            {!disabled && (
              <div className={styles.row} style={{ flexWrap: "wrap", gap: 6 }}>
                {item.steps.length < options.limits.steps && <button className={styles.ghost} onClick={() => setScenario(index, { steps: [...item.steps, { key: newKey("p"), actor: item.steps.at(-1)?.actor ?? value.actors[0]!.key, action: "", capability: "other" }] })}>{t("+ Шаг")}</button>}
                <button className={styles.ghost} onClick={() => { if (window.confirm(t("Удалить сценарий «{0}»?", [item.title || index + 1]))) { set({ scenarios: value.scenarios.filter((_, k) => k !== index) }); setScenarioIndex(0); } }}>{t("Удалить сценарий")}</button>
              </div>
            )}
          </details>
        ))}
        {!disabled && value.scenarios.length < options.limits.scenarios && (
          <button className={styles.ghost} style={{ marginTop: 8 }} onClick={() => { set({ scenarios: [...value.scenarios, { key: newKey("s"), title: "", goal: "", steps: [] }] }); setScenarioIndex(value.scenarios.length); }}>{t("+ Сценарий")}</button>
        )}
      </section>

      <section className={styles.card} aria-labelledby="process-rules">
        <p id="process-rules" className={styles.cardTitle}>{t("Правила")}</p>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("Правила, по которым вы работаете: отмена, предоплата, сроки ответа. По одному на строку.")}</p>
        <textarea className={styles.textarea} aria-label={t("Правила")} disabled={disabled} value={value.rules.join("\n")} placeholder={t("Например: отмена не позже чем за 2 часа")}
          onChange={(event) => set({ rules: event.target.value.split("\n").slice(0, options.limits.rules) })} />
      </section>

      <section className={styles.card} aria-labelledby="process-data">
        <p id="process-data" className={styles.cardTitle}>{t("Схема данных")}</p>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("Какую информацию вы храните и как она связана: например, у клиента много записей, у записи одна услуга. Сплошная линия — «много», пунктир — «один».")}</p>
        <DataDiagram entities={value.data} />
        {value.data.map((entity, i) => (
          <details key={entity.key} style={{ borderTop: "1px solid #e3e7e3", padding: "8px 0" }}>
            <summary style={{ fontWeight: 800 }}>{entity.name || t("Без названия")}</summary>
            <label className={styles.label} htmlFor={`en-name-${entity.key}`}>{t("Название")}</label>
            <input id={`en-name-${entity.key}`} className={styles.input} value={entity.name} maxLength={40} disabled={disabled} placeholder={t("Например: Заказ")}
              onChange={(event) => set({ data: value.data.map((x, k) => (k === i ? { ...x, name: event.target.value } : x)) })} />
            <label className={styles.label} htmlFor={`en-fields-${entity.key}`}>{t("Что о нём храните — через запятую")}</label>
            <input id={`en-fields-${entity.key}`} className={styles.input} value={entity.fields.join(", ")} disabled={disabled} placeholder={t("Имя, телефон, сумма")}
              onChange={(event) => set({ data: value.data.map((x, k) => (k === i ? { ...x, fields: event.target.value.split(",").map((f) => f.trimStart()).slice(0, options.limits.fields) } : x)) })} />
            <p className={styles.small} style={{ margin: "8px 0 4px" }}>{t("Связи")}</p>
            {entity.links.map((link, l) => (
              <div key={l} className={styles.row} style={{ gap: 6, marginBottom: 6 }}>
                <select className={styles.input} style={{ flex: 1.2 }} aria-label={t("С чем связано")} value={link.to} disabled={disabled}
                  onChange={(event) => set({ data: value.data.map((x, k) => (k === i ? { ...x, links: x.links.map((y, m) => (m === l ? { ...y, to: event.target.value } : y)) } : x)) })}>
                  {value.data.filter((other) => other.key !== entity.key).map((other) => <option key={other.key} value={other.key}>{other.name || t("Без названия")}</option>)}
                </select>
                <select className={styles.input} style={{ flex: 0.9 }} aria-label={t("Сколько")} value={link.kind} disabled={disabled}
                  onChange={(event) => set({ data: value.data.map((x, k) => (k === i ? { ...x, links: x.links.map((y, m) => (m === l ? { ...y, kind: event.target.value as "one" | "many" } : y)) } : x)) })}>
                  <option value="one">{t("один")}</option><option value="many">{t("много")}</option>
                </select>
                <input className={styles.input} style={{ flex: 1.4 }} aria-label={t("Подпись связи")} value={link.label} maxLength={60} disabled={disabled} placeholder={t("например: делает")}
                  onChange={(event) => set({ data: value.data.map((x, k) => (k === i ? { ...x, links: x.links.map((y, m) => (m === l ? { ...y, label: event.target.value } : y)) } : x)) })} />
                {!disabled && <button className={styles.ghost} style={{ minHeight: 40, padding: "4px 8px" }} aria-label={t("Убрать связь")} onClick={() => set({ data: value.data.map((x, k) => (k === i ? { ...x, links: x.links.filter((_, m) => m !== l) } : x)) })}>×</button>}
              </div>
            ))}
            {!disabled && (
              <div className={styles.row} style={{ flexWrap: "wrap", gap: 6 }}>
                {value.data.length > 1 && entity.links.length < options.limits.links && <button className={styles.ghost} onClick={() => set({ data: value.data.map((x, k) => (k === i ? { ...x, links: [...x.links, { to: value.data.find((other) => other.key !== entity.key)!.key, kind: "many", label: "" }] } : x)) })}>{t("+ Связь")}</button>}
                <button className={styles.ghost} onClick={() => set({ data: value.data.filter((_, k) => k !== i).map((x) => ({ ...x, links: x.links.filter((link) => link.to !== entity.key) })) })}>{t("Удалить")}</button>
              </div>
            )}
          </details>
        ))}
        {!disabled && value.data.length < options.limits.entities && <button className={styles.ghost} style={{ marginTop: 8 }} onClick={() => set({ data: [...value.data, { key: newKey("e"), name: "", fields: [], links: [] }] })}>{t("+ Данные")}</button>}
      </section>
    </>
  );
}
