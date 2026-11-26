"use client";

// «Развитие»: one list of what comes next. It fills itself from what the project already postponed (ТЗ functions «позже»,
// suggestions «потом», the owner's open remarks) and takes people's feedback and the owner's ideas. Chosen items start
// the next version: the ТЗ opens again with them listed on its page.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { explainError } from "@/lib/journey";
import styles from "../journey.module.css";

type Item = { id: string; title: string; details: string | null; source: "spec_later" | "suggestion" | "remark" | "feedback" | "owner" | "app_feedback"; priority: "high" | "medium" | "low"; status: "open" | "next" | "done" | "dropped"; version: number | null };
type Backlog = { items: Item[]; currentVersion: number; canEdit: boolean; canStartVersion: boolean; specStatus: string | null };

const sourceLabel = (source: Item["source"]) => ({
  spec_later: t("из ТЗ: «позже»"), suggestion: t("предложение «потом»"), remark: t("замечание к сценарию"), feedback: t("отзыв"), owner: t("ваша идея"), app_feedback: t("из приложения"),
})[source];
const priorityLabel = (priority: Item["priority"]) => ({ high: t("важно"), medium: t("обычно"), low: t("когда-нибудь") })[priority];

const messages: Record<string, string> = {
  BACKLOG_TITLE_REQUIRED: t("Напишите хотя бы пару слов."),
  BACKLOG_NOTHING_CHOSEN: t("Отметьте, что взять в новую версию."),
  BACKLOG_ITEM_NOT_OPEN: t("Часть пунктов уже взята в работу или закрыта. Обновите страницу."),
  SPEC_NOT_ACCEPTED: t("Сначала примите текущее ТЗ — новая версия начинается от принятого."),
};
const explain = (caught: unknown) => (caught instanceof Error && messages[caught.message]) || explainError(caught);

type Inbox = { enabled: boolean; url: string | null; received: number; lastReceivedAt: string | null; configured: boolean };

/**
 * «Отзывы из приложения»: when it is on, the AI agent puts a small form into the application and people's messages land
 * in the list below by themselves.
 */
function FeedbackInbox({ projectId, canEdit, onReceived }: { projectId: string; canEdit: boolean; onReceived: () => void }) {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { api<Inbox>(`/projects/${projectId}/feedback-inbox`).then(setInbox).catch(() => setInbox(null)); }, [projectId]);
  async function set(body: { enabled?: boolean; renew?: true }) {
    setBusy(true); setError("");
    try { setInbox(await api<Inbox>(`/projects/${projectId}/feedback-inbox`, { method: "PUT", body: JSON.stringify(body) })); onReceived(); } catch (caught) { setError(explain(caught)); } finally { setBusy(false); }
  }
  if (!inbox) return null;
  return (
    <section className={styles.card} aria-labelledby="feedback-inbox-title">
      <h2 id="feedback-inbox-title" className={styles.h2}>{t("Отзывы из приложения")}</h2>
      <p className={styles.small}>{t("Включите — и ИИ-агент добавит в приложение ссылку «Сообщить о проблеме или идее» с короткой формой. Сообщения людей будут сами появляться в списке выше с пометкой «из приложения»: проблемы — с высокой важностью.")}</p>
      {!inbox.configured && <p className={`${styles.notice} ${styles.info}`}>{t("На этом сервере не задан публичный адрес API (PUBLIC_API_URL) — приём отзывов недоступен.")}</p>}
      {inbox.enabled ? (
        <>
          <p className={`${styles.notice} ${styles.success}`} role="status" style={{ margin: "8px 0" }}>
            {t("Приём включён. Получено сообщений: {0}{1}.", [inbox.received, inbox.lastReceivedAt ? t(", последнее — {0}", [new Date(inbox.lastReceivedAt).toLocaleString()]) : ""])}
          </p>
          <p className={styles.small} style={{ margin: "0 0 8px" }}>{t("Форма появится в приложении со следующей задачей ИИ-агента. Если приложение пишет разработчик, передайте ему адрес:")}</p>
          {inbox.url && <code style={{ display: "block", overflowWrap: "anywhere", fontSize: 14, background: "var(--surface-2, #f4f6f8)", padding: "8px 10px", borderRadius: 8 }}>{inbox.url}</code>}
          {canEdit && (
            <div className={styles.row} style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => void set({ enabled: false })}>{t("Выключить")}</button>
              <button type="button" className={styles.ghost} disabled={busy} onClick={() => void set({ renew: true })}>{t("Сменить адрес (если форму засыпают спамом)")}</button>
            </div>
          )}
        </>
      ) : canEdit && inbox.configured ? (
        <button type="button" className={styles.button} disabled={busy} onClick={() => void set({ enabled: true })}>{busy ? t("Включаем…") : t("Включить приём отзывов")}</button>
      ) : !inbox.enabled && <p className={styles.small}>{t("Приём отзывов выключен.")}</p>}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    </section>
  );
}

export default function Growth({ projectId, app = false }: { projectId: string; app?: boolean }) {
  const [data, setData] = useState<Backlog | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [source, setSource] = useState<"feedback" | "owner">("feedback");
  const [priority, setPriority] = useState<Item["priority"]>("medium");
  const [chosen, setChosen] = useState<string[]>([]);
  const [started, setStarted] = useState<number | null>(null);

  const load = useCallback(() => api<Backlog>(`/projects/${projectId}/backlog`).then(setData).catch((caught) => setError(explain(caught))), [projectId]);
  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<Backlog>) {
    setBusy(true); setError("");
    try { setData(await action()); return true; } catch (caught) { setError(explain(caught)); return false; } finally { setBusy(false); }
  }
  async function add(event: React.FormEvent) {
    event.preventDefault();
    const ok = await run(() => api<Backlog>(`/projects/${projectId}/backlog`, { method: "POST", body: JSON.stringify({ title, details: details || null, source, priority }) }));
    if (ok) { setTitle(""); setDetails(""); }
  }
  const setStatus = (item: Item, status: "open" | "done" | "dropped") => run(() => api<Backlog>(`/projects/${projectId}/backlog/${item.id}`, { method: "PUT", body: JSON.stringify({ status }) }));
  async function startVersion() {
    const version = (data?.currentVersion ?? 1) + 1;
    if (await run(() => api<Backlog>(`/projects/${projectId}/backlog/next-version`, { method: "POST", body: JSON.stringify({ itemIds: chosen }) }))) { setChosen([]); setStarted(version); }
  }

  if (!data) return error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : null;
  const open = data.items.filter((item) => item.status === "open");
  const next = data.items.filter((item) => item.status === "next");
  const closed = data.items.filter((item) => item.status === "done" || item.status === "dropped");

  return (
    <div className={styles.panels}>
      <section className={styles.card} aria-labelledby="growth-title">
        <p className={styles.kicker}>{t("Развитие")}</p>
        <h2 id="growth-title" className={styles.h2}>{t("Что дальше")}</h2>
        <p className={styles.small}>{t("Сюда сами попадают функции, отложенные в ТЗ, предложения «потом» и ваши замечания к сценариям. Добавляйте отзывы людей и свои идеи, отметьте нужное и начните новую версию — откроется ТЗ, и только затронутые этапы придётся обновить.")}</p>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {started && <p className={`${styles.notice} ${styles.success}`} role="status">{t("Версия {0} начата. ТЗ снова открыто — выбранное показано на его странице.", [started])} <a href={`/projects/${projectId}/stages/features`}>{t("Открыть ТЗ")}</a></p>}

        {open.length === 0 ? <p>{t("Пока пусто. Когда появятся отзывы или идеи, запишите их здесь.")}</p> : (
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 12 }}>
            {open.map((item) => (
              <li key={item.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
                {data.canStartVersion && <input type="checkbox" aria-label={t("Взять в новую версию: {0}", [item.title])} style={{ width: 22, height: 22, marginTop: 2, flex: "none" }}
                  checked={chosen.includes(item.id)} disabled={busy} onChange={(event) => setChosen((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: "block" }}>{item.title}</strong>
                  {item.details && <p style={{ margin: "2px 0 0", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{item.details}</p>}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span className={`${styles.chip} ${styles.closed}`}>{sourceLabel(item.source)}</span>
                    <span className={`${styles.chip} ${styles[item.priority === "high" ? "attention" : "closed"]}`}>{priorityLabel(item.priority)}</span>
                  </div>
                  {data.canEdit && (
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <button type="button" className={styles.ghost} disabled={busy} onClick={() => setStatus(item, "done")}>{t("Уже сделано")}</button>
                      <button type="button" className={styles.ghost} disabled={busy} onClick={() => setStatus(item, "dropped")}>{t("Не будем делать")}</button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {data.canStartVersion && open.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <button type="button" className={styles.button} disabled={busy || chosen.length === 0} onClick={startVersion}>{t("Начать версию {0} ({1})", [data.currentVersion + 1, chosen.length])}</button>
          </div>
        )}
        {!data.canStartVersion && data.canEdit && open.length > 0 && data.specStatus !== "approved" && (
          <p className={styles.small} style={{ marginTop: 12 }}>{t("Новую версию можно начать, когда текущее ТЗ принято.")}</p>
        )}
      </section>

      {next.length > 0 && (
        <section className={styles.card} aria-labelledby="growth-next">
          <p id="growth-next" className={styles.cardTitle} style={{ margin: 0 }}>{t("В работе — версия {0}", [next[0].version ?? data.currentVersion])}</p>
          <ul className={styles.list}>{next.map((item) => <li key={item.id}>{item.title}{data.canEdit && <> {" "}<button type="button" className={styles.linkButton} disabled={busy} onClick={() => setStatus(item, "done")}>{t("готово")}</button></>}</li>)}</ul>
          <a className={styles.secondary} href={`/projects/${projectId}/stages/features`}>{t("Открыть ТЗ")}</a>
        </section>
      )}

      {data.canEdit && (
        <section className={styles.card} aria-labelledby="growth-add">
          <p id="growth-add" className={styles.cardTitle} style={{ margin: 0 }}>{t("Записать отзыв или идею")}</p>
          <form onSubmit={add} style={{ marginTop: 12 }}>
            <label className={styles.field}><span className={styles.label}>{t("Что нужно")}</span>
              <input className={styles.input} required minLength={3} maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("Например: клиенты просят оплату картой")} />
            </label>
            <label className={styles.field}><span className={styles.label}>{t("Подробности (необязательно)")}</span>
              <textarea className={styles.input} rows={3} maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} />
            </label>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label className={styles.field} style={{ flex: "1 1 160px" }}><span className={styles.label}>{t("Откуда")}</span>
                <select className={styles.input} value={source} onChange={(event) => setSource(event.target.value as "feedback" | "owner")}>
                  <option value="feedback">{t("Отзыв людей")}</option><option value="owner">{t("Моя идея")}</option>
                </select>
              </label>
              <label className={styles.field} style={{ flex: "1 1 160px" }}><span className={styles.label}>{t("Насколько важно")}</span>
                <select className={styles.input} value={priority} onChange={(event) => setPriority(event.target.value as Item["priority"])}>
                  <option value="high">{priorityLabel("high")}</option><option value="medium">{priorityLabel("medium")}</option><option value="low">{priorityLabel("low")}</option>
                </select>
              </label>
            </div>
            <button type="submit" className={styles.button} disabled={busy || title.trim().length < 3}>{t("Добавить")}</button>
          </form>
        </section>
      )}

      {closed.length > 0 && (
        <details className={`${styles.card} ${styles.details}`}>
          <summary>{t("Закрытые ({0})", [closed.length])}</summary>
          <ul className={styles.list}>{closed.map((item) => (
            <li key={item.id}>{item.title} <span className={styles.small}>{item.status === "done" ? t("сделано") : t("не делаем")}</span>
              {data.canEdit && <> {" "}<button type="button" className={styles.linkButton} disabled={busy} onClick={() => setStatus(item, "open")}>{t("вернуть")}</button></>}</li>
          ))}</ul>
        </details>
      )}
      {app && <FeedbackInbox projectId={projectId} canEdit={data.canEdit} onReceived={() => void load()} />}
    </div>
  );
}
