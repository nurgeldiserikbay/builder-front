"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import styles from "../journey.module.css";

type Insights = {
  published: boolean; url: string | null; days: number; views: number; previousViews: number; change: number | null;
  daily: Array<{ day: string; views: number }>;
  pages: Array<{ name: string; views: number }>; sources: Array<{ name: string; views: number }>;
  actions: { leads: number; bookings: number; orders: number; perHundredViews: number | null };
};

const sourceName = (name: string) => (name === "direct" ? t("Напрямую или из закладок") : name === "other" ? t("Другие") : name);
const pageName = (name: string) => (name === "/" ? t("Главная") : name === "other" ? t("Другие страницы") : name);

/** After launch: how many times the site was opened, which pages, from where, and what visitors did. Counts only. */
export default function InsightsCard({ projectId }: { projectId: string }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Insights | null>(null);
  useEffect(() => { api<Insights>(`/projects/${projectId}/insights?days=${days}`).then(setData).catch(() => undefined); }, [projectId, days]);
  if (!data || !data.published) return null;

  const max = Math.max(1, ...data.daily.map((row) => row.views));
  const actions = data.actions.leads + data.actions.bookings + data.actions.orders;
  return (
    <section className={styles.card} aria-labelledby="insights-title">
      <p className={styles.kicker}>{t("После запуска")}</p>
      <h2 id="insights-title" className={styles.h2}>{t("Посещения сайта")}</h2>
      <div className={styles.chips} role="group" aria-label={t("Период")} style={{ margin: "0 0 12px" }}>
        {[7, 30, 90].map((value) => (
          <button key={value} type="button" className={styles.choice} style={{ width: "auto" }} aria-pressed={days === value} onClick={() => setDays(value)}>{t("{0} дн.", [value])}</button>
        ))}
      </div>
      <p style={{ margin: "0 0 4px", fontSize: 18 }}>
        <strong>{data.views.toLocaleString(dateLocale())}</strong>{" "}{t("просмотров страниц")}
        {data.change !== null && <span className={styles.small} style={{ marginLeft: 8, color: data.change >= 0 ? "var(--brand-ink)" : "#7a1f1f" }}>{data.change >= 0 ? "▲" : "▼"} {Math.abs(data.change)}% {t("к прошлому периоду")}</span>}
      </p>
      <div aria-hidden="true" style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 64, margin: "8px 0 4px" }}>
        {data.daily.map((row) => <span key={row.day} title={`${new Date(`${row.day}T00:00:00`).toLocaleDateString(dateLocale())}: ${row.views}`} style={{ flex: 1, minWidth: 2, height: `${Math.max(row.views ? 6 : 2, Math.round((row.views / max) * 64))}px`, background: row.views ? "var(--brand)" : "var(--line)", borderRadius: 2 }} />)}
      </div>
      {data.views === 0 && <p className={styles.small} style={{ margin: "6px 0 0" }}>{t("Пока никто не открывал сайт за этот период. Поделитесь ссылкой в соцсетях и мессенджерах — посещения появятся здесь.")}</p>}
      {data.views > 0 && (
        <div className={styles.row} style={{ alignItems: "flex-start", gap: 24, marginTop: 10 }}>
          <div style={{ flex: "1 1 200px" }}>
            <p className={styles.label} style={{ margin: "0 0 4px" }}>{t("Страницы")}</p>
            <ul className={styles.list} style={{ marginTop: 0 }}>{data.pages.map((row) => <li key={row.name}>{pageName(row.name)} — {row.views}</li>)}</ul>
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <p className={styles.label} style={{ margin: "0 0 4px" }}>{t("Откуда пришли")}</p>
            <ul className={styles.list} style={{ marginTop: 0 }}>{data.sources.map((row) => <li key={row.name}>{sourceName(row.name)} — {row.views}</li>)}</ul>
          </div>
        </div>
      )}
      <p style={{ margin: "10px 0 0" }}>
        {t("Заявок:")}{" "}<strong>{data.actions.leads}</strong>
        {data.actions.bookings > 0 && <>{" · "}{t("записей:")}{" "}<strong>{data.actions.bookings}</strong></>}
        {data.actions.orders > 0 && <>{" · "}{t("заказов:")}{" "}<strong>{data.actions.orders}</strong></>}
        {actions > 0 && data.actions.perHundredViews !== null && <span className={styles.small}>{" · "}{t("{0} на 100 просмотров", [data.actions.perHundredViews])}</span>}
      </p>
      <p className={styles.small} style={{ margin: "10px 0 0" }}>{t("Считаем просмотры страниц без cookies и без данных о посетителях: одного человека, открывшего сайт дважды, видно как два просмотра. Роботы поисковиков и предпросмотр ссылок в мессенджерах не считаются.")}</p>
    </section>
  );
}
