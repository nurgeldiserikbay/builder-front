"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { dateLocale, t } from "@/lib/i18n";
import { explainError } from "@/lib/journey";
import styles from "../journey.module.css";

// Requests to an earlier stage (builder-back change-proposals.service.ts): a question or a needed change raised from a later
// stage, possibly blocking it. A question is answered; a change is taken on, the earlier stage reopens, and the request closes
// by itself when that stage is accepted again — the stages built on it then get the usual change notices.

export type Proposal = {
  id: string; text: string; kind: "change" | "question"; blocking: boolean; answer: string | null;
  status: "open" | "accepted" | "rejected" | "withdrawn" | "answered" | "resolved"; decisionNote: string | null; decidedAt: string | null; createdAt: string;
  fromStageKey: string; fromTitle: string; targetStageKey: string; targetTitle: string; author: string; mine: boolean; canAnswer: boolean; canDecide: boolean;
};

const statusLabel = (): Record<Proposal["status"], string> => ({
  open: t("ждёт ответа"), accepted: t("исправляют"), rejected: t("отклонено"), withdrawn: t("отозвано"), answered: t("отвечено"), resolved: t("исправлено"),
});
const kindLabel = (kind: Proposal["kind"]) => (kind === "question" ? t("Вопрос") : t("Нужно изменить"));

function Badge({ item }: { item: Proposal }) {
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {item.blocking && <span style={{ background: "#fdecea", color: "#7a1a14", borderRadius: 6, padding: "0 8px", fontWeight: 700, fontSize: 14 }}>{t("Блокер")}</span>}
      <span style={{ background: "var(--line, #eef0ee)", borderRadius: 6, padding: "0 8px", fontSize: 14 }}>{kindLabel(item.kind)}</span>
    </span>
  );
}

/**
 * The requests of one stage: to it from later stages (answer, take on, decline) and from it to earlier ones (what it waits for).
 * Without stageKey (the project page): every request the viewer may see.
 */
export default function ProposalsPanel({ projectId, stageKey, aiReady, onDecided }: { projectId: string; stageKey?: string; aiReady: boolean; onDecided?: () => void }) {
  const [list, setList] = useState<Proposal[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ text: string; stageKey: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ canDecide: boolean; proposals: Proposal[] }>(`/projects/${projectId}/change-proposals`);
      setList(data.proposals.filter((item) => !stageKey || item.targetStageKey === stageKey || item.fromStageKey === stageKey));
    } catch (caught) { setError(explainError(caught)); }
  }, [projectId, stageKey]);
  useEffect(() => { void load(); }, [load]);

  async function decide(item: Proposal, decision: "accept" | "reject" | "answer", applyWithAi = false) {
    setBusy(item.id); setError(""); setResult(null);
    try {
      const data = await api<{ generation: { ok: boolean; code: string | null } | null }>(`/projects/${projectId}/change-proposals/${item.id}/decide`, { method: "POST", body: JSON.stringify({ decision, applyWithAi, note: notes[item.id]?.trim() || undefined }) });
      if (decision === "accept") {
        setResult({ stageKey: item.targetStageKey, text: data.generation?.ok
          ? t("Этап «{0}» открыт, ИИ подготовил черновик по запросу. Проверьте и примите этап — запрос закроется сам, а следующие этапы получат уведомление.", [t(item.targetTitle)])
          : data.generation ? t("Этап «{0}» открыт, но ИИ не смог подготовить черновик ({1}). Внесите изменение сами и примите этап — запрос закроется сам.", [t(item.targetTitle), data.generation.code ?? ""])
            : t("Этап «{0}» открыт для изменений. Внесите изменение и примите этап — запрос закроется сам.", [t(item.targetTitle)]) });
      }
      await load();
      onDecided?.();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }

  async function withdraw(item: Proposal) {
    setBusy(item.id); setError("");
    try { await api(`/projects/${projectId}/change-proposals/${item.id}/withdraw`, { method: "POST" }); await load(); onDecided?.(); } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }

  if (!list || (!list.length && !error)) return null;
  const incoming = list.filter((item) => !stageKey || item.targetStageKey === stageKey);
  const outgoing = stageKey ? list.filter((item) => item.fromStageKey === stageKey) : [];
  const openIncoming = incoming.filter((item) => item.status === "open");
  const past = [...incoming, ...outgoing].filter((item) => !["open", "accepted"].includes(item.status));
  const when = (value: string) => new Date(value).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" });

  return (
    <section className={styles.card} aria-labelledby="stage-requests-title">
      <p id="stage-requests-title" className={styles.cardTitle}>{t("Запросы между этапами")}</p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {result && <p className={`${styles.notice} ${styles.success}`} role="status">{result.text}{" "}<a href={`/projects/${projectId}/stages/${result.stageKey}`}>{t("Открыть этап")}</a></p>}

      {openIncoming.length > 0 && <p className={styles.small} style={{ margin: "0 0 6px", fontWeight: 600 }}>{stageKey ? t("К этому этапу от следующих") : t("Ждут ответа")}</p>}
      {openIncoming.map((item) => (
        <div key={item.id} className={styles.proposal} style={item.blocking ? { borderColor: "#b3261e" } : undefined}>
          <p className={styles.small} style={{ margin: "0 0 4px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Badge item={item} /> {t("{0} · этап «{1}» → «{2}» · {3}", [item.author, t(item.fromTitle), t(item.targetTitle), when(item.createdAt)])}
          </p>
          <p style={{ margin: "6px 0 10px", whiteSpace: "pre-wrap" }}>{item.text}</p>
          {item.blocking && <p className={styles.small} style={{ marginTop: 0 }}>{t("Этап «{0}» не может двигаться дальше, пока вы не ответите или не исправите.", [t(item.fromTitle)])}</p>}
          {(item.canAnswer || item.canDecide) && <>
            <textarea className={styles.textarea} rows={2} maxLength={1000} aria-label={t("Ответ или комментарий")} placeholder={item.kind === "question" ? t("Ваш ответ") : t("Ответ или комментарий (необязательно)")}
              value={notes[item.id] ?? ""} onChange={(event) => setNotes({ ...notes, [item.id]: event.target.value })} />
            <div className={styles.row} style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {item.canAnswer && <button className={item.kind === "question" ? styles.button : styles.secondary} disabled={Boolean(busy) || (notes[item.id]?.trim().length ?? 0) < 2} onClick={() => void decide(item, "answer")}>
                {item.kind === "question" ? t("Ответить") : t("Ответить, менять не нужно")}</button>}
              {item.canDecide && aiReady && <button className={item.kind === "change" ? styles.button : styles.secondary} disabled={Boolean(busy)} onClick={() => void decide(item, "accept", true)}>{busy === item.id ? t("Готовим…") : t("Исправить с ИИ")}</button>}
              {item.canDecide && <button className={item.kind === "change" && !aiReady ? styles.button : styles.secondary} disabled={Boolean(busy)} onClick={() => void decide(item, "accept")}>{t("Исправлю сам")}</button>}
              {item.canDecide && <button className={styles.ghost} disabled={Boolean(busy)} onClick={() => void decide(item, "reject")}>{t("Отклонить")}</button>}
            </div>
          </>}
        </div>
      ))}
      {incoming.filter((item) => item.status === "accepted").map((item) => (
        <p key={item.id} className={`${styles.notice} ${styles.info}`}>
          <Badge item={item} /> {t("Исправляется: «{0}». Запрос закроется, когда этап «{1}» примут заново.", [item.text.slice(0, 120), t(item.targetTitle)])}
        </p>
      ))}

      {outgoing.filter((item) => ["open", "accepted"].includes(item.status)).length > 0 && <p className={styles.small} style={{ margin: "12px 0 6px", fontWeight: 600 }}>{t("От этого этапа к прошлым")}</p>}
      {outgoing.filter((item) => ["open", "accepted"].includes(item.status)).map((item) => (
        <div key={item.id} className={styles.proposal}>
          <p className={styles.small} style={{ margin: "0 0 4px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Badge item={item} /> {t("→ «{0}» · {1}", [t(item.targetTitle), statusLabel()[item.status]])}
          </p>
          <p style={{ margin: "6px 0 8px", whiteSpace: "pre-wrap" }}>{item.text}</p>
          {item.mine && item.status === "open" && <button className={styles.ghost} disabled={Boolean(busy)} onClick={() => void withdraw(item)}>{t("Отозвать")}</button>}
        </div>
      ))}

      {past.length > 0 && (
        <details className={styles.details}>
          <summary>{t("Решённые ({0})", [past.length])}</summary>
          <ul className={styles.list}>
            {past.map((item) => (
              <li key={item.id}>
                <strong>{statusLabel()[item.status]}</strong>{" — "}{t("«{0}» → «{1}»", [t(item.fromTitle), t(item.targetTitle)])}: {item.text}
                {item.answer && <><br /><span className={styles.small}>{t("Ответ:")}{" "}{item.answer}</span></>}
                {item.decisionNote && <><br /><span className={styles.small}>{t("Комментарий:")}{" "}{item.decisionNote}</span></>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** A question or a needed change to an earlier stage, optionally blocking this one. */
export function RaiseRequest({ projectId, stageKey, targets, onSent }: { projectId: string; stageKey: string; targets: Array<{ key: string; title: string }>; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(targets[0]?.key ?? "");
  const [kind, setKind] = useState<"question" | "change">("question");
  const [blocking, setBlocking] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!targets.length) return null;
  if (!open) return (
    <button type="button" className={`${styles.secondary} ${styles.block}`} onClick={() => setOpen(true)}>{t("Вопрос или проблема к прошлому этапу")}</button>
  );
  return (
    <form className={styles.card} aria-label={t("Запрос к прошлому этапу")} onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError("");
      try {
        await api(`/projects/${projectId}/stages/${stageKey}/change-proposals`, { method: "POST", body: JSON.stringify({ targetStageKey: target, kind, blocking, text: text.trim() }) });
        setOpen(false); setText(""); setBlocking(false); onSent();
      } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
    }}>
      <p className={styles.cardTitle}>{t("Запрос к прошлому этапу")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Если здесь нельзя двигаться из-за того, что сделано раньше, — спросите или попросите изменить. Запрос станет задачей того этапа; после исправления изменение придёт сюда обычным уведомлением.")}</p>
      <label className={styles.field}><span className={styles.label}>{t("К какому этапу")}</span>
        <select className={styles.input} value={target} onChange={(event) => setTarget(event.target.value)}>
          {targets.map((item) => <option key={item.key} value={item.key}>{t(item.title)}</option>)}
        </select></label>
      <div role="group" aria-label={t("Что нужно")} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, margin: "8px 0" }}>
        {(["question", "change"] as const).map((value) => (
          <button key={value} type="button" aria-pressed={kind === value} className={kind === value ? styles.button : styles.secondary} style={{ minHeight: 44 }} onClick={() => setKind(value)}>{kindLabel(value)}</button>
        ))}
      </div>
      <label className={styles.field}><span className={styles.label}>{kind === "question" ? t("Что непонятно") : t("Что изменить и почему")}</span>
        <textarea className={styles.textarea} rows={3} minLength={10} maxLength={1000} required value={text} onChange={(event) => setText(event.target.value)}
          placeholder={kind === "question" ? t("Например: торты только на заказ или есть готовые на витрине?") : t("Например: в процессе нет отмены записи, а без неё не сделать экран «Мои записи»")} /></label>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", minHeight: 44 }}>
        <input type="checkbox" checked={blocking} onChange={(event) => setBlocking(event.target.checked)} style={{ width: 22, height: 22, marginTop: 2, flexShrink: 0 }} />
        <span>{t("Блокер: не могу продолжать без этого")}<br /><span className={styles.small}>{t("Этот этап нельзя будет принять, пока запрос не решат.")}</span></span>
      </label>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      <div className={styles.row} style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button className={styles.button} disabled={busy || text.trim().length < 10}>{busy ? t("Отправляем…") : t("Отправить")}</button>
        <button type="button" className={styles.ghost} onClick={() => setOpen(false)}>{t("Отмена")}</button>
      </div>
    </form>
  );
}
