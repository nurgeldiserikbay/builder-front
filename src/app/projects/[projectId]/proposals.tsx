"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { dateLocale, t } from "@/lib/i18n";
import { explainError } from "@/lib/journey";
import styles from "../journey.module.css";

export type Proposal = {
  id: string; text: string; status: "open" | "accepted" | "rejected" | "withdrawn"; decisionNote: string | null; decidedAt: string | null; createdAt: string;
  fromStageKey: string; fromTitle: string; targetStageKey: string; targetTitle: string; author: string; mine: boolean;
};

const statusLabel: Record<Proposal["status"], string> = { open: t("ждёт решения"), accepted: t("принято"), rejected: t("отклонено"), withdrawn: t("отозвано") };

/**
 * Change proposals: owners and managers decide; a specialist sees their own and can withdraw open ones.
 * filter: only proposals about this requirement stage (targetStageKey) or from this specialist stage (fromStageKey).
 */
export default function ProposalsPanel({ projectId, filter, aiReady, onDecided }: { projectId: string; filter?: { targetStageKey?: string; fromStageKey?: string }; aiReady: boolean; onDecided?: () => void }) {
  const [list, setList] = useState<Proposal[] | null>(null);
  const [canDecide, setCanDecide] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ id: string; text: string; stageKey: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ canDecide: boolean; proposals: Proposal[] }>(`/projects/${projectId}/change-proposals`);
      setCanDecide(data.canDecide);
      setList(data.proposals.filter((item) => (!filter?.targetStageKey || item.targetStageKey === filter.targetStageKey) && (!filter?.fromStageKey || item.fromStageKey === filter.fromStageKey)));
    } catch (caught) { setError(explainError(caught)); }
  }, [projectId, filter?.targetStageKey, filter?.fromStageKey]);
  useEffect(() => { void load(); }, [load]);

  async function decide(item: Proposal, decision: "accept" | "reject", applyWithAi = false) {
    setBusy(item.id); setError(""); setResult(null);
    try {
      const data = await api<{ generation: { ok: boolean; code: string | null } | null }>(`/projects/${projectId}/change-proposals/${item.id}/decide`, { method: "POST", body: JSON.stringify({ decision, applyWithAi, note: notes[item.id]?.trim() || undefined }) });
      if (decision === "accept") {
        setResult({ id: item.id, stageKey: item.targetStageKey, text: data.generation?.ok
          ? t("Этап «{0}» открыт, ИИ подготовил черновик по предложению. Проверьте его и примите этап — этапы, которые на нём построены, получат уведомление.", [t(item.targetTitle)])
          : data.generation ? t("Этап «{0}» открыт, но ИИ не смог подготовить черновик ({1}). Внесите изменение сами по тексту предложения и примите этап.", [t(item.targetTitle), explainError(new Error(data.generation.code ?? ""))])
            : t("Этап «{0}» открыт для изменений. Внесите изменение по тексту предложения и примите этап.", [t(item.targetTitle)]) });
      }
      await load();
      onDecided?.();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }

  async function withdraw(item: Proposal) {
    setBusy(item.id); setError("");
    try { await api(`/projects/${projectId}/change-proposals/${item.id}/withdraw`, { method: "POST" }); await load(); } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }

  if (!list || (!list.length && !error)) return null;
  const open = list.filter((item) => item.status === "open");
  const past = list.filter((item) => item.status !== "open");
  return (
    <section className={styles.card} aria-labelledby="proposals-title">
      <p id="proposals-title" className={styles.cardTitle}>{canDecide ? t("Предложения изменений от специалистов") : t("Ваши предложения изменений")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>{canDecide
        ? t("Специалист не может сам менять принятые требования — он предлагает, вы решаете. Пока вы не приняли предложение, ничего не меняется.")
        : t("Владелец решает, принять ли предложение. Пока он не принял, требование остаётся прежним.")}</p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {result && <p className={`${styles.notice} ${styles.success}`} role="status">{result.text}{" "}<a href={`/projects/${projectId}/stages/${result.stageKey}`}>{t("Открыть этап")}</a></p>}
      {open.map((item) => (
        <div key={item.id} className={styles.proposal}>
          <p className={styles.small} style={{ margin: 0 }}>{canDecide ? t("{0}, этап «{1}» → «{2}»", [item.author, t(item.fromTitle), t(item.targetTitle)]) : t("Об этапе «{0}»", [t(item.targetTitle)])} · {new Date(item.createdAt).toLocaleDateString(dateLocale())}</p>
          <p style={{ margin: "6px 0 10px", whiteSpace: "pre-wrap" }}>{item.text}</p>
          {canDecide ? <>
            <input className={styles.input} maxLength={500} placeholder={t("Комментарий специалисту (необязательно)")} value={notes[item.id] ?? ""} onChange={(event) => setNotes({ ...notes, [item.id]: event.target.value })} />
            <div className={styles.row} style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {aiReady && <button className={styles.button} disabled={Boolean(busy)} onClick={() => void decide(item, "accept", true)}>{busy === item.id ? t("Готовим…") : t("Принять и поручить ИИ")}</button>}
              <button className={aiReady ? styles.secondary : styles.button} disabled={Boolean(busy)} onClick={() => void decide(item, "accept")}>{t("Принять, изменю сам")}</button>
              <button className={styles.ghost} disabled={Boolean(busy)} onClick={() => void decide(item, "reject")}>{t("Отклонить")}</button>
            </div>
          </> : item.mine && <button className={styles.ghost} disabled={Boolean(busy)} onClick={() => void withdraw(item)}>{t("Отозвать")}</button>}
        </div>
      ))}
      {past.length > 0 && (
        <details className={styles.details}>
          <summary>{t("Решённые ({0})", [past.length])}</summary>
          <ul className={styles.list}>
            {past.map((item) => <li key={item.id}><strong>{statusLabel[item.status]}</strong>{" — "}{t("«{0}»", [t(item.targetTitle)])}: {item.text}{item.decisionNote ? <><br /><span className={styles.small}>{t("Ответ:")}{" "}{item.decisionNote}</span></> : null}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

/** For a specialist: propose a change to one accepted input of their stage. */
export function ProposeChange({ projectId, stageKey, target, onSent }: { projectId: string; stageKey: string; target: { key: string; title: string }; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) return <button type="button" className={styles.inlineLinkButton} onClick={() => setOpen(true)}>{t("Предложить изменение")}</button>;
  return (
    <form style={{ marginTop: 8 }} onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError("");
      try {
        await api(`/projects/${projectId}/stages/${stageKey}/change-proposals`, { method: "POST", body: JSON.stringify({ targetStageKey: target.key, text: text.trim() }) });
        setOpen(false); setText(""); onSent();
      } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
    }}>
      <label className={styles.label} htmlFor={`propose-${target.key}`}>{t("Что изменить в «{0}» и почему", [t(target.title)])}</label>
      <textarea id={`propose-${target.key}`} className={styles.textarea} rows={3} minLength={10} maxLength={1000} required value={text} onChange={(event) => setText(event.target.value)} />
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      <div className={styles.row} style={{ gap: 8, marginTop: 8 }}>
        <button className={styles.button} disabled={busy || text.trim().length < 10}>{busy ? t("Отправляем…") : t("Отправить владельцу")}</button>
        <button type="button" className={styles.ghost} onClick={() => setOpen(false)}>{t("Отмена")}</button>
      </div>
    </form>
  );
}
