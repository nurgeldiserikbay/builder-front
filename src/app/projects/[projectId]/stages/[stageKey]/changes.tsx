"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../../journey.module.css";

type Person = { id: string; name: string; kind: string } | null;
type Message = { id: string; side: "target" | "source" | "owner"; resolution: "kept" | "will_revise" | "escalate" | null; text: string; createdAt: string; author: Person };
type Notice = {
  id: string; status: "open" | "discussing" | "accepted" | "accepted_no_change"; direction: "incoming" | "outgoing";
  source: { key: string; title: string; fromVersion: number | null; toVersion: number | null }; target: { key: string; title: string };
  changes: string[]; createdAt: string; createdBy: Person; decidedAt: string | null; decidedBy: Person; decidedByOwner: boolean;
  messages: Message[]; can: { decide: boolean; discuss: boolean; reply: boolean; explain?: boolean };
  respondBy?: string | null; overdue?: boolean; escalated?: boolean;
  explanation?: { summary: string; impact: string[]; check: string[]; suggestion: "accept" | "accept_no_change" | "discuss"; why: string; createdAt: string } | null;
};
const suggestionLabels = { accept: "обновить этап по изменениям", accept_no_change: "оставить этап как есть", discuss: "обсудить с автором изменения" } as const;
const daysLeft = (value: string) => {
  const hours = Math.round((new Date(value).getTime() - Date.now()) / 3_600_000);
  if (hours <= 0) return "срок ответа прошёл";
  return hours < 24 ? `ответить в течение ${hours} ч` : `ответить до ${new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`;
};

const resolutionLabels = { kept: "Оставить изменение как есть", will_revise: "Выпущу исправленную версию", escalate: "Пусть решит владелец" } as const;
const statusLabels: Record<Notice["status"], string> = { open: "Ждёт решения", discussing: "Обсуждается", accepted: "Принято — этап обновляется", accepted_no_change: "Принято без изменений" };
const when = (value: string) => new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Change notices of a stage: decide on changes of earlier stages, answer questions about changes of this stage. */
export default function ChangesPanel({ projectId, stageKey, onChange }: { projectId: string; stageKey: string; onChange: () => void }) {
  const [items, setItems] = useState<Notice[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [resolutions, setResolutions] = useState<Record<string, keyof typeof resolutionLabels>>({});

  const load = useCallback(async () => {
    try { setItems((await api<{ items: Notice[] }>(`/projects/${projectId}/stages/${stageKey}/changes`)).items); } catch (caught) { setError(explainError(caught)); }
  }, [projectId, stageKey]);
  useEffect(() => { void load(); }, [load]);

  async function act(notice: Notice, action: "accept" | "accept_no_change" | "discuss" | "reply") {
    const text = (texts[notice.id] ?? "").trim();
    if ((action === "discuss" || action === "reply") && !text) { setError("Напишите, что хотите сказать."); return; }
    setBusy(`${notice.id}:${action}`);
    setError("");
    try {
      await api(`/projects/${projectId}/changes/${notice.id}`, { method: "POST", body: JSON.stringify({ action, text: text || null, resolution: action === "reply" ? resolutions[notice.id] ?? "kept" : null }) });
      setTexts((current) => ({ ...current, [notice.id]: "" }));
      await load();
      onChange();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }

  async function explain(notice: Notice) {
    setBusy(`${notice.id}:explain`); setError("");
    try { setItems((await api<{ items: Notice[] }>(`/projects/${projectId}/changes/${notice.id}/explain`, { method: "POST" })).items); }
    catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }

  if (!items || items.length === 0) return error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : null;
  const open = items.filter((item) => item.status === "open" || item.status === "discussing");
  const closed = items.filter((item) => !open.includes(item)).slice(0, 3);

  const card = (notice: Notice) => {
    const incoming = notice.direction === "incoming";
    const live = notice.status === "open" || notice.status === "discussing";
    return (
      <section key={notice.id} className={styles.card} aria-label={incoming ? "Изменение предыдущего этапа" : "Вопрос по изменению этого этапа"}
        style={live && (notice.can.decide || notice.can.reply) ? { boxShadow: "0 0 0 2px #c98a00" } : undefined}>
        <p className={styles.kicker}>{incoming ? "Изменился предыдущий этап" : `Изменение затронуло этап «${notice.target.title}»`}</p>
        <p className={styles.cardTitle} style={{ marginTop: 0 }}>
          {incoming ? `«${notice.source.title}»: версия ${notice.source.fromVersion ?? "?"} → ${notice.source.toVersion ?? "?"}` : `Вы изменили этот этап: версия ${notice.source.fromVersion ?? "?"} → ${notice.source.toVersion ?? "?"}`}
        </p>
        <span className={`${styles.chip} ${live ? styles.attention : styles.done}`}>{statusLabels[notice.status]}</span>
        {live && incoming && notice.respondBy && (
          <span className={styles.small} style={{ marginLeft: 8, color: notice.overdue ? "#a33" : undefined, fontWeight: notice.overdue ? 700 : undefined }}>
            {daysLeft(notice.respondBy)}{notice.escalated ? " · владелец может решить за этап" : ""}
          </span>
        )}
        <p className={styles.small} style={{ margin: "8px 0 4px" }}>Что изменилось:</p>
        <ul className={styles.list} style={{ marginTop: 0 }}>{notice.changes.map((line) => <li key={line}>{line}</li>)}</ul>
        {incoming && live && notice.explanation && (
          <div style={{ background: "#f3f1fb", borderRadius: 10, padding: "10px 12px", margin: "8px 0" }}>
            <p className={styles.small} style={{ margin: 0, fontWeight: 700 }}>Пояснение ИИ — это совет, решаете вы</p>
            <p style={{ margin: "4px 0" }}>{notice.explanation.summary}</p>
            {notice.explanation.impact.length > 0 && <><p className={styles.small} style={{ margin: "6px 0 2px" }}>Что это значит для этапа:</p><ul className={styles.list} style={{ marginTop: 0 }}>{notice.explanation.impact.map((line) => <li key={line}>{line}</li>)}</ul></>}
            {notice.explanation.check.length > 0 && <><p className={styles.small} style={{ margin: "6px 0 2px" }}>Что проверить:</p><ul className={styles.list} style={{ marginTop: 0 }}>{notice.explanation.check.map((line) => <li key={line}>{line}</li>)}</ul></>}
            <p className={styles.small} style={{ margin: "6px 0 0" }}>Совет: {suggestionLabels[notice.explanation.suggestion]}. {notice.explanation.why}</p>
          </div>
        )}
        {incoming && live && !notice.explanation && notice.can.explain && (
          <button className={styles.ghost} style={{ margin: "4px 0" }} disabled={Boolean(busy)} onClick={() => void explain(notice)}>
            {busy === `${notice.id}:explain` ? "ИИ разбирается…" : "Объяснить простыми словами (ИИ)"}</button>
        )}
        {incoming && live && <p className={styles.small}>Пока вы не решите, этот этап работает на прежней версии «{notice.source.title}», а принять или отправить его на приёмку нельзя.</p>}

        {notice.messages.length > 0 && (
          <div style={{ display: "grid", gap: 8, margin: "10px 0" }}>
            {notice.messages.map((message) => (
              <div key={message.id} style={{ background: message.side === "source" ? "#eef5f0" : "#f6f4ee", borderRadius: 10, padding: "8px 10px" }}>
                <span className={styles.small}>{message.author?.name ?? ""} · {message.side === "source" ? `этап «${notice.source.title}»` : message.side === "owner" ? "владелец" : `этап «${notice.target.title}»`} · {when(message.createdAt)}</span>
                {message.resolution && <><br /><strong className={styles.small}>{resolutionLabels[message.resolution]}</strong></>}
                <p style={{ margin: "4px 0 0" }}>{message.text}</p>
              </div>
            ))}
          </div>
        )}
        {!live && notice.decidedBy && <p className={styles.small}>Решение: {notice.decidedBy.name}{notice.decidedByOwner ? " (владелец вместо ведущего)" : ""}{notice.decidedAt ? `, ${when(notice.decidedAt)}` : ""}.</p>}

        {incoming && notice.can.decide && (
          <>
            <label className={styles.label} htmlFor={`text-${notice.id}`}>Комментарий или вопрос {notice.source.title === "" ? "" : `автору «${notice.source.title}»`}</label>
            <textarea id={`text-${notice.id}`} className={styles.input} rows={2} maxLength={2000} value={texts[notice.id] ?? ""} onChange={(event) => setTexts((current) => ({ ...current, [notice.id]: event.target.value }))} placeholder="Например: если цены меняются, раздел «Тарифы» нужно переписать" />
            <div className={styles.row} style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <button className={styles.button} disabled={Boolean(busy)} onClick={() => act(notice, "accept")}>{busy === `${notice.id}:accept` ? "…" : "Принять и обновить этап"}</button>
              <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => act(notice, "accept_no_change")}>Этот этап не затронут</button>
              <button className={styles.ghost} disabled={Boolean(busy)} onClick={() => act(notice, "discuss")}>Задать вопрос</button>
            </div>
            <p className={styles.small} style={{ marginBottom: 0 }}>«Принять и обновить» — этап вернётся в работу с новой версией. «Не затронут» — текущий результат этапа остаётся в силе.</p>
          </>
        )}
        {!incoming && notice.can.reply && (
          <>
            <label className={styles.label} htmlFor={`reply-${notice.id}`}>Ваш ответ</label>
            <select className={styles.input} value={resolutions[notice.id] ?? "kept"} onChange={(event) => setResolutions((current) => ({ ...current, [notice.id]: event.target.value as keyof typeof resolutionLabels }))}>
              {Object.entries(resolutionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <textarea id={`reply-${notice.id}`} className={styles.input} rows={2} maxLength={2000} value={texts[notice.id] ?? ""} onChange={(event) => setTexts((current) => ({ ...current, [notice.id]: event.target.value }))} placeholder="Объясните решение" />
            <button className={styles.button} style={{ marginTop: 8 }} disabled={Boolean(busy)} onClick={() => act(notice, "reply")}>{busy ? "…" : "Ответить"}</button>
          </>
        )}
        {!incoming && live && !notice.can.reply && <p className={styles.small} style={{ marginBottom: 0 }}>Ждём решения этапа «{notice.target.title}».</p>}
      </section>
    );
  };

  return (
    <>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {open.map(card)}
      {closed.length > 0 && (
        <details className={`${styles.card} ${styles.details}`}>
          <summary>Прошлые изменения ({closed.length})</summary>
          {closed.map(card)}
        </details>
      )}
    </>
  );
}
