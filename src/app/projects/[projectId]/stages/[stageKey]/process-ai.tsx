"use client";

// «Изменить через ИИ» for the business process: the person writes what to change, the AI proposes, and the proposal is
// shown on the diagrams before anything is saved — added places in green, changed in amber, removed listed by name —
// together with what the quality review would say about it. Then the person applies it or not.
import { useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { formatTenge } from "@/lib/money";
import styles from "../../../journey.module.css";
import { DataDiagram, MARK, SwimlaneDiagram } from "./diagrams";
import type { BusinessProcess } from "./process-editor";
import { processDiff } from "./process-changes";
import type { ReviewFinding } from "./review";

type Proposal = { proposalId: string; content: BusinessProcess; changed: string[]; issues: Array<{ key: string; message: string }>; findings: Array<Omit<ReviewFinding, "overridden">>; blockedByLocks?: string[] };
const partTitle = () => ({ actors: t("Участники"), scenarios: t("Сценарии"), rules: t("Правила"), data: t("Схема данных") } as Record<string, string>);

const EXAMPLES = () => [
  t("Добавь сценарий отмены записи клиентом"),
  t("Добавь напоминание клиенту за день"),
  t("Добавь администратора, который подтверждает заявки"),
  t("Добавь в данные статус и дату у каждой заявки"),
];

export default function ProcessAiChange({ projectId, stageKey, base, baseFindings, requestPrice, onApplied }: {
  projectId: string; stageKey: string; base: BusinessProcess; requestPrice: number | null; onApplied: (message: string) => Promise<void> | void;
  /** Finding ids of the current version: the preview lists only what the change would add. */
  baseFindings: string[];
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<"" | "ask" | "apply" | "dismiss">("");
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [tab, setTab] = useState(0);

  const diff = useMemo(() => (proposal ? processDiff(base, proposal.content) : null), [base, proposal]);
  const scenarios = useMemo(() => {
    if (!proposal || !diff) return [];
    const touched = proposal.content.scenarios.filter((scenario) => diff.scenarios.includes(scenario.key));
    return touched.length ? touched : proposal.content.scenarios.slice(0, 1);
  }, [proposal, diff]);
  const scenario = scenarios[Math.min(tab, scenarios.length - 1)];
  const dataChanged = Boolean(proposal && diff && proposal.content.data.some((entity) => diff.marks[entity.key]));
  const nothing = diff && !diff.added.length && !diff.changed.length && !diff.removed.length;
  const fresh = proposal ? proposal.findings.filter((finding) => !baseFindings.includes(finding.id)) : [];
  const blocking = proposal ? fresh.filter((finding) => finding.severity === "blocking").length + proposal.issues.length : 0;
  const blocked = proposal?.blockedByLocks ?? [];

  /** Lets the AI change the protected parts it was held back on, and asks again with the same task. */
  async function unlockAndAsk() {
    if (!proposal) return;
    setBusy("ask"); setError("");
    try {
      await api(`/projects/${projectId}/stages/${stageKey}/ai-proposals/${proposal.proposalId}/dismiss`, { method: "POST" });
      for (const key of blocked) await api(`/projects/${projectId}/stages/${stageKey}/locks`, { method: "POST", body: JSON.stringify({ key, locked: false }) });
      setProposal(await api<Proposal>(`/projects/${projectId}/stages/${stageKey}/ai-proposals`, { method: "POST", body: JSON.stringify({ instruction: instruction.trim() }) }));
      setTab(0);
    } catch (caught) { setError(explainError(caught)); setProposal(null); } finally { setBusy(""); }
  }

  async function ask() {
    setBusy("ask"); setError("");
    try {
      const result = await api<Proposal>(`/projects/${projectId}/stages/${stageKey}/ai-proposals`, { method: "POST", body: JSON.stringify({ instruction: instruction.trim() }) });
      setProposal(result); setTab(0);
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }
  async function decide(action: "apply" | "dismiss", keepInstruction = false) {
    if (!proposal) return;
    setBusy(action); setError("");
    try {
      const result = await api<{ versionNumber?: number }>(`/projects/${projectId}/stages/${stageKey}/ai-proposals/${proposal.proposalId}/${action}`, { method: "POST" });
      setProposal(null);
      if (!keepInstruction && action === "dismiss") setInstruction("");
      if (action === "apply") { setInstruction(""); await onApplied(t("Изменения ИИ сохранены — версия {0}. Проверка качества обновлена.", [result.versionNumber ?? ""])); }
    } catch (caught) {
      // Someone saved the stage meanwhile: this proposal was made for the older version.
      if (caught instanceof ApiError && (caught.message === "PROPOSAL_STALE" || caught.message === "PROPOSAL_CLOSED")) setProposal(null);
      setError(explainError(caught));
    } finally { setBusy(""); }
  }

  return (
    <section className={styles.card} aria-labelledby="process-ai-title">
      <p id="process-ai-title" className={styles.cardTitle}>{t("✨ Изменить через ИИ")}</p>
      {!proposal && <>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("Напишите, что поменять в процессе. ИИ покажет изменения прямо на схеме — сохраните их, только если всё устраивает.")}{requestPrice !== null ? t(" Один запрос к ИИ стоит около {0}.", [formatTenge(requestPrice)]) : ""}</p>
        <textarea className={styles.textarea} value={instruction} maxLength={1000} aria-label={t("Что изменить")} placeholder={t("Например: добавь отмену заказа клиентом до подтверждения")} onChange={(event) => setInstruction(event.target.value)} />
        <div className={styles.chips} style={{ margin: "10px 0" }} aria-label={t("Примеры")}>
          {EXAMPLES().map((example) => <button key={example} type="button" className={styles.exampleChip} onClick={() => setInstruction(example)}>{example}</button>)}
        </div>
        <button className={`${styles.button} ${styles.block}`} disabled={Boolean(busy) || instruction.trim().length < 2} onClick={() => void ask()}>{busy === "ask" ? t("ИИ готовит изменения…") : t("Показать, что изменит ИИ")}</button>
      </>}

      {proposal && diff && <>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("Задание: «{0}». Пока ничего не сохранено.", [instruction.trim()])}</p>
        {blocked.length > 0 && (
          <div className={`${styles.notice} ${styles.warn}`}>
            <p style={{ margin: 0 }}>{t("ИИ хотел изменить: {0}. Вы защитили эти части от ИИ, когда правили их сами, поэтому они остались как были — изменения могут быть неполными.", [blocked.map((key) => `«${partTitle()[key] ?? key}»`).join(", ")])}</p>
            <button className={styles.secondary} style={{ marginTop: 8 }} disabled={Boolean(busy)} onClick={() => void unlockAndAsk()}>{busy === "ask" ? t("ИИ готовит изменения…") : t("Разрешить ИИ менять их и спросить снова")}</button>
          </div>
        )}
        {nothing ? <p className={`${styles.notice} ${styles.info}`}>{t("ИИ не нашёл, что менять по этому заданию. Уточните задание или оставьте как есть.")}</p> : <>
          <div className={styles.row} style={{ gap: 12, flexWrap: "wrap", margin: "4px 0 8px" }} aria-label={t("Обозначения")}>
            <span className={styles.small} style={{ margin: 0 }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: MARK.added.fill, border: `1.5px solid ${MARK.added.stroke}`, verticalAlign: -1 }} /> {t("добавлено")}</span>
            <span className={styles.small} style={{ margin: 0 }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: MARK.changed.fill, border: `1.5px solid ${MARK.changed.stroke}`, verticalAlign: -1 }} /> {t("изменено")}</span>
          </div>
          <ul className={styles.list} style={{ margin: "0 0 10px" }}>
            {diff.added.map((line) => <li key={`a${line}`}><b style={{ color: MARK.added.text }}>+</b> {line}</li>)}
            {diff.changed.map((line) => <li key={`c${line}`}><b style={{ color: MARK.changed.text }}>~</b> {line}</li>)}
            {diff.removed.map((line) => <li key={`r${line}`}><b style={{ color: "#b3261e" }}>−</b> <s>{line}</s></li>)}
          </ul>
          {scenarios.length > 1 && (
            <div className={styles.row} style={{ flexWrap: "wrap", gap: 6 }} role="tablist">
              {scenarios.map((item, i) => <button key={item.key} role="tab" aria-selected={i === tab} className={i === tab ? styles.button : styles.ghost} style={{ minHeight: 36, padding: "4px 10px" }} onClick={() => setTab(i)}>{item.title}</button>)}
            </div>
          )}
          {scenario && scenario.steps.length > 0 && <SwimlaneDiagram actors={proposal.content.actors} scenario={scenario} marks={diff.marks} />}
          {dataChanged && <><p className={styles.label} style={{ margin: "12px 0 4px" }}>{t("Схема данных")}</p><DataDiagram entities={proposal.content.data} marks={diff.marks} /></>}
        </>}

        {!nothing && (proposal.issues.length > 0 || fresh.length > 0
          ? <div className={`${styles.notice} ${blocking ? styles.warn : styles.info}`} style={{ marginTop: 10 }}>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{blocking ? t("С этими изменениями этап пока нельзя будет принять:") : t("Новые замечания проверки после изменений:")}</p>
            <ul className={styles.list} style={{ margin: 0 }}>
              {proposal.issues.map((issue) => <li key={issue.message}>{issue.message}</li>)}
              {fresh.slice(0, 6).map((finding) => <li key={finding.id}>{finding.where}: {finding.message}</li>)}
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
