"use client";

// «Агент в вашей сети» (PRODUCT_LIFECYCLE §7): for an application whose repository and servers are in a closed network. The
// owner makes a key, runs the agent there, and asks it to check the application, push code or run their own deploy.
import { useCallback, useEffect, useState } from "react";
import { api, API_BASE_URL, ApiError } from "@/lib/api";
import { t } from "@/lib/i18n";
import { explainError } from "@/lib/journey";
import styles from "../../../journey.module.css";

type AgentState = "waiting" | "online" | "offline" | "expired";
type Agent = {
  id: string; name: string; state: AgentState; tokenHint: string; version: string | null; appUrl: string | null;
  capabilities: { check: boolean; push: boolean; deploy: boolean; shareOutput: boolean } | null; lastSeenAt: string | null; expiresAt: string; createdAt: string;
};
type Job = {
  id: string; kind: "check" | "push" | "deploy"; status: "queued" | "running" | "succeeded" | "failed" | "expired"; error: string | null; taskId: string | null; branch: string | null;
  result: { ok?: boolean; status?: number | null; database?: string | null; ms?: number | null; branch?: string | null; commit?: string | null; exitCode?: number | null; output?: string | null } | null;
  createdAt: string; finishedAt: string | null;
};
type View = { agent: Agent | null; jobs: Job[]; canManage: boolean; pushTask: { id: string; createdAt: string; moduleKey: string | null } | null; apiBase: string | null; programVersion: string };

const stateLabel = (): Record<AgentState, string> => ({ waiting: t("ждёт подключения"), online: t("на связи"), offline: t("не на связи"), expired: t("ключ истёк") });
const kindLabel = (): Record<Job["kind"], string> => ({ check: t("Проверка приложения"), push: t("Отправка кода"), deploy: t("Выкладка") });
const statusLabel = (): Record<Job["status"], string> => ({ queued: t("ждёт агента"), running: t("агент выполняет"), succeeded: t("готово"), failed: t("не получилось"), expired: t("агент не взял") });
const errorText = (): Record<string, string> => ({
  NO_APP_URL: t("У агента не указан APP_URL."), NO_GIT_REMOTE: t("У агента не указан GIT_REMOTE."), NO_DEPLOY_COMMAND: t("У агента не указан DEPLOY_COMMAND."),
  APP_UNREACHABLE: t("Приложение не ответило изнутри сети."), APP_TIMEOUT: t("Приложение не ответило за минуту."), NOT_HEALTH_ANSWER: t("Адрес ответил, но не так, как отвечает приложение BuildPath (/api/health)."),
  GIT_NOT_INSTALLED: t("На машине агента нет git."), GIT_CLONE_FAILED: t("Агент не смог получить репозиторий: проверьте адрес и доступ."), GIT_PUSH_FAILED: t("Агент не смог отправить ветку: проверьте права на запись."),
  GIT_COMMIT_FAILED: t("Не получилось записать изменения в git."), GIT_BRANCH_FAILED: t("Не получилось создать ветку."), UNSAFE_PATH: t("В коде есть путь за пределами проекта — агент ничего не записал."),
  DEPLOY_FAILED: t("Команда выкладки завершилась с ошибкой."), DEPLOY_TIMEOUT: t("Команда выкладки не закончилась вовремя."), DEPLOY_NOT_STARTED: t("Команду выкладки не удалось запустить."),
  AGENT_DID_NOT_TAKE: t("Агент не взял задание за час — проверьте, что он запущен."), AGENT_DID_NOT_REPORT: t("Агент взял задание, но не сообщил результат за 20 минут."),
  AGENT_KEY_REPLACED: t("Ключ заменили новым."), AGENT_KEY_REVOKED: t("Ключ отозван."), AGENT_ERROR: t("Ошибка в программе агента."),
  NETWORK_AGENT_CANNOT_DO: t("Агент не настроен на это: задайте у него нужную переменную и перезапустите."), NETWORK_AGENT_JOB_WAITING: t("Такое задание уже ждёт агента."),
  NETWORK_AGENT_KEY_EXPIRED: t("Срок ключа истёк — создайте новый."), NETWORK_AGENT_RATE_LIMITED: t("Слишком много заданий за час. Попробуйте позже."),
  AGENT_TASK_NO_FILES: t("У этой сборки нет кода."), AGENT_TASK_FILES_CHANGED: t("Код сборки изменился — соберите заново."),
});
const when = (value: string) => new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function NetworkAgentPanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [appUrl, setAppUrl] = useState("");
  const [gitRemote, setGitRemote] = useState("");
  const [deployCommand, setDeployCommand] = useState("");
  const base = `/projects/${projectId}/network-agent`;
  const load = useCallback(async () => {
    try { setView(await api<View>(base)); }
    catch (caught) {
      if (caught instanceof ApiError && (caught.status === 404 || caught.status === 403)) { setHidden(true); return; }
      setError(explainError(caught));
    }
  }, [base]);
  useEffect(() => { void load(); }, [load]);
  const waiting = Boolean(view && (view.agent?.state === "waiting" || view.jobs.some((job) => job.status === "queued" || job.status === "running")));
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [waiting, load]);

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(label); setError("");
    try { await action(); await load(); }
    catch (caught) { const code = caught instanceof Error ? caught.message : ""; setError(errorText()[code] ?? explainError(caught)); }
    finally { setBusy(null); }
  };
  const createKey = () => run("key", async () => {
    if (view?.agent && !window.confirm(t("Создать новый ключ? Старый перестанет работать сразу, агента нужно будет перезапустить с новым ключом."))) return;
    const created = await api<{ token: string }>(base, { method: "POST", body: JSON.stringify({}) });
    setToken(created.token);
  });
  const revoke = () => { if (window.confirm(t("Отозвать ключ? Агент остановится при следующем обращении."))) void run("revoke", async () => { await api(base, { method: "DELETE" }); setToken(null); }); };
  const job = (kind: Job["kind"]) => {
    if (kind === "push" && !window.confirm(t("Отправить код последней сборки агентом во внутренний репозиторий отдельной веткой? Основная ветка не меняется."))) return;
    if (kind === "deploy" && !window.confirm(t("Запустить вашу команду выкладки на машине агента? Это меняет работающее приложение."))) return;
    void run(kind, () => api(`${base}/jobs`, { method: "POST", body: JSON.stringify({ kind, ...(kind === "check" ? {} : { confirm: true }), ...(kind === "push" ? { taskId: view?.pushTask?.id } : {}) }) }));
  };
  const download = () => run("program", async () => {
    const response = await fetch(`${API_BASE_URL}${base}/program`, { credentials: "include" });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const link = document.createElement("a"); link.href = URL.createObjectURL(await response.blob()); link.download = "buildpath-agent.mjs";
    document.body.appendChild(link); link.click(); link.remove();
  });

  if (hidden || (!view && !error)) return null;
  if (!view) return <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>;
  const agent = view.agent;
  const apiBase = view.apiBase ?? API_BASE_URL;
  const envFile = [
    `BUILDPATH_URL=${apiBase}`, `BUILDPATH_AGENT_TOKEN=${token ?? "bpa_…"}`,
    ...(appUrl.trim() ? [`APP_URL=${appUrl.trim()}`] : ["# APP_URL=http://app.internal:8080"]),
    ...(gitRemote.trim() ? [`GIT_REMOTE=${gitRemote.trim()}`] : ["# GIT_REMOTE=git@gitlab.internal:team/app.git"]),
    ...(deployCommand.trim() ? [`DEPLOY_COMMAND=${deployCommand.trim()}`] : ["# DEPLOY_COMMAND=ssh deploy@app.internal ./deploy.sh"]),
  ].join("\n");
  const labels = stateLabel(); const kinds = kindLabel(); const statuses = statusLabel(); const errors = errorText();
  const caps = agent?.capabilities;

  return (
    <section id="network-agent" className={styles.card} aria-labelledby="network-agent-title">
      <p className={styles.kicker}>{t("Закрытая сеть")}</p>
      <h2 id="network-agent-title" className={styles.h2}>{t("Агент в вашей сети")}</h2>
      <p className={styles.small} style={{ margin: "0 0 10px" }}>{t("Если репозиторий или сервер приложения во внутренней сети, BuildPath до них не достанет. Запустите внутри сети программу-агента: она сама обращается к BuildPath по HTTPS — порты и VPN не нужны. Агент умеет три вещи: проверить приложение, отправить код во внутренний git и запустить вашу команду выкладки. Пароли и ключи остаются у вас.")}</p>

      {agent ? (
        <div style={{ display: "grid", gap: 4, margin: "0 0 10px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <strong>{agent.name}</strong>
            <span className={`${styles.chip} ${styles[agent.state === "online" ? "done" : agent.state === "waiting" ? "active" : "attention"]}`} style={{ marginTop: 0 }}>{labels[agent.state]}</span>
          </div>
          <span className={styles.small}>
            {agent.lastSeenAt ? t("Последний раз: {0}", [when(agent.lastSeenAt)]) : t("Ещё не подключался")}
            {agent.version ? ` · ${t("версия {0}", [agent.version])}${agent.version !== view.programVersion ? ` (${t("есть {0}", [view.programVersion])})` : ""}` : ""}
            {" · "}{t("ключ …{0}, до {1}", [agent.tokenHint, new Date(agent.expiresAt).toLocaleDateString()])}
          </span>
          {caps && <span className={styles.small}>{t("Умеет:")} {[caps.check && t("проверять {0}", [agent.appUrl ?? ""]), caps.push && t("отправлять код"), caps.deploy && t("выкладывать")].filter(Boolean).join(", ") || t("ничего — не заданы APP_URL, GIT_REMOTE, DEPLOY_COMMAND")}</span>}
        </div>
      ) : <p style={{ margin: "0 0 10px" }}>{t("Агент ещё не подключён.")}</p>}

      {token && (
        <div className={`${styles.notice} ${styles.warn}`} role="status">
          <strong>{t("Ключ показан один раз — сохраните его сейчас.")}</strong>
          <input className={styles.input} readOnly value={token} onFocus={(event) => event.target.select()} aria-label={t("Ключ агента")} style={{ marginTop: 6, fontFamily: "monospace" }} />
        </div>
      )}

      {view.canManage && (token || agent?.state === "waiting") && (
        <details className={styles.details} open={Boolean(token)} style={{ margin: "0 0 10px" }}>
          <summary>{t("Как запустить агента")}</summary>
          <ol className={styles.list} style={{ margin: "8px 0 0", paddingLeft: 20, display: "grid", gap: 8 }}>
            <li>{t("Скачайте программу — один файл, нужен Node.js 22 и git.")} <button type="button" className={styles.linkButton} disabled={Boolean(busy)} onClick={() => void download()}>{busy === "program" ? t("Скачиваем…") : t("Скачать buildpath-agent.mjs")}</button></li>
            <li>
              {t("Впишите, что нужно агенту, — необязательно: поля только собирают файл ниже, BuildPath их не сохраняет. Адрес приложения агент потом сообщит сам, чтобы показать его здесь; адрес репозитория и команда остаются у вас.")}
              <label className={styles.field} style={{ margin: "6px 0" }}><span className={styles.label}>{t("Адрес приложения в сети (для проверки)")}</span><input className={styles.input} inputMode="url" value={appUrl} onChange={(event) => setAppUrl(event.target.value)} placeholder="http://app.internal:8080" /></label>
              <label className={styles.field} style={{ margin: "6px 0" }}><span className={styles.label}>{t("Внутренний репозиторий (для отправки кода)")}</span><input className={styles.input} value={gitRemote} onChange={(event) => setGitRemote(event.target.value)} placeholder="git@gitlab.internal:team/app.git" /></label>
              <label className={styles.field} style={{ margin: "6px 0" }}><span className={styles.label}>{t("Команда выкладки (ветка — в $BUILDPATH_BRANCH)")}</span><input className={styles.input} value={deployCommand} onChange={(event) => setDeployCommand(event.target.value)} placeholder='ssh deploy@app.internal ./deploy.sh "$BUILDPATH_BRANCH"' /></label>
            </li>
            <li>{t("Сохраните рядом с программой файл buildpath-agent.env — программа читает его сама, кавычки и пробелы в команде сохраняются:")}<pre className={styles.code} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "6px 0 0" }}>{envFile}</pre></li>
            <li>{t("Запустите:")}<pre className={styles.code} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "6px 0 0" }}>{"node buildpath-agent.mjs buildpath-agent.env"}</pre>
              {t("или в Docker:")}<pre className={styles.code} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "6px 0 0" }}>{'docker run -d --name buildpath-agent --restart on-failure \\\n  -v "$PWD:/agent:ro" -v "$HOME/.ssh:/root/.ssh:ro" \\\n  node:22-alpine sh -c "apk add --no-cache git openssh-client >/dev/null && node /agent/buildpath-agent.mjs /agent/buildpath-agent.env"'}</pre></li>
            <li>{t("Когда агент подключится, здесь появится «на связи».")}</li>
          </ol>
        </details>
      )}

      {view.canManage && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 10px" }}>
          {agent && agent.state !== "expired" && <>
            <button type="button" className={styles.button} disabled={Boolean(busy) || caps?.check === false} onClick={() => job("check")}>{busy === "check" ? t("Отправляем…") : t("Проверить приложение")}</button>
            <button type="button" className={styles.secondary} disabled={Boolean(busy) || caps?.push === false || !view.pushTask} onClick={() => job("push")} title={!view.pushTask ? t("Сначала соберите приложение агентом") : undefined}>{busy === "push" ? t("Отправляем…") : t("Отправить код")}</button>
            <button type="button" className={styles.secondary} disabled={Boolean(busy) || caps?.deploy === false} onClick={() => job("deploy")}>{busy === "deploy" ? t("Отправляем…") : t("Выложить")}</button>
          </>}
          <button type="button" className={agent ? styles.ghost : styles.button} disabled={Boolean(busy)} onClick={() => void createKey()}>{busy === "key" ? t("Создаём…") : agent ? t("Новый ключ") : t("Создать ключ")}</button>
          {agent && <button type="button" className={styles.ghost} disabled={Boolean(busy)} onClick={revoke}>{t("Отозвать ключ")}</button>}
        </div>
      )}
      {view.canManage && agent && !view.pushTask && <p className={styles.small} style={{ margin: "0 0 10px" }}>{t("Отправить код можно после того, как ИИ-агент соберёт приложение.")}</p>}

      {view.jobs.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {view.jobs.slice(0, 8).map((item) => (
            <li key={item.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <span>{kinds[item.kind]}</span>
                <span className={`${styles.chip} ${styles[item.status === "succeeded" ? "done" : item.status === "failed" || item.status === "expired" ? "alert" : "active"]}`} style={{ marginTop: 0 }}>{statuses[item.status]}</span>
                <span className={styles.small}>{when(item.createdAt)}</span>
              </div>
              {item.result && item.kind === "check" && <p className={styles.small} style={{ margin: "2px 0 0" }}>{item.result.status ? t("ответ {0}", [item.result.status]) : t("нет ответа")}{item.result.database ? ` · ${t("база: {0}", [item.result.database])}` : ""}{item.result.ms != null ? ` · ${item.result.ms} ms` : ""}</p>}
              {item.result && item.kind === "push" && item.result.branch && <p className={styles.small} style={{ margin: "2px 0 0" }}>{t("ветка {0}", [item.result.branch])}{item.result.commit ? ` · ${item.result.commit.slice(0, 8)}` : ""}</p>}
              {item.result && item.kind === "deploy" && item.result.exitCode != null && <p className={styles.small} style={{ margin: "2px 0 0" }}>{t("код завершения {0}", [item.result.exitCode])}</p>}
              {item.result?.output && <details className={styles.details}><summary>{t("Вывод команды")}</summary><pre className={styles.code} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{item.result.output}</pre></details>}
              {item.error && <p className={styles.small} style={{ margin: "2px 0 0", color: "#b3261e" }}>{errors[item.error] ?? item.error}</p>}
            </li>
          ))}
        </ul>
      )}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert" style={{ marginTop: 8 }}>{error}</p>}
    </section>
  );
}
