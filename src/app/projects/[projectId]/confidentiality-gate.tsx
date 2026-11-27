"use client";

import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../journey.module.css";

type Pending = { assignmentId: string; stageKey: string; stageTitle: string; text: string; hash: string; changed: boolean };

/**
 * Shown to a specialist instead of the project while confidentiality terms wait for acceptance (403 CONFIDENTIALITY_NOT_ACCEPTED):
 * the text, and one button that accepts exactly this text.
 */
export default function ConfidentialityGate({ projectId, onAccepted }: { projectId: string; onAccepted: () => void }) {
  const [data, setData] = useState<{ projectName: string | null; invitedBy: string | null; pending: Pending[] } | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = () => api<{ projectName: string | null; invitedBy: string | null; pending: Pending[] }>(`/projects/${projectId}/confidentiality`).then(setData).catch((caught) => setError(explainError(caught)));
  useEffect(() => { void load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Nothing left to accept (accepted in another tab, or the owner removed the terms): open the project.
  useEffect(() => { if (data && !data.pending.length) onAccepted(); }, [data, onAccepted]);

  async function accept() {
    if (!data) return;
    setBusy(true); setError("");
    try {
      for (const item of data.pending) await api(`/projects/${projectId}/assignments/${item.assignmentId}/confidentiality/accept`, { method: "POST", body: JSON.stringify({ hash: item.hash }) });
      onAccepted();
    } catch (caught) {
      // The owner changed the text while it was open: show the new one.
      setError(explainError(caught)); setAgreed(false); await load();
    } finally { setBusy(false); }
  }

  if (!data) return error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : <p className={styles.muted} style={{ padding: 24 }}>{t("Загружаем условия…")}</p>;
  if (!data.pending.length) return null;
  const changed = data.pending.some((item) => item.changed);
  return (
    <section className={styles.card} aria-labelledby="confidentiality-gate">
      <p className={styles.kicker}>{data.projectName}</p>
      <h1 id="confidentiality-gate" className={styles.h2} style={{ marginTop: 4 }}>{changed ? t("Условия конфиденциальности изменились") : t("Условия конфиденциальности")}</h1>
      <p className={styles.small}>{changed
        ? t("{0} изменил(а) условия. Пока вы их не примете, этап закрыт, и время не считается.", [data.invitedBy ?? t("Владелец проекта")])
        : t("{0} просит принять условия до начала работы. Пока вы их не примете, этап закрыт, и время не считается.", [data.invitedBy ?? t("Владелец проекта")])}</p>
      {data.pending.map((item) => (
        <div key={item.assignmentId} style={{ marginTop: 12 }}>
          {data.pending.length > 1 && <p className={styles.label}>{t("Этап «{0}»", [item.stageTitle])}</p>}
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{item.text}</p>
        </div>
      ))}
      <label className={styles.checkRow} style={{ marginTop: 14 }}>
        <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
        <span>{t("Я прочитал(а) и принимаю условия конфиденциальности")}</span>
      </label>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      <div className={styles.row} style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" className={styles.button} disabled={!agreed || busy} onClick={() => void accept()}>{busy ? t("Сохраняем…") : t("Принять и открыть этап")}</button>
        <a className={styles.ghost} href="/projects">{t("Не сейчас")}</a>
      </div>
      <p className={styles.small}>{t("Если не согласны с текстом, напишите владельцу проекта: он может изменить условия или отозвать приглашение.")}</p>
    </section>
  );
}
