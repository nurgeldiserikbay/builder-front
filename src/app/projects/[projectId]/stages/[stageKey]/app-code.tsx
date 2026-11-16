"use client";

import { t } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { makeZip } from "@/lib/zip";
import styles from "../../../journey.module.css";

type StepStatus = "passed" | "failed" | "timed_out" | "skipped" | null;
type Run = {
  id: string; status: "queued" | "running" | "succeeded" | "failed" | "unavailable" | "rejected"; statusLabel: string; outdated: boolean; error: string | null;
  steps: { id: string; label: string; status: StepStatus; durationMs: number | null; output: string }[];
  files: { path: string; bytes: number }[];
  instruction: string | null; covered: { rule: string; how: string }[]; notCovered: { rule: string; reason: string }[]; issues: { file: string; message: string }[]; rulesCode: string | null;
};
type State = { run: Run | null; aiConfigured: boolean; sandboxConfigured: boolean; canGenerate: boolean; runsLeft: number };

const icon = (status: StepStatus) => (status === "passed" ? "✓" : status === "failed" || status === "timed_out" ? "✕" : status === "skipped" ? "–" : "…");
const iconTone = (status: StepStatus) => (status === "passed" ? "passed" : status === "failed" || status === "timed_out" ? "failed" : "warning");

/** Business rules written by AI into the starter API, checked against the platform's code rules and tested in the sandbox. */
export default function AppCodePanel({ projectId, packageBuilt }: { projectId: string; packageBuilt: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const base = `/projects/${projectId}/handoff/app-code`;
  const load = useCallback(async () => { try { setState(await api<State>(base)); } catch (caught) { setError(explainError(caught)); } }, [base]);
  useEffect(() => { void load(); }, [load, packageBuilt]);
  const pending = state?.run?.status === "queued" || state?.run?.status === "running";
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [pending, load]);

  async function generate() {
    setBusy("ai"); setError("");
    try { setState(await api<State>(base, { method: "POST", body: JSON.stringify({ instruction: instruction.trim() || null }) })); setInstruction(""); }
    catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }
  async function download() {
    setBusy("zip"); setError("");
    try {
      const result = await api<{ files: { path: string; content: string }[] }>(`${base}/files`);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(makeZip(result.files.map((file) => ({ name: file.path, content: file.content }))));
      link.download = "app-with-rules.zip";
      document.body.appendChild(link); link.click(); link.remove();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }

  if (!state) return error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : null;
  const run = state.run;
  const tone = run?.status === "succeeded" ? styles.success : run?.status === "failed" || run?.status === "rejected" ? styles.warn : styles.info;
  return (
    <section className={styles.card} aria-label={t("Бизнес-правила в коде")}>
      <p className={styles.cardTitle}>{t("Бизнес-правила в коде")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>
        {t("ИИ допишет к стартовому коду правила из процесса и критериев приёмки — например, «клиент видит только свои заявки» — и тесты на каждое. Остальной код не меняется. Перед запуском платформа проверяет, что код не обращается к сети, файлам и системе; тесты идут в той же изолированной машине.")}
      </p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {!state.aiConfigured && <p className={`${styles.notice} ${styles.info}`} role="status">{t("ИИ пока не подключён к платформе, поэтому правила в коде написать нельзя. Стартовый код выше доступен.")}</p>}
      {run && (
        <>
          {!(run.status === "unavailable" && !state.sandboxConfigured) && (
            <p className={`${styles.notice} ${tone}`} role="status">
              <strong>{run.statusLabel}</strong>{pending ? t(" — обычно это занимает до минуты.") : "."}{run.error ? ` ${run.error}` : ""}
              {run.outdated ? ` ${t("Пакет собран заново после этой проверки — проверьте ещё раз.")}` : ""}
            </p>
          )}
          {run.status === "unavailable" && !state.sandboxConfigured && (
            <p className={`${styles.notice} ${styles.info}`} role="status">{t("Код написан и прошёл правила платформы, но не запускался: изолированная среда не подключена.")}</p>
          )}
          {run.instruction && <p className={styles.small}>{t("Запрос: «{0}»", [run.instruction])}</p>}
          {run.issues.length > 0 && (
            <ul className={styles.list}>{run.issues.map((issue, index) => <li key={index}><code>{issue.file}</code>: {issue.message}</li>)}</ul>
          )}
          {run.covered.length > 0 && (
            <>
              <p className={styles.label} style={{ margin: "12px 0 4px" }}>{t("Что ИИ сделал в коде")}</p>
              <ul className={styles.list}>{run.covered.map((item, index) => <li key={index}><strong>{item.rule}</strong> — {item.how}</li>)}</ul>
            </>
          )}
          {run.notCovered.length > 0 && (
            <>
              <p className={styles.label} style={{ margin: "12px 0 4px" }}>{t("Что осталось разработчику")}</p>
              <ul className={styles.list}>{run.notCovered.map((item, index) => <li key={index}><strong>{item.rule}</strong> — {item.reason}</li>)}</ul>
            </>
          )}
          {(run.covered.length > 0 || run.notCovered.length > 0) && <p className={styles.small}>{t("Это списки со слов ИИ. Что правила действительно работают, показывают только тесты.")}</p>}
          {run.status !== "rejected" && run.status !== "unavailable" && (
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
          {run.rulesCode && (
            <details className={styles.details}>
              <summary>{t("Посмотреть src/rules.js")}</summary>
              <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 12, maxHeight: 360 }}>{run.rulesCode}</pre>
            </details>
          )}
        </>
      )}
      {state.canGenerate && packageBuilt && (
        <label className={styles.field} style={{ margin: "14px 0 10px" }}>
          <span className={styles.label}>{t("Что учесть (необязательно)")}</span>
          <textarea className={styles.textarea} style={{ minHeight: 80 }} maxLength={1000} value={instruction} onChange={(event) => setInstruction(event.target.value)}
            placeholder={t("Например: отменить заявку можно только до начала уборки")} />
        </label>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {run && run.status !== "rejected" && <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => void download()}>{busy === "zip" ? t("Готовим архив…") : t("⬇ Скачать код (.zip)")}</button>}
        {state.canGenerate && packageBuilt && (
          <button className={run ? styles.ghost : `${styles.button} ${styles.block}`} disabled={Boolean(busy)} onClick={() => void generate()}>
            {busy === "ai" ? t("ИИ пишет код — до двух минут…") : run ? t("Написать заново") : t("Написать правила с ИИ")}
          </button>
        )}
      </div>
      {state.aiConfigured && !packageBuilt && <p className={styles.small}>{t("Сначала соберите пакет.")}</p>}
      {run && !state.canGenerate && !pending && state.runsLeft === 0 && <p className={styles.small}>{t("Для этого пакета ИИ уже писал код 10 раз. Соберите пакет заново, чтобы попробовать снова.")}</p>}
    </section>
  );
}
