"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../projects/journey.module.css";

type Booking = {
  id: string; serviceName: string; minutes: number; price: string | null; startsAt: string; endsAt: string; timezone: string;
  clientName: string; clientPhone: string; comment: string | null; status: "booked" | "cancelled_by_client" | "cancelled_by_owner" | "done" | "no_show";
};
type Place = { accessId: string; projectId: string; placeName: string; masterName: string | null; archived: boolean; bookings: Booking[] };
type Telegram = { configured: boolean; linked: boolean; username: string | null };

const statusText: Record<Booking["status"], string> = { booked: "записан", cancelled_by_client: "отменил клиент", cancelled_by_owner: "отменено", done: "пришёл", no_show: "не пришёл" };
const dayOf = (booking: Booking) => {
  const text = new Date(booking.startsAt).toLocaleDateString("ru-RU", { timeZone: booking.timezone, weekday: "long", day: "numeric", month: "long" });
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const clock = (value: string, timeZone: string) => new Date(value).toLocaleTimeString("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" });

/** A master's own bookings in every place that invited them. */
export default function MasterPage() {
  const router = useRouter();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [telegram, setTelegram] = useState<Telegram | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const [mine, tg] = await Promise.all([api<{ places: Place[] }>("/me/master-bookings"), api<Telegram>("/me/telegram").catch(() => null)]);
      setPlaces(mine.places); setTelegram(tg);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent("/master")}`); return; }
      setError(explainError(caught));
    }
  }, [router]);
  useEffect(() => { void load(); }, [load]);

  async function mark(booking: Booking, status: "done" | "no_show") {
    setBusy(booking.id); setError("");
    try { setPlaces((await api<{ places: Place[] }>(`/me/master-bookings/${booking.id}/status`, { method: "POST", body: JSON.stringify({ status }) })).places); }
    catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }

  const now = Date.now();
  return (
    <div className={styles.shell}>
      <header className={styles.top}><div className={styles.topInner}><a className={styles.brand} href="/projects"><span aria-hidden="true">B</span>BuildPath</a></div></header>
      <main className={styles.container}>
        <p className={styles.kicker}>Для мастера</p>
        <h1 className={styles.h1}>Мои записи</h1>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!places && !error && <p className={styles.muted}>Загружаем…</p>}
        {telegram?.configured && !telegram.linked && (
          <div className={`${styles.notice} ${styles.info}`}>
            Новые записи и отмены можно получать в Telegram. Сейчас они приходят на почту.
            <div className={styles.row} style={{ marginTop: 8 }}>
              <button className={styles.secondary} onClick={async () => { const link = await api<{ deepLink: string }>("/me/telegram/link", { method: "POST" }); setWaiting(true); window.open(link.deepLink, "_blank", "noopener"); }}>Подключить Telegram</button>
              {waiting && <button className={styles.ghost} onClick={() => void load().then(() => setWaiting(false))}>Я нажал(а) Start</button>}
            </div>
          </div>
        )}
        {places && places.length === 0 && <div className={`${styles.notice} ${styles.info}`}>Вас пока не пригласили как мастера. Владелец салона может сделать это на странице записей.</div>}
        {places?.map((place) => {
          const groups = new Map<string, Booking[]>();
          for (const booking of place.bookings) groups.set(dayOf(booking), [...(groups.get(dayOf(booking)) ?? []), booking]);
          return (
            <section key={place.accessId} aria-label={place.placeName}>
              <h2 className={styles.h2} style={{ marginTop: 18 }}>{place.placeName}</h2>
              <p className={styles.small} style={{ margin: "0 0 8px" }}>{place.masterName ? `Вы — мастер «${place.masterName}». ` : ""}Записи на 30 дней вперёд. Отменить запись может владелец — позвоните ему, если нужно.</p>
              {place.bookings.length === 0 && <div className={`${styles.notice} ${styles.info}`}>Записей пока нет.</div>}
              {[...groups.entries()].map(([day, items]) => (
                <div key={day}>
                  <h3 className={styles.cardTitle} style={{ margin: "14px 0 8px" }}>{day}</h3>
                  {items.map((booking) => {
                    const started = new Date(booking.startsAt).getTime() <= now;
                    const phone = booking.clientPhone.replace(/[^\d+]/g, "");
                    return (
                      <article key={booking.id} className={styles.card} style={{ opacity: booking.status.startsWith("cancelled") ? 0.6 : 1 }}>
                        <div className={styles.row}>
                          <strong style={{ fontSize: 18 }}>{clock(booking.startsAt, booking.timezone)}–{clock(booking.endsAt, booking.timezone)}</strong>
                          <div className={styles.spacer} />
                          <span className={styles.small}>{statusText[booking.status]}</span>
                        </div>
                        <p style={{ margin: "6px 0 2px" }}><strong>{booking.serviceName}</strong>{booking.price ? ` · ${booking.price}` : ""}</p>
                        <p style={{ margin: "6px 0" }}>{booking.clientName} · <a href={`tel:${phone}`} style={{ color: "#255b42", fontWeight: 800 }}>{booking.clientPhone}</a></p>
                        {booking.comment && <p className={styles.small} style={{ margin: "0 0 6px", whiteSpace: "pre-wrap" }}>«{booking.comment}»</p>}
                        {started && ["booked", "done", "no_show"].includes(booking.status) && (
                          <div className={styles.row} style={{ flexWrap: "wrap" }}>
                            <button className={styles.ghost} aria-pressed={booking.status === "done"} disabled={Boolean(busy)} onClick={() => void mark(booking, "done")}>Пришёл</button>
                            <button className={styles.ghost} aria-pressed={booking.status === "no_show"} disabled={Boolean(busy)} onClick={() => void mark(booking, "no_show")}>Не пришёл</button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ))}
            </section>
          );
        })}
      </main>
    </div>
  );
}
