"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t, dateLocale } from "@/lib/i18n";
import { explainError } from "@/lib/journey";
import { formatTenge } from "@/lib/money";
import { payKindText, termsLine, type ResponseTerms } from "@/lib/requests";
import styles from "../../../journey.module.css";

type Card = { profileId: string | null; name: string | null; headline: string | null; city: string | null; rating: number | null; reviews: number; finishedStages: number };
type Response = { id: string; message: string; days: number; status: string; createdAt: string; terms: ResponseTerms; overBudget: boolean; specialist: Card | null };
type Request = {
  id: string; role: "lead" | "consultant"; roleTitle: string; description: string; payKind: string; budget: number | null; days: number;
  status: "open" | "expired" | "filled" | "cancelled"; closesAt: string; createdAt: string; responses: Response[];
};

const statusText = (status: Request["status"]) => ({ open: t("Открыта"), expired: t("Срок вышел"), filled: t("Исполнитель выбран"), cancelled: t("Закрыта") })[status];

/**
 * «Найти исполнителя»: the owner describes the work, specialists from the catalog respond with their terms,
 * the owner compares and chooses — the chosen specialist joins the stage at once.
 */
export default function StageRequests({ projectId, stageKey, editable, onChosen }: { projectId: string; stageKey: string; editable: boolean; onChosen: () => void }) {
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [role, setRole] = useState<"lead" | "consultant">("lead");
  const [description, setDescription] = useState("");
  const [payKind, setPayKind] = useState<"any" | "fixed" | "hourly">("any");
  const [budget, setBudget] = useState("");
  const [days, setDays] = useState("7");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setRequests((await api<{ requests: Request[] }>(`/projects/${projectId}/stages/${stageKey}/requests`)).requests); }
    catch (caught) { setError(explainError(caught)); }
  }, [projectId, stageKey]);
  useEffect(() => { void load(); }, [load]);

  async function run(work: () => Promise<{ requests: Request[] }>, after?: () => void) {
    setBusy(true); setError("");
    try { setRequests((await work()).requests); after?.(); }
    catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }
  const create = () => run(() => api(`/projects/${projectId}/stages/${stageKey}/requests`, { method: "POST", body: JSON.stringify({
    role, description: description.trim(), payKind, days: Number(days), budget: budget.trim() ? Number(budget.replace(/\s/g, "")) : null,
  }) }), () => { setCreating(false); setDescription(""); });

  if (!requests) return error ? <p className={`${styles.notice} ${styles.error}`}>{error}</p> : null;
  const active = requests.filter((request) => request.status === "open");
  const recent = requests.filter((request) => request.status !== "open").slice(0, 3);
  const validDays = Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 180;
  const validBudget = !budget.trim() || Number(budget.replace(/\s/g, "")) >= 1000;

  return (
    <section className={styles.card} aria-labelledby="requests-title">
      <div className={styles.sectionTitle}>
        <h2 id="requests-title" className={styles.h2}>{t("Найти исполнителя")}</h2>
        {editable && !creating && <button type="button" className={styles.secondary} style={{ marginLeft: "auto", minHeight: 32 }} onClick={() => setCreating(true)}>{t("Разместить заявку")}</button>}
      </div>
      <p className={styles.small} style={{ margin: "0 0 12px" }}>{t("Опишите задачу — специалисты из каталога предложат цену и срок. Вы сравните отклики и выберете; выбранный сразу получит доступ к этапу. Название проекта и его данные в заявке не видны.")}</p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}

      {creating && (
        <div className={styles.responseForm} style={{ marginBottom: 14 }}>
          <div className={styles.segmented} role="group" aria-label={t("Кого ищете")} style={{ marginBottom: 12 }}>
            <button type="button" aria-pressed={role === "lead"} onClick={() => setRole("lead")}>{t("Ведущего этапа")}</button>
            <button type="button" aria-pressed={role === "consultant"} onClick={() => setRole("consultant")}>{t("Консультанта")}</button>
          </div>
          <label className={styles.field}><span className={styles.label}>{t("Что нужно сделать")}</span>
            <textarea className={styles.textarea} value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)}
              placeholder={t("Например: разобрать, как клиенты записываются и отменяют запись, и довести ТЗ до готовности. Важно учесть оплату на месте и напоминания.")} />
            <span className={styles.why}>{t("Не меньше 30 знаков. Не пишите контакты и данные клиентов — заявку видят все специалисты.")}</span></label>
          <div className={styles.formGrid}>
            <label className={styles.field}><span className={styles.label}>{t("Оплата")}</span>
              <select className={styles.select} value={payKind} onChange={(event) => setPayKind(event.target.value as typeof payKind)}>
                <option value="any">{t("Цена или почасово — как предложат")}</option>
                <option value="fixed">{t("Фиксированная цена за этап")}</option>
                <option value="hourly">{t("Почасово")}</option>
              </select></label>
            <label className={styles.field}><span className={styles.label}>{t("Бюджет, ₸ (необязательно)")}</span>
              <input className={styles.input} inputMode="numeric" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder={t("Например: 50000")} /></label>
            <label className={styles.field}><span className={styles.label}>{t("Срок, дней")}</span>
              <input className={styles.input} inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} /></label>
          </div>
          <div className={styles.row}>
            <button type="button" className={styles.button} disabled={busy || description.trim().length < 30 || !validDays || !validBudget} onClick={() => void create()}>{busy ? t("Размещаем…") : t("Разместить на 14 дней")}</button>
            <button type="button" className={styles.ghost} onClick={() => setCreating(false)}>{t("Отмена")}</button>
          </div>
        </div>
      )}

      {active.map((request) => (
        <div key={request.id} className={styles.requestBlock}>
          <div className={styles.row} style={{ justifyContent: "space-between" }}>
            <b>{t("Заявка: {0}", [request.roleTitle.toLowerCase()])}</b>
            <span className={styles.small}>{payKindText(request.payKind)}{request.budget ? ` · ${t("до {0}", [formatTenge(request.budget)])}` : ""} · {t("срок {0} дн.", [request.days])} · {t("открыта до {0}", [new Date(request.closesAt).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" })])}</span>
          </div>
          <p className={styles.requestText} style={{ margin: "6px 0 10px" }}>{request.description}</p>
          {request.responses.filter((item) => item.status === "sent").length === 0
            ? <p className={styles.small} style={{ margin: "0 0 8px" }}>{t("Откликов пока нет. Обычно они приходят в первые дни — мы сообщим.")}</p>
            : (
              <ul className={styles.responseList}>
                {request.responses.filter((item) => item.status === "sent").map((response) => (
                  <li key={response.id}>
                    <div className={styles.row} style={{ justifyContent: "space-between", alignItems: "flex-start", gap: "4px 12px" }}>
                      <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                        <b>{response.specialist?.profileId ? <a className={styles.tableLink} href={`/specialists/${response.specialist.profileId}`}>{response.specialist.name}</a> : response.specialist?.name ?? t("Специалист")}</b>
                        <span className={styles.cellSub}>
                          {response.specialist?.headline}
                          {response.specialist?.rating ? ` · ★ ${response.specialist.rating.toLocaleString(dateLocale())} (${response.specialist.reviews})` : ""}
                          {response.specialist ? ` · ${t("принято этапов: {0}", [response.specialist.finishedStages])}` : ""}
                          {response.specialist?.city ? ` · ${response.specialist.city}` : ""}
                        </span>
                      </div>
                      <div style={{ flex: "none" }}>
                        <b className={styles.num} style={response.overBudget ? { color: "var(--attention)" } : undefined}>{termsLine(response.terms)}</b>
                        <span className={styles.cellSub}>{t("срок {0} дн.", [response.days])}{response.overBudget ? ` · ${t("выше бюджета")}` : ""}</span>
                      </div>
                    </div>
                    <p className={styles.requestText} style={{ margin: "8px 0" }}>{response.message}</p>
                    {editable && (
                      <div className={styles.row} style={{ gap: 6 }}>
                        <button type="button" className={styles.button} style={{ minHeight: 32 }} disabled={busy}
                          onClick={() => { if (window.confirm(t("Выбрать этого специалиста? Он сразу получит доступ к этапу на этих условиях, остальным откликам мы откажем."))) void run(() => api(`/projects/${projectId}/requests/${request.id}/responses/${response.id}/choose`, { method: "POST" }), onChosen); }}>{t("Выбрать")}</button>
                        <button type="button" className={styles.ghost} style={{ minHeight: 32 }} disabled={busy}
                          onClick={() => void run(() => api(`/projects/${projectId}/requests/${request.id}/responses/${response.id}/decline`, { method: "POST" }))}>{t("Отказать")}</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          {editable && <button type="button" className={styles.ghost} style={{ minHeight: 32, paddingLeft: 0 }} disabled={busy}
            onClick={() => { if (window.confirm(t("Закрыть заявку без выбора? Откликнувшимся мы сообщим."))) void run(() => api(`/projects/${projectId}/requests/${request.id}/cancel`, { method: "POST" })); }}>{t("Закрыть заявку")}</button>}
        </div>
      ))}

      {recent.length > 0 && (
        <details className={styles.details}>
          <summary>{t("Прошлые заявки ({0})", [recent.length])}</summary>
          <ul className={styles.list}>
            {recent.map((request) => (
              <li key={request.id}>{request.roleTitle} · {statusText(request.status)} · {t("откликов: {0}", [request.responses.length])}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
