"use client";

import { t } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { makeZip } from "@/lib/zip";
import styles from "../../../journey.module.css";

type StepStatus = "passed" | "failed" | "timed_out" | "skipped" | null;
type Run = {
  id: string; status: "queued" | "running" | "succeeded" | "failed" | "unavailable"; statusLabel: string; outdated: boolean; error: string | null;
  steps: { id: string; label: string; status: StepStatus; durationMs: number | null; output: string }[];
  files: { path: string; bytes: number }[];
};
type State = { run: Run | null; configured: boolean; canRun: boolean; runsLeft: number };

const icon = (status: StepStatus) => (status === "passed" ? "✓" : status === "failed" || status === "timed_out" ? "✕" : status === "skipped" ? "–" : "…");
const iconTone = (status: StepStatus) => (status === "passed" ? "passed" : status === "failed" || status === "timed_out" ? "failed" : "warning");

/** Starter API code built from the package, with its tests run in an isolated sandbox — never on the platform's servers. */
export default function StarterCodePanel({ projectId, packageBuilt }: { projectId: string; packageBuilt: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const base = `/projects/${projectId}/handoff/starter`;
  const load = useCallback(async () => { try { setState(await api<State>(base)); } catch (caught) { setError(explainError(caught)); } }, [base]);
  useEffect(() => { void load(); }, [load, packageBuilt]);
  const pending = state?.run?.status === "queued" || state?.run?.status === "running";
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [pending, load]);

  async function start() {
    setBusy("run"); setError("");
    try { setState(await api<State>(base, { method: "POST" })); } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }
  async function download() {
    setBusy("zip"); setError("");
    try {
      const result = await api<{ files: { path: string; content: string }[] }>(`${base}/files`);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(makeZip(result.files.map((file) => ({ name: file.path, content: file.content }))));
      link.download = "starter-api.zip";
      document.body.appendChild(link); link.click(); link.remove();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }

  if (!state) return error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : null;
  const run = state.run;
  return (
    <section className={styles.card} aria-label={t("Стартовый код")}>
      <p className={styles.cardTitle}>{t("Стартовый код")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>
        {t("Платформа сделает из пакета заготовку API на Node.js: ресурсы из схемы данных, права по ролям и тесты. Без ИИ и без зависимостей. Тесты запускаются в отдельной одноразовой машине без интернета — не на серверах BuildPath.")}
      </p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {!state.configured && (
        <p className={`${styles.notice} ${styles.info}`} role="status">{t("Изолированная среда для запуска кода пока не подключена: код можно собрать и скачать, но он не будет запущен.")}</p>
      )}
      {!packageBuilt && <p className={styles.small}>{t("Сначала соберите пакет.")}</p>}
      {run && (
        <>
          {/* Without a sandbox the notice above already says the code was not run. */}
          {!(run.status === "unavailable" && !state.configured) && (
            <p className={`${styles.notice} ${run.status === "succeeded" ? styles.success : run.status === "failed" ? styles.warn : styles.info}`} role="status">
              <strong>{run.statusLabel}</strong>{pending ? t(" — обычно это занимает до минуты.") : "."}{run.error ? ` ${run.error}` : ""}
              {run.outdated ? ` ${t("Пакет собран заново после этой проверки — проверьте ещё раз.")}` : ""}
            </p>
          )}
          {run.status === "unavailable" && !state.configured && run.outdated && <p className={styles.small}>{t("Пакет собран заново после этой проверки — проверьте ещё раз.")}</p>}
          {run.status !== "unavailable" && (
            <ul className={styles.checks}>
              {run.steps.map((step) => (
                <li key={step.id}>
                  <span className={`${styles.checkIcon} ${styles[iconTone(step.status)]}`} aria-hidden="true">{icon(step.status)}</span>
                  <span>
                    <strong>{step.label}</strong>
                    <span className={styles.small}>
                      {step.status === "timed_out" ? ` — ${t("не уложилось во время")}` : step.status === "skipped" ? ` — ${t("пропущено после ошибки")}` : ""}
                      {step.durationMs !== null && step.status !== "skipped" ? ` · ${t("{0} с", [(step.durationMs / 1000).toFixed(1)])}` : ""}
                    </span>
                    {step.output && (
                      <details className={styles.details}>
                        <summary>{step.status === "passed" ? t("Отчёт") : t("Что пошло не так")}</summary>
                        <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 12, maxHeight: 280 }}>{step.output}</pre>
                      </details>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.small}>{t("Файлов: {0}. Перед запуском разработчик заменяет вход и хранилище — что именно, написано в README.md.", [run.files.length])}</p>
        </>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {run && <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => void download()}>{busy === "zip" ? t("Готовим архив…") : t("⬇ Скачать код (.zip)")}</button>}
        {state.canRun && packageBuilt && (
          <button className={run ? styles.ghost : `${styles.button} ${styles.block}`} disabled={Boolean(busy)} onClick={() => void start()}>
            {busy === "run" ? t("Собираем…") : run ? (state.configured ? t("Собрать и проверить заново") : t("Собрать заново")) : state.configured ? t("Собрать и проверить код") : t("Собрать код")}
          </button>
        )}
      </div>
      {run && !state.canRun && !pending && state.runsLeft === 0 && <p className={styles.small}>{t("Этот пакет уже проверяли 5 раз. Соберите пакет заново, чтобы проверить снова.")}</p>}
    </section>
  );
}
