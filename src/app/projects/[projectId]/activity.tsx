"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "../journey.module.css";
import { apiPage } from "@/lib/api";
import { t, dateLocale } from "@/lib/i18n";
import { activityKindLabel, activityLine, dayHeading, type ActivityEvent, type ActivityKind } from "@/lib/inbox";

const kinds: Array<ActivityKind | "all"> = ["all", "stage", "ai", "changes", "team", "money", "site"];
const initials = (name: string | null) => (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";

/** «Журнал»: who did what in the project and when — stages, AI, changes, team, money, site. */
export default function ActivityLog({ projectId, stages }: { projectId: string; stages: Array<{ key: string; title: string }> }) {
  const [kind, setKind] = useState<ActivityKind | "all">("all");
  const [stageKey, setStageKey] = useState("");
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const query = useCallback((cursor: string | null) => {
    const params = new URLSearchParams({ limit: "50" });
    if (kind !== "all") params.set("kind", kind);
    if (stageKey) params.set("stageKey", stageKey);
    if (cursor) params.set("cursor", cursor);
    return `/projects/${projectId}/activity?${params}`;
  }, [projectId, kind, stageKey]);

  useEffect(() => {
    let alive = true;
    setEvents(null); setError("");
    fetchPage(query(null)).then((page) => { if (alive) { setEvents(page.data); setNext(page.nextCursor); } }).catch(() => { if (alive) setError(t("Не удалось загрузить журнал.")); });
    return () => { alive = false; };
  }, [query]);

  async function more() {
    if (!next) return;
    setBusy(true);
    try { const page = await fetchPage(query(next)); setEvents((current) => [...(current ?? []), ...page.data]); setNext(page.nextCursor); }
    catch { setError(t("Не удалось загрузить журнал.")); }
    finally { setBusy(false); }
  }

  const title = (key: string | null) => stages.find((stage) => stage.key === key)?.title ?? key ?? "";
  const days = new Map<string, ActivityEvent[]>();
  for (const event of events ?? []) {
    const key = new Date(event.createdAt).toDateString();
    days.set(key, [...(days.get(key) ?? []), event]);
  }

  return (
    <section aria-labelledby="activity-title">
      <h2 id="activity-title" className={styles.srOnly}>{t("Журнал")}</h2>
      <div className={styles.toolbar}>
        <div className={styles.segmented} role="group" aria-label={t("Что показать")}>
          {kinds.map((item) => <button key={item} type="button" aria-pressed={kind === item} onClick={() => setKind(item)}>{activityKindLabel(item)}</button>)}
        </div>
        <select className={styles.input} style={{ width: "auto", minHeight: 30, padding: "2px 8px", fontSize: 13.5 }} value={stageKey} onChange={(event) => setStageKey(event.target.value)} aria-label={t("Этап")}>
          <option value="">{t("Все этапы")}</option>
          {stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.title}</option>)}
        </select>
      </div>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {!events && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}
      {events && events.length === 0 && <div className={styles.empty}>{t("Здесь пока нет событий.")}</div>}
      {[...days.entries()].map(([key, list]) => (
        <div key={key} style={{ marginBottom: 16 }}>
          <h3 className={styles.dayHeading}>{dayHeading(list[0]!.createdAt, dateLocale())}</h3>
          <ul className={styles.feed}>
            {list.map((event) => (
              <li key={event.id}>
                <span className={styles.avatar} aria-hidden="true">{event.actor?.isMe ? t("Вы").slice(0, 2) : initials(event.actor?.name ?? null)}</span>
                <span className={styles.feedMain}>
                  <span>{activityLine(event, title)}</span>
                  <span className={styles.cellSub}>
                    {event.actor ? (event.actor.isMe ? t("Вы") : event.actor.name ?? t("Участник проекта")) : t("Система")}
                    {" · "}{new Date(event.createdAt).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
                <span className={styles.feedKind}>{activityKindLabel(event.kind)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {next && <button type="button" className={styles.secondary} onClick={() => void more()} disabled={busy}>{busy ? t("Загружаем…") : t("Показать раньше")}</button>}
    </section>
  );
}

async function fetchPage(path: string): Promise<{ data: ActivityEvent[]; nextCursor: string | null }> {
  const page = await apiPage<ActivityEvent[]>(path);
  return { data: page.data ?? [], nextCursor: page.meta.nextCursor };
}
