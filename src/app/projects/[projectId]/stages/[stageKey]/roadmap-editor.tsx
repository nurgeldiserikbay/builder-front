"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { explainError } from "@/lib/journey";
import styles from "../../../journey.module.css";

// «План реализации» of a web application (builder-back src/journey/roadmap.ts): modules with tasks, the order between them,
// releases, estimates, who does each module, risks — and after approval, the progress of every task.

export type Executor = "ai" | "ai_supervised" | "specialist";
export type RoadmapTask = { key: string; title: string; feature: string | null; release: number; hours: number; aiRequests: number };
export type RoadmapModule = { key: string; name: string; summary: string; contractModule: string | null; dependsOn: string[]; executor: Executor; tasks: RoadmapTask[] };
export type RoadmapRisk = { key: string; text: string; action: string; module: string | null };
export type Roadmap = { modules: RoadmapModule[]; risks: RoadmapRisk[]; hoursPerDay: number; notes: string };
export type RoadmapOptions = {
  template: Roadmap | null; limits: { modules: number; tasks: number; risks: number; hours: number; requests: number }; executors: Executor[]; missing: "inputs" | null;
  markdown: string | null; features: Array<{ key: string; title: string; priority: string }>; contractModules: Array<{ key: string; name: string }>; approved: boolean;
};
type Finding = { target: string | null; message: string };

const executorLabels = (): Record<Executor, string> => ({ ai: t("ИИ-агент"), ai_supervised: t("ИИ под присмотром специалиста"), specialist: t("Специалист") });

function freeKey(prefix: string, used: string[]) {
  let index = used.length + 1;
  while (used.includes(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

/** The same rules as the server (roadmap.ts scheduleOf): parallel branches run in parallel, the longest chain decides. */
export function scheduleOf(value: Roadmap) {
  const byKey = new Map(value.modules.map((module) => [module.key, module]));
  const state = new Map<string, "open" | "done">();
  let cycle: string[] | null = null;
  const stack: string[] = [];
  const visit = (key: string) => {
    if (cycle || state.get(key) === "done") return;
    if (state.get(key) === "open") { cycle = [...stack.slice(stack.indexOf(key)), key]; return; }
    state.set(key, "open"); stack.push(key);
    for (const next of byKey.get(key)?.dependsOn ?? []) if (byKey.has(next)) visit(next);
    stack.pop(); state.set(key, "done");
  };
  value.modules.forEach((module) => visit(module.key));
  if (cycle) return { cycle: cycle as string[], placed: null };
  const placed = new Map<string, { start: number; finish: number; level: number; hours: number; requests: number }>();
  const place = (module: RoadmapModule): { start: number; finish: number; level: number; hours: number; requests: number } => {
    const known = placed.get(module.key);
    if (known) return known;
    const before = module.dependsOn.filter((key) => byKey.has(key)).map((key) => place(byKey.get(key)!));
    const hours = module.tasks.reduce((sum, task) => sum + (Number(task.hours) || 0), 0);
    const start = Math.max(0, ...before.map((item) => item.finish));
    const result = { start, finish: start + hours, level: before.length ? Math.max(...before.map((item) => item.level)) + 1 : 0, hours, requests: module.tasks.reduce((sum, task) => sum + (Number(task.aiRequests) || 0), 0) };
    placed.set(module.key, result);
    return result;
  };
  value.modules.forEach(place);
  const end = Math.max(0, ...[...placed.values()].map((item) => item.finish));
  const critical: string[] = [];
  let current = value.modules.find((module) => placed.get(module.key)!.finish === end && end > 0) ?? null;
  while (current) {
    critical.unshift(current.key);
    const start = placed.get(current.key)!.start;
    current = current.dependsOn.map((key) => byKey.get(key)).filter((item): item is RoadmapModule => Boolean(item) && placed.get(item!.key)!.finish === start)
      .sort((a, b) => placed.get(b.key)!.hours - placed.get(a.key)!.hours)[0] ?? null;
  }
  return { cycle: null, placed, critical, end, days: Math.ceil(end / (value.hoursPerDay || 6)) };
}

type Tab = "order" | "modules" | "risks" | "progress";

export function RoadmapEditor({ projectId, value, onChange, options, disabled, findings, onRebuild }: {
  projectId: string; value: Roadmap; onChange: (next: Roadmap) => void; options: RoadmapOptions; disabled: boolean; findings: Finding[]; onRebuild: (() => void) | null;
}) {
  const [tab, setTab] = useState<Tab>(options.approved ? "progress" : "order");
  const schedule = scheduleOf(value);
  const tabs: Array<[Tab, string, string | null]> = [
    ...(options.approved ? [["progress", t("Ход работ"), null] as [Tab, string, null]] : []),
    ["order", t("Порядок и срок"), schedule.cycle ? "!" : null],
    ["modules", t("Модули и задачи"), findings.some((finding) => finding.target && finding.target !== "risks") ? "!" : String(value.modules.length)],
    ["risks", t("Риски"), value.risks.some((risk) => !risk.action) ? "!" : String(value.risks.length)],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
      <div role="tablist" aria-label={t("Разделы плана")} style={{ display: "flex", gap: 6, overflowX: "auto", position: "sticky", top: 52, zIndex: 3, background: "var(--bg, #f6f7f5)", padding: "6px 0" }}>
        {tabs.map(([key, label, badge]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? styles.button : styles.secondary} style={{ minHeight: 40, padding: "4px 12px", whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => setTab(key)}>
            {label}{badge ? <span style={{ marginLeft: 6, opacity: 0.8, color: badge === "!" && tab !== key ? "#b3261e" : undefined }}>{badge}</span> : null}
          </button>
        ))}
      </div>
      {tab === "progress" && <ProgressView projectId={projectId} />}
      {tab === "order" && <OrderView value={value} onChange={onChange} disabled={disabled} schedule={schedule} />}
      {tab === "modules" && <ModulesEditor value={value} onChange={onChange} options={options} disabled={disabled} findings={findings} />}
      {tab === "risks" && <RisksEditor value={value} onChange={onChange} options={options} disabled={disabled} />}
      {onRebuild && options.template && tab !== "progress" && (
        <section className={styles.card} aria-label={t("Собрать заново")}>
          <p className={styles.small} style={{ marginTop: 0 }}>{t("Если контракты или ТЗ изменились, план можно собрать заново. Ваши правки заменятся черновиком платформы — до сохранения их можно вернуть, обновив страницу.")}</p>
          <button type="button" className={styles.secondary} disabled={disabled} onClick={onRebuild}>{t("Собрать заново из контрактов и ТЗ")}</button>
        </section>
      )}
    </div>
  );
}

function OrderView({ value, onChange, disabled, schedule }: { value: Roadmap; onChange: (next: Roadmap) => void; disabled: boolean; schedule: ReturnType<typeof scheduleOf> }) {
  const name = (key: string) => value.modules.find((module) => module.key === key)?.name ?? key;
  const releases = [1, 2, 3].map((release) => {
    const tasks = value.modules.flatMap((module) => module.tasks).filter((task) => task.release === release);
    return { release, tasks: tasks.length, hours: tasks.reduce((sum, task) => sum + (Number(task.hours) || 0), 0), requests: tasks.reduce((sum, task) => sum + (Number(task.aiRequests) || 0), 0) };
  }).filter((item) => item.tasks > 0);
  const total = releases.reduce((sum, item) => sum + item.hours, 0);
  const requests = releases.reduce((sum, item) => sum + item.requests, 0);
  return (
    <>
      <section className={styles.card} aria-labelledby="order-title">
        <p id="order-title" className={styles.cardTitle}>{t("Порядок и срок")}</p>
        {schedule.cycle ? (
          <p style={{ color: "#b3261e", margin: 0 }}>{t("Модули ждут друг друга по кругу: {0}. Уберите одну из зависимостей на вкладке «Модули и задачи».", [schedule.cycle.map(name).join(" → ")])}</p>
        ) : (
          <>
            <p style={{ margin: "0 0 8px" }}>{t("Всего {0} ч работы и около {1} запросов к ИИ. Срок — около {2} раб. дней с учётом параллельной работы.", [total, requests, schedule.days ?? 0])}</p>
            <p className={styles.small} style={{ marginTop: 0 }}><strong>{t("Критический путь")}:</strong> {schedule.critical!.map(name).join(" → ")} — {t("если любой из этих модулей опаздывает, опаздывает весь выпуск.")}</p>
            <RoadmapGraph value={value} schedule={schedule} />
          </>
        )}
        <label className={styles.field} style={{ marginTop: 14, maxWidth: 260 }}><span className={styles.label}>{t("Рабочих часов в день")}</span>
          <input className={styles.input} type="number" min={1} max={12} value={value.hoursPerDay} disabled={disabled} onChange={(event) => onChange({ ...value, hoursPerDay: Math.min(12, Math.max(1, Number(event.target.value) || 1)) })} /></label>
      </section>
      <section className={styles.card} aria-labelledby="releases-title">
        <p id="releases-title" className={styles.cardTitle}>{t("Выпуски")}</p>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("Первый — обязательные функции ТЗ, следующие — желательные и отложенные. Выпуск задачи меняется на вкладке «Модули и задачи».")}</p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {releases.map((item) => <li key={item.release}>{t("Выпуск {0}: задач {1}, {2} ч, ~{3} запросов к ИИ", [item.release, item.tasks, item.hours, item.requests])}</li>)}
        </ul>
      </section>
    </>
  );
}

/** Modules in columns by how far down the dependency chain they are; the critical path is red. Scrolls sideways when wide. */
function RoadmapGraph({ value, schedule }: { value: Roadmap; schedule: ReturnType<typeof scheduleOf> }) {
  if (!schedule.placed) return null;
  const W = 168; const H = 64; const GX = 44; const GY = 16;
  const columns = new Map<number, string[]>();
  for (const module of value.modules) { const level = schedule.placed.get(module.key)!.level; columns.set(level, [...(columns.get(level) ?? []), module.key]); }
  const pos = new Map<string, { x: number; y: number }>();
  for (const [level, keys] of columns) keys.forEach((key, index) => pos.set(key, { x: 8 + level * (W + GX), y: 8 + index * (H + GY) }));
  const width = 16 + Math.max(...columns.keys()) * (W + GX) + W;
  const height = 16 + Math.max(...[...columns.values()].map((keys) => keys.length)) * (H + GY) - GY;
  const critical = new Set(schedule.critical ?? []);
  const red = "#b3261e";
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)" }}>
      <svg width={width} height={height} role="img" aria-label={t("Граф модулей: что после чего")} style={{ display: "block" }}>
        <defs>
          <marker id="rm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#8a919c" /></marker>
          <marker id="rm-arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={red} /></marker>
        </defs>
        {value.modules.flatMap((module) => module.dependsOn.filter((key) => pos.has(key)).map((key) => {
          const from = pos.get(key)!; const to = pos.get(module.key)!;
          const hot = critical.has(key) && critical.has(module.key) && (schedule.critical!.indexOf(module.key) === schedule.critical!.indexOf(key) + 1);
          const x1 = from.x + W; const y1 = from.y + H / 2; const x2 = to.x - 2; const y2 = to.y + H / 2;
          return <path key={`${key}-${module.key}`} d={`M${x1},${y1} C${x1 + GX / 2},${y1} ${x2 - GX / 2},${y2} ${x2},${y2}`} fill="none" stroke={hot ? red : "#8a919c"} strokeWidth={hot ? 2.5 : 1.5} markerEnd={`url(#${hot ? "rm-arrow-red" : "rm-arrow"})`} />;
        }))}
        {value.modules.map((module) => {
          const { x, y } = pos.get(module.key)!; const placed = schedule.placed!.get(module.key)!; const hot = critical.has(module.key);
          return (
            <g key={module.key}>
              <rect x={x} y={y} width={W} height={H} rx={8} fill="var(--surface, #fff)" stroke={hot ? red : "#c3c8d0"} strokeWidth={hot ? 2.5 : 1.2} />
              <text x={x + 10} y={y + 24} fontSize={14} fontWeight={600} fill="var(--ink, #0d1117)">{module.name.length > 20 ? `${module.name.slice(0, 19)}…` : module.name}</text>
              <text x={x + 10} y={y + 46} fontSize={13} fill="var(--muted, #5b6270)">{t("{0} ч · с {1} по {2} ч", [placed.hours, placed.start, placed.finish])}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ModulesEditor({ value, onChange, options, disabled, findings }: { value: Roadmap; onChange: (next: Roadmap) => void; options: RoadmapOptions; disabled: boolean; findings: Finding[] }) {
  const [open, setOpen] = useState<string | null>(value.modules[0]?.key ?? null);
  const executors = executorLabels();
  const setModule = (key: string, patch: Partial<RoadmapModule>) => onChange({ ...value, modules: value.modules.map((module) => (module.key === key ? { ...module, ...patch } : module)) });
  const setTask = (module: RoadmapModule, index: number, patch: Partial<RoadmapTask>) => setModule(module.key, { tasks: module.tasks.map((task, position) => (position === index ? { ...task, ...patch } : task)) });
  const allTaskKeys = value.modules.flatMap((module) => module.tasks.map((task) => task.key));
  const general = findings.filter((finding) => finding.target === "modules");
  return (
    <>
      {general.length > 0 && (
        <section className={styles.card} aria-label={t("Что не попало в план")}>
          <p className={styles.cardTitle}>{t("Что не попало в план")}</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>{general.map((finding, index) => <li key={index}>{finding.message}</li>)}</ul>
        </section>
      )}
      {value.modules.map((module) => {
        const expanded = open === module.key;
        const hours = module.tasks.reduce((sum, task) => sum + (Number(task.hours) || 0), 0);
        const issues = findings.filter((finding) => finding.target === module.key);
        return (
          <section key={module.key} className={styles.card} aria-label={module.name}>
            <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : module.key)} style={{ all: "unset", cursor: "pointer", display: "grid", gap: 4, width: "100%", minHeight: 44 }}>
              <span className={styles.cardTitle} style={{ margin: 0 }}>{module.name || t("Без названия")}</span>
              <span className={styles.small}>{t("Задач: {0}, {1} ч", [module.tasks.length, hours])} · {executors[module.executor]}{module.dependsOn.length ? ` · ${t("ждёт")}: ${module.dependsOn.map((key) => value.modules.find((item) => item.key === key)?.name ?? key).join(", ")}` : ""}</span>
              {issues.length > 0 && <span className={styles.small} style={{ color: "#b3261e" }}>{issues.map((issue) => issue.message).join(" ")}</span>}
            </button>
            {expanded && (
              <div style={{ marginTop: 14 }}>
                <label className={styles.field}><span className={styles.label}>{t("Название")}</span>
                  <input className={styles.input} value={module.name} maxLength={60} disabled={disabled} onChange={(event) => setModule(module.key, { name: event.target.value })} /></label>
                <label className={styles.field}><span className={styles.label}>{t("Что входит")}</span>
                  <input className={styles.input} value={module.summary} maxLength={300} disabled={disabled} onChange={(event) => setModule(module.key, { summary: event.target.value })} /></label>
                <div className={styles.row} style={{ alignItems: "flex-end" }}>
                  <label className={styles.field} style={{ flex: "1 1 200px" }}><span className={styles.label}>{t("Кто делает")}</span>
                    <select className={styles.select} value={module.executor} disabled={disabled} onChange={(event) => setModule(module.key, { executor: event.target.value as Executor })}>
                      {options.executors.map((executor) => <option key={executor} value={executor}>{executors[executor]}</option>)}
                    </select></label>
                  <label className={styles.field} style={{ flex: "1 1 200px" }}><span className={styles.label}>{t("Модуль контрактов")}</span>
                    <select className={styles.select} value={module.contractModule ?? ""} disabled={disabled} onChange={(event) => setModule(module.key, { contractModule: event.target.value || null })}>
                      <option value="">{t("нет — общий")}</option>
                      {options.contractModules.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
                    </select></label>
                </div>
                <fieldset style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
                  <legend className={styles.label} style={{ marginBottom: 6 }}>{t("Начинается после")}</legend>
                  <div className={styles.row}>
                    {value.modules.filter((other) => other.key !== module.key).map((other) => (
                      <label key={other.key} className={styles.row} style={{ gap: 6, minHeight: 40 }}>
                        <input type="checkbox" checked={module.dependsOn.includes(other.key)} disabled={disabled}
                          onChange={(event) => setModule(module.key, { dependsOn: event.target.checked ? [...module.dependsOn, other.key] : module.dependsOn.filter((key) => key !== other.key) })} />
                        <span>{other.name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <p className={styles.label} style={{ margin: "0 0 6px" }}>{t("Задачи")}</p>
                {module.tasks.map((task, index) => (
                  <article key={task.key} className={styles.section} style={{ paddingTop: 10, paddingBottom: 10 }}>
                    <label className={styles.field}><span className={styles.label}>{t("Задача")}</span>
                      <input className={styles.input} value={task.title} maxLength={160} disabled={disabled} onChange={(event) => setTask(module, index, { title: event.target.value })} /></label>
                    <div className={styles.row} style={{ alignItems: "flex-end" }}>
                      <label className={styles.field} style={{ flex: "1 1 100px" }}><span className={styles.label}>{t("Выпуск")}</span>
                        <select className={styles.select} value={task.release} disabled={disabled} onChange={(event) => setTask(module, index, { release: Number(event.target.value) })}>
                          {[1, 2, 3].map((release) => <option key={release} value={release}>{release}</option>)}
                        </select></label>
                      <label className={styles.field} style={{ flex: "1 1 100px" }}><span className={styles.label}>{t("Часов")}</span>
                        <input className={styles.input} type="number" min={0} max={options.limits.hours} step={0.5} value={task.hours} disabled={disabled} aria-invalid={!(task.hours > 0)} onChange={(event) => setTask(module, index, { hours: Number(event.target.value) || 0 })} /></label>
                      <label className={styles.field} style={{ flex: "1 1 120px" }}><span className={styles.label}>{t("Запросов к ИИ")}</span>
                        <input className={styles.input} type="number" min={0} max={options.limits.requests} value={task.aiRequests} disabled={disabled} onChange={(event) => setTask(module, index, { aiRequests: Math.round(Number(event.target.value) || 0) })} /></label>
                    </div>
                    <label className={styles.field}><span className={styles.label}>{t("Функция ТЗ")}</span>
                      <select className={styles.select} value={task.feature ?? ""} disabled={disabled} onChange={(event) => setTask(module, index, { feature: event.target.value || null })}>
                        <option value="">{t("нет — техническая задача")}</option>
                        {options.features.map((feature) => <option key={feature.key} value={feature.key}>{feature.title}</option>)}
                      </select></label>
                    {!disabled && <button type="button" className={styles.ghost} onClick={() => setModule(module.key, { tasks: module.tasks.filter((_, position) => position !== index) })}>{t("Убрать задачу")}</button>}
                  </article>
                ))}
                {!disabled && module.tasks.length < options.limits.tasks && (
                  <button type="button" className={styles.secondary} onClick={() => setModule(module.key, { tasks: [...module.tasks, { key: freeKey("t", allTaskKeys), title: "", feature: null, release: 1, hours: 2, aiRequests: 2 }] })}>{t("Добавить задачу")}</button>
                )}
                {!disabled && value.modules.length > 1 && (
                  <div style={{ marginTop: 14 }}>
                    <button type="button" className={styles.danger} onClick={() => onChange({ ...value, modules: value.modules.filter((item) => item.key !== module.key).map((item) => ({ ...item, dependsOn: item.dependsOn.filter((key) => key !== module.key) })), risks: value.risks.map((risk) => (risk.module === module.key ? { ...risk, module: null } : risk)) })}>{t("Убрать модуль")}</button>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
      {!disabled && value.modules.length < options.limits.modules && (
        <button type="button" className={styles.secondary} onClick={() => { const key = freeKey("m", value.modules.map((item) => item.key)); onChange({ ...value, modules: [...value.modules, { key, name: t("Новый модуль"), summary: "", contractModule: null, dependsOn: value.modules[0] ? [value.modules[0].key] : [], executor: "ai_supervised", tasks: [] }] }); setOpen(key); }}>{t("Добавить модуль")}</button>
      )}
    </>
  );
}

function RisksEditor({ value, onChange, options, disabled }: { value: Roadmap; onChange: (next: Roadmap) => void; options: RoadmapOptions; disabled: boolean }) {
  const set = (index: number, patch: Partial<RoadmapRisk>) => onChange({ ...value, risks: value.risks.map((risk, position) => (position === index ? { ...risk, ...patch } : risk)) });
  return (
    <section className={styles.card} aria-labelledby="risks-title">
      <p id="risks-title" className={styles.cardTitle}>{t("Риски")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Что может сорвать срок или бюджет и что вы сделаете. Черновик берёт риски из разбора идеи.")}</p>
      {value.risks.length === 0 && <p className={styles.small}>{t("Рисков пока нет.")}</p>}
      {value.risks.map((risk, index) => (
        <article key={risk.key} className={styles.section}>
          <label className={styles.field}><span className={styles.label}>{t("Риск")}</span>
            <input className={styles.input} value={risk.text} maxLength={300} disabled={disabled} onChange={(event) => set(index, { text: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.label}>{t("Что сделаем")}</span>
            <input className={styles.input} value={risk.action} maxLength={300} disabled={disabled} aria-invalid={!risk.action} onChange={(event) => set(index, { action: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.label}>{t("Какой модуль затрагивает")}</span>
            <select className={styles.select} value={risk.module ?? ""} disabled={disabled} onChange={(event) => set(index, { module: event.target.value || null })}>
              <option value="">{t("весь проект")}</option>
              {value.modules.map((module) => <option key={module.key} value={module.key}>{module.name}</option>)}
            </select></label>
          {!disabled && <button type="button" className={styles.danger} onClick={() => onChange({ ...value, risks: value.risks.filter((_, position) => position !== index) })}>{t("Убрать риск")}</button>}
        </article>
      ))}
      {!disabled && value.risks.length < options.limits.risks && (
        <button type="button" className={styles.secondary} onClick={() => onChange({ ...value, risks: [...value.risks, { key: freeKey("r", value.risks.map((risk) => risk.key)), text: "", action: "", module: null }] })}>{t("Добавить риск")}</button>
      )}
    </section>
  );
}

type TaskStatus = "not_started" | "in_progress" | "review" | "done" | "done_with_note" | "blocked";
type ProgressTask = { key: string; title: string; release: number; hours: number; status: TaskStatus; assigneeUserId: string | null; assignee: string | null; dueDate: string | null; note: string | null; blockedBy: string | null; late: boolean; checks: { total: number; passed: number } };
type Progress = {
  progress: number; hoursDone: number; hoursTotal: number; criticalPath: string[]; expectedFinish: string; remainingCriticalHours: number;
  spent: { aiRequests: number; specialistHours: number }; planned: { aiRequests: number; hours: number };
  blocked: Array<{ key: string; title: string; module: string; blockedBy: string | null }>; late: Array<{ key: string; title: string; module: string; dueDate: string | null; critical: boolean }>;
  next: { key: string; title: string; module: string } | null; canEdit: boolean; people: Array<{ userId: string; name: string }>;
  modules: Array<{ key: string; name: string; critical: boolean; progress: number; hoursDone: number; hoursTotal: number; tasks: ProgressTask[] }>;
};
const statusLabels = (): Record<TaskStatus, string> => ({ not_started: t("не начата"), in_progress: t("в работе"), review: t("на проверке"), done: t("готова"), done_with_note: t("готова с замечанием"), blocked: t("заблокирована") });
const statusColor: Record<TaskStatus, string> = { not_started: "#5b6270", in_progress: "#2f55d4", review: "#7a4500", done: "#1d7a46", done_with_note: "#1d7a46", blocked: "#b3261e" };
const taskErrors = (): Record<string, string> => ({
  TASK_NEEDS_CHECKS: t("«Готова» ставится только по зелёным проверкам задачи, а у этой задачи нет кейсов в плане проверки. Выберите «готова с замечанием» и напишите, почему её можно считать сделанной."),
  TASK_CHECKS_NOT_PASSED: t("Не все кейсы этой задачи пройдены. Отметьте результаты в «Плане проверки» или выберите «готова с замечанием» с объяснением."),
  TASK_NOTE_REQUIRED: t("Для «готова с замечанием» напишите причину — хотя бы 10 символов."),
  TASK_BLOCKER_REQUIRED: t("Напишите, что или кого ждёт задача."),
  TASK_ASSIGNEE_NOT_IN_PROJECT: t("Этот человек не участвует в проекте."),
  ROADMAP_NOT_APPROVED: t("План ещё не утверждён."),
});
const date = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long" });

function ProgressView({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => { try { setData(await api<Progress>(`/projects/${projectId}/roadmap/progress`)); } catch (caught) { setError(explainError(caught)); } }, [projectId]);
  useEffect(() => { void load(); }, [load]);
  if (error && !data) return <section className={styles.card}><p style={{ margin: 0, color: "#b3261e" }}>{error}</p></section>;
  if (!data) return <section className={styles.card}><p className={styles.small} style={{ margin: 0 }}>{t("Загружаем ход работ…")}</p></section>;
  /** The reason a save was refused, shown next to the task it is about; empty when saved. */
  const save = async (task: string, body: Record<string, unknown>): Promise<string> => {
    try { setData(await api<Progress>(`/projects/${projectId}/roadmap/tasks/${task}`, { method: "PUT", body: JSON.stringify(body) })); return ""; } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      return taskErrors()[code] ?? explainError(caught);
    }
  };
  const statuses = statusLabels();
  return (
    <>
      <section className={styles.card} aria-labelledby="progress-title">
        <p id="progress-title" className={styles.cardTitle}>{t("Ход работ")}</p>
        <Bar value={data.progress} />
        <p style={{ margin: "8px 0 4px" }}>{t("Готово {0}% — {1} из {2} ч по оценкам.", [data.progress, data.hoursDone, data.hoursTotal])}</p>
        <p className={styles.small} style={{ margin: "0 0 4px" }}>{t("Ожидаемое окончание — {0}: на критическом пути осталось {1} ч.", [date(data.expectedFinish), data.remainingCriticalHours])}</p>
        <p className={styles.small} style={{ margin: 0 }}>{t("Потрачено с утверждения: {0} запросов к ИИ из ~{1}, {2} ч специалистов по табелю (в плане — {3} ч работы).", [data.spent.aiRequests, data.planned.aiRequests, data.spent.specialistHours, data.planned.hours])}</p>
        {data.next && <p style={{ margin: "10px 0 0" }}><strong>{t("Следующая важная задача")}:</strong> {data.next.title} <span className={styles.small}>({data.next.module})</span></p>}
        <p className={styles.small} style={{ margin: "10px 0 0" }}>{t("«Готова» ставится, только когда все кейсы задачи из плана проверки пройдены. Иначе задачу закрывают «готова с замечанием» с объяснением.")}</p>
      </section>
      {(data.blocked.length > 0 || data.late.length > 0) && (
        <section className={styles.card} aria-label={t("Что мешает")} style={{ borderColor: "#ecc7c7" }}>
          <p className={styles.cardTitle}>{t("Что мешает")}</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {data.blocked.map((task) => <li key={`b-${task.key}`}>{t("«{0}» ({1}) ждёт: {2}", [task.title, task.module, task.blockedBy ?? "—"])}</li>)}
            {data.late.map((task) => <li key={`l-${task.key}`}>{t("«{0}» ({1}) опаздывает: срок был {2}", [task.title, task.module, task.dueDate ? date(task.dueDate) : "—"])}{task.critical ? ` — ${t("на критическом пути, сдвигает весь выпуск")}` : ""}</li>)}
          </ul>
        </section>
      )}
      {data.modules.map((module) => (
        <section key={module.key} className={styles.card} aria-label={module.name} style={module.critical ? { borderColor: "#e3b3b0" } : undefined}>
          <p className={styles.cardTitle} style={{ marginBottom: 6 }}>{module.name}{module.critical ? <span className={styles.small} style={{ color: "#b3261e", fontWeight: 400 }}> · {t("критический путь")}</span> : null}</p>
          <Bar value={module.progress} />
          <p className={styles.small} style={{ margin: "6px 0 8px" }}>{t("{0}% — {1} из {2} ч", [module.progress, module.hoursDone, module.hoursTotal])}</p>
          {module.tasks.map((task) => (
            <TaskRow key={task.key} task={task} statuses={statuses} people={data.people} canEdit={data.canEdit} open={open === task.key} onToggle={() => setOpen(open === task.key ? null : task.key)}
              onSave={async (body) => { const problem = await save(task.key, body); if (!problem) setOpen(null); return problem; }} />
          ))}
        </section>
      ))}
    </>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} style={{ height: 10, borderRadius: 5, background: "var(--sunken, #eceee9)", overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", background: "#1d7a46" }} />
    </div>
  );
}

function TaskRow({ task, statuses, people, canEdit, open, onToggle, onSave }: {
  task: ProgressTask; statuses: Record<TaskStatus, string>; people: Array<{ userId: string; name: string }>; canEdit: boolean; open: boolean; onToggle: () => void; onSave: (body: Record<string, unknown>) => Promise<string>;
}) {
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [note, setNote] = useState(task.note ?? "");
  const [blockedBy, setBlockedBy] = useState(task.blockedBy ?? "");
  const [assignee, setAssignee] = useState(task.assigneeUserId ?? "");
  const [due, setDue] = useState(task.dueDate ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  return (
    <article className={styles.section} style={{ paddingTop: 8, paddingBottom: 8 }}>
      <button type="button" aria-expanded={open} onClick={onToggle} disabled={!canEdit} style={{ all: "unset", cursor: canEdit ? "pointer" : "default", display: "grid", gap: 2, width: "100%", minHeight: 44 }}>
        <span>{task.title}</span>
        <span className={styles.small}>
          <span style={{ color: statusColor[task.status], fontWeight: 600 }}>{statuses[task.status]}</span>
          {` · ${t("{0} ч", [task.hours])} · ${t("выпуск {0}", [task.release])}`}{task.assignee ? ` · ${task.assignee}` : ""}{task.dueDate ? ` · ${t("до {0}", [date(task.dueDate)])}` : ""}
          {task.late ? <span style={{ color: "#b3261e" }}> · {t("опаздывает")}</span> : null}
          {` · ${t("проверок: {0} из {1}", [task.checks.passed, task.checks.total])}`}
        </span>
        {task.status === "done_with_note" && task.note && <span className={styles.small}>{t("Замечание")}: {task.note}</span>}
        {task.status === "blocked" && task.blockedBy && <span className={styles.small} style={{ color: "#b3261e" }}>{t("Ждёт")}: {task.blockedBy}</span>}
      </button>
      {open && canEdit && (
        <div style={{ marginTop: 10 }}>
          <div className={styles.row} style={{ alignItems: "flex-end" }}>
            <label className={styles.field} style={{ flex: "1 1 180px" }}><span className={styles.label}>{t("Статус")}</span>
              <select className={styles.select} value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
                {(Object.keys(statuses) as TaskStatus[]).map((key) => <option key={key} value={key}>{statuses[key]}</option>)}
              </select></label>
            <label className={styles.field} style={{ flex: "1 1 180px" }}><span className={styles.label}>{t("Исполнитель")}</span>
              <select className={styles.select} value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                <option value="">{t("никто")}</option>
                {people.map((person) => <option key={person.userId} value={person.userId}>{person.name}</option>)}
              </select></label>
            <label className={styles.field} style={{ flex: "1 1 150px" }}><span className={styles.label}>{t("Срок")}</span>
              <input className={styles.input} type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label>
          </div>
          {status === "done_with_note" && (
            <label className={styles.field}><span className={styles.label}>{t("Почему можно считать готовой без проверок")}</span>
              <textarea className={styles.textarea} rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></label>
          )}
          {status === "blocked" && (
            <label className={styles.field}><span className={styles.label}>{t("Что или кого ждёт")}</span>
              <input className={styles.input} maxLength={300} value={blockedBy} onChange={(event) => setBlockedBy(event.target.value)} /></label>
          )}
          <button type="button" className={styles.button} disabled={busy} onClick={async () => { setBusy(true); setProblem(""); setProblem(await onSave({ status, note: note || null, blockedBy: blockedBy || null, assigneeUserId: assignee || null, dueDate: due || null })); setBusy(false); }}>
            {busy ? t("Сохраняем…") : t("Сохранить задачу")}
          </button>
          {problem && <p role="alert" style={{ color: "#b3261e", margin: "10px 0 0" }}>{problem}</p>}
        </div>
      )}
    </article>
  );
}
