"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { explainError } from "@/lib/journey";
import styles from "../../../journey.module.css";

// «План проверки» of a web application (builder-back src/journey/testplan.ts): cases by class, each an instruction for a
// person and a description for an automatic test, linked to the plan task it proves. After approval people record the
// results of cases checked by hand or in a browser; automatic cases get results from test runs only.

export type CaseClass = "normal" | "mistakes" | "edge" | "dishonest" | "rights" | "security" | "data_law" | "failures" | "load" | "devices";
export type CaseMethod = "auto" | "ai_browser" | "human";
export type TestCase = {
  key: string; title: string; class: CaseClass; actor: string | null; honest: boolean; given: string; steps: string[]; expected: string; mustNot: string;
  links: string[]; task: string | null; method: CaseMethod; blocking: boolean; source: "platform" | "owner" | "ai"; plain: string;
};
export type TestPlan = { cases: TestCase[]; skipped: Array<{ class: CaseClass; why: string }>; notes: string };
export type TestPlanOptions = {
  template: TestPlan | null; limits: { cases: number; steps: number }; classes: CaseClass[]; methods: CaseMethod[]; missing: "inputs" | null; markdown: string | null;
  roles: Array<{ key: string; name: string }>; features: Array<{ key: string; title: string; priority: string }>; tasks: Array<{ key: string; title: string; module: string }>;
  threats: Array<{ key: string; how: string }>; approved: boolean; results: Array<{ caseKey: string; status: "passed" | "failed"; note: string | null; planVersion: number; source: string; stale: boolean }>;
};
type Finding = { target: string | null; message: string };

export const classLabels = (): Record<CaseClass, string> => ({
  normal: t("Нормальный путь"), mistakes: t("Ошибки и невнимательность"), edge: t("Крайние случаи"), dishonest: t("Недобросовестный пользователь"), rights: t("Права и роли"),
  security: t("Безопасность"), data_law: t("Данные и закон"), failures: t("Сбои и восстановление"), load: t("Нагрузка и скорость"), devices: t("Устройства и доступность"),
});
const methodLabels = (): Record<CaseMethod, string> => ({ auto: t("автотест"), ai_browser: t("ИИ-агент в браузере"), human: t("человек") });

type Tab = "plain" | "cases" | "results";

export function TestPlanEditor({ projectId, value, onChange, options, disabled, findings, onRebuild }: {
  projectId: string; value: TestPlan; onChange: (next: TestPlan) => void; options: TestPlanOptions; disabled: boolean; findings: Finding[]; onRebuild: (() => void) | null;
}) {
  const [tab, setTab] = useState<Tab>(options.approved ? "results" : "plain");
  const labels = classLabels();
  const tabs: Array<[Tab, string, string | null]> = [
    ...(options.approved ? [["results", t("Результаты"), null] as [Tab, string, null]] : []),
    ["plain", t("Простыми словами"), null],
    ["cases", t("Кейсы"), findings.length ? "!" : String(value.cases.length)],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
      <div role="tablist" aria-label={t("Разделы плана проверки")} style={{ display: "flex", gap: 6, overflowX: "auto", position: "sticky", top: 52, zIndex: 3, background: "var(--bg, #f6f7f5)", padding: "6px 0" }}>
        {tabs.map(([key, label, badge]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? styles.button : styles.secondary} style={{ minHeight: 40, padding: "4px 12px", whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => setTab(key)}>
            {label}{badge ? <span style={{ marginLeft: 6, opacity: 0.8, color: badge === "!" && tab !== key ? "#b3261e" : undefined }}>{badge}</span> : null}
          </button>
        ))}
      </div>
      {tab === "plain" && (
        <section className={styles.card} aria-labelledby="plain-title">
          <p id="plain-title" className={styles.cardTitle}>{t("Что мы проверим — простыми словами")}</p>
          {options.classes.map((kind) => {
            const own = value.cases.filter((item) => item.class === kind);
            const skipped = value.skipped.find((item) => item.class === kind);
            if (!own.length && !skipped) return null;
            return (
              <div key={kind} style={{ marginBottom: 14 }}>
                <p className={styles.label} style={{ margin: "0 0 6px" }}>{labels[kind]}</p>
                {own.length ? <ul style={{ margin: 0, paddingLeft: 20 }}>{own.map((item) => <li key={item.key}>{item.plain || item.title}{item.blocking ? <span className={styles.small}> · {t("блокирует запуск")}</span> : null}</li>)}</ul>
                  : <p className={styles.small} style={{ margin: 0 }}>{t("Не нужен")}: {skipped!.why}</p>}
              </div>
            );
          })}
          <p className={styles.small} style={{ margin: "8px 0 0" }}>{t("Автоматические проверки не заменяют аудит безопасности. Для продуктов с деньгами и личными данными мы рекомендуем специалиста по безопасности.")}</p>
        </section>
      )}
      {tab === "cases" && <CasesEditor value={value} onChange={onChange} options={options} disabled={disabled} findings={findings} />}
      {tab === "results" && <ResultsView projectId={projectId} value={value} options={options} />}
      {onRebuild && options.template && tab !== "results" && (
        <section className={styles.card} aria-label={t("Собрать заново")}>
          <p className={styles.small} style={{ marginTop: 0 }}>{t("Если ТЗ, архитектура или план изменились, кейсы можно собрать заново. Ваши правки заменятся черновиком платформы — до сохранения их можно вернуть, обновив страницу.")}</p>
          <button type="button" className={styles.secondary} disabled={disabled} onClick={onRebuild}>{t("Собрать кейсы заново")}</button>
        </section>
      )}
    </div>
  );
}

function CasesEditor({ value, onChange, options, disabled, findings }: { value: TestPlan; onChange: (next: TestPlan) => void; options: TestPlanOptions; disabled: boolean; findings: Finding[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const labels = classLabels();
  const methods = methodLabels();
  const set = (key: string, patch: Partial<TestCase>) => onChange({ ...value, cases: value.cases.map((item) => (item.key === key ? { ...item, ...patch } : item)) });
  const general = findings.filter((finding) => !finding.target || finding.target === "cases");
  const add = (kind: CaseClass) => {
    let index = value.cases.length + 1;
    while (value.cases.some((item) => item.key === `c${index}`)) index += 1;
    const key = `c${index}`;
    onChange({ ...value, cases: [...value.cases, { key, title: t("Новый кейс"), class: kind, actor: null, honest: kind !== "dishonest", given: "", steps: [""], expected: "", mustNot: "", links: [], task: null, method: "auto", blocking: false, source: "owner", plain: "" }] });
    setOpen(key);
  };
  return (
    <>
      {general.length > 0 && (
        <section className={styles.card} aria-label={t("Что не покрыто")}>
          <p className={styles.cardTitle}>{t("Что не покрыто")}</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>{general.map((finding, index) => <li key={index}>{finding.message}</li>)}</ul>
        </section>
      )}
      {options.classes.map((kind) => {
        const own = value.cases.filter((item) => item.class === kind);
        const skipped = value.skipped.find((item) => item.class === kind);
        const classIssue = findings.find((finding) => finding.target === kind);
        return (
          <section key={kind} className={styles.card} aria-label={labels[kind]}>
            <p className={styles.cardTitle}>{labels[kind]} <span className={styles.small} style={{ fontWeight: 400 }}>· {own.length}</span></p>
            {classIssue && <p className={styles.small} style={{ color: "#7a4500", marginTop: 0 }}>{classIssue.message}</p>}
            {own.map((item) => {
              const expanded = open === item.key;
              const issues = findings.filter((finding) => finding.target === item.key);
              return (
                <article key={item.key} className={styles.section} style={{ paddingTop: 8, paddingBottom: 8 }}>
                  <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : item.key)} style={{ all: "unset", cursor: "pointer", display: "grid", gap: 2, width: "100%", minHeight: 44 }}>
                    <span>{item.title}</span>
                    <span className={styles.small}>{methods[item.method]}{item.blocking ? ` · ${t("блокирует запуск")}` : ""}{item.honest ? "" : ` · ${t("недобросовестный")}`}{item.source === "owner" ? ` · ${t("добавлен вручную")}` : ""}</span>
                    {issues.length > 0 && <span className={styles.small} style={{ color: "#b3261e" }}>{issues.map((issue) => issue.message).join(" ")}</span>}
                  </button>
                  {expanded && (
                    <div style={{ marginTop: 10 }}>
                      <label className={styles.field}><span className={styles.label}>{t("Название")}</span>
                        <input className={styles.input} value={item.title} maxLength={160} disabled={disabled} onChange={(event) => set(item.key, { title: event.target.value })} /></label>
                      <div className={styles.row} style={{ alignItems: "flex-end" }}>
                        <label className={styles.field} style={{ flex: "1 1 160px" }}><span className={styles.label}>{t("Кто действует")}</span>
                          <select className={styles.select} value={item.actor ?? ""} disabled={disabled} onChange={(event) => set(item.key, { actor: event.target.value || null })}>
                            <option value="">{t("посторонний или система")}</option>
                            {options.roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
                          </select></label>
                        <label className={styles.row} style={{ gap: 6, minHeight: 44, marginBottom: 18 }}>
                          <input type="checkbox" checked={!item.honest} disabled={disabled} onChange={(event) => set(item.key, { honest: !event.target.checked })} />
                          <span>{t("недобросовестный")}</span>
                        </label>
                      </div>
                      <label className={styles.field}><span className={styles.label}>{t("Дано")}</span>
                        <input className={styles.input} value={item.given} maxLength={400} disabled={disabled} onChange={(event) => set(item.key, { given: event.target.value })} /></label>
                      <fieldset style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
                        <legend className={styles.label} style={{ marginBottom: 6 }}>{t("Когда — шаги по порядку")}</legend>
                        {item.steps.map((step, index) => (
                          <div key={index} className={styles.row} style={{ marginBottom: 6, flexWrap: "nowrap" }}>
                            <span className={styles.small} style={{ width: 20 }}>{index + 1}.</span>
                            <input className={styles.input} style={{ flex: 1, minWidth: 0 }} value={step} maxLength={300} disabled={disabled} aria-label={t("Шаг {0}", [index + 1])}
                              onChange={(event) => set(item.key, { steps: item.steps.map((one, position) => (position === index ? event.target.value : one)) })} />
                            {!disabled && <button type="button" className={styles.ghost} aria-label={t("Убрать шаг")} onClick={() => set(item.key, { steps: item.steps.filter((_, position) => position !== index) })}>✕</button>}
                          </div>
                        ))}
                        {!disabled && item.steps.length < options.limits.steps && <button type="button" className={styles.ghost} onClick={() => set(item.key, { steps: [...item.steps, ""] })}>{t("Добавить шаг")}</button>}
                      </fieldset>
                      <label className={styles.field}><span className={styles.label}>{t("Тогда — что должно получиться")}</span>
                        <textarea className={styles.textarea} rows={2} value={item.expected} maxLength={400} disabled={disabled} aria-invalid={!item.expected} onChange={(event) => set(item.key, { expected: event.target.value })} /></label>
                      <label className={styles.field}><span className={styles.label}>{t("Что не должно произойти")}</span>
                        <input className={styles.input} value={item.mustNot} maxLength={400} disabled={disabled} onChange={(event) => set(item.key, { mustNot: event.target.value })} /></label>
                      <label className={styles.field}><span className={styles.label}>{t("Простыми словами для владельца")}</span>
                        <input className={styles.input} value={item.plain} maxLength={300} disabled={disabled} placeholder={t("Мы проверим, что …")} onChange={(event) => set(item.key, { plain: event.target.value })} /></label>
                      <div className={styles.row} style={{ alignItems: "flex-end" }}>
                        <label className={styles.field} style={{ flex: "1 1 160px" }}><span className={styles.label}>{t("Как проверяется")}</span>
                          <select className={styles.select} value={item.method} disabled={disabled} onChange={(event) => set(item.key, { method: event.target.value as CaseMethod })}>
                            {options.methods.map((method) => <option key={method} value={method}>{methods[method]}</option>)}
                          </select></label>
                        <label className={styles.field} style={{ flex: "2 1 220px" }}><span className={styles.label}>{t("Задача плана")}</span>
                          <select className={styles.select} value={item.task ?? ""} disabled={disabled} onChange={(event) => set(item.key, { task: event.target.value || null })}>
                            <option value="">{t("не привязан")}</option>
                            {options.tasks.map((task) => <option key={task.key} value={task.key}>{task.module}: {task.title}</option>)}
                          </select></label>
                      </div>
                      <label className={styles.row} style={{ gap: 6, minHeight: 44, marginBottom: 10 }}>
                        <input type="checkbox" checked={item.blocking} disabled={disabled} onChange={(event) => set(item.key, { blocking: event.target.checked })} />
                        <span>{t("Блокирует запуск, если не пройден")}</span>
                      </label>
                      {item.links.length > 0 && <p className={styles.small} style={{ margin: "0 0 10px" }}>{t("Проверяет")}: {item.links.map((link) => describeLink(link, options)).join("; ")}</p>}
                      {!disabled && <button type="button" className={styles.danger} onClick={() => { onChange({ ...value, cases: value.cases.filter((one) => one.key !== item.key) }); setOpen(null); }}>{t("Убрать кейс")}</button>}
                    </div>
                  )}
                </article>
              );
            })}
            {own.length === 0 && (
              <label className={styles.field}><span className={styles.label}>{t("Почему этот класс не нужен")}</span>
                <input className={styles.input} value={skipped?.why ?? ""} maxLength={300} disabled={disabled} placeholder={t("Например: в первой версии нет внешних сервисов")}
                  onChange={(event) => onChange({ ...value, skipped: [...value.skipped.filter((one) => one.class !== kind), ...(event.target.value ? [{ class: kind, why: event.target.value }] : [])] })} /></label>
            )}
            {!disabled && value.cases.length < options.limits.cases && <button type="button" className={styles.secondary} onClick={() => add(kind)}>{t("Добавить кейс")}</button>}
          </section>
        );
      })}
    </>
  );
}

function describeLink(link: string, options: TestPlanOptions): string {
  const [kind, target = ""] = link.split(":");
  if (kind === "feature") return t("функция «{0}»", [options.features.find((item) => item.key === target)?.title ?? target]);
  if (kind === "threat") return t("угроза «{0}»", [(options.threats.find((item) => item.key === target)?.how ?? target).slice(0, 60)]);
  if (kind === "access") { const [role, data] = target.split("."); return t("права роли «{0}» на «{1}»", [options.roles.find((item) => item.key === role)?.name ?? role ?? "", data ?? ""]); }
  if (kind === "quality") return t("требование ТЗ «{0}»", [target]);
  return link;
}

type Result = { status: "passed" | "failed"; note: string | null; source?: string; stale: boolean } | null;
const caseErrors = (): Record<string, string> => ({
  CASE_AUTOMATIC: t("Этот кейс проверяет автотест: результат придёт из прогона проверок, отметить его вручную нельзя."),
  CASE_NOTE_REQUIRED: t("Напишите, что именно не так, — хотя бы 10 символов."),
  TESTPLAN_NOT_APPROVED: t("План проверки ещё не утверждён."),
});

function ResultsView({ projectId, value, options }: { projectId: string; value: TestPlan; options: TestPlanOptions }) {
  const [results, setResults] = useState<Record<string, Result>>(() => Object.fromEntries(options.results.map((item) => [item.caseKey, { status: item.status, note: item.note, source: item.source, stale: item.stale }])));
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<{ key: string; text: string } | null>(null);
  const methods = methodLabels();
  const record = async (key: string, status: "passed" | "failed" | "not_run") => {
    setProblem(null);
    try {
      const data = await api<{ cases: Array<{ key: string; result: Result }> }>(`/projects/${projectId}/testplan/cases/${key}/result`, { method: "PUT", body: JSON.stringify({ status, note: note || null }) });
      setResults(Object.fromEntries(data.cases.map((item) => [item.key, item.result])));
      setOpen(null); setNote("");
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setProblem({ key, text: caseErrors()[code] ?? explainError(caught) });
    }
  };
  const manual = value.cases.filter((item) => item.method !== "auto");
  const passed = value.cases.filter((item) => results[item.key]?.status === "passed" && !results[item.key]?.stale).length;
  const failed = value.cases.filter((item) => results[item.key]?.status === "failed").length;
  return (
    <>
      <OwnerAcceptance projectId={projectId} value={value} />
      <BrowserRun projectId={projectId} value={value} onRecorded={(next) => setResults((current) => ({ ...current, ...next }))} />
      <section className={styles.card} aria-labelledby="results-title">
        <p id="results-title" className={styles.cardTitle}>{t("Результаты")}</p>
        <p style={{ margin: "0 0 6px" }}>{t("Пройдено {0} из {1}, не пройдено {2}.", [passed, value.cases.length, failed])}</p>
        <p className={styles.small} style={{ margin: 0 }}>{t("Кейсы, которые проверяет человек или ИИ-агент в браузере, отмечают здесь. Автотесты получат результат из прогона проверок, когда появится код модулей. Задача плана реализации становится «готова», только когда все её кейсы пройдены.")}</p>
      </section>
      {manual.length > 0 && (
        <section className={styles.card} aria-label={t("Проверяет человек")}>
          <p className={styles.cardTitle}>{t("Проверяет человек или ИИ-агент в браузере")}</p>
          {manual.map((item) => {
            const result = results[item.key] ?? null;
            const expanded = open === item.key;
            return (
              <article key={item.key} className={styles.section} style={{ paddingTop: 8, paddingBottom: 8 }}>
                <button type="button" aria-expanded={expanded} onClick={() => { setOpen(expanded ? null : item.key); setNote(""); }} style={{ all: "unset", cursor: "pointer", display: "grid", gap: 2, width: "100%", minHeight: 44 }}>
                  <span>{item.title}</span>
                  <span className={styles.small}>{methods[item.method]} · <ResultLabel result={result} /></span>
                </button>
                {expanded && (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ margin: "0 0 4px" }}><strong>{t("Дано")}:</strong> {item.given || "—"}</p>
                    <ol style={{ margin: "0 0 4px", paddingLeft: 22 }}>{item.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
                    <p style={{ margin: "0 0 4px" }}><strong>{t("Тогда")}:</strong> {item.expected}</p>
                    {item.mustNot && <p style={{ margin: "0 0 8px" }}><strong>{t("Не должно")}:</strong> {item.mustNot}</p>}
                    {result?.source === "browser" && result.note && <p className={styles.small} style={{ margin: "0 0 8px" }}>{t("ИИ-агент в браузере увидел")}: {result.note}</p>}
                    <label className={styles.field}><span className={styles.label}>{t("Что увидели (обязательно, если не работает)")}</span>
                      <input className={styles.input} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} /></label>
                    <div className={styles.row}>
                      <button type="button" className={styles.button} onClick={() => void record(item.key, "passed")}>{t("Работает")}</button>
                      <button type="button" className={styles.danger} onClick={() => void record(item.key, "failed")}>{t("Не работает")}</button>
                      {result && <button type="button" className={styles.ghost} onClick={() => void record(item.key, "not_run")}>{t("Сбросить")}</button>}
                    </div>
                    {problem?.key === item.key && <p role="alert" style={{ color: "#b3261e", margin: "8px 0 0" }}>{problem.text}</p>}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
      <section className={styles.card} aria-label={t("Автотесты")}>
        <p className={styles.cardTitle}>{t("Автотесты")}</p>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("Результат приходит из прогона: платформа сама запускает тесты, которые написал ИИ-агент, и отмечает кейсы по названиям тестов. Тесты пишет ИИ — прочитайте их или попросите специалиста проверить.")}</p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {value.cases.filter((item) => item.method === "auto").map((item) => <li key={item.key} style={{ marginBottom: 6 }}>{item.title} — <ResultLabel result={results[item.key] ?? null} /><CaseTest projectId={projectId} caseKey={item.key} /></li>)}
        </ul>
      </section>
    </>
  );
}

function ResultLabel({ result }: { result: Result }) {
  if (!result) return <span>{t("не проверен")}</span>;
  if (result.stale) return <span style={{ color: "#7a4500" }}>{t("проверен по старой версии — проверьте снова")}</span>;
  const by = result.source === "run" ? ` (${t("по прогону тестов")})` : result.source === "browser" ? ` (${t("ИИ-агент в браузере, на предпросмотре")})` : "";
  return result.status === "passed" ? <span style={{ color: "#1d7a46", fontWeight: 600 }}>{t("работает")}{by}</span>
    : <span style={{ color: "#b3261e", fontWeight: 600 }}>{t("не работает")}{by}{result.note ? `: ${result.note}` : ""}</span>;
}

type Verdict = "works" | "broken" | "remark";
type Acceptance = {
  acceptances: Array<{ caseKey: string; verdict: Verdict | null; note: string | null; stale: boolean }>;
  readiness: { blocking: { total: number; passed: number }; scenarios: { total: number; works: number }; openRemarks: number };
  canAccept: boolean;
};
const acceptanceErrors = (): Record<string, string> => ({
  ACCEPTANCE_NOTE_REQUIRED: t("Напишите, что не так или что поправить, — хотя бы 10 символов."),
  STAGE_ACCEPT_FORBIDDEN: t("Принимать сценарии может владелец или менеджер проекта."),
  TESTPLAN_NOT_APPROVED: t("План проверки ещё не утверждён."),
});

/**
 * «Приёмка владельцем»: the main scenarios — normal path and mistakes — tried on the test version. «Не работает» or a
 * remark becomes a task of the plan; «Работает» closes it. Readiness follows the test plan's rule for a launch.
 */
function OwnerAcceptance({ projectId, value }: { projectId: string; value: TestPlan }) {
  const [data, setData] = useState<Acceptance | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<{ key: string; text: string } | null>(null);
  const load = useCallback(async () => { try { setData(await api<Acceptance>(`/projects/${projectId}/testplan/acceptance`)); } catch { setData(null); } }, [projectId]);
  useEffect(() => { void load(); }, [load]);
  if (!data) return null;
  const send = async (caseKey: string, verdict: Verdict) => {
    setProblem(null);
    try {
      setData(await api<Acceptance>(`/projects/${projectId}/testplan/cases/${caseKey}/acceptance`, { method: "PUT", body: JSON.stringify({ verdict, note: note || null }) }));
      setOpen(null); setNote("");
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setProblem({ key: caseKey, text: acceptanceErrors()[code] ?? explainError(caught) });
    }
  };
  const { readiness } = data;
  const ready = readiness.blocking.passed === readiness.blocking.total && readiness.scenarios.works === readiness.scenarios.total && readiness.openRemarks === 0;
  const verdictLabel = (verdict: Verdict | null, stale: boolean) => stale ? <span style={{ color: "#7a4500" }}>{t("принято по старой версии — проверьте снова")}</span>
    : verdict === "works" ? <span style={{ color: "#1d7a46", fontWeight: 600 }}>{t("работает")}</span>
      : verdict === "broken" ? <span style={{ color: "#b3261e", fontWeight: 600 }}>{t("не работает")}</span>
        : verdict === "remark" ? <span style={{ color: "#7a4500", fontWeight: 600 }}>{t("есть замечание")}</span> : <span>{t("не проверено")}</span>;
  return (
    <>
      <section className={styles.card} aria-labelledby="ready-title" style={{ borderColor: ready ? "#d2eadb" : undefined }}>
        <p id="ready-title" className={styles.cardTitle}>{t("Готовность к запуску")}</p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>{t("Блокирующие кейсы пройдены: {0} из {1}", [readiness.blocking.passed, readiness.blocking.total])}</li>
          <li>{t("Главные сценарии приняты: {0} из {1}", [readiness.scenarios.works, readiness.scenarios.total])}</li>
          <li>{t("Открытых замечаний: {0}", [readiness.openRemarks])}</li>
        </ul>
        <p className={styles.small} style={{ margin: "8px 0 0" }}>{ready ? t("По плану проверки всё готово к запуску.") : t("Запуск — когда все блокирующие кейсы пройдены, главные сценарии приняты и замечаний не осталось.")}</p>
      </section>
      <section className={styles.card} aria-labelledby="accept-title">
        <p id="accept-title" className={styles.cardTitle}>{t("Приёмка владельцем")}</p>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("Пройдите главные сценарии в тестовой версии приложения и отметьте каждый. «Не работает» и замечание становятся задачей в плане реализации; когда всё поправят, отметьте «Работает».")}</p>
        {data.acceptances.map((item) => {
          const testCase = value.cases.find((one) => one.key === item.caseKey);
          if (!testCase) return null;
          const expanded = open === item.caseKey;
          return (
            <article key={item.caseKey} className={styles.section} style={{ paddingTop: 8, paddingBottom: 8 }}>
              <button type="button" aria-expanded={expanded} onClick={() => { setOpen(expanded ? null : item.caseKey); setNote(""); }} style={{ all: "unset", cursor: "pointer", display: "grid", gap: 2, width: "100%", minHeight: 44 }}>
                <span>{testCase.plain || testCase.title}</span>
                <span className={styles.small}>{verdictLabel(item.verdict, item.stale)}{item.note ? ` — ${item.note}` : ""}</span>
              </button>
              {expanded && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ margin: "0 0 4px" }}><strong>{t("Что сделать")}:</strong> {[testCase.given, ...testCase.steps].filter(Boolean).join(" → ")}</p>
                  <p style={{ margin: "0 0 8px" }}><strong>{t("Должно получиться")}:</strong> {testCase.expected}</p>
                  {data.canAccept ? (
                    <>
                      <label className={styles.field}><span className={styles.label}>{t("Что не так или что поправить (для «Не работает» и замечания)")}</span>
                        <input className={styles.input} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} /></label>
                      <div className={styles.row}>
                        <button type="button" className={styles.button} onClick={() => void send(item.caseKey, "works")}>{t("Работает")}</button>
                        <button type="button" className={styles.secondary} onClick={() => void send(item.caseKey, "remark")}>{t("Работает, есть замечание")}</button>
                        <button type="button" className={styles.danger} onClick={() => void send(item.caseKey, "broken")}>{t("Не работает")}</button>
                      </div>
                    </>
                  ) : <p className={styles.small} style={{ margin: 0 }}>{t("Принимать сценарии может владелец или менеджер проекта.")}</p>}
                  {problem?.key === item.caseKey && <p role="alert" style={{ color: "#b3261e", margin: "8px 0 0" }}>{problem.text}</p>}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </>
  );
}

type BrowserRunState = {
  run: { id: string; status: string; caseKeys: string[]; results: Array<{ key: string; status: "passed" | "failed" | "cannot_check"; observed: string }>; errorCode: string | null; createdAt: string; finishedAt: string | null } | null;
  preview: { id: string; createdAt: string } | null; configured: boolean; canStart: boolean;
};
const browserErrors = (): Record<string, string> => ({
  BROWSER_CASES_NOT_CONFIGURED: t("ИИ-агент в браузере не подключён на этом сервере."),
  PREVIEW_NOT_BUILT: t("Нет предпросмотра: сначала ИИ-агент должен собрать приложение или модуль."),
  NO_BROWSER_CASES: t("В плане проверки нет кейсов «ИИ-агент в браузере»."),
  BROWSER_CASES_RUNNING: t("Проверка в браузере уже идёт."),
  AI_DAILY_LIMIT_REACHED: t("Лимит запросов к ИИ на сегодня исчерпан."),
  BROWSER_CASES_BUDGET: t("Закончились деньги, выделенные на проверку: часть кейсов не проверена."),
  AGENT_MODEL_UNAVAILABLE: t("Модель ИИ перестала отвечать: часть кейсов не проверена."),
  BROWSER_CASES_INPUT_CHANGED: t("План проверки или предпросмотр изменились во время проверки. Запустите её снова."),
  BROWSER_CASES_INTERRUPTED: t("Проверка прервалась: сервер перезапустился. Запустите её снова."),
  BROWSER_CASES_FAILED: t("Проверка прервалась из-за внутренней ошибки."),
});

/**
 * The cases marked «ИИ-агент в браузере», checked by the agent in the newest preview: it looks at the screen, presses and
 * types, and says what it saw. The verdict is about the preview, not the production server.
 */
function BrowserRun({ projectId, value, onRecorded }: { projectId: string; value: TestPlan; onRecorded: (next: Record<string, Result>) => void }) {
  const [state, setState] = useState<BrowserRunState | null>(null);
  const [problem, setProblem] = useState("");
  const load = useCallback(async () => { try { setState(await api<BrowserRunState>(`/projects/${projectId}/testplan/browser-runs/latest`)); } catch { setState(null); } }, [projectId]);
  useEffect(() => { void load(); }, [load]);
  const active = Boolean(state?.run && ["queued", "running"].includes(state.run.status));
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [active, load]);
  useEffect(() => {
    if (!state?.run || active) return;
    const decided = state.run.results.filter((item) => item.status !== "cannot_check");
    if (decided.length) onRecorded(Object.fromEntries(decided.map((item) => [item.key, { status: item.status as "passed" | "failed", note: item.observed, source: "browser", stale: false }])));
    // Only when a run finishes; the parent keeps a person's own result when it was recorded later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.run?.id, active]);
  const browserCases = value.cases.filter((item) => item.method === "ai_browser");
  if (!state || !browserCases.length) return null;
  const start = async () => {
    setProblem("");
    try { await api(`/projects/${projectId}/testplan/browser-runs`, { method: "POST" }); await load(); } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setProblem(browserErrors()[code] ?? explainError(caught));
    }
  };
  const title = (key: string) => value.cases.find((item) => item.key === key)?.title ?? key;
  const label = (status: string) => status === "passed" ? <span style={{ color: "#1d7a46", fontWeight: 600 }}>{t("работает")}</span> : status === "failed" ? <span style={{ color: "#b3261e", fontWeight: 600 }}>{t("не работает")}</span> : <span style={{ color: "#7a4500" }}>{t("не удалось проверить")}</span>;
  return (
    <section className={styles.card} aria-labelledby="browser-title">
      <p id="browser-title" className={styles.cardTitle}>{t("ИИ-агент в браузере")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Агент открывает предпросмотр приложения на экране телефона, проходит кейсы как человек — смотрит, нажимает, вводит — и пишет, что увидел. Предпросмотр работает без сервера и без интернета, поэтому это проверка интерфейса и правил, а не рабочего сервера. Любой кейс можно перепроверить самому: ваш результат главнее.")}</p>
      <p style={{ margin: "0 0 8px" }}>{t("Кейсов для проверки в браузере: {0}.", [browserCases.length])}{state.preview ? "" : ` ${t("Предпросмотра пока нет.")}`}</p>
      {state.run && (
        <div style={{ margin: "0 0 10px" }}>
          <p className={styles.small} style={{ margin: "0 0 6px" }}>
            {active ? t("Агент проверяет кейсы в браузере…") : state.run.status === "succeeded" ? t("Последняя проверка закончена.") : t("Последняя проверка закончилась с ошибкой.")}
            {state.run.errorCode ? ` ${browserErrors()[state.run.errorCode] ?? ""}` : ""}
          </p>
          {state.run.results.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {state.run.results.map((item) => <li key={item.key} style={{ marginBottom: 4 }}>{title(item.key)} — {label(item.status)}{item.observed ? <span className={styles.small}>: {item.observed}</span> : null}</li>)}
            </ul>
          )}
        </div>
      )}
      {state.canStart && (
        <button type="button" className={styles.secondary} disabled={active || !state.configured || !state.preview} onClick={() => void start()}>
          {state.run ? t("Проверить в браузере ещё раз") : t("Проверить в браузере")}
        </button>
      )}
      {!state.configured && <p className={styles.small} style={{ margin: "6px 0 0" }}>{t("ИИ-агент в браузере не подключён на этом сервере.")}</p>}
      {problem && <p role="alert" style={{ color: "#b3261e", margin: "6px 0 0" }}>{problem}</p>}
    </section>
  );
}

/** «Код теста»: the agent's test whose name holds the case key, read on demand. */
function CaseTest({ projectId, caseKey }: { projectId: string; caseKey: string }) {
  const [tests, setTests] = useState<Array<{ path: string; line: number; code: string }> | null>(null);
  const [open, setOpen] = useState(false);
  const toggle = async () => {
    if (!open && tests === null) {
      try { setTests((await api<{ tests: Array<{ path: string; line: number; code: string }> }>(`/projects/${projectId}/testplan/cases/${caseKey}/test`)).tests); } catch { setTests([]); }
    }
    setOpen(!open);
  };
  return (
    <div>
      <button type="button" className={styles.ghost} style={{ minHeight: 36, padding: "0 6px" }} aria-expanded={open} onClick={() => void toggle()}>{open ? t("Скрыть код теста") : t("Код теста")}</button>
      {open && tests !== null && (tests.length ? tests.map((test) => (
        <div key={`${test.path}:${test.line}`} style={{ marginTop: 4 }}>
          <p className={styles.small} style={{ margin: "0 0 2px" }}>{test.path}, {t("строка {0}", [test.line])}</p>
          <pre style={{ maxWidth: "100%", overflow: "auto", background: "var(--sunken, #f1f2f0)", padding: 10, borderRadius: 8, fontSize: 14, lineHeight: 1.45, margin: 0 }}>{test.code}</pre>
        </div>
      )) : <p className={styles.small} style={{ margin: "4px 0 0" }}>{t("Теста с этим кейсом в названии нет: агент его ещё не написал или назвал иначе.")}</p>)}
    </div>
  );
}
