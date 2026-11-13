"use client";

import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../../journey.module.css";

type Option = { key: string; name: string; description: string | null; isDefault: boolean; version: number | null };
type ProjectProfile = { chosen: string | null; effective: Option | null; options: Option[]; canChange: boolean };

/**
 * Which rules the pre-publication check of this project uses. Shown only when there is more than one active profile.
 * A change applies to the next build; reports already made keep the rules they were made with.
 */
export default function QualityProfilePicker({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProjectProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { api<ProjectProfile>(`/projects/${projectId}/quality-profile`).then(setData).catch(() => undefined); }, [projectId]);
  if (!data || data.options.length < 2) return null;

  async function choose(key: string | null) {
    setBusy(true); setError(""); setSaved(false);
    try { setData(await api<ProjectProfile>(`/projects/${projectId}/quality-profile`, { method: "POST", body: JSON.stringify({ key }) })); setSaved(true); }
    catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }
  const current = data.chosen ?? "";
  const effective = data.effective;
  return (
    <details className={styles.details} style={{ marginTop: 10 }}>
      <summary>{t("Правила проверки: {0}", [effective?.name ?? t("стандартные BuildPath")])}</summary>
      <p className={styles.small} style={{ margin: "6px 0" }}>{t("Набор правил решает, какие замечания мешают публикации. Новые правила применятся при следующей сборке; готовые отчёты не меняются.")}</p>
      {data.canChange ? (
        <label className={styles.field} style={{ marginBottom: 0 }}>
          <span className={styles.label}>{t("Для этого проекта")}</span>
          <select className={styles.input} value={current} disabled={busy} onChange={(event) => void choose(event.target.value || null)}>
            <option value="">{t("По умолчанию ({0})", [data.options.find((item) => item.isDefault)?.name ?? t("стандартные BuildPath")])}</option>
            {data.options.filter((item) => !item.isDefault).map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
          </select>
          {effective?.description && <span className={styles.why}>{effective.description}</span>}
        </label>
      ) : <p className={styles.small}>{t("Правила выбирают владелец или менеджер проекта.")}</p>}
      {saved && <p className={`${styles.notice} ${styles.success}`} role="status">{t("Сохранено. Соберите сайт заново, чтобы проверить его по этим правилам.")}</p>}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    </details>
  );
}
