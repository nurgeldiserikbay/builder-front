"use client";

import { t } from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { formatTenge } from "@/lib/money";
import { makeZip } from "@/lib/zip";
import styles from "../../../journey.module.css";

type Step = { at: string; kind: "note" | "tool"; tool?: string; summary: string; status?: "ok" | "failed"; output?: string };
type Check = { id: string; label: string; command: string; status: "passed" | "failed" | "timed_out" | "skipped"; output: string; durationMs: number };
type Task = {
  id: string; status: "queued" | "running" | "succeeded" | "failed" | "stopped" | "unavailable"; statusLabel: string; instruction: string | null; model: string | null;
  createdAt: string; startedAt: string | null; finishedAt: string | null; stopRequested: boolean; turns: number; costTiyn: number;
  steps: Step[]; stopLabel: string | null; report: { summary: string; done: string[]; notDone: string[] } | null; checks: Check[]; error: string | null;
  files: { path: string; bytes: number }[]; filesTruncated: boolean;
};
type State = {
  configured: boolean; profile: { key: string; version: string }; limits: { turns: number; wallMs: number; costTiyn: number | null }; canStart: boolean;
  latest: Task | null; history: { id: string; statusLabel: string; createdAt: string; costTiyn: number }[];
};

const toolLabel: Record<string, string> = { write_file: "✎", read_file: "👁", list_files: "📂", run: "▶", finish: "✓" };
const errors: Record<string, string> = {
  AGENT_TASK_RUNNING: t("Агент уже работает над задачей. Дождитесь конца или остановите её."),
  AGENT_NOT_CONFIGURED: t("ИИ-агент не подключён на этом сервере: нужны модель ИИ и изолированная среда (E2B)."),
  HANDOFF_NOT_BUILT: t("Сначала соберите пакет для разработки на этом этапе."),
};

/**
 * «ИИ-агент»: the agent builds the application from the package in a throwaway sandbox — writes code, runs it, fixes errors —
 * and the platform checks the result itself. Progress is live; the owner can stop it; nothing is published or pushed.
 */
export default function AgentPanel({ projectId, packageBuilt, canEdit }: { projectId: string; packageBuilt: boolean; canEdit: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const log = useRef<HTMLOListElement | null>(null);
  const base = `/projects/${projectId}/agent/tasks`;
  const load = useCallback(async () => { try { setState(await api<State>(base)); } catch (caught) { setError(explainError(caught)); } }, [base]);
  useEffect(() => { void load(); }, [load, packageBuilt]);
  const task = state?.latest ?? null;
  const pending = task?.status === "queued" || task?.status === "running";
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [pending, load]);
  useEffect(() => { if (pending && log.current) log.current.scrollTop = log.current.scrollHeight; }, [pending, task?.steps.length]);

  async function act(label: string, work: () => Promise<void>) {
    setBusy(label); setError("");
    try { await work(); } catch (caught) { const code = caught instanceof Error ? caught.message : ""; setError(errors[code] ?? explainError(caught)); } finally { setBusy(""); }
  }
  const start = () => act("start", async () => { await api(base, { method: "POST", body: JSON.stringify({ kind: "build_app", instruction: instruction.trim() || null }) }); setInstruction(""); await load(); });
  const stop = () => act("stop", async () => { await api(`${base}/${task!.id}/stop`, { method: "POST" }); await load(); });
  const download = () => act("zip", async () => {
    const result = await api<{ files: { path: string; content: string }[] }>(`${base}/${task!.id}/files`);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(makeZip(result.files.map((file) => ({ name: file.path, content: file.content }))));
    link.download = "app-by-agent.zip";
    document.body.appendChild(link); link.click(); link.remove();
  });

  if (!state) return error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : null;
  const tone = task?.status === "succeeded" ? styles.success : task?.status === "failed" || task?.status === "unavailable" ? styles.warn : styles.info;
  const minutes = Math.round(state.limits.wallMs / 60_000);
  return (
    <section className={styles.card} aria-labelledby="agent-title">
      <p className={styles.cardTitle} id="agent-title">{t("Приложение целиком: ИИ-агент")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>
        {t("ИИ-агент пишет всё приложение по пакету — интерфейс, сервер, вход по ролям, базу данных и тесты. Он работает в отдельном одноразовом компьютере: пишет код, запускает его, читает ошибки и исправляет. Потом BuildPath сам проверяет результат: установку, тесты и сборку.")}
      </p>
      <p className={styles.small}>
        {t("Стек: Node.js, React и PostgreSQL ({0}). На одну задачу — до {1} шагов и {2} минут{3}. Считается как один запрос к ИИ. Ничего не публикуется и не отправляется в репозиторий.",
          [`${state.profile.key}@${state.profile.version}`, state.limits.turns, minutes, state.limits.costTiyn !== null ? `, ${t("не больше {0}", [formatTenge(state.limits.costTiyn / 100)])}` : ""])}
      </p>

      {!state.configured && <p className={`${styles.notice} ${styles.info}`}>{errors.AGENT_NOT_CONFIGURED}</p>}

      {task && (
        <div className={`${styles.notice} ${tone}`} role="status" style={{ marginTop: 8 }}>
          <strong>{task.statusLabel}</strong>
          {task.stopRequested && pending && ` · ${t("останавливаем…")}`}
          <span className={styles.small} style={{ display: "block" }}>
            {t("Шагов: {0}", [task.turns])}{task.costTiyn > 0 ? ` · ${t("потрачено {0}", [formatTenge(task.costTiyn / 100)])}` : ""}{task.stopLabel ? ` · ${task.stopLabel}` : ""}
          </span>
          {task.error && <span style={{ display: "block", marginTop: 4 }}>{task.error}</span>}
        </div>
      )}

      {task && task.steps.length > 0 && (
        <details open={pending || open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)} style={{ marginTop: 8 }}>
          <summary>{t("Что делает агент ({0})", [task.steps.length])}</summary>
          <ol ref={log} style={{ listStyle: "none", padding: 0, margin: "8px 0 0", maxHeight: 320, overflowY: "auto", display: "grid", gap: 4 }}>
            {task.steps.map((step, index) => (
              <li key={`${step.at}-${index}`} className={styles.small} style={{ overflowWrap: "anywhere" }}>
                {step.kind === "note" ? <em>{step.summary}</em> : (
                  <>
                    <span aria-hidden="true">{toolLabel[step.tool ?? ""] ?? "•"} </span>
                    <code>{step.summary}</code>{step.status === "failed" && <span style={{ color: "var(--danger, #b42318)" }}> ✕</span>}
                    {step.output && step.status === "failed" && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: "4px 0", maxHeight: 140, overflow: "auto" }}>{step.output}</pre>}
                  </>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}

      {task && !pending && task.checks.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p className={styles.label} style={{ margin: "0 0 4px" }}>{t("Проверка BuildPath")}</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {task.checks.map((check) => (
              <li key={check.id}>
                <span aria-hidden="true">{check.status === "passed" ? "✓" : check.status === "skipped" ? "–" : "✕"} </span>
                {check.label}{check.status === "skipped" ? ` — ${t("не запускалось")}` : check.status === "timed_out" ? ` — ${t("не уложилось во время")}` : ""}
                {(check.status === "failed" || check.status === "timed_out") && check.output && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, maxHeight: 160, overflow: "auto", margin: "4px 0" }}>{check.output}</pre>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {task?.report && !pending && (
        <div style={{ marginTop: 10 }}>
          <p className={styles.label} style={{ margin: "0 0 4px" }}>{t("Отчёт агента")}</p>
          <p style={{ margin: "0 0 6px" }}>{task.report.summary}</p>
          {task.report.done.length > 0 && <><p className={styles.small} style={{ margin: "6px 0 2px" }}>{t("Сделано:")}</p><ul style={{ margin: 0, paddingLeft: 18 }}>{task.report.done.map((line) => <li key={line}>{line}</li>)}</ul></>}
          {task.report.notDone.length > 0 && <><p className={styles.small} style={{ margin: "6px 0 2px" }}>{t("Не сделано или сделано частично:")}</p><ul style={{ margin: 0, paddingLeft: 18 }}>{task.report.notDone.map((line) => <li key={line}>{line}</li>)}</ul></>}
          <p className={styles.small}>{t("Это слова агента. Что работает на самом деле, показывает проверка BuildPath выше.")}</p>
        </div>
      )}

      {task && !pending && task.files.length > 0 && (
        <button type="button" className={styles.secondary} style={{ marginTop: 8 }} disabled={Boolean(busy)} onClick={() => void download()}>
          {busy === "zip" ? t("Готовим архив…") : t("Скачать код ({0} файлов)", [task.files.length])}
        </button>
      )}

      {pending && canEdit && !task?.stopRequested && (
        <button type="button" className={styles.ghost} style={{ marginTop: 8 }} disabled={Boolean(busy)} onClick={() => { if (window.confirm(t("Остановить агента? То, что он успел сделать, сохранится и будет проверено."))) void stop(); }}>{t("Остановить")}</button>
      )}

      {canEdit && state.configured && !pending && (
        <div style={{ marginTop: 12 }}>
          {!packageBuilt ? <p className={styles.small}>{errors.HANDOFF_NOT_BUILT}</p> : (
            <>
              <label className={styles.label} htmlFor="agent-instruction">{t("Пожелание агенту (необязательно)")}</label>
              <textarea id="agent-instruction" className={styles.textarea} rows={2} maxLength={2000} value={instruction} placeholder={t("Например: сделай акцент на удобстве для мастеров с телефона")} onChange={(event) => setInstruction(event.target.value)} />
              <button type="button" className={`${styles.button} ${styles.block}`} style={{ marginTop: 8 }} disabled={Boolean(busy) || !state.canStart} onClick={() => void start()}>
                {busy === "start" ? t("Запускаем…") : task ? t("Собрать приложение заново") : t("Собрать приложение")}
              </button>
            </>
          )}
        </div>
      )}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    </section>
  );
}
