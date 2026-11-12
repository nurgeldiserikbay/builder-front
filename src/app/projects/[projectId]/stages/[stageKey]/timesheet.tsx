"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { formatTenge } from "@/lib/money";
import { DisputesBlock } from "./disputes";
import styles from "../../../journey.module.css";

type Terms = { payKind: "none" | "fixed" | "hourly"; fixedAmount: number | null; hourlyRate: number | null; hourLimit: number | null; weeklyHourLimit: number | null; revisionsIncluded: number | null; onlyResultTime: boolean };
type Entry = { id: string; startedAt: string; endedAt: string; minutes: number; source: "tracked" | "manual"; actions: number; withoutResult: boolean; note: string | null; status: string; ownerComment: string | null; specialistReply: string | null };
type Payment = { id: string; basis: string; minutes: number | null; amount: number; fee: number | null; payout: number | null; status: "due" | "checkout" | "held" | "paid_out" | "paid_direct" | "paid" | "cancelled" | "refunded"; paidAt: string | null; paidOutAt: string | null; stageVersion: number | null };
type Summary = { trackedMinutes: number; approvedMinutes: number; pendingMinutes: number; disputedMinutes: number; noResultMinutes: number; payableMinutes: number; limitMinutes: number | null; limitReached: boolean; amountDue: number };
type Sheet = { id: string; name: string; isYou: boolean; role: string; status: string; terms: Terms; summary: Summary; entries: Entry[]; payments: Payment[] };

const hours = (minutes: number) => (minutes < 60 ? t("{0} мин", [minutes]) : t("{0} ч{1}", [Math.floor(minutes / 60), minutes % 60 ? t(" {0} мин", [minutes % 60]) : ""]));
const time = (value: string) => new Date(value).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });
const day = (value: string) => new Date(value).toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "long" });
const statusText: Record<string, string> = { pending: t("ждёт подтверждения"), approved: t("подтверждено"), auto_approved: t("подтверждено автоматически"), disputed: t("оспорено") };
const paymentText: Record<string, string> = {
  due: t("к оплате"), checkout: t("ждёт оплаты"), held: t("оплачено в BuildPath, ждёт перевода специалисту"), paid_out: t("переведено специалисту"),
  paid_direct: t("оплачено напрямую"), paid: t("оплачено"), cancelled: t("отменено"), refunded: t("возвращено владельцу"),
};

/**
 * While a specialist with an active assignment has the stage open and interacts with it, tell the server once a minute.
 * No input for a minute, or a hidden tab, means no heartbeat; the server ends the interval after 5 minutes.
 */
export function useWorkHeartbeat(projectId: string, stageKey: string, active: boolean) {
  const lastInput = useRef(0);
  const [limitReached, setLimitReached] = useState(false);
  useEffect(() => {
    if (!active) return;
    const mark = () => { lastInput.current = Date.now(); };
    const events = ["pointerdown", "keydown", "scroll", "input"] as const;
    events.forEach((name) => window.addEventListener(name, mark, { passive: true }));
    mark();
    const beat = async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastInput.current > 60_000) return;
      try {
        const result = await api<{ tracking: boolean; limitReached: boolean }>(`/projects/${projectId}/stages/${stageKey}/activity`, { method: "POST" });
        setLimitReached(result.limitReached);
      } catch { /* the next beat retries */ }
    };
    void beat();
    const timer = window.setInterval(() => void beat(), 60_000);
    return () => { window.clearInterval(timer); events.forEach((name) => window.removeEventListener(name, mark)); };
  }, [projectId, stageKey, active]);
  return { limitReached };
}

function TermsLine({ terms }: { terms: Terms }) {
  if (terms.payKind === "fixed") return <>{t("Фиксированная цена:")}{" "}{formatTenge(terms.fixedAmount ?? 0)}{terms.revisionsIncluded !== null ? t(" · правок включено: {0}", [terms.revisionsIncluded]) : ""}</>;
  if (terms.payKind === "hourly") return <>{formatTenge(terms.hourlyRate ?? 0)}{" "}{t("в час · лимит")}{" "}{terms.hourLimit}{" "}{t("ч")}{terms.weeklyHourLimit ? t(" · до {0} ч в неделю", [terms.weeklyHourLimit]) : ""}{terms.onlyResultTime ? t(" · только время с результатом") : ""}</>;
  return <>{t("Оплата не через платформу")}</>;
}

/** Time and money of specialists on a stage: the owner decides on entries, the specialist sees and explains their own. */
export function TimesheetPanel({ projectId, stageKey, specialistActive }: { projectId: string; stageKey: string; specialistActive: boolean }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [canDecide, setCanDecide] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [comment, setComment] = useState<{ id: string; kind: "dispute" | "reply"; text: string } | null>(null);
  const [manual, setManual] = useState<{ date: string; start: string; minutes: string; note: string } | null>(null);
  const { limitReached } = useWorkHeartbeat(projectId, stageKey, specialistActive);
  const [online, setOnline] = useState<{ payOnline: boolean; feePercent: number }>({ payOnline: false, feePercent: 0 });

  const load = useCallback(async () => {
    try {
      const data = await api<{ canDecide: boolean; assignments: Sheet[]; payOnline: boolean; specialistFeePercent: number }>(`/projects/${projectId}/stages/${stageKey}/timesheet`);
      setSheets(data.assignments); setCanDecide(data.canDecide); setOnline({ payOnline: data.payOnline, feePercent: data.specialistFeePercent });
    } catch (caught) { setError(explainError(caught)); }
  }, [projectId, stageKey]);
  useEffect(() => { void load(); }, [load]);

  async function act(id: string, action: () => Promise<{ canDecide: boolean; assignments: Sheet[] }>) {
    setBusy(id); setError("");
    try { const data = await action(); setSheets(data.assignments); setCanDecide(data.canDecide); setComment(null); setManual(null); }
    catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }
  const post = (path: string, body?: unknown) => api<{ canDecide: boolean; assignments: Sheet[] }>(path, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) });

  const paid = (sheets ?? []).filter((sheet) => sheet.terms.payKind !== "none" || sheet.entries.length > 0);
  if (!sheets || paid.length === 0) return error ? <p className={`${styles.notice} ${styles.error}`}>{error}</p> : null;

  return (
    <section className={styles.card} aria-label={t("Время и оплата")}>
      <p className={styles.cardTitle}>{t("Время и оплата")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>
        {canDecide
          ? t("Платформа считает время, пока специалист работает на этапе. Отрезки без действий помечены «без результата». Оплата начисляется, когда вы принимаете этап: время, которое вы не оспорили, при приёмке засчитывается. Оспорьте то, с чем не согласны, до приёмки.")
          : t("Время считается, пока страница этапа открыта и вы что-то делаете. Через 5 минут без действий учёт останавливается. Оплата — после того, как владелец примет этап.")}
      </p>
      {limitReached && <p className={`${styles.notice} ${styles.error}`}>{t("Лимит часов закончился — учёт остановлен. Попросите владельца увеличить лимит.")}</p>}
      {error && <p className={`${styles.notice} ${styles.error}`}>{error}</p>}
      {paid.map((sheet) => {
        const byDay = new Map<string, Entry[]>();
        for (const entry of sheet.entries) { const key = day(entry.startedAt); byDay.set(key, [...(byDay.get(key) ?? []), entry]); }
        const s = sheet.summary;
        return (
          <div key={sheet.id} style={{ marginBottom: 16 }}>
            <div className={styles.row}><strong>{sheet.name}</strong><span className={styles.small}>{sheet.role === "lead" ? t("ведущий") : t("консультант")} · {sheet.status === "completed" ? t("этап принят") : t("работает")}</span></div>
            <div className={styles.small}><TermsLine terms={sheet.terms} /></div>
            <ul className={styles.list} style={{ margin: "8px 0" }}>
              <li>{t("Учтено:")}{" "}{hours(s.trackedMinutes)}{s.limitMinutes ? t(" из {0}", [hours(s.limitMinutes)]) : ""}{s.noResultMinutes ? t(" · без результата: {0}", [hours(s.noResultMinutes)]) : ""}</li>
              <li>{t("Подтверждено:")}{" "}{hours(s.approvedMinutes)}{s.pendingMinutes ? t(" · ждёт: {0}", [hours(s.pendingMinutes)]) : ""}{s.disputedMinutes ? t(" · оспорено: {0}", [hours(s.disputedMinutes)]) : ""}</li>
              {sheet.terms.payKind !== "none" && <li>{sheet.status === "completed" ? t("Начислено") : t("Если принять этап сейчас")}: <strong>{formatTenge(sheet.payments[0]?.amount ?? s.amountDue)}</strong></li>}
            </ul>
            {sheet.payments.map((payment) => (
              <div key={payment.id} className={`${styles.notice} ${payment.status === "due" || payment.status === "checkout" ? styles.info : styles.success}`}>
                {payment.basis === "dispute" ? t("По решению спора") : <>{t("Версия")}{" "}{payment.stageVersion}</>}: {formatTenge(payment.amount)}{payment.minutes !== null ? t(" за {0}", [hours(payment.minutes)]) : ""} — {paymentText[payment.status]}{payment.paidAt ? ` ${new Date(payment.paidAt).toLocaleDateString(dateLocale())}` : ""}
                {payment.payout !== null && ["held", "paid_out"].includes(payment.status) && payment.fee ? (
                  <div className={styles.small}>{t("Специалисту:")}{" "}{formatTenge(payment.payout)}{" "}{t("· комиссия BuildPath:")}{" "}{formatTenge(payment.fee)}</div>
                ) : null}
                {canDecide && ["held", "paid_out", "refunded"].includes(payment.status) && <div><a className={styles.small} href={`/projects/${projectId}/receipts/stage/${payment.id}`}>{t("Квитанция об оплате")}</a></div>}
                {canDecide && (payment.status === "due" || payment.status === "checkout") && (
                  <div style={{ marginTop: 8 }}>
                    {online.payOnline ? (
                      <>
                        <span className={styles.small}>
                          {t("Заплатите через BuildPath картой — мы переведём деньги специалисту на его счёт.")}
                          {online.feePercent > 0 ? t(" Комиссия BuildPath {0}% удерживается из суммы специалиста; вы платите {1}.", [online.feePercent, formatTenge(payment.amount)]) : t(" Комиссии нет.")}
                        </span>
                        <button className={styles.button} style={{ marginTop: 6 }} disabled={Boolean(busy)}
                          onClick={() => void act(`pay-${payment.id}`, async () => {
                            const { redirectUrl } = await api<{ redirectUrl: string }>(`/projects/${projectId}/payments/${payment.id}/checkout`, { method: "POST" });
                            window.location.assign(redirectUrl);
                            return new Promise<never>(() => {});
                          })}>{busy === `pay-${payment.id}` ? t("Открываем оплату…") : t("Оплатить {0} через BuildPath", [formatTenge(payment.amount)])}</button>
                        <span className={styles.small} style={{ display: "block", marginTop: 6 }}>{t("Уже заплатили сами? Тогда отметьте:")}</span>
                      </>
                    ) : <span className={styles.small}>{t("Переведите деньги специалисту сами и отметьте здесь.")}</span>}
                    <button className={styles.secondary} style={{ marginTop: 6 }} disabled={Boolean(busy)}
                      onClick={() => { if (window.confirm(t("Отметить, что вы заплатили {0} напрямую?", [formatTenge(payment.amount)]))) void act(payment.id, () => post(`/projects/${projectId}/payments/${payment.id}/mark-paid`)); }}>{t("Я оплатил напрямую")}</button>
                  </div>
                )}
              </div>
            ))}
            {sheet.isYou && sheet.terms.payKind !== "none" && online.payOnline && <PayoutAccount />}
            {(canDecide || sheet.isYou) && <DisputesBlock assignmentId={sheet.id} />}
            {[...byDay.entries()].map(([label, entries]) => (
              <details key={label} open={entries.some((entry) => entry.status === "pending" || entry.status === "disputed")}>
                <summary className={styles.small} style={{ fontWeight: 700, padding: "6px 0" }}>{label} · {hours(entries.reduce((sum, entry) => sum + entry.minutes, 0))}</summary>
                <ul className={styles.versions}>
                  {entries.map((entry) => (
                    <li key={entry.id}>
                      <div className={styles.row}>
                        <span>{time(entry.startedAt)}–{time(entry.endedAt)} · {hours(entry.minutes)}</span>
                        <span className={styles.small}>{statusText[entry.status] ?? entry.status}</span>
                      </div>
                      <div className={styles.small}>
                        {entry.source === "manual" ? t("Добавлено вручную: {0}", [entry.note]) : entry.withoutResult ? t("Без результата: страница была открыта, действий на этапе не было") : t("Действий на этапе: {0}", [entry.actions])}
                      </div>
                      {entry.ownerComment && <div className={styles.small}>{t("Владелец:")}{" "}{entry.ownerComment}</div>}
                      {entry.specialistReply && <div className={styles.small}>{t("Ответ:")}{" "}{entry.specialistReply}</div>}
                      {canDecide && entry.status === "pending" && (
                        <div className={styles.row} style={{ marginTop: 6 }}>
                          <button className={styles.secondary} style={{ minHeight: 40 }} disabled={Boolean(busy)} onClick={() => void act(entry.id, () => post(`/projects/${projectId}/time-entries/${entry.id}`, { action: "approve" }))}>{t("Подтвердить")}</button>
                          <button className={styles.ghost} style={{ minHeight: 40 }} disabled={Boolean(busy)} onClick={() => setComment({ id: entry.id, kind: "dispute", text: "" })}>{t("Оспорить")}</button>
                        </div>
                      )}
                      {sheet.isYou && entry.status === "disputed" && !entry.specialistReply && (
                        <button className={styles.ghost} style={{ minHeight: 40, marginTop: 6 }} onClick={() => setComment({ id: entry.id, kind: "reply", text: "" })}>{t("Ответить владельцу")}</button>
                      )}
                      {comment?.id === entry.id && (
                        <div style={{ marginTop: 6 }}>
                          <textarea className={styles.textarea} value={comment.text} maxLength={500} aria-label={comment.kind === "dispute" ? t("Почему вы не согласны") : t("Ваш ответ")}
                            placeholder={comment.kind === "dispute" ? t("Например: в это время работы на этапе не было видно") : t("Объясните, что вы делали в это время")} onChange={(event) => setComment({ ...comment, text: event.target.value })} />
                          <div className={styles.row}>
                            <button className={styles.ghost} onClick={() => setComment(null)}>{t("Отмена")}</button>
                            <div className={styles.spacer} />
                            <button className={styles.button} disabled={Boolean(busy) || comment.text.trim().length < 2}
                              onClick={() => void act(entry.id, () => post(`/projects/${projectId}/time-entries/${entry.id}`, { action: comment.kind, comment: comment.text.trim() }))}>{t("Отправить")}</button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            {sheet.isYou && sheet.status === "active" && !manual && (
              <button className={styles.ghost} onClick={() => { const now = new Date(); setManual({ date: now.toISOString().slice(0, 10), start: "10:00", minutes: "30", note: "" }); }}>{t("+ Добавить время вне платформы")}</button>
            )}
            {sheet.isYou && manual && (
              <div className={`${styles.notice} ${styles.info}`}>
                <p style={{ marginTop: 0 }}>{t("Например, созвон с владельцем или работа в другой программе. Владелец подтвердит или оспорит запись. Можно добавить за последние 14 дней.")}</p>
                <div className={styles.row}>
                  <input className={styles.input} type="date" aria-label={t("День")} value={manual.date} onChange={(event) => setManual({ ...manual, date: event.target.value })} />
                  <input className={styles.input} type="time" aria-label={t("Начало")} value={manual.start} onChange={(event) => setManual({ ...manual, start: event.target.value })} />
                </div>
                <label className={styles.field} style={{ marginTop: 8 }}>
                  <span className={styles.label}>{t("Сколько минут")}</span>
                  <input className={styles.input} inputMode="numeric" value={manual.minutes} maxLength={3} onChange={(event) => setManual({ ...manual, minutes: event.target.value.replace(/\D/g, "") })} />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>{t("Что вы делали")}</span>
                  <textarea className={styles.textarea} value={manual.note} maxLength={500} onChange={(event) => setManual({ ...manual, note: event.target.value })} />
                </label>
                <div className={styles.row}>
                  <button className={styles.ghost} onClick={() => setManual(null)}>{t("Отмена")}</button>
                  <div className={styles.spacer} />
                  <button className={styles.button} disabled={Boolean(busy) || manual.note.trim().length < 5 || Number(manual.minutes) < 5 || Number(manual.minutes) > 600}
                    onClick={() => void act("manual", () => post(`/projects/${projectId}/stages/${stageKey}/timesheet/entries`, { date: new Date(`${manual.date}T${manual.start}`).toISOString(), minutes: Number(manual.minutes), note: manual.note.trim() }))}>{t("Добавить")}</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** Where BuildPath sends the specialist's money. The full IBAN never comes back to the browser after saving. */
export function PayoutAccount() {
  const [state, setState] = useState<{ details: { holderName: string; iban: string } | null; canSave: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const [holder, setHolder] = useState("");
  const [iban, setIban] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { api<{ details: { holderName: string; iban: string } | null; canSave: boolean }>("/me/payout-details").then(setState).catch(() => setState(null)); }, []);
  if (!state) return null;
  async function save() {
    setBusy(true); setError("");
    try { setState(await api("/me/payout-details", { method: "PUT", body: JSON.stringify({ holderName: holder, iban }) })); setEditing(false); setIban(""); }
    catch (caught) { setError(caught instanceof ApiError && caught.message === "IBAN_INVALID" ? t("Проверьте IBAN: 20 знаков, начинается с KZ. Его можно скопировать в приложении банка.") : explainError(caught)); }
    finally { setBusy(false); }
  }
  if (state.details && !editing) {
    return (
      <div className={styles.small} style={{ marginTop: 8 }}>
        {t("Переведём на счёт")}{" "}{state.details.iban} ({state.details.holderName}). <button className={styles.ghost} style={{ minHeight: 36 }} onClick={() => { setHolder(state.details!.holderName); setEditing(true); }}>{t("Изменить")}</button>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8 }}>
      <p style={{ margin: "0 0 6px" }}><strong>{t("Куда перевести деньги")}</strong></p>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Укажите IBAN своего счёта в банке Казахстана (есть в приложении банка в реквизитах счёта) и имя владельца. Мы храним его зашифрованным и показываем только сотруднику, который делает перевод.")}</p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      <label className={styles.field}><span className={styles.label}>{t("Имя владельца счёта")}</span>
        <input className={styles.input} value={holder} maxLength={120} autoComplete="name" onChange={(event) => setHolder(event.target.value)} /></label>
      <label className={styles.field}><span className={styles.label}>IBAN</span>
        <input className={styles.input} value={iban} maxLength={40} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="KZ00 000K ZT00 0000 0000" onChange={(event) => setIban(event.target.value.toUpperCase())} /></label>
      {!state.canSave && <p className={`${styles.notice} ${styles.info}`}>{t("Сохранение счетов пока не включено на этом сервере BuildPath.")}</p>}
      <button className={styles.button} disabled={busy || !state.canSave || holder.trim().length < 3 || iban.replace(/\s/g, "").length !== 20} onClick={() => void save()}>{busy ? t("Сохраняем…") : t("Сохранить счёт")}</button>
    </div>
  );
}
