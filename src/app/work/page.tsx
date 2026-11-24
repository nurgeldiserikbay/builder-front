"use client";

import { useEffect, useState } from "react";
import AppHeader from "../app-header";
import styles from "../projects/journey.module.css";
import { api, ApiError } from "@/lib/api";
import { t, dateLocale } from "@/lib/i18n";
import { formatTenge } from "@/lib/money";
import { statusTone, type StageStatus } from "@/lib/journey";
import { PayoutAccount } from "../projects/[projectId]/stages/[stageKey]/timesheet";

type Assignment = {
  id: string; role: "lead" | "consultant"; status: "active" | "completed";
  projectId: string; projectName: string; projectType: string | null; projectStatus: string;
  stageKey: string; stageTitle: string; stageStatus: StageStatus;
  terms: { payKind: string; fixedAmount: number | null; hourlyRate: number | null; hourLimit: number | null; weeklyHourLimit: number | null };
  time: { trackedMinutes: number; approvedMinutes: number; pendingMinutes: number; disputedMinutes: number; limitMinutes: number | null; weekMinutes: number };
  planned: number; earnedSoFar: number; money: { awaitingOwner: number; held: number; paidOut: number };
  ai: { budget: number | null; used: number }; openDispute: boolean; acceptedAt: string | null; completedAt: string | null; readUntil: string | null;
};
type Payment = { id: string; projectId: string; projectName: string; stageKey: string; stageTitle: string; amount: number; payout: number | null; status: string; createdAt: string; paidOutAt: string | null };
type Work = {
  assignments: Assignment[];
  totals: { awaitingOwner: number; held: number; paidOut: number; paidOutLast30: number; weekMinutes: number; pendingMinutes: number };
  recentTime: Array<{ startedAt: string; minutes: number }>;
  payments: Payment[];
  reviews: { count: number; average: number | null; latest: Array<{ id: string; rating: number; text: string | null; stageTitle: string; createdAt: string; replied: boolean }> };
  setup: { payoutDetails: boolean; payoutHint: string | null; profile: "none" | "draft" | "published" | "blocked" };
  feePercent: number;
};

const hours = (minutes: number) => {
  if (minutes < 60) return t("{0} мин", [minutes]);
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  return m ? t("{0} ч {1} мин", [h, m]) : t("{0} ч", [h]);
};
const stageStatusText = (status: StageStatus) => ({
  locked: t("Закрыт"), ready: t("Можно начинать"), awaiting_lead: t("Ждёт ведущего"), in_progress: t("В работе"), in_review: t("На приёмке"),
  changes_requested: t("Нужны правки"), approved: t("Принят"), stale: t("Устарел"), imported: t("Свои материалы"), skipped: t("Пропущен"), blocked: t("Заблокирован"),
})[status];
const paymentText = (status: string) => ({
  due: t("Ждёт оплаты владельцем"), checkout: t("Владелец оплачивает"), held: t("У BuildPath, будет выплачено"), paid: t("У BuildPath, будет выплачено"),
  paid_out: t("Выплачено"), paid_direct: t("Оплачено напрямую"), refunded: t("Возвращено владельцу"),
} as Record<string, string>)[status] ?? status;
const paymentTone = (status: string) => (status === "paid_out" || status === "paid_direct" ? "done" : status === "refunded" ? "closed" : status === "due" ? "attention" : "active");
const terms = (item: Assignment) => {
  if (item.terms.payKind === "fixed" && item.terms.fixedAmount !== null) return t("{0} за этап", [formatTenge(item.terms.fixedAmount)]);
  if (item.terms.payKind === "hourly" && item.terms.hourlyRate !== null) return t("{0} в час", [formatTenge(item.terms.hourlyRate)]) + (item.terms.hourLimit ? t(", до {0} ч", [item.terms.hourLimit]) : "");
  return t("без оплаты через BuildPath");
};

/** «Моя работа»: everything a specialist does on BuildPath in one place — stages, time, money, reviews. */
export default function WorkPage() {
  const [work, setWork] = useState<Work | null>(null);
  const [error, setError] = useState("");
  const [show, setShow] = useState<"active" | "completed">("active");

  useEffect(() => {
    api<Work>("/me/work").then(setWork).catch((caught) => {
      if (caught instanceof ApiError && caught.status === 401) { window.location.href = "/login?next=/work"; return; }
      setError(t("Не удалось загрузить вашу работу. Обновите страницу."));
    });
  }, []);

  const active = work?.assignments.filter((item) => item.status === "active") ?? [];
  const completed = work?.assignments.filter((item) => item.status === "completed") ?? [];
  const shown = show === "active" ? active : completed;
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - (6 - index));
    const next = new Date(day); next.setDate(next.getDate() + 1);
    const minutes = (work?.recentTime ?? []).filter((entry) => { const at = new Date(entry.startedAt); return at >= day && at < next; }).reduce((sum, entry) => sum + entry.minutes, 0);
    return { day, minutes };
  });
  const peak = Math.max(60, ...days.map((item) => item.minutes));

  return (
    <div className={styles.shell}>
      <AppHeader />
      <main className={`${styles.container} ${styles.wide}`}>
        <div className={styles.pageHead}>
          <div>
            <p className={styles.kicker}>{t("Специалист")}</p>
            <h1 className={styles.h1}>{t("Моя работа")}</h1>
          </div>
          <div className={styles.row}>
            <a className={styles.secondary} href="/account/specialist">{t("Профиль в каталоге")}</a>
          </div>
        </div>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!work && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}

        {work && (
          <>
            {work.setup.profile !== "published" && (
              <p className={`${styles.notice} ${work.setup.profile === "blocked" ? styles.error : styles.info}`}>
                {work.setup.profile === "blocked" ? t("Ваш профиль скрыт поддержкой после жалобы. Владельцы не находят вас в каталоге.")
                  : work.setup.profile === "draft" ? t("Профиль не опубликован — владельцы проектов не найдут вас в каталоге специалистов.")
                  : t("У вас нет профиля в каталоге. Пока вас приглашают только по ссылке — с профилем владельцы найдут вас сами.")}
                {" "}<a href="/account/specialist" className={styles.linkButton}>{work.setup.profile === "none" ? t("Создать профиль") : t("Открыть профиль")}</a>
              </p>
            )}

            <div className={`${styles.stats} ${styles.stats5}`}>
              <div className={styles.stat}><span>{t("Этапов в работе")}</span><b>{active.length}</b><small>{t("завершено: {0}", [completed.length])}</small></div>
              <div className={styles.stat}><span>{t("Время за 7 дней")}</span><b>{hours(work.totals.weekMinutes)}</b><small>{work.totals.pendingMinutes ? t("ждут подтверждения: {0}", [hours(work.totals.pendingMinutes)]) : t("всё подтверждено")}</small></div>
              <div className={styles.stat}><span>{t("Ждёт оплаты владельцем")}</span><b>{formatTenge(work.totals.awaitingOwner)}</b><small>{t("за принятую работу")}</small></div>
              <div className={styles.stat}><span>{t("У BuildPath")}</span><b>{formatTenge(work.totals.held)}</b><small>{work.feePercent ? t("после комиссии {0}%", [work.feePercent]) : t("будет выплачено")}</small></div>
              <div className={styles.stat}><span>{t("Выплачено")}</span><b>{formatTenge(work.totals.paidOut)}</b><small>{t("за 30 дней: {0}", [formatTenge(work.totals.paidOutLast30)])}</small></div>
            </div>

            <div className={styles.workGrid}>
              <div style={{ minWidth: 0 }}>
                <div className={styles.sectionHeader} style={{ marginTop: 0 }}>
                  <h2 className={styles.h2}>{t("Мои этапы")}</h2>
                  <div className={styles.segmented} role="group" aria-label={t("Показать")} style={{ marginLeft: "auto" }}>
                    <button type="button" aria-pressed={show === "active"} onClick={() => setShow("active")}>{t("В работе")} <span className={styles.num} style={{ opacity: .6 }}>{active.length}</span></button>
                    <button type="button" aria-pressed={show === "completed"} onClick={() => setShow("completed")}>{t("Завершённые")} <span className={styles.num} style={{ opacity: .6 }}>{completed.length}</span></button>
                  </div>
                </div>
                {shown.length === 0 ? (
                  <div className={styles.empty}>
                    {show === "active" ? <>{t("Сейчас вы не работаете ни над одним этапом.")} {work.setup.profile !== "published" ? t("Опубликуйте профиль, чтобы владельцы проектов могли вас пригласить.") : t("Приглашения придут на почту и во «Входящие».")}</> : t("Завершённых этапов за полгода нет.")}
                  </div>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>{t("Этап")}</th>
                          <th>{t("Статус")}</th>
                          <th className={styles.hideMobile}>{t("Условия")}</th>
                          <th className={styles.hideMobile} style={{ textAlign: "right" }}>{t("Время")}</th>
                          <th style={{ textAlign: "right" }}>{t("Заработано")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <a className={styles.tableLink} href={`/projects/${item.projectId}/stages/${item.stageKey}`}>{item.stageTitle}</a>
                              <span className={styles.cellSub}>{item.projectName} · {item.role === "lead" ? t("ведущий") : t("консультант")}</span>
                            </td>
                            <td>
                              <span className={`${styles.chip} ${styles[statusTone[item.stageStatus]]}`} style={{ marginTop: 0 }}>{stageStatusText(item.stageStatus)}</span>
                              {item.openDispute && <span className={styles.cellSub} style={{ color: "var(--danger)" }}>{t("открыт спор")}</span>}
                            </td>
                            <td className={`${styles.hideMobile} ${styles.small}`}>{terms(item)}</td>
                            <td className={`${styles.hideMobile} ${styles.num}`} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              {hours(item.time.trackedMinutes)}
                              {item.time.pendingMinutes > 0 && <span className={styles.cellSub}>{t("ждут: {0}", [hours(item.time.pendingMinutes)])}</span>}
                            </td>
                            <td className={styles.num} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              <b style={{ fontWeight: 600 }}>{formatTenge(item.earnedSoFar)}</b>
                              {item.planned > 0 && <span className={styles.cellSub}>{t("из {0}", [formatTenge(item.planned)])}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className={styles.sectionHeader}><h2 className={styles.h2}>{t("Начисления и выплаты")}</h2></div>
                {work.payments.length === 0 ? (
                  <div className={styles.empty}>{t("Начисления появятся, когда владелец примет ваш этап. Оплата идёт за принятую работу — заранее ничего не списывается.")}</div>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead><tr><th>{t("Дата")}</th><th>{t("Этап")}</th><th>{t("Статус")}</th><th style={{ textAlign: "right" }}>{t("Вам")}</th></tr></thead>
                      <tbody>
                        {work.payments.map((payment) => (
                          <tr key={payment.id}>
                            <td className={styles.small} style={{ whiteSpace: "nowrap" }}>{new Date(payment.paidOutAt ?? payment.createdAt).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" })}</td>
                            <td>{payment.stageTitle}<span className={styles.cellSub}>{payment.projectName}</span></td>
                            <td><span className={`${styles.chip} ${styles[paymentTone(payment.status)]}`} style={{ marginTop: 0 }}>{paymentText(payment.status)}</span></td>
                            <td className={styles.num} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              <b style={{ fontWeight: 600 }}>{formatTenge(payment.payout ?? payment.amount)}</b>
                              {payment.payout !== null && payment.payout !== payment.amount && <span className={styles.cellSub}>{t("из {0}", [formatTenge(payment.amount)])}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <aside className={styles.aside}>
                <section>
                  <h2 className={styles.h2}>{t("Время за неделю")}</h2>
                  <div className={styles.bars} role="img" aria-label={t("Часы по дням за последние 7 дней")}>
                    {days.map((item) => (
                      <div key={item.day.toISOString()} title={hours(item.minutes)}>
                        <span style={{ height: `${Math.round((item.minutes / peak) * 100)}%` }} />
                        <small>{item.day.toLocaleDateString(dateLocale(), { weekday: "short" })}</small>
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <h2 className={styles.h2}>{t("Выплаты")}</h2>
                  {!work.setup.payoutDetails && <p className={`${styles.notice} ${styles.warn}`} style={{ margin: "8px 0" }}>{t("Без счёта мы не сможем перевести деньги, которые владельцы оплатили через BuildPath.")}</p>}
                  <PayoutAccount />
                </section>
                <section>
                  <h2 className={styles.h2}>{t("Отзывы")}</h2>
                  {work.reviews.count === 0 ? <p className={styles.small} style={{ margin: 0 }}>{t("Отзывов пока нет. Владелец может оставить отзыв после приёмки этапа.")}</p> : (
                    <>
                      <p style={{ margin: "4px 0 10px" }}><b style={{ fontSize: 22, fontWeight: 650 }}>{work.reviews.average?.toLocaleString(dateLocale())}</b> <span className={styles.stars} aria-hidden="true">{"★".repeat(Math.round(work.reviews.average ?? 0))}</span> <span className={styles.small}>{t("отзывов: {0}", [work.reviews.count])}</span></p>
                      {work.reviews.latest.map((review) => (
                        <div key={review.id} className={styles.review}>
                          <span className={styles.stars} aria-label={t("Оценка {0} из 5", [review.rating])}>{"★".repeat(review.rating)}</span>
                          {review.text && <p>«{review.text}»</p>}
                          <span className={styles.cellSub}>{review.stageTitle} · {new Date(review.createdAt).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" })}</span>
                        </div>
                      ))}
                      <a className={styles.linkButton} href="/account/specialist">{t("Ответить на отзывы")}</a>
                    </>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
