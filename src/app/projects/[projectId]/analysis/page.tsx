"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError, saveFromApi } from "@/lib/journey";
import { fileSize } from "../stages/[stageKey]/files";
import styles from "../../journey.module.css";
import AppHeader from "../../../app-header";

type Run = {
  id: string; status: "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled"; statusLabel: string; sourceKind: string; sourceKindLabel: string;
  sourceLabel: string; sourceRef: string | null; sourceSha256: string | null; error: string | null; createdAt: string; finishedAt: string | null; requestedBy: string;
};
type Finding = { id: string; code: string; categoryLabel: string; severity: "high" | "medium" | "low" | "info"; severityLabel: string; confidence: string; title: string; explanation: string; remediation: string; evidence: { path: string; line?: number }[] };
type Report = {
  status: string; profile: string; source: { sha256: string; bytes: number; kindLabel: string; label: string; revision: string | null };
  summary: { files: number; directories: number; textFilesRead: number; lines: number; languages: { name: string; files: number; lines: number }[]; stack: { key: string; label: string; evidence: string }[]; routes: string[]; readmeExcerpt: string | null };
  findings: Finding[]; counts: Record<"high" | "medium" | "low" | "info", number>;
  checks: { key: string; label: string; status: string; statusLabel: string }[]; unverified: { key: string; text: string }[]; disclaimer: string;
};
type List = {
  runs: Run[]; canRun: boolean;
  sources: { files: { id: string; name: string; sizeBytes: number; stageKey: string; createdAt: string }[]; repository: { provider: string; repoPath: string; defaultBranch: string; canUse: boolean } | null; publicRepo: boolean };
};

const tones: Record<Run["status"], string> = { queued: "active", running: "active", succeeded: "done", partial: "attention", failed: "attention", cancelled: "closed" };
const severityColor: Record<Finding["severity"], string> = { high: "var(--danger)", medium: "var(--attention, #b7791f)", low: "var(--brand)", info: "var(--line-strong)" };
const when = (value: string) => new Date(value).toLocaleString(dateLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const key = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");

export default function AnalysisPage() {
  const router = useRouter();
  const { projectId } = useParams<{ projectId: string }>();
  const [list, setList] = useState<List | null>(null);
  const [source, setSource] = useState<"file" | "repository" | "public_repo">("file");
  // The stage files panel links here with ?file=<id>; read once on the client.
  const [fileId, setFileId] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("file") ?? ""));
  const [url, setUrl] = useState("");
  const [ref, setRef] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [report, setReport] = useState<(Run & { report: Report | null }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await api<List>(`/projects/${projectId}/analysis-runs`);
      setList(next);
      setFileId((current) => current || next.sources.files[0]?.id || "");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=/projects/${projectId}/analysis`); return; }
      setError(explainError(caught));
    }
  }, [projectId, router]);
  useEffect(() => { void load(); }, [load]);

  const openRun = useCallback(async (id: string) => {
    setOpen(id);
    try { setReport(await api<Run & { report: Report | null }>(`/projects/${projectId}/analysis-runs/${id}`)); } catch (caught) { setError(explainError(caught)); }
  }, [projectId]);

  // While something is queued or running, look again every few seconds.
  const pending = Boolean(list?.runs.some((run) => run.status === "queued" || run.status === "running"));
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => { void load(); if (open) void openRun(open); }, 3000);
    return () => clearInterval(timer);
  }, [pending, load, open, openRun]);

  async function start() {
    setBusy(true); setError("");
    try {
      const body = source === "file" ? { source, fileId } : source === "repository" ? { source, ref: ref.trim() || null } : { source, url: url.trim(), ref: ref.trim() || null };
      const run = await api<Run>(`/projects/${projectId}/analysis-runs`, { method: "POST", body: JSON.stringify({ ...body, idempotencyKey: key() }) });
      await load();
      void openRun(run.id);
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  const ready = source === "file" ? Boolean(fileId) : source === "repository" ? Boolean(list?.sources.repository?.canUse) : /^https:\/\/github\.com\/[^/]+\/[^/]+/.test(url.trim());
  return (
    <div className={styles.shell}>
      <AppHeader back={{ href: `/projects/${projectId}`, label: t("← Проект") }} title={t("Разбор кода")} />
      <main className={styles.container}>
        <h1 className={styles.h1}>{t("Разбор кода")}</h1>
        <p style={{ maxWidth: "70ch" }}>{t("BuildPath изучит архив или репозиторий в режиме чтения: найдёт технологии, страницы, ключи и пароли в коде, лишние папки и пробелы в документации. Код не запускается, не меняется и не отправляется в ИИ. Каждая находка указывает файл и строку.")}</p>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}

        {list?.canRun && (
          <section className={styles.card} aria-labelledby="new-run">
            <p id="new-run" className={styles.cardTitle}>{t("Что разобрать")}</p>
            <div role="radiogroup" aria-label={t("Источник")} style={{ display: "grid", gap: 8, margin: "8px 0 12px" }}>
              {([
                ["file", t("ZIP-архив из файлов этапов"), list.sources.files.length ? t("Архивов: {0}", [list.sources.files.length]) : t("Сначала добавьте ZIP в «Файлы этапа» на любом этапе")],
                ["repository", t("Подключённый репозиторий"), list.sources.repository ? `${list.sources.repository.repoPath}${list.sources.repository.canUse ? "" : t(" — запускает владелец или администратор")}` : t("Репозиторий не подключён")],
                ["public_repo", t("Открытый репозиторий GitHub"), t("Скачиваем без вашего доступа, только чтение")],
              ] as const).map(([value, label, hint]) => (
                <label key={value} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <input type="radio" name="source" checked={source === value} onChange={() => setSource(value)} style={{ width: 20, height: 20, flex: "none", marginTop: 3 }} />
                  <span><strong>{label}</strong><br /><span className={styles.small}>{hint}</span></span>
                </label>
              ))}
            </div>
            {source === "file" && list.sources.files.length > 0 && (
              <label className={styles.small}>{t("Архив")}
                <select className={styles.select} value={fileId} onChange={(event) => setFileId(event.target.value)}>
                  {list.sources.files.map((file) => <option key={file.id} value={file.id}>{file.name} · {fileSize(file.sizeBytes)}</option>)}
                </select>
              </label>
            )}
            {source === "public_repo" && (
              <label className={styles.small}>{t("Ссылка на репозиторий")}
                <input className={styles.input} inputMode="url" placeholder="https://github.com/owner/repo" value={url} maxLength={300} onChange={(event) => setUrl(event.target.value)} />
              </label>
            )}
            {source !== "file" && (
              <label className={styles.small} style={{ display: "block", marginTop: 8 }}>{t("Ветка (необязательно)")}
                <input className={styles.input} placeholder={source === "repository" ? list.sources.repository?.defaultBranch ?? "main" : t("основная ветка")} value={ref} maxLength={200} onChange={(event) => setRef(event.target.value)} />
              </label>
            )}
            <p className={styles.small}>{t("Не проверяется: работает ли код, собирается ли он, проходят ли тесты и есть ли уязвимости в библиотеках — отчёт перечислит это отдельно. Архив до 40 МБ и до 5000 файлов; папки node_modules и vendor лучше убрать.")}</p>
            <button type="button" className={styles.button} disabled={busy || !ready || pending} onClick={() => void start()}>{busy ? t("Запускаем…") : t("Начать разбор")}</button>
          </section>
        )}

        {list && list.runs.length === 0 && <p className={styles.small}>{t("Разборов ещё не было.")}</p>}
        {list && list.runs.length > 0 && (
          <section aria-labelledby="runs-title">
            <h2 id="runs-title" className={styles.h2}>{t("Разборы")}</h2>
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
              {list.runs.map((run) => (
                <li key={run.id} className={styles.card} style={{ margin: 0, padding: 16 }}>
                  <p style={{ margin: 0, overflowWrap: "anywhere" }}><strong>{run.sourceLabel}</strong>{run.sourceRef ? ` · ${run.sourceRef}` : ""}</p>
                  <p className={styles.small} style={{ margin: "2px 0" }}>{run.sourceKindLabel} · {run.requestedBy} · {when(run.createdAt)}</p>
                  <span className={`${styles.chip} ${styles[tones[run.status]]}`}>{run.statusLabel}</span>
                  {run.error && <p className={styles.small} style={{ margin: "6px 0 0" }}>{run.error}</p>}
                  {(run.status === "succeeded" || run.status === "partial") && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      <button type="button" className={styles.secondary} onClick={() => (open === run.id ? (setOpen(null), setReport(null)) : void openRun(run.id))}>{open === run.id ? t("Скрыть отчёт") : t("Открыть отчёт")}</button>
                      <button type="button" className={styles.ghost} onClick={() => void saveFromApi(`/projects/${projectId}/analysis-runs/${run.id}/export?format=md`, "analysis.md").catch((caught) => setError(explainError(caught)))}>{t("Скачать .md")}</button>
                      <button type="button" className={styles.ghost} onClick={() => void saveFromApi(`/projects/${projectId}/analysis-runs/${run.id}/export?format=json`, "analysis.json").catch((caught) => setError(explainError(caught)))}>{t("Скачать .json")}</button>
                    </div>
                  )}
                  {open === run.id && report?.id === run.id && report.report && <ReportView report={report.report} />}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function ReportView({ report }: { report: Report }) {
  const total = report.findings.length;
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ margin: "0 0 6px" }}>
        {total ? t("Находок: {0} — важных {1}, средних {2}, мелких {3}, к сведению {4}.", [total, report.counts.high, report.counts.medium, report.counts.low, report.counts.info]) : t("Находок нет.")}
      </p>
      <p className={styles.small} style={{ margin: "0 0 10px" }}>
        {t("Файлов: {0}, прочитано текстовых: {1}, строк: {2}.", [report.summary.files, report.summary.textFilesRead, report.summary.lines.toLocaleString(dateLocale())])}
        {report.summary.stack.length > 0 && <> {t("Технологии: {0}.", [report.summary.stack.map((item) => item.label).join(", ")])}</>}
      </p>
      {report.summary.routes.length > 0 && (
        <details className={styles.details} style={{ margin: "0 0 10px" }}>
          <summary>{t("Страницы по именам файлов ({0})", [report.summary.routes.length])}</summary>
          <p className={styles.small} style={{ overflowWrap: "anywhere" }}>{report.summary.routes.join(", ")}</p>
        </details>
      )}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
        {report.findings.map((finding) => (
          <li key={finding.id} style={{ borderLeft: `3px solid ${severityColor[finding.severity]}`, paddingLeft: 10 }}>
            <p className={styles.small} style={{ margin: 0 }}><strong>{finding.severityLabel}</strong> · {finding.categoryLabel}{finding.confidence === "likely" ? ` · ${t("возможно")}` : ""}</p>
            <p style={{ margin: "2px 0" }}><strong>{finding.title}</strong></p>
            <p style={{ margin: "2px 0" }}>{finding.explanation}</p>
            <p className={styles.small} style={{ margin: "2px 0" }}><strong>{t("Что сделать:")}</strong> {finding.remediation}</p>
            <p className={styles.small} style={{ margin: "2px 0", overflowWrap: "anywhere" }}>{t("Где:")} {finding.evidence.map((item) => `${item.path}${item.line ? `:${item.line}` : ""}`).join(", ")}</p>
          </li>
        ))}
      </ul>
      <details className={styles.details}>
        <summary>{t("Что проверено и что нет")}</summary>
        <ul className={styles.list}>{report.checks.map((check) => <li key={check.key}>{check.label}: {check.statusLabel}</li>)}</ul>
        <p className={styles.small} style={{ margin: "8px 0 4px" }}><strong>{t("Не проверено:")}</strong></p>
        <ul className={styles.list}>{report.unverified.map((item) => <li key={item.key}>{item.text}</li>)}</ul>
        <p className={styles.small} style={{ overflowWrap: "anywhere" }}>SHA-256: {report.source.sha256} · {t("профиль")} {report.profile}</p>
      </details>
      <p className={styles.small} style={{ marginTop: 10 }}>{report.disclaimer}</p>
    </div>
  );
}
