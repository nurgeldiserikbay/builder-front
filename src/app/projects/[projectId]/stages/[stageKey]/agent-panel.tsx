"use client";

import { t } from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { formatTenge } from "@/lib/money";
import { makeZip } from "@/lib/zip";
import styles from "../../../journey.module.css";
import AppLaunch, { type Deployment } from "./app-launch";

type Step = { at: string; kind: "note" | "tool"; tool?: string; summary: string; status?: "ok" | "failed"; output?: string };
type Check = {
  id: string; label: string; command: string; status: "passed" | "failed" | "timed_out" | "skipped"; output: string; durationMs: number;
  /** For «audit»: known vulnerabilities of the packages the application runs with. */
  vulnerabilities?: { critical: number; high: number; moderate: number; low: number; packages: Array<{ name: string; severity: string; title: string | null }> };
};
const severityText: Record<string, string> = { critical: t("критическая"), high: t("высокая"), moderate: t("средняя"), low: t("низкая") };
type Task = {
  id: string; kind: string; baseTaskId: string | null; baseSource?: string | null; baseCommit?: string | null; status: "queued" | "running" | "succeeded" | "failed" | "stopped" | "unavailable"; statusLabel: string; instruction: string | null; model: string | null;
  createdAt: string; startedAt: string | null; finishedAt: string | null; stopRequested: boolean; turns: number; costTiyn: number;
  steps: Step[]; stopLabel: string | null; report: { summary: string; done: string[]; notDone: string[] } | null; checks: Check[]; error: string | null;
  files: { path: string; bytes: number }[]; filesTruncated: boolean;
  hasDemo: boolean;
  pushed: { branch: string | null; pullRequestUrl: string | null; commitUrl: string | null; at: string } | null;
};
type Repository = { provider: string; repoPath: string; webUrl: string; defaultBranch: string };
type State = {
  configured: boolean; ownStack?: boolean; repository: Repository | null; deployment: Deployment | null; profile: { key: string; version: string }; limits: { turns: number; wallMs: number; costTiyn: number | null }; canStart: boolean; changeBase: string | null; changeFromRepository?: boolean;
  latest: Task | null; history: { id: string; kind?: string; statusLabel: string; createdAt: string; costTiyn: number }[];
  mainLine?: { version: number; head: { id: string; moduleKey: string | null; status: string; statusLabel: string; createdAt: string; files: number } | null };
};

const toolLabel: Record<string, string> = { write_file: "✎", read_file: "👁", list_files: "📂", run: "▶", finish: "✓" };
const errors: Record<string, string> = {
  AGENT_TASK_RUNNING: t("Агент уже работает над задачей. Дождитесь конца или остановите её."),
  AGENT_NOT_CONFIGURED: t("ИИ-агент не подключён на этом сервере: нужны модель ИИ и изолированная среда (E2B)."),
  AGENT_STACK_NOT_SUPPORTED: t("В решении «Технологии» выбран свой стек разработчика: ИИ-агент на нём код не пишет. Модули делают специалисты."),
  HANDOFF_NOT_BUILT: t("Сначала соберите пакет для разработки на этом этапе."),
  REPO_NOT_CONNECTED: t("Репозиторий не подключён. Подключите его в решении «Где хранить код»."),
  AGENT_TASK_NO_FILES: t("Агент не оставил файлов — отправлять нечего."),
  CHANGE_INSTRUCTION_REQUIRED: t("Опишите, что изменить."),
  REPO_BRANCH_EMPTY: t("В основной ветке репозитория пока нет кода. Отправьте туда код агента или начните с кода последней задачи."),
  AGENT_BASE_HAS_NO_CODE: t("У последней задачи нет кода, который можно менять. Соберите приложение заново."),
};

/**
 * «ИИ-агент»: the agent builds the application from the package in a throwaway sandbox — writes code, runs it, fixes errors —
 * and the platform checks the result itself. Progress is live; the owner can stop it; nothing is published or pushed.
 */
export default function AgentPanel({ projectId, packageBuilt, canEdit }: { projectId: string; packageBuilt: boolean; canEdit: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [instruction, setInstruction] = useState("");
  const [change, setChange] = useState("");
  // Where a change starts: the repository's main branch (with the owner's own edits) when connected, else the latest task.
  const [source, setSource] = useState<"repository" | "task">("repository");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
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
  const startChange = () => act("change", async () => {
    // The repository is the start only when it can be read; without it the change starts from the latest task's code.
    const fromRepo = Boolean(state!.changeFromRepository) && (source === "repository" || !state!.changeBase);
    await api(base, { method: "POST", body: JSON.stringify(fromRepo ? { kind: "change_app", base: "repository", instruction: change.trim() } : { kind: "change_app", baseTaskId: state!.changeBase, instruction: change.trim() }) });
    setChange(""); await load();
  });
  const stop = () => act("stop", async () => { await api(`${base}/${task!.id}/stop`, { method: "POST" }); await load(); });
  const push = () => act("push", async () => {
    const repo = state!.repository!;
    const where = repo.provider === "ssh" ? repo.webUrl : repo.repoPath;
    const failed = task!.checks.some((check) => check.status === "failed" || check.status === "timed_out");
    const question = `${repo.provider === "ssh"
      ? t("Отправить код в {0}? Он попадёт в отдельную ветку, основная ветка {1} не изменится. Слить изменения решаете вы.", [where, repo.defaultBranch])
      : t("Отправить код в {0}? Он попадёт в отдельную ветку с запросом на слияние, основная ветка {1} не изменится. Слить изменения решаете вы.", [where, repo.defaultBranch])}${failed ? `\n\n${t("Внимание: проверка BuildPath нашла ошибки — в запросе это будет видно.")}` : ""}`;
    if (!window.confirm(question)) return;
    const result = await api<Task & { mainBranch: boolean }>(`${base}/${task!.id}/push`, { method: "POST", body: JSON.stringify({ confirm: true }) });
    setNotice(result.mainBranch ? t("Репозиторий был пустым — код стал его первой версией в ветке {0}.", [result.pushed?.branch ?? ""])
      : result.pushed?.pullRequestUrl ? t("Готово: код в ветке {0}. Откройте запрос на слияние, посмотрите изменения и слейте их, когда будете готовы.", [result.pushed?.branch ?? ""])
        : t("Готово: код в ветке {0}. Посмотрите изменения и слейте ветку на своём сервере, когда будете готовы.", [result.pushed?.branch ?? ""]));
    await load();
  });
  const openPreview = () => act("demo", async () => {
    const result = await api<{ html: string }>(`${base}/${task!.id}/demo`);
    setPreview(result.html);
  });
  useEffect(() => {
    if (preview === null) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setPreview(null); };
    document.addEventListener("keydown", close);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", close); document.body.style.overflow = overflow; };
  }, [preview]);
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
        {t("Стек: Node.js, React и PostgreSQL ({0}). На одну задачу — до {1} шагов и {2} минут{3}. Считается как один запрос к ИИ. Ничего не публикуется; в репозиторий код уходит только по вашей кнопке.",
          [`${state.profile.key}@${state.profile.version}`, state.limits.turns, minutes, state.limits.costTiyn !== null ? `, ${t("не больше {0}", [formatTenge(state.limits.costTiyn / 100)])}` : ""])}
      </p>

      {!state.configured && <p className={`${styles.notice} ${styles.info}`}>{errors.AGENT_NOT_CONFIGURED}</p>}
      {state.ownStack && <p className={`${styles.notice} ${styles.info}`}>{errors.AGENT_STACK_NOT_SUPPORTED} <a href={`/projects/${projectId}/choices/technologies`}>{t("Открыть решение")}</a></p>}

      {state.mainLine && state.mainLine.version > 0 && state.mainLine.head && (
        <p className={styles.small} style={{ margin: "6px 0" }}>
          {t("Основная линия кода: версия {0}, последним влит модуль «{1}» ({2}) · {3}.", [state.mainLine.version, state.mainLine.head.moduleKey ?? "—", new Date(state.mainLine.head.createdAt).toLocaleString(), state.mainLine.head.statusLabel])}{" "}
          {t("У каждого модуля своя ветка; при принятии этапа модуля его код вливается сюда. В репозиторий — ветка buildpath/main-line.")}
        </p>
      )}

      {task && (
        <div className={`${styles.notice} ${tone}`} role="status" style={{ marginTop: 8 }}>
          <strong>{task.statusLabel}</strong>
          {task.kind === "line_merge" && <span style={{ display: "block" }}>{t("Новая версия основной линии: платформа влила принятый модуль, код проверяется так же, как результат агента. ИИ здесь не работает, денег не списывается.")}</span>}
          {task.kind === "change_app" && task.instruction && <span style={{ display: "block", overflowWrap: "anywhere" }}>{t("Изменение: {0}", [task.instruction])}</span>}
          {task.kind === "change_app" && task.baseSource === "line" && <span className={styles.small} style={{ display: "block" }}>{t("Согласование модуля с основной линией.")}</span>}
          {task.kind === "change_app" && task.baseSource === "repository" && <span className={styles.small} style={{ display: "block" }}>{t("Начато с кода из репозитория{0}.", [task.baseCommit ? ` (${task.baseCommit.slice(0, 7)})` : ""])}</span>}
          {task.stopRequested && pending && ` · ${t("останавливаем…")}`}
          {task.kind !== "line_merge" && <span className={styles.small} style={{ display: "block" }}>
            {t("Шагов: {0}", [task.turns])}{task.costTiyn > 0 ? ` · ${t("потрачено {0}", [formatTenge(task.costTiyn / 100)])}` : ""}{task.stopLabel ? ` · ${task.stopLabel}` : ""}
          </span>}
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
                {check.label}{check.id === "audit" && check.status === "skipped" && check.output ? ` — ${t("не проверено: база уязвимостей npm не ответила")}` : check.status === "skipped" ? ` — ${t("не запускалось")}` : check.status === "timed_out" ? ` — ${t("не уложилось во время")}` : ""}
                {check.id === "audit" && check.vulnerabilities && (check.vulnerabilities.critical + check.vulnerabilities.high + check.vulnerabilities.moderate + check.vulnerabilities.low) > 0 && (
                  <div className={styles.small} style={{ margin: "2px 0 4px 18px" }}>
                    {t("Критических: {0}, высоких: {1}, средних: {2}, низких: {3}.", [check.vulnerabilities.critical, check.vulnerabilities.high, check.vulnerabilities.moderate, check.vulnerabilities.low])}
                    <ul style={{ margin: "2px 0", paddingLeft: 18 }}>{check.vulnerabilities.packages.map((item) => <li key={item.name}><code>{item.name}</code> — {severityText[item.severity] ?? item.severity}{item.title ? `: ${item.title}` : ""}</li>)}</ul>
                    {check.status === "failed" ? t("Задачу это не останавливает. Но принять модуль или запустить приложение с такими пакетами можно будет, только письменно объяснив почему: лучше попросите агента обновить или заменить их следующим изменением приложения.") : t("Серьёзных нет; средние и низкие стоит обновить при следующих изменениях.")}
                  </div>
                )}
                {check.id !== "audit" && (check.status === "failed" || check.status === "timed_out") && check.output && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, maxHeight: 160, overflow: "auto", margin: "4px 0" }}>{check.output}</pre>}
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

      {task && !pending && task.hasDemo && (
        <div style={{ marginTop: 10 }}>
          <button type="button" className={`${styles.button} ${styles.block}`} disabled={Boolean(busy)} onClick={() => void openPreview()}>{busy === "demo" ? t("Открываем…") : t("▶ Попробовать приложение")}</button>
          <p className={styles.small} style={{ margin: "4px 0 0" }}>{t("Приложение работает прямо в браузере на демо-данных; можно переключать роли. Ничего никуда не отправляется, данные сбрасываются при закрытии.")}</p>
        </div>
      )}
      {task && !pending && task.files.length > 0 && !task.hasDemo && task.checks.some((check) => check.id === "demo") && (
        <p className={styles.small} style={{ marginTop: 8 }}>{t("Предпросмотр не собрался — попробовать приложение в браузере пока нельзя. Код при этом сохранён.")}</p>
      )}
      {preview !== null && (
        <div role="dialog" aria-modal="true" aria-label={t("Предпросмотр приложения")} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "var(--bg, #fff)", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--line, #e3e6ee)" }}>
            <span className={styles.small} style={{ flex: 1 }}>{t("Предпросмотр · демо-данные · написано ИИ-агентом")}</span>
            <button type="button" className={styles.secondary} onClick={() => setPreview(null)} autoFocus>{t("Закрыть")}</button>
          </div>
          {/* The agent's page runs without same-origin rights and with a no-network policy: it cannot reach BuildPath or the internet. */}
          <iframe title={t("Предпросмотр приложения")} srcDoc={preview} sandbox="allow-scripts allow-forms allow-modals" referrerPolicy="no-referrer" style={{ flex: 1, width: "100%", border: 0 }} />
        </div>
      )}

      {task && !pending && task.files.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p className={styles.label} style={{ margin: "0 0 4px" }}>{t("Код в вашем репозитории")}</p>
          {task.pushed && (
            <p className={`${styles.notice} ${styles.success}`} style={{ margin: "0 0 8px", overflowWrap: "anywhere" }}>
              {t("Отправлено в ветку {0}.", [task.pushed.branch ?? ""])}{" "}
              {task.pushed.pullRequestUrl ? <a href={task.pushed.pullRequestUrl} target="_blank" rel="noreferrer">{t("Открыть запрос на слияние")}</a>
                : task.pushed.commitUrl ? <a href={task.pushed.commitUrl} target="_blank" rel="noreferrer">{t("Открыть изменения")}</a> : null}
            </p>
          )}
          {state.repository ? (
            canEdit && (
              <>
                <p className={styles.small} style={{ margin: "0 0 6px", overflowWrap: "anywhere" }}>{state.repository.provider === "ssh"
                  ? t("Код уйдёт в {0} отдельной веткой. Основная ветка не меняется, пока вы сами не сольёте изменения.", [state.repository.webUrl])
                  : t("Код уйдёт в {0} отдельной веткой с запросом на слияние и отчётом агента. Основная ветка не меняется, пока вы сами не сольёте изменения.", [state.repository.repoPath])}</p>
                <button type="button" className={styles.button} disabled={Boolean(busy)} onClick={() => void push()}>
                  {busy === "push" ? t("Отправляем…") : task.pushed ? t("Отправить ещё раз") : t("Отправить в репозиторий")}
                </button>
              </>
            )
          ) : (
            <p className={styles.small} style={{ margin: "0 0 6px" }}>{t("Чтобы отправить код в git, подключите репозиторий в решении «Где хранить код»: GitHub, GitLab, Gitea, Bitbucket или любой сервер по SSH.")} <a href={`/projects/${projectId}/choices/code_hosting`}>{t("Открыть решение")}</a></p>
          )}
          <button type="button" className={styles.ghost} style={{ marginTop: 6 }} disabled={Boolean(busy)} onClick={() => void download()}>
            {busy === "zip" ? t("Готовим архив…") : t("Скачать код (файлов: {0})", [task.files.length])}
          </button>
        </div>
      )}

      {pending && canEdit && !task?.stopRequested && (
        <button type="button" className={styles.ghost} style={{ marginTop: 8 }} disabled={Boolean(busy)} onClick={() => { if (window.confirm(t("Остановить агента? То, что он успел сделать, сохранится и будет проверено."))) void stop(); }}>{t("Остановить")}</button>
      )}

      {canEdit && state.configured && !pending && (
        <div style={{ marginTop: 12 }}>
          {!packageBuilt ? <p className={styles.small}>{errors.HANDOFF_NOT_BUILT}</p> : state.changeBase || state.changeFromRepository ? (
            <>
              <form onSubmit={(event) => { event.preventDefault(); void startChange(); }}>
                <label className={styles.label} htmlFor="agent-change">{t("Что изменить в приложении?")}</label>
                <textarea id="agent-change" className={styles.textarea} rows={3} maxLength={2000} required value={change} placeholder={t("Например: добавь в заявку поле «Телефон» и покажи его в списке")} onChange={(event) => setChange(event.target.value)} />
                {state.changeFromRepository && state.changeBase && (
                  <fieldset style={{ border: 0, padding: 0, margin: "8px 0 0" }}>
                    <legend className={styles.small} style={{ marginBottom: 4 }}>{t("С какого кода начать")}</legend>
                    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
                      <input type="radio" name="change-source" checked={source === "repository"} onChange={() => setSource("repository")} />
                      <span>{t("Из репозитория, ветка {0}", [state.repository?.defaultBranch ?? "main"])}<span className={styles.small} style={{ display: "block" }}>{t("Со всеми правками, которые вы или разработчик внесли в git. Рекомендуем.")}</span></span>
                    </label>
                    <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <input type="radio" name="change-source" checked={source === "task"} onChange={() => setSource("task")} />
                      <span>{t("Код последней задачи агента")}<span className={styles.small} style={{ display: "block" }}>{t("Если ветку агента ещё не слили или в репозитории что-то сломано.")}</span></span>
                    </label>
                  </fieldset>
                )}
                <p className={styles.small} style={{ margin: "4px 0 0" }}>{(state.changeFromRepository && (source === "repository" || !state.changeBase))
                  ? t("Опишите словами, как человеку. Агент возьмёт код из основной ветки репозитория — с вашими правками, — внесёт изменения и проверит, что остальное работает. Изменения придут новой веткой с запросом на слияние.")
                  : t("Опишите словами, как человеку. Агент возьмёт код последней задачи, внесёт изменения и проверит, что остальное работает. Правки, которые вы сделали в репозитории сами, он не увидит.")}</p>
                <button className={`${styles.button} ${styles.block}`} style={{ marginTop: 8 }} disabled={Boolean(busy) || !state.canStart || !change.trim()}>
                  {busy === "change" ? t("Запускаем…") : t("Поручить изменение агенту")}
                </button>
              </form>
              <details style={{ marginTop: 10 }}>
                <summary className={styles.small}>{t("Собрать заново с нуля")}</summary>
                <div style={{ marginTop: 8 }}>
              <label className={styles.label} htmlFor="agent-instruction">{t("Пожелание агенту (необязательно)")}</label>
              <textarea id="agent-instruction" className={styles.textarea} rows={2} maxLength={2000} value={instruction} placeholder={t("Например: сделай акцент на удобстве для мастеров с телефона")} onChange={(event) => setInstruction(event.target.value)} />
              <button type="button" className={`${styles.button} ${styles.block}`} style={{ marginTop: 8 }} disabled={Boolean(busy) || !state.canStart} onClick={() => void start()}>
                {busy === "start" ? t("Запускаем…") : task ? t("Собрать приложение заново") : t("Собрать приложение")}
              </button>
                </div>
              </details>
            </>
          ) : (
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
      {(state.deployment || task?.pushed) && <AppLaunch projectId={projectId} deployment={state.deployment} canEdit={canEdit} onChecked={load} />}

      {notice && <p className={`${styles.notice} ${styles.success}`} role="status">{notice}</p>}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    </section>
  );
}
