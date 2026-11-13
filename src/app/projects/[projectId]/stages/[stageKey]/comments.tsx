"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError, stageFiles, type StageFile } from "@/lib/journey";
import styles from "../../../journey.module.css";

type Attachment = { id: string; name: string | null; kind: string | null; sizeBytes: number | null; deleted?: boolean };
type Reply = { id: string; text: string; author: string | null; mine: boolean; createdAt: string; attachments: Attachment[]; mentions: string[] };
type Comment = Reply & { targetKey: string | null; versionNumber: number | null; blocking: boolean; resolved: boolean; resolvedBy: string | null; canResolve: boolean; replies: Reply[] };
type State = {
  comments: Comment[]; openBlocking: number; open: number; canWrite: boolean; canBlock: boolean; canUpload: boolean; currentVersion: number | null; targets: string[];
  files: Array<{ id: string; name: string; kind: string; sizeBytes: number }>; people: Array<{ id: string; name: string }>; limits: { files: number; mentions: number };
};

/** Remarks on the stage: open ones first; a blocking remark holds acceptance until it is resolved. */
export default function CommentsPanel({ projectId, stageKey, targetLabel, onChange }: { projectId: string; stageKey: string; targetLabel: (key: string) => string; onChange: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const [blocking, setBlocking] = useState(false);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [showResolved, setShowResolved] = useState(false);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const base = `/projects/${projectId}/stages/${stageKey}/comments`;
  const load = useCallback(async () => { try { setState(await api<State>(base)); } catch (caught) { setError(explainError(caught)); } }, [base]);
  useEffect(() => { void load(); }, [load]);

  async function send(body: Record<string, unknown>, after?: () => void) {
    setBusy(true); setError("");
    try {
      const next = await api<State>(base, { method: "POST", body: JSON.stringify(body) });
      setState(next); after?.();
      if (body.blocking) onChange();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }
  async function resolve(id: string, resolved: boolean) {
    setBusy(true); setError("");
    try { setState(await api<State>(`${base}/${id}/${resolved ? "resolve" : "reopen"}`, { method: "POST" })); onChange(); } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  async function attachNew(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const uploaded = await stageFiles.upload(projectId, stageKey, file, "");
      if (uploaded.createdId) setFileIds((current) => [...current, uploaded.createdId!]);
      await load();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }
  const download = (file: Attachment) => void stageFiles.download(projectId, stageKey, { id: file.id, name: file.name ?? "file" } as StageFile).catch((caught) => setError(explainError(caught)));
  const extras = (item: { attachments: Attachment[]; mentions: string[] }) => (
    <>
      {item.mentions.length > 0 && <p className={styles.small} style={{ margin: "2px 0" }}>{item.mentions.map((name) => `@${name}`).join(" ")}</p>}
      {item.attachments.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "2px 0" }}>
          {item.attachments.map((file) => file.deleted || !file.name
            ? <span key={file.id} className={styles.small}>📎 {t("файл удалён")}</span>
            : <button key={file.id} type="button" className={styles.ghost} style={{ minHeight: 36, padding: "0 8px" }} onClick={() => download(file)}>📎 {file.name}</button>)}
        </div>
      )}
    </>
  );

  if (!state) return null;
  const open = state.comments.filter((item) => !item.resolved);
  const closed = state.comments.filter((item) => item.resolved);
  const shown = showResolved ? state.comments : open;
  return (
    <section className={styles.card} aria-labelledby="comments-title">
      <p id="comments-title" className={styles.cardTitle}>{t("Замечания")}{state.open ? ` · ${state.open}` : ""}</p>
      {state.openBlocking > 0 && <p className={`${styles.notice} ${styles.warn}`}>{t("Открытых блокирующих замечаний: {0}. Пока их не закроют, этап нельзя принять или одобрить.", [state.openBlocking])}</p>}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {shown.length === 0 && <p className={styles.small} style={{ marginTop: 0 }}>{t("Замечаний нет.")}</p>}
      <ul className={styles.list} style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {shown.map((item) => (
          <li key={item.id} style={{ borderLeft: `3px solid ${item.resolved ? "var(--line)" : item.blocking ? "var(--danger)" : "var(--brand)"}`, paddingLeft: 10, opacity: item.resolved ? 0.75 : 1 }}>
            <p className={styles.small} style={{ margin: 0 }}>
              <strong>{item.author ?? ""}</strong>{item.versionNumber ? ` · ${t("версия {0}", [item.versionNumber])}` : ""}{item.targetKey ? ` · ${targetLabel(item.targetKey)}` : ""} · {new Date(item.createdAt).toLocaleDateString(dateLocale())}
              {item.blocking && !item.resolved && <> · <strong style={{ color: "var(--danger)" }}>{t("блокирует приёмку")}</strong></>}
              {item.resolved && <> · {t("закрыто")}{item.resolvedBy ? ` (${item.resolvedBy})` : ""}</>}
            </p>
            <p style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>{item.text}</p>
            {extras(item)}
            {item.replies.map((answer) => <div key={answer.id} style={{ margin: "4px 0 4px 12px" }}><p className={styles.small} style={{ margin: 0, whiteSpace: "pre-wrap" }}><strong>{answer.author ?? ""}:</strong> {answer.text}</p>{extras(answer)}</div>)}
            {!item.resolved && state.canWrite && (
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <input className={styles.input} style={{ flex: "1 1 180px" }} placeholder={t("Ответить")} aria-label={t("Ответ на замечание")} value={reply[item.id] ?? ""} maxLength={2000}
                  onChange={(event) => setReply((current) => ({ ...current, [item.id]: event.target.value }))} />
                <button type="button" className={styles.secondary} disabled={busy || (reply[item.id] ?? "").trim().length < 2}
                  onClick={() => void send({ text: reply[item.id], parentId: item.id }, () => setReply((current) => ({ ...current, [item.id]: "" })))}>{t("Ответить")}</button>
              </div>
            )}
            {item.canResolve && <button type="button" className={styles.ghost} style={{ marginTop: 4 }} disabled={busy} onClick={() => void resolve(item.id, !item.resolved)}>{item.resolved ? t("Открыть снова") : t("Закрыть замечание")}</button>}
          </li>
        ))}
      </ul>
      {closed.length > 0 && <button type="button" className={styles.ghost} onClick={() => setShowResolved(!showResolved)}>{showResolved ? t("Скрыть закрытые") : t("Показать закрытые ({0})", [closed.length])}</button>}
      {state.canWrite && (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <textarea className={styles.input} placeholder={t("Замечание к результату этапа")} aria-label={t("Новое замечание")} value={text} maxLength={2000} onChange={(event) => setText(event.target.value)} />
          {state.targets.length > 0 && (
            <label className={styles.small}>{t("К какой части")}
              <select className={styles.input} value={target} onChange={(event) => setTarget(event.target.value)}>
                <option value="">{t("Ко всему этапу")}</option>
                {state.targets.map((key) => <option key={key} value={key}>{targetLabel(key)}</option>)}
              </select>
            </label>
          )}
          {(state.files.length > 0 || state.people.length > 0) && (
            <details className={styles.details}>
              <summary>{t("Файлы и упоминания")}{fileIds.length + mentions.length ? ` · ${fileIds.length + mentions.length}` : ""}</summary>
              {state.files.length > 0 && <p className={styles.small} style={{ margin: "8px 0 4px" }}>{t("Прикрепить файлы этапа (до {0})", [state.limits.files])}</p>}
              {state.files.map((file) => (
                <label key={file.id} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 36 }}>
                  <input type="checkbox" checked={fileIds.includes(file.id)} disabled={!fileIds.includes(file.id) && fileIds.length >= state.limits.files} style={{ width: 20, height: 20, flex: "none" }}
                    onChange={(event) => setFileIds((current) => (event.target.checked ? [...current, file.id] : current.filter((id) => id !== file.id)))} />
                  <span style={{ overflowWrap: "anywhere" }}>📎 {file.name}</span>
                </label>
              ))}
              {state.people.length > 0 && <p className={styles.small} style={{ margin: "8px 0 4px" }}>{t("Упомянуть — эти люди получат уведомление")}</p>}
              {state.people.map((person) => (
                <label key={person.id} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 36 }}>
                  <input type="checkbox" checked={mentions.includes(person.id)} disabled={!mentions.includes(person.id) && mentions.length >= state.limits.mentions} style={{ width: 20, height: 20, flex: "none" }}
                    onChange={(event) => setMentions((current) => (event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id)))} />
                  <span>@{person.name}</span>
                </label>
              ))}
            </details>
          )}
          {state.canUpload && <label className={styles.ghost} style={{ cursor: busy ? "not-allowed" : "pointer", justifySelf: "start" }}>
            📎 {t("Загрузить и прикрепить файл")}
            <input type="file" hidden disabled={busy} accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.json,.docx,.xlsx,.pptx,.zip" onChange={(event) => { void attachNew(event.target.files?.[0]); event.target.value = ""; }} />
          </label>}
          {state.canBlock && (
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input type="checkbox" checked={blocking} onChange={(event) => setBlocking(event.target.checked)} style={{ width: 20, height: 20, flex: "none" }} />
              <span className={styles.small}>{t("Блокирующее: этап нельзя принять, пока замечание не закроют")}</span>
            </label>
          )}
          <button type="button" className={styles.secondary} disabled={busy || text.trim().length < 2}
            onClick={() => void send({ text, targetKey: target || null, blocking, fileIds, mentionUserIds: mentions }, () => { setText(""); setTarget(""); setBlocking(false); setFileIds([]); setMentions([]); })}>{busy ? t("Отправляем…") : t("Оставить замечание")}</button>
        </div>
      )}
    </section>
  );
}
