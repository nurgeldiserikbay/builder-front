"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../journey.module.css";

type Monitoring = {
  status: "unknown" | "up" | "down"; checkedAt: string | null; downSince: string | null; lastMs: number | null; lastError: string | null;
  incidents: Array<{ startedAt: string; endedAt: string | null; cause: string }>; weeklyReport: boolean; canChange: boolean;
};

const causes: Record<string, string> = {
  TIMEOUT: t("не ответил за 10 секунд"), DNS: t("домен не находится — проверьте настройки DNS"), TLS: t("ошибка сертификата HTTPS"),
  REFUSED: t("сервер не принимает соединение"), NOT_PUBLIC: t("домен указывает не на BuildPath"),
};
const causeText = (cause: string | null) => (cause ? causes[cause] ?? (cause.startsWith("HTTP_") ? t("ответ с ошибкой {0}", [cause.slice(5)]) : t("ошибка соединения")) : "");
const when = (iso: string) => new Date(iso).toLocaleString(dateLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const minutesAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
const length = (from: string, to: string | null) => {
  const minutes = Math.max(1, Math.round(((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 60_000));
  return minutes >= 60 ? t("{0} ч {1} мин", [Math.floor(minutes / 60), minutes % 60]) : t("{0} мин", [minutes]);
};

/** After launch: does the site open, recent outages, and the Monday e-mail. */
export default function MonitoringCard({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Monitoring | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { api<Monitoring | null>(`/projects/${projectId}/monitoring`).then(setData).catch(() => undefined); }, [projectId]);
  if (!data) return null;

  async function toggle(next: boolean) {
    setBusy(true); setError("");
    try { setData(await api<Monitoring>(`/projects/${projectId}/monitoring`, { method: "POST", body: JSON.stringify({ weeklyReport: next }) })); }
    catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  return (
    <section className={styles.card} aria-labelledby="monitoring-title">
      <p className={styles.kicker}>{t("После запуска")}</p>
      <h2 id="monitoring-title" className={styles.h2}>{t("Работает ли сайт")}</h2>
      {data.status === "down" ? (
        <p className={`${styles.notice} ${styles.error}`} role="alert" style={{ marginBottom: 10 }}>
          {t("Сайт не открывается с {0}: {1}.", [data.downSince ? when(data.downSince) : "—", causeText(data.lastError)])}{" "}{t("Мы написали вам и сообщим, когда он снова заработает.")}
        </p>
      ) : data.status === "up" ? (
        <p style={{ margin: "0 0 10px" }}>
          <span className={`${styles.chip} ${styles.done}`}>{t("Открывается")}</span>{" "}
          <span className={styles.small}>{data.checkedAt ? t("проверено {0} мин назад", [minutesAgo(data.checkedAt)]) : ""}{data.lastMs !== null ? t(" · ответ за {0} мс", [data.lastMs]) : ""}</span>
        </p>
      ) : (
        <p className={styles.small} style={{ margin: "0 0 10px" }}>{t("Первая проверка пройдёт в ближайшие 10 минут.")}</p>
      )}
      <p className={styles.small} style={{ margin: "0 0 10px" }}>{t("Каждые 10 минут BuildPath открывает сайт так же, как посетитель. Если он не открывается две проверки подряд, мы сразу напишем вам в Telegram и на почту.")}</p>
      <details className={styles.details}>
        <summary>{t("Сбои за 30 дней: {0}", [data.incidents.length])}</summary>
        {data.incidents.length === 0 ? <p className={styles.small}>{t("Сбоев не было.")}</p> : (
          <ul className={styles.list}>
            {data.incidents.map((item) => <li key={item.startedAt}>{when(item.startedAt)} — {item.endedAt ? length(item.startedAt, item.endedAt) : t("продолжается")} · {causeText(item.cause)}</li>)}
          </ul>
        )}
      </details>
      <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, minHeight: 40 }}>
        <input type="checkbox" checked={data.weeklyReport} disabled={!data.canChange || busy} onChange={(event) => void toggle(event.target.checked)} />
        <span>{t("Присылать по понедельникам отчёт за неделю: посещения, заявки и сбои")}</span>
      </label>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    </section>
  );
}
