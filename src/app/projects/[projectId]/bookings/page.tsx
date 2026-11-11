"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../journey.module.css";
import { MastersPanel } from "./masters-panel";
import AppHeader from "../../../app-header";

type Booking = {
  id: string; serviceName: string; minutes: number; price: string | null; masterName: string; startsAt: string; endsAt: string; timezone: string;
  clientName: string; clientPhone: string; comment: string | null; status: "booked" | "cancelled_by_client" | "cancelled_by_owner" | "done" | "no_show"; telegramStatus: string; createdAt: string;
  reminderStatus: "pending" | "sending" | "sent" | "failed" | "skipped" | null; reminderAt: string | null;
};
type Data = { bookings: Booking[]; live: boolean; siteUrl: string | null; siteName: string; emailReminders: boolean };

const statusText: Record<Booking["status"], string> = {
  booked: t("записан"), cancelled_by_client: t("отменил клиент"), cancelled_by_owner: t("вы отменили"), done: t("пришёл"), no_show: t("не пришёл"),
};

/** Times are shown in the zone of the schedule, so the owner sees the same time as the client. */
const dayOf = (booking: Booking) => {
  const text = new Date(booking.startsAt).toLocaleDateString(dateLocale(), { timeZone: booking.timezone, weekday: "long", day: "numeric", month: "long" });
  return text.charAt(0).toUpperCase() + text.slice(1);
};
/** WhatsApp wants the number in international form without «+»; Kazakh numbers written from 8 become 7. */
function whatsappNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

function reminderText(booking: Booking, siteName: string): string {
  const day = new Date(booking.startsAt).toLocaleDateString(dateLocale(), { timeZone: booking.timezone, weekday: "long", day: "numeric", month: "long" });
  return t("Здравствуйте, {0}! Напоминаем о записи в «{1}»: {2}, {3} в {4}. Мастер: {5}. Если планы изменились, напишите нам, пожалуйста.", [booking.clientName, siteName, booking.serviceName, day, clock(booking.startsAt, booking.timezone), booking.masterName]);
}

const reminderLabel = (booking: Booking): string | null => {
  if (booking.reminderStatus === "pending" && booking.reminderAt) return t("Напоминание на почту: {0}", [new Date(booking.reminderAt).toLocaleString(dateLocale(), { timeZone: booking.timezone, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })]);
  if (booking.reminderStatus === "sent") return t("Напоминание на почту отправлено");
  if (booking.reminderStatus === "failed") return t("Напоминание на почту не отправилось — напомните сами");
  return null;
};

const clock = (value: string, timeZone: string) => new Date(value).toLocaleTimeString(dateLocale(), { timeZone, hour: "2-digit", minute: "2-digit" });

export default function BookingsPage() {
  const router = useRouter();
  const { projectId } = useParams<{ projectId: string }>();
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try { setData(await api<Data>(`/projects/${projectId}/bookings?scope=${scope}`)); }
    catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
      setError(explainError(caught));
    }
  }, [projectId, scope, router]);
  useEffect(() => { setData(null); void load(); }, [load]);

  async function mark(booking: Booking, status: "cancelled_by_owner" | "done" | "no_show") {
    if (status === "cancelled_by_owner" && !window.confirm(t("Отменить запись {0}? Время снова станет свободным. Клиенту сообщите сами — позвоните по номеру {1}.", [booking.clientName, booking.clientPhone]))) return;
    setBusy(booking.id); setError("");
    try { await api(`/projects/${projectId}/bookings/${booking.id}/status`, { method: "POST", body: JSON.stringify({ status }) }); await load(); }
    catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }

  const groups = new Map<string, Booking[]>();
  for (const booking of data?.bookings ?? []) groups.set(dayOf(booking), [...(groups.get(dayOf(booking)) ?? []), booking]);
  const now = Date.now();

  return (
    <div className={styles.shell}>
      <AppHeader back={{ href: `/projects/${projectId}`, label: t("← Проект") }} title={t("Записи")} />
      <main className={styles.container}>
        <p className={styles.kicker}>{t("Онлайн-запись")}</p>
        <h1 className={styles.h1}>{t("Записи клиентов")}</h1>
        <p className={styles.small} style={{ margin: "0 0 12px" }}>
          {t("Новые записи и отмены приходят вам в Telegram. Если отменяете запись здесь, позвоните клиенту — сам он сообщения не получит.")}
          {data && (data.emailReminders
            ? t(" Клиенты, которые оставили почту, получат напоминание перед визитом (обычно за сутки). Остальным можно напомнить в WhatsApp кнопкой у записи.")
            : t(" Напомнить клиенту о визите можно в WhatsApp кнопкой у записи — текст подставится сам."))}
          {data?.siteUrl && <> <a href={`${data.siteUrl}/book`} target="_blank" rel="noopener">{t("Открыть запись на сайте →")}</a></>}
        </p>
        <div className={styles.viewToggle} role="group" aria-label={t("Какие записи")}>
          <button type="button" aria-pressed={scope === "upcoming"} onClick={() => setScope("upcoming")}>{t("Предстоящие")}</button>
          <button type="button" aria-pressed={scope === "past"} onClick={() => setScope("past")}>{t("Прошедшие")}</button>
        </div>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!data && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}
        {data && !data.live && <div className={`${styles.notice} ${styles.info}`}>{t("Сайт не опубликован, поэтому новых записей не будет. Опубликуйте его на странице проекта.")}</div>}
        {data && data.bookings.length === 0 && <div className={`${styles.notice} ${styles.info}`}>{scope === "upcoming" ? t("Предстоящих записей нет.") : t("Прошедших записей нет.")}</div>}
        {[...groups.entries()].map(([day, items]) => (
          <section key={day} aria-label={day}>
            <h2 className={styles.cardTitle} style={{ margin: "18px 0 8px" }}>{day}</h2>
            {items.map((booking) => {
              const active = booking.status === "booked";
              const started = new Date(booking.startsAt).getTime() <= now;
              return (
                <article key={booking.id} className={styles.card} style={{ opacity: booking.status.startsWith("cancelled") ? 0.6 : 1 }}>
                  <div className={styles.row}>
                    <strong style={{ fontSize: 18 }}>{clock(booking.startsAt, booking.timezone)}–{clock(booking.endsAt, booking.timezone)}</strong>
                    <div className={styles.spacer} />
                    <span className={styles.small}>{statusText[booking.status]}</span>
                  </div>
                  <p style={{ margin: "6px 0 2px" }}><strong>{booking.serviceName}</strong>{booking.price ? ` · ${booking.price}` : ""}</p>
                  <p className={styles.small} style={{ margin: 0 }}>{t("Мастер:")}{" "}{booking.masterName}</p>
                  <p style={{ margin: "6px 0" }}>{booking.clientName} · <a href={`tel:${booking.clientPhone.replace(/[^\d+]/g, "")}`} style={{ color: "var(--brand-ink)", fontWeight: 700 }}>{booking.clientPhone}</a></p>
                  {booking.comment && <p className={styles.small} style={{ margin: "0 0 6px", whiteSpace: "pre-wrap" }}>«{booking.comment}»</p>}
                  {active && !started && reminderLabel(booking) && <p className={styles.small} style={{ margin: "0 0 6px" }}>{reminderLabel(booking)}</p>}
                  <div className={styles.row} style={{ flexWrap: "wrap" }}>
                    <a className={styles.secondary} href={`tel:${booking.clientPhone.replace(/[^\d+]/g, "")}`}>{t("Позвонить")}</a>
                    {active && !started && whatsappNumber(booking.clientPhone) && data && (
                      <a className={styles.secondary} href={`https://wa.me/${whatsappNumber(booking.clientPhone)}?text=${encodeURIComponent(reminderText(booking, data.siteName))}`} target="_blank" rel="noopener">{t("Напомнить в WhatsApp")}</a>
                    )}
                    {active && !started && <button className={styles.danger} disabled={Boolean(busy)} onClick={() => void mark(booking, "cancelled_by_owner")}>{t("Отменить")}</button>}
                    {started && ["booked", "done", "no_show"].includes(booking.status) && (
                      <>
                        <button className={styles.ghost} aria-pressed={booking.status === "done"} disabled={Boolean(busy)} onClick={() => void mark(booking, "done")}>{t("Пришёл")}</button>
                        <button className={styles.ghost} aria-pressed={booking.status === "no_show"} disabled={Boolean(busy)} onClick={() => void mark(booking, "no_show")}>{t("Не пришёл")}</button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        ))}
        <MastersPanel projectId={projectId} />
      </main>
    </div>
  );
}
