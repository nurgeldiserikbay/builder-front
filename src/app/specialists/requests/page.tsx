"use client";

import { useCallback, useEffect, useState } from "react";
import AppHeader from "../../app-header";
import styles from "../../projects/journey.module.css";
import { api, ApiError } from "@/lib/api";
import { t, dateLocale } from "@/lib/i18n";
import { explainError } from "@/lib/journey";
import { formatTenge } from "@/lib/money";
import { payKindText, termsLine, type ResponseTerms } from "@/lib/requests";

type BoardRequest = {
  id: string; projectTypeTitle: string | null; stageKey: string; stageTitle: string; stagePurpose: string;
  role: "lead" | "consultant"; roleTitle: string; roleExplanation: string; can: string[];
  description: string; payKind: "fixed" | "hourly" | "any"; budget: number | null; days: number; closesAt: string; createdAt: string;
  responses: number; matchesProfile: boolean; canRespond: boolean; cannotRespond: string | null;
  mine: { id: string; status: string; message: string; days: number; terms: ResponseTerms; createdAt: string } | null;
};
type Board = { profile: "none" | "draft" | "published" | "blocked"; requests: BoardRequest[] };

const reasonText = (reason: string | null) => ({
  PROFILE_NOT_PUBLISHED: t("Откликаться можно с опубликованной карточкой в каталоге."),
  PROFILE_BLOCKED: t("Карточка скрыта поддержкой — откликаться нельзя."),
  OWN_PROJECT: t("Это ваш проект."),
  ALREADY_ON_STAGE: t("Вы уже работаете на этом этапе."),
} as Record<string, string>)[reason ?? ""] ?? "";
const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

/** «Заявки на этапы»: what owners need, for specialists to respond with their terms. */
export default function RequestsBoard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [onlyMatching, setOnlyMatching] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setBoard(await api<Board>("/stage-requests")); }
    catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { window.location.href = "/login?next=/specialists/requests"; return; }
      setError(explainError(caught));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = (board?.requests ?? []).filter((item) => (!onlyMine || item.mine) && (!onlyMatching || item.matchesProfile));

  return (
    <div className={styles.shell}>
      <AppHeader />
      <main className={`${styles.container} ${styles.wide}`}>
        <div className={styles.pageHead}>
          <div>
            <p className={styles.kicker}>{t("Специалисты")}</p>
            <h1 className={styles.h1}>{t("Заявки на этапы")}</h1>
          </div>
        </div>
        <nav className={styles.tabs} style={{ position: "static", padding: 0, background: "transparent", marginBottom: 16 }} aria-label={t("Разделы")}>
          <a className={styles.tab} href="/specialists" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>{t("Каталог")}</a>
          <a className={styles.tab} aria-selected="true" href="/specialists/requests" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>{t("Заявки на этапы")}</a>
        </nav>
        <p className={styles.lead} style={{ marginTop: -4 }}>{t("Владельцы описывают, что нужно сделать на этапе. Откликнитесь своей ценой и сроком — если владелец выберет вас, этап откроется сразу, с вашими условиями. Название проекта и его данные видны только после выбора.")}</p>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {board && board.profile !== "published" && (
          <p className={`${styles.notice} ${board.profile === "blocked" ? styles.error : styles.info}`}>
            {board.profile === "blocked" ? t("Карточка скрыта поддержкой — откликаться нельзя.") : t("Чтобы откликаться, опубликуйте карточку в каталоге: по ней владелец решает, кого выбрать.")}{" "}
            <a className={styles.linkButton} href="/account/specialist">{board.profile === "none" ? t("Создать карточку") : t("Открыть карточку")}</a>
          </p>
        )}
        {board && (
          <div className={styles.toolbar}>
            <div className={styles.segmented} role="group" aria-label={t("Показать")}>
              <button type="button" aria-pressed={!onlyMine && !onlyMatching} onClick={() => { setOnlyMine(false); setOnlyMatching(false); }}>{t("Все")} <span className={styles.num} style={{ opacity: .6 }}>{board.requests.length}</span></button>
              <button type="button" aria-pressed={onlyMatching} onClick={() => { setOnlyMatching(true); setOnlyMine(false); }}>{t("По моим этапам")}</button>
              <button type="button" aria-pressed={onlyMine} onClick={() => { setOnlyMine(true); setOnlyMatching(false); }}>{t("Мои отклики")}</button>
            </div>
          </div>
        )}
        {!board && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}
        {board && shown.length === 0 && <div className={styles.empty}>{onlyMine ? t("Вы пока ни на что не откликались.") : t("Открытых заявок сейчас нет. Загляните позже — заявки живут 14 дней.")}</div>}
        <div className={styles.requestList}>
          {shown.map((item) => (
            <article key={item.id} className={styles.requestCard}>
              <div className={styles.requestHead}>
                <div style={{ minWidth: 0 }}>
                  <p className={styles.kicker} style={{ margin: 0 }}>{item.projectTypeTitle ?? t("Проект")}{item.matchesProfile ? ` · ${t("подходит вашей карточке")}` : ""}</p>
                  <h2 className={styles.h2} style={{ margin: "2px 0 0" }}>{t(item.stageTitle)} — {item.roleTitle.toLowerCase()}</h2>
                </div>
                <div className={styles.requestMeta}>
                  <b>{item.budget ? t("до {0}", [formatTenge(item.budget)]) : t("бюджет не указан")}</b>
                  <span>{payKindText(item.payKind)} · {t("срок {0} дн.", [item.days])}</span>
                </div>
              </div>
              <p className={styles.requestText}>{item.description}</p>
              <p className={styles.small} style={{ margin: 0 }}>
                {t("Откликов: {0}", [item.responses])} · {t("закроется через {0} дн.", [daysLeft(item.closesAt)])} · {new Date(item.createdAt).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" })}
              </p>
              {item.mine ? (
                <div className={styles.myResponse}>
                  <span><b>{t("Ваш отклик:")}</b> {termsLine(item.mine.terms)}, {t("срок {0} дн.", [item.mine.days])}</span>
                  <span className={styles.row} style={{ gap: 6 }}>
                    <button type="button" className={styles.ghost} onClick={() => setOpen(open === item.id ? null : item.id)}>{t("Изменить")}</button>
                    <button type="button" className={styles.ghost} onClick={() => void api<Board>(`/stage-requests/${item.id}/responses/withdraw`, { method: "POST" }).then(() => load()).catch((caught) => setError(explainError(caught)))}>{t("Отозвать")}</button>
                  </span>
                </div>
              ) : item.canRespond ? (
                open !== item.id && <div><button type="button" className={styles.button} onClick={() => setOpen(item.id)}>{t("Откликнуться")}</button></div>
              ) : <p className={styles.small} style={{ margin: 0 }}>{reasonText(item.cannotRespond)}</p>}
              {open === item.id && <ResponseForm request={item} onDone={() => { setOpen(null); void load(); }} onCancel={() => setOpen(null)} />}
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}

function ResponseForm({ request, onDone, onCancel }: { request: BoardRequest; onDone: () => void; onCancel: () => void }) {
  const mine = request.mine;
  const [payKind, setPayKind] = useState<"fixed" | "hourly">(mine ? (mine.terms.payKind as "fixed" | "hourly") : request.payKind === "hourly" ? "hourly" : "fixed");
  const [amount, setAmount] = useState(mine?.terms.fixedAmount ? String(mine.terms.fixedAmount) : request.budget && request.payKind !== "hourly" ? String(request.budget) : "");
  const [rate, setRate] = useState(mine?.terms.hourlyRate ? String(mine.terms.hourlyRate) : "");
  const [hours, setHours] = useState(mine?.terms.hourLimit ? String(mine.terms.hourLimit) : "10");
  const [days, setDays] = useState(String(mine?.days ?? request.days));
  const [message, setMessage] = useState(mine?.message ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const number = (value: string) => Number(value.replace(/\s/g, ""));
  const total = payKind === "fixed" ? number(amount) : number(rate) * number(hours);
  const valid = message.trim().length >= 20 && number(days) >= 1 && (payKind === "fixed" ? number(amount) >= 1000 : number(rate) >= 500 && number(hours) >= 1);

  async function send() {
    setBusy(true); setError("");
    try {
      await api(`/stage-requests/${request.id}/responses`, { method: "POST", body: JSON.stringify({
        message: message.trim(), payKind, days: number(days),
        ...(payKind === "fixed" ? { fixedAmount: number(amount) } : { hourlyRate: number(rate), hourLimit: number(hours) }),
      }) });
      onDone();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  return (
    <div className={styles.responseForm}>
      <p className={styles.small} style={{ margin: "0 0 10px" }}><b>{request.roleTitle}.</b> {request.roleExplanation}</p>
      {request.payKind === "any" && (
        <div className={styles.segmented} role="group" aria-label={t("Как оплачивать")} style={{ marginBottom: 12 }}>
          <button type="button" aria-pressed={payKind === "fixed"} onClick={() => setPayKind("fixed")}>{t("Цена за этап")}</button>
          <button type="button" aria-pressed={payKind === "hourly"} onClick={() => setPayKind("hourly")}>{t("Почасово")}</button>
        </div>
      )}
      <div className={styles.formGrid}>
        {payKind === "fixed" ? (
          <label className={styles.field}><span className={styles.label}>{t("Цена за этап, ₸")}</span>
            <input className={styles.input} inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        ) : (
          <>
            <label className={styles.field}><span className={styles.label}>{t("Ставка в час, ₸")}</span>
              <input className={styles.input} inputMode="numeric" value={rate} onChange={(event) => setRate(event.target.value)} /></label>
            <label className={styles.field}><span className={styles.label}>{t("Не больше часов")}</span>
              <input className={styles.input} inputMode="numeric" value={hours} onChange={(event) => setHours(event.target.value)} /></label>
          </>
        )}
        <label className={styles.field}><span className={styles.label}>{t("Срок, дней")}</span>
          <input className={styles.input} inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} /></label>
      </div>
      <label className={styles.field}><span className={styles.label}>{t("Почему вы")}</span>
        <textarea className={styles.textarea} value={message} maxLength={1000} onChange={(event) => setMessage(event.target.value)}
          placeholder={t("Опыт с похожими задачами и с чего начнёте. Контакты не пишите — после выбора владелец увидит вас в проекте.")} />
        <span className={styles.why}>{t("Не меньше 20 знаков.")}</span></label>
      {total > 0 && <p className={styles.small} style={{ margin: "0 0 10px" }}>
        {t("Владелец увидит: не больше {0}.", [formatTenge(total)])}{request.budget && total > request.budget ? ` ${t("Это выше его бюджета ({0}) — объясните почему.", [formatTenge(request.budget)])}` : ""}
        {" "}{t("Оплата — только после приёмки этапа.")}
      </p>}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      <div className={styles.row}>
        <button type="button" className={styles.button} disabled={busy || !valid} onClick={() => void send()}>{busy ? t("Отправляем…") : mine ? t("Сохранить отклик") : t("Отправить отклик")}</button>
        <button type="button" className={styles.ghost} onClick={onCancel}>{t("Отмена")}</button>
      </div>
    </div>
  );
}
