"use client";

// A module of the accepted plan as its own stage (PRODUCT_LIFECYCLE §4.9): what the module is, what it rests on, its tasks
// and cases as they stand now, the AI agent for this module, and the lead's words for the acceptance. Readiness comes from
// the cases and the platform's checks; the owner accepts the stage as any other.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { explainError } from "@/lib/journey";
import styles from "../../../journey.module.css";
import { agentErrors, agentStatus, statusColor, statusLabels, type TaskStatus } from "./roadmap-editor";

export type ModuleWork = { summary: string };
export type ModuleOptions = {
  key: string; name: string; summary: string; executor: "ai" | "ai_supervised" | "specialist" | null; critical: boolean; hours: number; removed: boolean;
  dependsOn: Array<{ key: string; name: string; stageKey: string | null; status: string | null }>;
  usedBy: Array<{ key: string; name: string; stageKey: string | null }>;
  facts: {
    tasks: Array<{ key: string; title: string; status: TaskStatus; cases: number; passed: number; failed: number; fromCase: string | null }>;
    cases: Array<{ key: string; title: string; task: string; method: "auto" | "ai_browser" | "human"; status: "passed" | "failed" | null; stale: boolean }>;
    agent: { taskId: string; status: string; checksFailed: number } | null;
  };
};
type AgentState = { configured: boolean; canStart: boolean; busy?: boolean; changeBase: string | null; latest: { id: string; status: string; statusLabel: string; createdAt: string; finishedAt: string | null } | null };

const executorLabel = (): Record<string, string> => ({ ai: t("ИИ-агент"), ai_supervised: t("ИИ-агент под присмотром специалиста"), specialist: t("специалист") });
const methodLabel = (): Record<string, string> => ({ auto: t("автотест"), ai_browser: t("ИИ-агент в браузере"), human: t("человек") });
const finished = (status: TaskStatus) => status === "done" || status === "done_with_note";

export function ModuleEditor({ projectId, value, onChange, options, disabled }: {
  projectId: string; value: ModuleWork; onChange: (next: ModuleWork) => void; options: ModuleOptions; disabled: boolean;
}) {
  const { facts } = options;
  const done = facts.tasks.filter((task) => finished(task.status)).length;
  const failed = facts.cases.filter((item) => item.status === "failed").length;
  const passed = facts.cases.filter((item) => item.status === "passed" && !item.stale).length;
  const labels = statusLabels();
  const methods = methodLabel();
  return (
    <>
      {options.removed && (
        <p className={`${styles.notice} ${styles.warn}`} role="status">{t("Этого модуля больше нет в принятом плане реализации. Сделанное сохранено; если модуль вернут в план, этап продолжится с того же места.")}</p>
      )}
      <section className={styles.card} aria-labelledby="module-about">
        <p className={styles.kicker}>{t("Модуль плана")}</p>
        <h2 id="module-about" className={styles.h2}>{options.name}</h2>
        {options.summary && <p style={{ margin: "0 0 8px" }}>{options.summary}</p>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {options.executor && <span className={`${styles.chip} ${styles.closed}`}>{t("Делает: {0}", [executorLabel()[options.executor] ?? options.executor])}</span>}
          <span className={`${styles.chip} ${styles.closed}`}>{t("Оценка: {0} ч", [options.hours])}</span>
          {options.critical && <span className={`${styles.chip} ${styles.alert}`}>{t("на критическом пути")}</span>}
        </div>
        {options.dependsOn.length > 0 && (
          <p className={styles.small} style={{ margin: "10px 0 0" }}>
            {t("Опирается на:")}{" "}
            {options.dependsOn.map((item, index) => (
              <span key={item.key}>{index ? ", " : ""}{item.stageKey ? <a href={`/projects/${projectId}/stages/${item.stageKey}`}>{item.name}</a> : item.name}{item.status === "approved" ? t(" (принят)") : ""}</span>
            ))}
            {". "}{t("Их контракты зафиксированы, код этих модулей отсюда не меняется.")}
          </p>
        )}
        {options.usedBy.length > 0 && (
          <p className={styles.small} style={{ margin: "6px 0 0" }}>
            {t("На него опираются:")}{" "}
            {options.usedBy.map((item, index) => <span key={item.key}>{index ? ", " : ""}{item.stageKey ? <a href={`/projects/${projectId}/stages/${item.stageKey}`}>{item.name}</a> : item.name}</span>)}
          </p>
        )}
      </section>

      <ModuleAgentCard projectId={projectId} moduleKey={options.key} />

      <section className={styles.card} aria-labelledby="module-tasks">
        <p id="module-tasks" className={styles.cardTitle} style={{ margin: 0 }}>{t("Задачи: готово {0} из {1}", [done, facts.tasks.length])}</p>
        <p className={styles.small} style={{ margin: "4px 0 8px" }}>{t("Задача готова, когда её кейсы проходят. Статусы, исполнителей и сроки задач меняют в «Плане реализации».")}{" "}<a href={`/projects/${projectId}/stages/roadmap`}>{t("Открыть план")}</a></p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {facts.tasks.map((task) => (
            <li key={task.key} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <span style={{ display: "block" }}>{task.title}</span>
              <span className={styles.small}>
                {task.fromCase ? <span style={{ color: "#7a4500" }}>{t("замечание владельца")} · </span> : null}
                <span style={{ color: statusColor[task.status], fontWeight: 600 }}>{labels[task.status]}</span>
                {task.cases ? <> · {t("кейсов пройдено {0} из {1}", [task.passed, task.cases])}{task.failed ? <span style={{ color: "#b3261e" }}> · {t("не проходят: {0}", [task.failed])}</span> : null}</> : !task.fromCase ? <> · {t("нет кейсов")}</> : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.card} aria-labelledby="module-cases">
        <p id="module-cases" className={styles.cardTitle} style={{ margin: 0 }}>{t("Кейсы проверки: пройдено {0} из {1}", [passed, facts.cases.length])}{failed ? t(", не проходят: {0}", [failed]) : ""}</p>
        {facts.cases.length === 0 ? <p className={styles.small}>{t("У задач модуля нет кейсов в плане проверки.")}</p> : (
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 6 }}>
            {facts.cases.map((item) => (
              <li key={item.key} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <span className={`${styles.chip} ${styles[item.status === "passed" && !item.stale ? "done" : item.status === "failed" ? "alert" : "closed"]}`} style={{ marginTop: 0 }}>
                  {item.status === "passed" ? (item.stale ? t("проверить снова") : t("работает")) : item.status === "failed" ? t("не работает") : t("не проверен")}
                </span>
                <span style={{ flex: "1 1 200px" }}>{item.title} <span className={styles.small}>· {methods[item.method] ?? item.method}</span></span>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.small} style={{ margin: "8px 0 0" }}><a href={`/projects/${projectId}/stages/testplan`}>{t("Открыть план проверки")}</a>{" "}{t("— там отмечают кейсы, которые проверяют люди.")}</p>
      </section>

      <section className={styles.card} aria-labelledby="module-summary">
        <label className={styles.field} style={{ margin: 0 }}>
          <span id="module-summary" className={styles.label}>{t("Что сделано — для приёмки")}</span>
          <span className={styles.small}>{t("Коротко: что готово, что посмотреть, что осталось. Необязательно — готовность и так видна по кейсам.")}</span>
          <textarea className={styles.input} rows={4} maxLength={2000} value={value.summary ?? ""} disabled={disabled} onChange={(event) => onChange({ summary: event.target.value })} />
        </label>
      </section>
    </>
  );
}

/** The AI agent for this module: the platform writes its task from the plan, the contracts and the cases. */
function ModuleAgentCard({ projectId, moduleKey }: { projectId: string; moduleKey: string }) {
  const [state, setState] = useState<AgentState | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const base = `/projects/${projectId}/agent/tasks`;
  const load = useCallback(async () => {
    try { setState(await api<AgentState>(`${base}?module=${encodeURIComponent(moduleKey)}`)); } catch (caught) { setProblem(explainError(caught)); }
  }, [base, moduleKey]);
  useEffect(() => { void load(); }, [load]);
  const active = Boolean(state?.latest && ["queued", "running"].includes(state.latest.status));
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(timer);
  }, [active, load]);
  const start = async () => {
    setBusy(true); setProblem("");
    try {
      // The newest code of the project is what the module is built on; without it the agent starts the application.
      const all = await api<{ changeBase: string | null }>(base);
      await api(base, { method: "POST", body: JSON.stringify(all.changeBase ? { kind: "change_app", baseTaskId: all.changeBase, module: moduleKey } : { kind: "build_app", module: moduleKey }) });
      await load();
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setProblem(agentErrors()[code] ?? explainError(caught));
    } finally { setBusy(false); }
  };
  const labels = agentStatus();
  return (
    <section className={styles.card} aria-labelledby="module-agent">
      <p id="module-agent" className={styles.cardTitle} style={{ margin: 0 }}>{t("ИИ-агент для модуля")}</p>
      {!state ? <p className={styles.small}>{problem || t("Загружаем…")}</p> : (
        <>
          {state.latest ? (
            <p style={{ margin: "6px 0" }}>
              {labels[state.latest.status] ?? state.latest.statusLabel}
              <span className={styles.small}> · {new Date(state.latest.createdAt).toLocaleString()}</span>
              {" · "}<a href={`/projects/${projectId}/stages/handoff`}>{t("ход, код и предпросмотр")}</a>
            </p>
          ) : <p className={styles.small} style={{ margin: "6px 0" }}>{t("Агент этот модуль ещё не делал. Задачу ему напишет платформа: модуль, на что он опирается, его задачи, операции API и кейсы, которые должны пройти.")}</p>}
          {!state.configured && <p className={styles.small}>{t("ИИ-агент не подключён на этом сервере.")}</p>}
          {state.busy && <p className={styles.small}>{t("Агент сейчас занят другой задачей проекта.")}</p>}
          {state.canStart && (
            <button type="button" className={styles.button} disabled={busy} onClick={() => void start()}>
              {busy ? t("Ставим в очередь…") : state.latest ? t("Поручить агенту ещё раз") : t("Поручить модуль ИИ-агенту")}
            </button>
          )}
          {problem && <p role="alert" style={{ color: "#b3261e", margin: "6px 0 0" }}>{problem}</p>}
        </>
      )}
    </section>
  );
}
