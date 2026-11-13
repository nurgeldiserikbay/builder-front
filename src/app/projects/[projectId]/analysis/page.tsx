"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError, saveFromApi, type CatalogType } from "@/lib/journey";
import { fileSize } from "../stages/[stageKey]/files";
import styles from "../../journey.module.css";
import AppHeader from "../../../app-header";

type Run = {
  id: string; status: "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled"; statusLabel: string; sourceKind: string; sourceKindLabel: string;
  sourceLabel: string; sourceRef: string | null; sourceSha256: string | null; error: string | null; createdAt: string; finishedAt: string | null; requestedBy: string;
};
type Finding = { suggestedStageKey?: string | null; id: string; code: string; categoryLabel: string; severity: "high" | "medium" | "low" | "info"; severityLabel: string; confidence: string; title: string; explanation: string; remediation: string; evidence: { path: string; line?: number }[] };
type Report = {
  type: "code" | "document";
  document: { format: string; words: number; paragraphs: number; pages: number | null; headings: string[]; sections: { key: string; label: string; found: boolean; paragraph: number | null }[] } | null;
  status: string; profile: string; source: { sha256: string; bytes: number; kindLabel: string; label: string; revision: string | null };
  summary: { files: number; directories: number; textFilesRead: number; lines: number; languages: { name: string; files: number; lines: number }[]; stack: { key: string; label: string; evidence: string }[]; routes: string[]; readmeExcerpt: string | null };
  findings: Finding[]; counts: Record<"high" | "medium" | "low" | "info", number>;
  checks: { key: string; label: string; status: string; statusLabel: string }[]; unverified: { key: string; text: string }[]; disclaimer: string;
};
type List = {
  project: { name: string; analysisOnly: boolean };
  stages: { key: string; title: string }[]; canAddRoute: boolean;
  runs: Run[]; canRun: boolean;
  sources: { files: { id: string; name: string; sizeBytes: number; stageKey: string | null; createdAt: string; canDelete: boolean }[]; repository: { provider: string; repoPath: string; defaultBranch: string; canUse: boolean } | null; publicRepo: boolean; canUpload: boolean };
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

  async function uploadZip(file: File | undefined) {
    if (!file) return;
    setError("");
    if (file.size > 15 * 1024 * 1024) { setError(t("Файл больше 15 МБ. Сожмите его или разделите на части.")); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const created = await api<{ createdId: string }>(`/projects/${projectId}/analysis-sources`, { method: "POST", body: form });
      setSource("file"); setFileId(created.createdId);
      await load();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }
  async function removeZip(id: string, name: string) {
    if (!window.confirm(t("Удалить файл «{0}»? Это нельзя отменить.", [name]))) return;
    setBusy(true); setError("");
    try { await api(`/projects/${projectId}/analysis-sources/${id}`, { method: "DELETE" }); setFileId(""); await load(); } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

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
      <AppHeader back={list?.project.analysisOnly ? { href: "/projects", label: t("← Проекты") } : { href: `/projects/${projectId}`, label: t("← Проект") }} title={t("Разбор кода и документов")} />
      <main className={styles.container}>
        {list?.project.analysisOnly && <p className={styles.kicker}>{t("Только анализ")} · {list.project.name}</p>}
        <h1 className={styles.h1}>{t("Разбор кода и документов")}</h1>
        <p style={{ maxWidth: "70ch" }}>{t("BuildPath изучит архив или репозиторий в режиме чтения: найдёт технологии, страницы, ключи и пароли в коде, лишние папки и пробелы в документации. Код не запускается, не меняется и не отправляется в ИИ. Каждая находка указывает файл и строку.")}{" "}{t("ТЗ в PDF, Word или тексте проверяется так же: какие разделы есть, где размытые формулировки и открытые вопросы — с номером абзаца.")}</p>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}

        {list?.canRun && (
          <section className={styles.card} aria-labelledby="new-run">
            <p id="new-run" className={styles.cardTitle}>{t("Что разобрать")}</p>
            <div role="radiogroup" aria-label={t("Источник")} style={{ display: "grid", gap: 8, margin: "8px 0 12px" }}>
              {([
                ["file", t("Файл: ZIP, PDF, Word или текст"), list.sources.files.length ? t("Файлов: {0}", [list.sources.files.length]) : t("Загрузите файл ниже или добавьте его в «Файлы этапа»")],
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
            {source === "file" && list.sources.files.find((file) => file.id === fileId)?.canDelete && (
              <button type="button" className={styles.ghost} disabled={busy} onClick={() => { const file = list.sources.files.find((item) => item.id === fileId)!; void removeZip(file.id, file.name); }}>{t("Удалить этот архив")}</button>
            )}
            {source === "file" && list.sources.canUpload && (
              <label className={styles.secondary} style={{ cursor: busy ? "not-allowed" : "pointer", margin: "8px 0" }}>
                {busy ? t("Загружаем и проверяем…") : t("Загрузить файл")}
                <input type="file" hidden disabled={busy} accept=".zip,.pdf,.docx,.txt,.md" onChange={(event) => { void uploadZip(event.target.files?.[0]); event.target.value = ""; }} />
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
        {list?.canAddRoute && <RouteCard projectId={projectId} />}
        {list?.project.analysisOnly && <p className={styles.small}>{t("Нужно проверить опубликованный сайт — скорость, доступность, соответствие ТЗ и дизайну? Это делает")}{" "}<a href="/review">{t("«Сверка сайта»")}</a>.</p>}
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
                  {open === run.id && report?.id === run.id && report.report && <ReportView report={report.report} projectId={projectId} runId={run.id} stages={list.stages} />}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function ReportView({ report, projectId, runId, stages }: { report: Report; projectId: string; runId: string; stages: { key: string; title: string }[] }) {
  const total = report.findings.length;
  const [stageFor, setStageFor] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<Record<string, { stageKey: string; stageTitle: string }>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function toRemark(findingId: string) {
    const stageKey = stageFor[findingId] ?? report.findings.find((item) => item.id === findingId)?.suggestedStageKey ?? stages[0]?.key;
    if (!stageKey) return;
    setBusy(findingId); setError("");
    try {
      const result = await api<{ stageKey: string; stageTitle: string }>(`/projects/${projectId}/analysis-runs/${runId}/findings/${encodeURIComponent(findingId)}/remark`, { method: "POST", body: JSON.stringify({ stageKey }) });
      setAdded((current) => ({ ...current, [findingId]: result }));
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ margin: "0 0 6px" }}>
        {total ? t("Находок: {0} — важных {1}, средних {2}, мелких {3}, к сведению {4}.", [total, report.counts.high, report.counts.medium, report.counts.low, report.counts.info]) : t("Находок нет.")}
      </p>
      <p className={styles.small} style={{ margin: "0 0 10px" }}>
        {report.document ? t("Слов: {0}, абзацев: {1}.", [report.document.words.toLocaleString(dateLocale()), report.document.paragraphs]) : t("Файлов: {0}, прочитано текстовых: {1}, строк: {2}.", [report.summary.files, report.summary.textFilesRead, report.summary.lines.toLocaleString(dateLocale())])}
        {report.summary.stack.length > 0 && <> {t("Технологии: {0}.", [report.summary.stack.map((item) => item.label).join(", ")])}</>}
      </p>
      {report.document && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 10px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 4 }}>
          {report.document.sections.map((section) => (
            <li key={section.key} className={styles.small}><span aria-hidden="true">{section.found ? "✓" : "✗"}</span> {section.label}{section.found ? "" : ` — ${t("не найдено")}`}</li>
          ))}
        </ul>
      )}
      {report.summary.routes.length > 0 && (
        <details className={styles.details} style={{ margin: "0 0 10px" }}>
          <summary>{t("Страницы по именам файлов ({0})", [report.summary.routes.length])}</summary>
          <p className={styles.small} style={{ overflowWrap: "anywhere" }}>{report.summary.routes.join(", ")}</p>
        </details>
      )}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
        {report.findings.map((finding) => (
          <li key={finding.id} style={{ borderLeft: `3px solid ${severityColor[finding.severity]}`, paddingLeft: 10 }}>
            <p className={styles.small} style={{ margin: 0 }}><strong>{finding.severityLabel}</strong> · {finding.categoryLabel}{finding.confidence === "likely" ? ` · ${t("возможно")}` : ""}</p>
            <p style={{ margin: "2px 0" }}><strong>{finding.title}</strong></p>
            <p style={{ margin: "2px 0" }}>{finding.explanation}</p>
            <p className={styles.small} style={{ margin: "2px 0" }}><strong>{t("Что сделать:")}</strong> {finding.remediation}</p>
            {stages.length > 0 && (added[finding.id]
              ? <p className={styles.small} style={{ margin: "4px 0" }}>✓ {t("Добавлено в замечания этапа")} <a href={`/projects/${projectId}/stages/${added[finding.id]!.stageKey}`}>«{added[finding.id]!.stageTitle}»</a></p>
              : (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "4px 0" }}>
                  <select className={styles.select} style={{ flex: "1 1 160px", minHeight: 40 }} aria-label={t("Этап для замечания")} value={stageFor[finding.id] ?? finding.suggestedStageKey ?? stages[0]!.key} onChange={(event) => setStageFor((current) => ({ ...current, [finding.id]: event.target.value }))}>
                    {stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.title}</option>)}
                  </select>
                  <button type="button" className={styles.ghost} disabled={busy === finding.id} onClick={() => void toRemark(finding.id)}>{t("В замечания этапа")}</button>
                </div>
              ))}
            <p className={styles.small} style={{ margin: "2px 0", overflowWrap: "anywhere" }}>{t("Где:")} {finding.evidence.map((item) => (report.type === "document" ? (item.line ? t("абзац {0}", [item.line]) : item.path) : `${item.path}${item.line ? `:${item.line}` : ""}`)).join(", ")}</p>
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

/** «Только анализ» → a project with stages: the owner picks the type; reports and files stay. */
function RouteCard({ projectId }: { projectId: string }) {
  const [types, setTypes] = useState<CatalogType[]>([]);
  const [typeKey, setTypeKey] = useState("");
  const [locale, setLocale] = useState<"ru" | "en">("ru");
  const [start, setStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || types.length) return;
    void api<{ projectTypes: CatalogType[] }>("/journey/catalog").then((catalog) => { setTypes(catalog.projectTypes); setTypeKey(catalog.projectTypes[0]?.key ?? ""); }).catch((caught) => setError(explainError(caught)));
  }, [open, types.length]);
  async function create() {
    setBusy(true); setError("");
    try {
      await api(`/projects/${projectId}/route`, { method: "POST", body: JSON.stringify({ projectType: typeKey, locale, ...(start ? { startStageKey: start } : {}) }) });
      window.location.href = `/projects/${projectId}`;
    } catch (caught) { setError(explainError(caught)); setBusy(false); }
  }
  return (
    <section className={styles.card} aria-labelledby="route-title">
      <p id="route-title" className={styles.cardTitle}>{t("Перейти к доработке")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Если по отчёту решили делать сайт заново или дорабатывать — добавьте проекту этапы. Отчёты и файлы останутся, находки можно будет отправить в замечания этапов. С этого момента проект занимает место в тарифе.")}</p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {!open ? <button type="button" className={styles.secondary} onClick={() => setOpen(true)}>{t("Выбрать тип проекта…")}</button> : (
        <div style={{ display: "grid", gap: 10 }}>
          <label className={styles.small}>{t("Тип проекта")}
            <select className={styles.select} value={typeKey} onChange={(event) => { setTypeKey(event.target.value); setStart(""); }}>
              {types.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}
            </select>
          </label>
          {types.find((item) => item.key === typeKey) && <p className={styles.small} style={{ margin: 0 }}>{t("Этапы:")}{" "}{types.find((item) => item.key === typeKey)!.stages.map((stage) => stage.title).join(" → ")}</p>}
          {(types.find((item) => item.key === typeKey)?.stages ?? []).some((stage, index) => index > 0 && stage.importHint) && (
            <label className={styles.small}>{t("С какого этапа начать")}
              <select className={styles.select} value={start} onChange={(event) => setStart(event.target.value)}>
                <option value="">{t("С самого начала")}</option>
                {types.find((item) => item.key === typeKey)!.stages.filter((stage, index) => index > 0 && stage.importHint).map((stage) => <option key={stage.key} value={stage.key}>{t("У меня уже есть:")} {stage.title.toLowerCase()}</option>)}
              </select>
            </label>
          )}
          <label className={styles.small}>{t("Язык сайта")}
            <select className={styles.select} value={locale} onChange={(event) => setLocale(event.target.value as "ru" | "en")}>
              <option value="ru">Русский</option><option value="en">English</option>
            </select>
          </label>
          <button type="button" className={styles.button} disabled={busy || !typeKey} onClick={() => void create()}>{busy ? t("Создаём…") : t("Добавить этапы")}</button>
        </div>
      )}
    </section>
  );
}
