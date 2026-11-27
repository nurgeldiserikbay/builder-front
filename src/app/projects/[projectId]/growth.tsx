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

type Usage = {
  enabled: boolean; url: string | null; configured: boolean; period: 7 | 30; since: string | null;
  days: Array<{ day: string; views: number; visitors: number; actions: number }>;
  totals: { views: number; visitors: number; actions: number };
  screens: Array<{ name: string; count: number }>; actions: Array<{ name: string; count: number }>;
  goals: UsageGoalRow[]; actionNames: string[];
};
type GoalKind = "visitors" | "views" | "action";
type GoalSetting = { metricKey: string; kind: GoalKind; name: string | null; target: number; period: "week" | "month" };
type UsageGoalRow = {
  metricKey: string; text: string; goal: GoalSetting | null; hint: { target: number | null; period: "week" | "month" | null; kind: GoalKind | null } | null;
  actual: number | null; percent: number | null; status: "not_set" | "no_data" | "reached" | "behind";
};

/** The success goals of the idea review against the counters: how each is counted, and how far the last week or month got. */
function SuccessGoals({ projectId, usage, canEdit, onSaved }: { projectId: string; usage: Usage; canEdit: boolean; onSaved: () => Promise<unknown> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<GoalSetting | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const kinds: Record<GoalKind, string> = { visitors: t("Посетители"), views: t("Открытия экранов"), action: t("Главное действие") };
  const periods = { week: t("за неделю"), month: t("за месяц") };
  const settings = usage.goals.map((row) => row.goal).filter((goal): goal is GoalSetting => Boolean(goal));
  function open(row: UsageGoalRow) {
    setError(""); setEditing(row.metricKey);
    setForm(row.goal ?? { metricKey: row.metricKey, kind: row.hint?.kind ?? "visitors", name: row.hint?.kind === "action" ? usage.actionNames[0] ?? "" : null, target: row.hint?.target ?? 100, period: row.hint?.period ?? "month" });
  }
  async function save(next: GoalSetting[]) {
    setBusy(true); setError("");
    try { await api(`/projects/${projectId}/usage/goals`, { method: "PUT", body: JSON.stringify({ goals: next }) }); await onSaved(); setEditing(null); setForm(null); }
    catch (caught) { setError(explain(caught)); } finally { setBusy(false); }
  }
  if (!usage.goals.length) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <h3 className={styles.cardTitle}>{t("Цели успеха из разбора идеи")}</h3>
      <p className={styles.small}>{t("Укажите, по какому счётчику видна каждая цель — и здесь появится, сколько набралось за последние 7 дней (цель на неделю) или 30 дней (на месяц). Сам разбор идеи не меняется.")}</p>
      <ul className={styles.list} style={{ listStyle: "none", padding: 0 }}>
        {usage.goals.map((row) => (
          <li key={row.metricKey} style={{ padding: "10px 0", borderTop: "1px solid var(--line, #e3e6e4)" }}>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{row.text}</p>
            {row.goal && row.status !== "not_set" && (
              <>
                <p className={styles.small} style={{ margin: "0 0 4px" }}>
                  {t("{0}{1}: {2} из {3} {4}", [kinds[row.goal.kind], row.goal.name ? ` «${row.goal.name}»` : "", row.actual ?? 0, row.goal.target, periods[row.goal.period]])}
                  {" · "}
                  <b style={{ color: row.status === "reached" ? "#1f6f43" : row.status === "behind" ? "#8a5a00" : "inherit" }}>
                    {row.status === "reached" ? t("достигнута") : row.status === "behind" ? t("пока не достигнута") : t("данных ещё нет")}
                  </b>
                </p>
                <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.percent ?? 0} aria-label={row.text}
                  style={{ height: 8, background: "var(--surface-2, #eef1ef)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${row.percent ?? 0}%`, height: "100%", background: row.status === "reached" ? "#1f6f43" : "#c08a1e" }} />
                </div>
              </>
            )}
            {!row.goal && <p className={styles.small} style={{ margin: 0 }}>{t("Не указано, как считать.")}</p>}
            {canEdit && editing !== row.metricKey && (
              <button type="button" className={styles.inlineLinkButton} style={{ marginTop: 6 }} onClick={() => open(row)}>{row.goal ? t("Изменить") : t("Указать, как считать")}</button>
            )}
            {editing === row.metricKey && form && (
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                <label className={styles.field}><span className={styles.label}>{t("Что считать")}</span>
                  <select className={styles.input} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as GoalKind, name: event.target.value === "action" ? usage.actionNames[0] ?? "" : null })}>
                    {(Object.keys(kinds) as GoalKind[]).map((kind) => <option key={kind} value={kind}>{kinds[kind]}</option>)}
                  </select></label>
                {form.kind === "action" && (
                  <label className={styles.field}><span className={styles.label}>{t("Какое действие")}</span>
                    <span className={styles.why}>{t("Так, как его называет приложение: например «заявка отправлена». Названия, которые уже приходили, — в подсказке.")}</span>
                    <input className={styles.input} list="usage-action-names" value={form.name ?? ""} maxLength={40} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                    <datalist id="usage-action-names">{usage.actionNames.map((name) => <option key={name} value={name} />)}</datalist></label>
                )}
                <div className={styles.row} style={{ gap: 8 }}>
                  <label className={styles.field} style={{ flex: 1 }}><span className={styles.label}>{t("Сколько")}</span>
                    <input className={styles.input} inputMode="numeric" value={String(form.target)} onChange={(event) => setForm({ ...form, target: Number(event.target.value.replace(/\D/g, "").slice(0, 8)) || 0 })} /></label>
                  <label className={styles.field} style={{ flex: 1 }}><span className={styles.label}>{t("За какой срок")}</span>
                    <select className={styles.input} value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value as "week" | "month" })}>
                      <option value="week">{t("Неделя")}</option><option value="month">{t("Месяц")}</option>
                    </select></label>
                </div>
                <div className={styles.row} style={{ gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className={styles.button} disabled={busy || form.target < 1 || (form.kind === "action" && !form.name?.trim())}
                    onClick={() => void save([...settings.filter((goal) => goal.metricKey !== form.metricKey), form])}>{busy ? t("Сохраняем…") : t("Сохранить")}</button>
                  {row.goal && <button type="button" className={styles.ghost} disabled={busy} onClick={() => void save(settings.filter((goal) => goal.metricKey !== row.metricKey))}>{t("Не считать")}</button>}
                  <button type="button" className={styles.ghost} disabled={busy} onClick={() => { setEditing(null); setForm(null); }}>{t("Отмена")}</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    </div>
  );
}

/** Usage of the launched application: counts only — no cookies, no addresses, nothing about who the person is. */
function AppUsage({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [days, setDays] = useState<7 | 30>(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback((period: 7 | 30) => api<Usage>(`/projects/${projectId}/usage?days=${period}`).then(setUsage).catch(() => setUsage(null)), [projectId]);
  useEffect(() => { void load(days); }, [load, days]);
  async function set(body: { enabled?: boolean; renew?: true }) {
    setBusy(true); setError("");
    try { await api(`/projects/${projectId}/usage`, { method: "PUT", body: JSON.stringify(body) }); await load(days); } catch (caught) { setError(explain(caught)); } finally { setBusy(false); }
  }
  if (!usage) return null;
  const max = Math.max(1, ...usage.days.map((day) => day.views));
  const label = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
  // Anything ever counted: the period switch stays even when the chosen period is empty.
  const counted = Boolean(usage.since);
  return (
    <section className={styles.card} aria-labelledby="app-usage-title">
      <h2 id="app-usage-title" className={styles.h2}>{t("Сколько людей пользуется")}</h2>
      <p className={styles.small}>{t("Включите — и ИИ-агент добавит в приложение пару строк, которые сообщают платформе: «открыт такой-то экран» и «сделано главное действие» (заявка, заказ). Платформа хранит только счётчики по дням: без cookie, без адресов и без того, кто именно заходил. Посетитель считается один раз в день — примерно, по признакам, которые на следующий день стираются.")}</p>
      {!usage.configured && <p className={`${styles.notice} ${styles.info}`}>{t("На этом сервере не задан публичный адрес API (PUBLIC_API_URL) — подсчёт недоступен.")}</p>}
      {!usage.enabled && canEdit && usage.configured && (
        <button type="button" className={styles.button} disabled={busy} onClick={() => void set({ enabled: true })}>{busy ? t("Включаем…") : t("Включить подсчёт")}</button>
      )}
      {!usage.enabled && !canEdit && <p className={styles.small}>{t("Подсчёт выключен.")}</p>}
      {usage.enabled && !counted && (
        <p className={`${styles.notice} ${styles.info}`} role="status" style={{ margin: "8px 0" }}>{t("Подсчёт включён, данных пока нет. Строки подсчёта появятся в приложении со следующей задачей ИИ-агента; если приложение пишет разработчик, передайте ему адрес ниже.")}</p>
      )}
      {(usage.enabled || counted) && (
        <>
          {counted && <>
          <div className={styles.row} style={{ gap: 8, margin: "10px 0" }} role="group" aria-label={t("Период")}>
            {([7, 30] as const).map((period) => (
              <button key={period} type="button" className={styles.filterChip} aria-pressed={days === period} onClick={() => setDays(period)}>{t("{0} дней", [period])}</button>
            ))}
          </div>
          <div className={styles.stats} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", margin: "0 0 8px" }}>
            <div className={styles.stat}><b>{usage.totals.visitors}</b><span>{t("посетителей")}</span></div>
            <div className={styles.stat}><b>{usage.totals.views}</b><span>{t("открытий экранов")}</span></div>
            <div className={styles.stat}><b>{usage.totals.actions}</b><span>{t("главных действий")}</span></div>
          </div>
          <div role="img" aria-label={t("Открытия экранов по дням: {0}", [usage.days.map((day) => `${label(day.day)} — ${day.views}`).join(", ")])}
            style={{ display: "flex", alignItems: "flex-end", gap: days === 7 ? 8 : 2, height: 110, margin: "12px 0 4px", borderBottom: "1px solid var(--line, #e3e6e4)" }}>
            {usage.days.map((day) => (
              <div key={day.day} title={`${label(day.day)}: ${day.views}`} style={{ flex: 1, height: `${Math.max(day.views ? 4 : 0, Math.round((day.views / max) * 100))}%`, background: "var(--brand-ink, #1f6f4a)", borderRadius: "4px 4px 0 0", minWidth: 3 }} />
            ))}
          </div>
          <div className={styles.row} style={{ justifyContent: "space-between" }}>
            <span className={styles.small}>{label(usage.days[0]!.day)}</span><span className={styles.small}>{label(usage.days.at(-1)!.day)}</span>
          </div>
          {usage.screens.length > 0 && (
            <>
              <h3 className={styles.cardTitle} style={{ marginTop: 14 }}>{t("Какие экраны открывают")}</h3>
              <ul className={styles.list}>{usage.screens.map((item) => <li key={item.name}><code>{item.name}</code> — {item.count}</li>)}</ul>
              <p className={styles.small}>{t("«:id» — вместо номеров и кодов в адресе: какая именно запись открыта, не сохраняется.")}</p>
            </>
          )}
          {usage.actions.length > 0 && (
            <>
              <h3 className={styles.cardTitle} style={{ marginTop: 14 }}>{t("Главные действия")}</h3>
              <ul className={styles.list}>{usage.actions.map((item) => <li key={item.name}>{item.name} — {item.count}</li>)}</ul>
            </>
          )}
          </>}
          {usage.enabled && usage.url && (
            <details className={styles.details} style={{ marginTop: 10 }}>
              <summary>{t("Адрес для разработчика")}</summary>
              <code style={{ display: "block", overflowWrap: "anywhere", fontSize: 14, background: "var(--surface-2, #f4f6f8)", padding: "8px 10px", borderRadius: 8, marginTop: 6 }}>{usage.url}</code>
              <p className={styles.small}>{t("Приложение отправляет navigator.sendBeacon с полями kind=view и name=путь экрана или kind=action и name=название действия. Больше ничего отправлять нельзя.")}</p>
            </details>
          )}
          {canEdit && (
            <div className={styles.row} style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {usage.enabled
                ? <button type="button" className={styles.secondary} disabled={busy} onClick={() => void set({ enabled: false })}>{t("Выключить подсчёт")}</button>
                : usage.configured && <button type="button" className={styles.secondary} disabled={busy} onClick={() => void set({ enabled: true })}>{t("Включить снова")}</button>}
              {usage.enabled && <button type="button" className={styles.ghost} disabled={busy} onClick={() => void set({ renew: true })}>{t("Сменить адрес (если считают лишнее)")}</button>}
            </div>
          )}
          {!usage.enabled && <p className={styles.small}>{t("Подсчёт выключен; накопленные цифры сохранены.")}</p>}
        </>
      )}
      <SuccessGoals projectId={projectId} usage={usage} canEdit={canEdit} onSaved={() => load(days)} />
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
      {app && <AppUsage projectId={projectId} canEdit={data.canEdit} />}
      {app && <FeedbackInbox projectId={projectId} canEdit={data.canEdit} onReceived={() => void load()} />}
    </div>
  );
}
