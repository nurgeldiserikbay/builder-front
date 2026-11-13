"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../../journey.module.css";

type Category = "performance" | "accessibility" | "best-practices" | "seo";
type Page = {
  path: string; scores: Record<Category, number | null>; error: string | null;
  metrics: { fcpMs: number | null; lcpMs: number | null; cls: number | null; tbtMs: number | null; speedIndexMs: number | null };
  issues: { id: string; category: Category; categoryLabel: string; title: string; score: number }[];
};
type Check = {
  id: string; status: "queued" | "running" | "succeeded" | "failed" | "unavailable"; statusLabel: string; error: string | null; finishedAt: string | null;
  result: { tool: { lighthouse: string; browser: string }; measuredAt: string; pages: Page[]; skippedPages: number } | null;
  categories: { key: Category; label: string }[]; note: string;
};
type State = { check: Check | null; canRerun: boolean };

const tone = (score: number | null) => (score === null ? "var(--line-strong)" : score >= 90 ? "var(--brand)" : score >= 50 ? "var(--attention, #b7791f)" : "var(--danger)");
const seconds = (ms: number | null) => (ms === null ? "—" : t("{0} с", [(ms / 1000).toLocaleString(dateLocale(), { maximumFractionDigits: 1 })]));

/** The build measured in a real browser (Lighthouse). Advice next to the release gate; it never blocks publishing. */
export default function BrowserCheckPanel({ projectId, versionId }: { projectId: string; versionId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const base = `/projects/${projectId}/stages/build/browser-check?versionId=${versionId}`;
  const load = useCallback(async () => { try { setState(await api<State>(base)); } catch (caught) { setError(explainError(caught)); } }, [base]);
  useEffect(() => { void load(); }, [load]);
  const pending = state?.check?.status === "queued" || state?.check?.status === "running";
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [pending, load]);

  async function rerun() {
    setBusy(true); setError("");
    try { setState(await api<State>(base, { method: "POST" })); } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  if (!state) return error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : null;
  const check = state.check;
  return (
    <div style={{ marginTop: 16 }}>
      <p className={styles.cardTitle}>{t("Проверка в браузере")}</p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {!check && <p className={styles.small}>{t("Эту сборку ещё не проверяли в браузере.")}</p>}
      {check && (check.status !== "succeeded" || !check.result) && (
        <p className={`${styles.notice} ${check.status === "failed" ? styles.warn : styles.info}`} role="status">
          {check.statusLabel}{pending ? t(" — обычно это занимает до минуты.") : ""}{check.error ? ` ${check.error}` : ""}
        </p>
      )}
      {check?.result && check.result.pages.map((page) => (
        <div key={page.path} style={{ margin: "10px 0" }}>
          {check.result!.pages.length > 1 && <p className={styles.small} style={{ margin: "0 0 4px" }}><strong>{page.path}</strong></p>}
          {page.error ? <p className={styles.small}>{page.error}</p> : (
            <>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                {check.categories.map((category) => (
                  <li key={category.key} style={{ border: "1px solid var(--line)", borderTop: `4px solid ${tone(page.scores[category.key])}`, borderRadius: 10, padding: "8px 10px" }}>
                    <span className={styles.small}>{category.label}</span><br />
                    <strong style={{ fontSize: 22 }}>{page.scores[category.key] ?? "—"}</strong><span className={styles.small}> / 100</span>
                  </li>
                ))}
              </ul>
              <p className={styles.small} style={{ margin: "6px 0" }}>
                {t("Первый текст: {0}. Главный блок: {1}. Сдвиг макета: {2}. Блокировка: {3} мс.", [seconds(page.metrics.fcpMs), seconds(page.metrics.lcpMs), page.metrics.cls ?? "—", page.metrics.tbtMs ?? "—"])}
              </p>
              {page.issues.length > 0 && (
                <details className={styles.details}>
                  <summary>{t("Что можно улучшить ({0})", [page.issues.length])}</summary>
                  <ul className={styles.list}>{page.issues.map((issue) => <li key={`${issue.category}-${issue.id}`}>{issue.categoryLabel}: {issue.title}</li>)}</ul>
                </details>
              )}
            </>
          )}
        </div>
      ))}
      {check && (
        <p className={styles.small}>
          {check.note}
          {check.result ? ` ${t("Lighthouse {0}, {1}, {2}.", [check.result.tool.lighthouse, check.result.tool.browser || "Chromium", new Date(check.result.measuredAt).toLocaleString(dateLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })])}` : ""}
          {check.result?.skippedPages ? ` ${t("Проверены первые 7 страниц.")}` : ""}
        </p>
      )}
      {state.canRerun && (
        <button type="button" className={styles.ghost} disabled={busy} onClick={() => void rerun()}>{check ? t("Проверить ещё раз") : t("Проверить в браузере")}</button>
      )}
    </div>
  );
}
