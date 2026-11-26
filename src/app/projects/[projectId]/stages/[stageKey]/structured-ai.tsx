"use client";

// «Изменить через ИИ» for an application's architecture, contracts, implementation plan and test plan: the person writes
// what to change, the AI proposes a new version, and the proposal is listed by name — added, changed, removed — with what
// the quality review would say about it before anything is saved.
import { useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { formatTenge } from "@/lib/money";
import styles from "../../../journey.module.css";
import type { ReviewFinding } from "./review";
import type { DesignDiff } from "./architecture-changes";

type Proposal = { proposalId: string; content: unknown; issues: Array<{ key: string; message: string }>; findings: Array<Omit<ReviewFinding, "overridden">> };

export default function StructuredAiChange({ projectId, stageKey, diffOf, examples, intro, placeholder, applied, baseFindings, requestPrice, onApplied }: {
  projectId: string; stageKey: string; requestPrice: number | null; onApplied: (message: string) => Promise<void> | void;
  /** What the proposal adds, changes and removes compared with the saved version, by name. */
  diffOf: (proposal: unknown) => DesignDiff | null;
  examples: string[]; intro: string; placeholder: string; applied: string;
  /** Finding ids of the current version: the preview lists only what the change would add. */
  baseFindings: string[];
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<"" | "ask" | "apply" | "dismiss">("");
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const diff = useMemo(() => (proposal ? diffOf(proposal.content) : null), [diffOf, proposal]);
  const nothing = diff && !diff.added.length && !diff.changed.length && !diff.removed.length;
  const fresh = proposal ? proposal.findings.filter((finding) => !baseFindings.includes(finding.id)) : [];
  const blocking = proposal ? fresh.filter((finding) => finding.severity === "blocking").length + proposal.issues.length : 0;

  async function ask() {
    setBusy("ask"); setError("");
    try {
      setProposal(await api<Proposal>(`/projects/${projectId}/stages/${stageKey}/ai-proposals`, { method: "POST", body: JSON.stringify({ instruction: instruction.trim() }) }));
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }
  async function decide(action: "apply" | "dismiss", keepInstruction = false) {
    if (!proposal) return;
    setBusy(action); setError("");
    try {
      const result = await api<{ versionNumber?: number }>(`/projects/${projectId}/stages/${stageKey}/ai-proposals/${proposal.proposalId}/${action}`, { method: "POST" });
      setProposal(null);
      if (!keepInstruction && action === "dismiss") setInstruction("");
      if (action === "apply") { setInstruction(""); await onApplied(applied.replace("{0}", String(result.versionNumber ?? ""))); }
    } catch (caught) {
      // Someone saved the stage meanwhile: this proposal was made for the older version.
      if (caught instanceof ApiError && (caught.message === "PROPOSAL_STALE" || caught.message === "PROPOSAL_CLOSED")) setProposal(null);
      setError(explainError(caught));
    } finally { setBusy(""); }
  }

  return (
    <section className={styles.card} aria-labelledby="structured-ai-title">
      <p id="structured-ai-title" className={styles.cardTitle}>{t("✨ Изменить через ИИ")}</p>
      {!proposal && <>
        <p className={styles.small} style={{ marginTop: 0 }}>{intro}{requestPrice !== null ? t(" Один запрос к ИИ стоит около {0}.", [formatTenge(requestPrice)]) : ""}</p>
        <textarea className={styles.textarea} value={instruction} maxLength={1000} aria-label={t("Что изменить")} placeholder={placeholder} onChange={(event) => setInstruction(event.target.value)} />
        <div className={styles.chips} style={{ margin: "10px 0" }} aria-label={t("Примеры")}>
          {examples.map((example) => <button key={example} type="button" className={styles.exampleChip} onClick={() => setInstruction(example)}>{example}</button>)}
        </div>
        <button className={`${styles.button} ${styles.block}`} disabled={Boolean(busy) || instruction.trim().length < 2} onClick={() => void ask()}>{busy === "ask" ? t("ИИ готовит изменения…") : t("Показать, что изменит ИИ")}</button>
      </>}

      {proposal && <>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("Задание: «{0}». Пока ничего не сохранено.", [instruction.trim()])}</p>
        {!diff || nothing ? <p className={`${styles.notice} ${styles.info}`}>{t("ИИ не нашёл, что менять по этому заданию. Уточните задание или оставьте как есть.")}</p> : (
          <ul className={styles.list} style={{ margin: "0 0 10px", overflowWrap: "anywhere" }}>
            {diff.added.map((line, index) => <li key={`a${index}`}><b style={{ color: "#128a5e" }}>+</b> {line}</li>)}
            {diff.changed.map((line, index) => <li key={`c${index}`}><b style={{ color: "#a86a12" }}>~</b> {line}</li>)}
            {diff.removed.map((line, index) => <li key={`r${index}`}><b style={{ color: "#b3261e" }}>−</b> <s>{line}</s></li>)}
          </ul>
        )}
        {!nothing && (proposal.issues.length > 0 || fresh.length > 0
          ? <div className={`${styles.notice} ${blocking ? styles.warn : styles.info}`} style={{ marginTop: 10 }}>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{blocking ? t("С этими изменениями этап пока нельзя будет принять:") : t("Новые замечания проверки после изменений:")}</p>
            <ul className={styles.list} style={{ margin: 0 }}>
              {proposal.issues.map((issue) => <li key={issue.message}>{issue.message}</li>)}
              {fresh.slice(0, 6).map((finding) => <li key={finding.id}>{finding.message}</li>)}
            </ul>
            {fresh.length > 6 && <p className={styles.small} style={{ margin: "4px 0 0" }}>{t("И ещё замечаний: {0} — они будут в проверке качества.", [fresh.length - 6])}</p>}
          </div>
          : <p className={`${styles.notice} ${styles.success}`} style={{ marginTop: 10 }}>{t("Новых замечаний проверки нет.")}</p>)}
        <div className={styles.row} style={{ gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          {!nothing && <button className={styles.button} disabled={Boolean(busy)} onClick={() => void decide("apply")}>{busy === "apply" ? t("Сохраняем…") : t("Применить изменения")}</button>}
          <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => void decide("dismiss")}>{t("Не применять")}</button>
          <button className={styles.ghost} disabled={Boolean(busy)} onClick={() => void decide("dismiss", true)}>{t("Изменить задание")}</button>
        </div>
      </>}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    </section>
  );
}
