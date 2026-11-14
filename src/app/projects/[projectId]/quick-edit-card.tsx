"use client";

import { t } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../journey.module.css";
import { HoursForm, ProductsForm, type QuickMaster, type QuickProduct } from "./quick-edit-data";

type Contacts = { phone: string | null; messenger: string | null; email: string | null; address: string | null };
type Pending = { stageKey: string; stageTitle: string; versionId: string; request: string; changes: string[] };
type State = {
  available: boolean; reason: string | null; targets: Array<{ key: string; title: string; status: string | null }>; pending: Pending | null;
  aiConfigured: boolean; contacts: Contacts | null; locked: Record<string, string[]>;
  products: QuickProduct[] | null; schedule: { masters: QuickMaster[] } | null;
  published?: { buildVersion: number; changes?: string[]; contacts?: Array<{ field: string; before: string | null; after: string | null }> };
};

const fieldLabels: Record<keyof Contacts, string> = { phone: t("Телефон"), messenger: t("Мессенджер"), email: t("Почта"), address: t("Адрес") };
const sectionLabels: Record<string, string> = {
  hero: t("первый экран"), about: t("о вас"), services: t("услуги"), benefits: t("почему выбирают вас"), steps: t("как вы работаете"),
  faq: t("вопросы и ответы"), contacts: t("контакты"), cta: t("призыв к действию"),
};
const sectionName = (key: string) => sectionLabels[key.replace(/[-_]\d+$/, "")] ?? key;
const reasons: Record<string, string> = {
  QUICK_EDIT_FORBIDDEN: t("Менять опубликованный сайт может владелец или менеджер проекта."),
  QUICK_EDIT_NOT_LIVE: t("Сайт ещё не опубликован. Сначала опубликуйте его — потом здесь можно будет быстро вносить правки."),
  QUICK_EDIT_BUILD_IN_WORK: t("Сборка сайта сейчас в работе. Закончите её на этапе «Сборка», потом возвращайтесь к быстрым правкам."),
};

/**
 * «Изменить сайт»: contacts, prices and stock, working hours by simple forms; texts and look by a request to the AI with the changes and a preview
 * before anything reaches the live site.
 */
export default function QuickEditCard({ projectId, onPublished }: { projectId: string; onPublished: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [mode, setMode] = useState<"contacts" | "prices" | "hours" | "texts">("contacts");
  const [contacts, setContacts] = useState<Contacts>({ phone: null, messenger: null, email: null, address: null });
  const [confirmContacts, setConfirmContacts] = useState(false);
  const [request, setRequest] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [locked, setLocked] = useState<string[] | null>(null);
  const [allowLocked, setAllowLocked] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const apply = useCallback((next: State) => {
    setState(next);
    if (next.contacts) setContacts(next.contacts);
  }, []);
  useEffect(() => { api<State>(`/projects/${projectId}/quick-edit`).then(apply).catch(() => undefined); }, [projectId, apply]);
  // The draft preview: the site as it would look with the change, before it is confirmed.
  useEffect(() => {
    if (!state?.pending) { setPreview(null); return; }
    api<{ html: string }>(`/projects/${projectId}/preview`).then((data) => setPreview(data.html)).catch(() => setPreview(null));
  }, [projectId, state?.pending]);

  if (!state) return null;
  if (!state.pending && !state.available) {
    return state.reason === "QUICK_EDIT_NOT_LIVE" || !state.reason ? null : (
      <section className={styles.card}><p className={styles.kicker}>{t("Изменить сайт")}</p><p style={{ margin: 0 }}>{reasons[state.reason] ?? explainError(new ApiError(409, state.reason))}</p></section>
    );
  }

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label); setError(""); setDone("");
    try { await work(); } catch (caught) {
      // Hand-edited parts kept the AI from changing anything: offer to let it.
      if (caught instanceof ApiError && caught.message === "QUICK_EDIT_LOCKED") {
        const body = caught.body as { locked?: string[] } | null;
        setLocked(body?.locked ?? state?.locked[target ?? "content"] ?? []);
      } else if (caught instanceof ApiError && caught.message === "QUICK_EDIT_NO_CHANGES") setLocked([]);
      else setError(explainError(caught));
    } finally { setBusy(""); }
  }
  const changed = (Object.keys(fieldLabels) as Array<keyof Contacts>).filter((field) => (contacts[field] ?? "") !== (state.contacts?.[field] ?? ""));

  const saveContacts = () => run("contacts", async () => {
    const next = await api<State>(`/projects/${projectId}/quick-edit/contacts`, { method: "POST", body: JSON.stringify(Object.fromEntries((Object.keys(fieldLabels) as Array<keyof Contacts>).map((field) => [field, contacts[field]?.trim() || null]))) });
    apply(next); setConfirmContacts(false); setDone(t("Контакты обновлены на сайте.")); onPublished();
  });
  const start = () => run("start", async () => {
    apply(await api<State>(`/projects/${projectId}/quick-edit`, { method: "POST", body: JSON.stringify({ request: request.trim(), target, allowLocked }) }));
    setLocked(null);
  });
  const confirm = () => run("confirm", async () => {
    const next = await api<State>(`/projects/${projectId}/quick-edit/confirm`, { method: "POST", body: JSON.stringify({ versionId: state.pending!.versionId }) });
    apply(next); setRequest(""); setAllowLocked(false); setDone(t("Сайт обновлён.")); onPublished();
  });
  const cancel = () => run("cancel", async () => { apply(await api<State>(`/projects/${projectId}/quick-edit/cancel`, { method: "POST" })); });

  return (
    <section className={styles.card} aria-labelledby="quick-edit-title">
      <p className={styles.kicker}>{t("Сайт опубликован")}</p>
      <h2 id="quick-edit-title" className={styles.h2}>{t("Изменить сайт")}</h2>
      {done && <p className={`${styles.notice} ${styles.success}`} role="status">{done}</p>}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}

      {state.pending ? (
        <div>
          <p style={{ margin: "0 0 6px" }}>{t("Вы попросили:")} <em>{state.pending.request}</em></p>
          <p className={styles.label} style={{ margin: "10px 0 4px" }}>{t("Что изменится на этапе «{0}»", [t(state.pending.stageTitle)])}</p>
          <ul className={styles.list} style={{ marginTop: 0 }}>{state.pending.changes.map((line) => <li key={line}>{t(line)}</li>)}</ul>
          {preview && <div className={styles.phone} style={{ margin: "10px 0" }}><iframe title={t("Предпросмотр с изменениями")} sandbox="" srcDoc={preview} /></div>}
          <p className={styles.small}>{t("Пока вы не подтвердите, на сайте всё по-старому. После подтверждения сайт соберётся заново, пройдёт проверки и обновится.")}</p>
          <div className={styles.row}>
            <button className={styles.button} disabled={Boolean(busy)} onClick={() => void confirm()}>{busy === "confirm" ? t("Обновляем сайт…") : t("Обновить сайт")}</button>
            <button className={styles.ghost} disabled={Boolean(busy)} onClick={() => void cancel()}>{t("Отменить")}</button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.chips} role="group" aria-label={t("Что поменять")} style={{ margin: "0 0 12px" }}>
            <button type="button" className={styles.choice} style={{ width: "auto" }} aria-pressed={mode === "contacts"} onClick={() => setMode("contacts")}>{t("Контакты")}</button>
            {state.products && <button type="button" className={styles.choice} style={{ width: "auto" }} aria-pressed={mode === "prices"} onClick={() => setMode("prices")}>{t("Цены и наличие")}</button>}
            {state.schedule && <button type="button" className={styles.choice} style={{ width: "auto" }} aria-pressed={mode === "hours"} onClick={() => setMode("hours")}>{t("Часы работы")}</button>}
            <button type="button" className={styles.choice} style={{ width: "auto" }} aria-pressed={mode === "texts"} onClick={() => setMode("texts")}>{t("Тексты или внешний вид")}</button>
          </div>

          {mode === "prices" && state.products && <ProductsForm<State> projectId={projectId} products={state.products} onDone={(next) => { apply(next); setDone(t("Цены и наличие обновлены на сайте.")); onPublished(); }} />}
          {mode === "hours" && state.schedule && <HoursForm<State> projectId={projectId} masters={state.schedule.masters} onDone={(next) => { apply(next); setDone(t("Часы работы обновлены на сайте.")); onPublished(); }} />}

          {mode === "contacts" && state.contacts && (
            <div>
              {(Object.keys(fieldLabels) as Array<keyof Contacts>).map((field) => (
                <label key={field} className={styles.field} style={{ marginBottom: 12 }}>
                  <span className={styles.label}>{fieldLabels[field]}</span>
                  <input className={styles.input} value={contacts[field] ?? ""} maxLength={field === "address" ? 160 : field === "email" ? 120 : 60}
                    inputMode={field === "phone" ? "tel" : field === "email" ? "email" : undefined} onChange={(event) => { setContacts({ ...contacts, [field]: event.target.value }); setConfirmContacts(false); }} />
                </label>
              ))}
              {!confirmContacts ? (
                <button className={styles.button} disabled={Boolean(busy) || changed.length === 0} onClick={() => setConfirmContacts(true)}>{t("Сохранить")}</button>
              ) : (
                <div className={`${styles.notice} ${styles.info}`}>
                  <ul className={styles.list} style={{ marginTop: 0 }}>
                    {changed.map((field) => <li key={field}>{fieldLabels[field]}: {state.contacts?.[field] || t("не указан")} → <strong>{contacts[field]?.trim() || t("убрать")}</strong></li>)}
                  </ul>
                  <p className={styles.small}>{t("Контакты записаны на этапе «Цель». Остальные этапы от них не зависят — им мы отметим «без изменений». Сайт соберётся заново и обновится сразу.")}</p>
                  <div className={styles.row}>
                    <button className={styles.button} disabled={Boolean(busy)} onClick={() => void saveContacts()}>{busy === "contacts" ? t("Обновляем сайт…") : t("Да, обновить сайт")}</button>
                    <button className={styles.ghost} disabled={Boolean(busy)} onClick={() => setConfirmContacts(false)}>{t("Отмена")}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === "texts" && (!state.aiConfigured ? (
            <p style={{ margin: 0 }}>{t("ИИ не подключён, поэтому тексты и внешний вид меняются на своих этапах вручную.")}</p>
          ) : (
            <div>
              <label className={styles.field} style={{ marginBottom: 10 }}>
                <span className={styles.label}>{t("Что поменять")}</span>
                <span className={styles.why}>{t("Например: «Цена на торт — 12 000 ₸», «Добавьте вопрос про доставку», «Сделайте сайт светлее».")}</span>
                <textarea className={styles.textarea} style={{ minHeight: 90 }} maxLength={1000} value={request} onChange={(event) => { setRequest(event.target.value); setLocked(null); }} />
              </label>
              <div className={styles.chips} role="group" aria-label={t("Где менять")} style={{ margin: "0 0 10px" }}>
                {[{ key: null, title: t("Определить самим") }, ...state.targets.map((item) => ({ key: item.key, title: t(item.title) }))].map((item) => (
                  <button key={item.key ?? "auto"} type="button" className={styles.choice} style={{ width: "auto" }} aria-pressed={target === item.key} onClick={() => { setTarget(item.key); setLocked(null); }}>{item.title}</button>
                ))}
              </div>
              {locked && (
                <div className={`${styles.notice} ${styles.warn}`}>
                  {locked.length
                    ? t("ИИ ничего не поменял: эти разделы вы правили вручную, и они защищены от ИИ — {0}.", [locked.map(sectionName).join(", ")])
                    : t("ИИ ничего не поменял. Попробуйте описать правку подробнее или поменяйте на этапе вручную.")}
                  {locked.length > 0 && (
                    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 8 }}>
                      <input type="checkbox" checked={allowLocked} onChange={(event) => setAllowLocked(event.target.checked)} />
                      <span>{t("Разрешить ИИ изменить и эти разделы. Их защита снимется — дальше ИИ сможет менять их и при других просьбах.")}</span>
                    </label>
                  )}
                </div>
              )}
              <button className={styles.button} disabled={Boolean(busy) || request.trim().length < 5 || (Boolean(locked?.length) && !allowLocked)} onClick={() => void start()}>
                {busy === "start" ? t("ИИ готовит изменения…") : t("Показать изменения")}
              </button>
              <p className={styles.small} style={{ marginTop: 8 }}>{t("Сначала вы увидите, что изменится, и предпросмотр — на сайте ничего не поменяется, пока вы не подтвердите. Запрос к ИИ оплачивается как обычно.")}</p>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
