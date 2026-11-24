"use client";

import { useCallback, useEffect, useState } from "react";
import AppHeader from "../app-header";
import styles from "../projects/journey.module.css";
import { api, ApiError } from "@/lib/api";
import { t, dateLocale } from "@/lib/i18n";
import { activityLine, dayHeading, dueText, inboxLine, inboxQuote, type Inbox, type InboxKind, type UpdateEvent } from "@/lib/inbox";
import { useStageTitles } from "@/lib/use-catalog";

const kindTone: Record<InboxKind, string> = {
  dispute: "alert", change_notice: "attention", stage_review: "active", stage_changes: "attention", change_proposal: "active", time_entries: "active", mention: "closed", request_responses: "done",
};
const kindLabel = (kind: InboxKind) => ({
  stage_review: t("Приёмка"), stage_changes: t("Доработка"), change_notice: t("Изменение"), change_proposal: t("Предложение"),
  time_entries: t("Часы"), dispute: t("Спор"), mention: t("Упоминание"), request_responses: t("Отклики"),
})[kind];

const time = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });
function since(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return t("ждёт {0} мин", [Math.max(1, minutes)]);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("ждёт {0} ч", [hours]);
  return t("ждёт {0} дн.", [Math.round(hours / 24)]);
}
const initials = (name: string | null) => (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";

export default function InboxPage() {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"waiting" | "updates">("waiting");
  const stageTitle = useStageTitles();

  const load = useCallback(async () => {
    try {
      setInbox(await api<Inbox>("/me/inbox"));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { window.location.href = "/login?next=/inbox"; return; }
      setError(t("Не удалось загрузить входящие. Обновите страницу."));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (window.location.hash === "#updates") setTab("updates"); }, []);

  // Opening the updates marks them as seen; the markers stay on screen until the next visit.
  useEffect(() => {
    if (tab !== "updates" || !inbox?.unreadUpdates) return;
    const timer = window.setTimeout(() => { void api("/me/inbox/seen", { method: "POST" }).catch(() => undefined); }, 1200);
    return () => window.clearTimeout(timer);
  }, [tab, inbox?.unreadUpdates]);

  const days = new Map<string, UpdateEvent[]>();
  for (const event of inbox?.updates ?? []) {
    const key = new Date(event.createdAt).toDateString();
    days.set(key, [...(days.get(key) ?? []), event]);
  }

  return (
    <div className={styles.shell}>
      <AppHeader />
      <main className={`${styles.container} ${styles.wide}`}>
        <div className={styles.pageHead}>
          <div>
            <p className={styles.kicker}>{t("Все проекты")}</p>
            <h1 className={styles.h1}>{t("Входящие")}</h1>
          </div>
        </div>
        <p className={styles.lead} style={{ marginTop: -8 }}>{t("Здесь всё, что ждёт именно вас: приёмка этапов, изменения, часы специалистов, споры и упоминания. Пункт исчезает, когда вопрос решён.")}</p>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}

        <div className={styles.tabs} role="tablist" style={{ position: "static", padding: 0, background: "transparent", marginBottom: 16 }}>
          <button role="tab" type="button" className={styles.tab} aria-selected={tab === "waiting"} onClick={() => setTab("waiting")}>
            {t("Ждут меня")} {inbox && <span className={`${styles.count} ${inbox.waiting.length ? "" : styles.zero}`} style={{ marginLeft: 6 }}>{inbox.waiting.length}</span>}
          </button>
          <button role="tab" type="button" className={styles.tab} aria-selected={tab === "updates"} onClick={() => { setTab("updates"); history.replaceState(null, "", "#updates"); }}>
            {t("Обновления")} {inbox && inbox.unreadUpdates > 0 && <span className={`${styles.count} ${styles.countNew}`} style={{ marginLeft: 6 }}>{inbox.unreadUpdates}</span>}
          </button>
        </div>

        {!inbox && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}

        {inbox && tab === "waiting" && (inbox.waiting.length === 0 ? (
          <div className={styles.empty}>
            <b style={{ color: "var(--ink)", display: "block", marginBottom: 4 }}>{t("Ничего не ждёт вашего решения")}</b>
            {t("Когда этап придёт на приёмку, специалист отправит часы или изменится связанный этап — это появится здесь.")}
          </div>
        ) : (
          <ul className={styles.inboxList}>
            {inbox.waiting.map((item) => {
              const line = inboxLine(item, stageTitle);
              const quote = inboxQuote(item);
              const due = item.dueAt ? dueText(item.dueAt) : null;
              return (
                <li key={item.id}>
                  <a href={line.href} className={styles.inboxRow}>
                    <span className={`${styles.chip} ${styles[kindTone[item.kind]] ?? ""}`} style={{ marginTop: 0 }}>{kindLabel(item.kind)}</span>
                    <span className={styles.inboxMain}>
                      <b>{line.title}</b>
                      {quote && <span className={styles.inboxQuote}>«{quote}»</span>}
                      <span className={styles.cellSub}>{item.projectName}{item.who ? ` · ${item.who}` : ""} · {since(item.since)}</span>
                    </span>
                    {due && <span className={`${styles.due} ${due.overdue ? styles.overdue : ""}`}>{due.text}</span>}
                    <span className={styles.secondary} style={{ minHeight: 32, pointerEvents: "none" }}>{line.action}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        ))}

        {inbox && tab === "updates" && (inbox.updates.length === 0 ? (
          <div className={styles.empty}>{t("За последние две недели другие участники ничего не меняли в ваших проектах.")}</div>
        ) : (
          [...days.entries()].map(([key, events]) => (
            <section key={key} style={{ marginBottom: 18 }}>
              <h2 className={styles.dayHeading}>{dayHeading(events[0]!.createdAt, dateLocale())}</h2>
              <ul className={styles.feed}>
                {events.map((event) => (
                  <li key={event.id} className={event.unread ? styles.unread : undefined}>
                    <span className={styles.avatar} aria-hidden="true">{initials(event.actor?.name ?? null)}</span>
                    <span className={styles.feedMain}>
                      <span>{activityLine(event, (key) => stageTitle(event.projectType, key))}</span>
                      <span className={styles.cellSub}>
                        <a href={`/projects/${event.projectId}`} className={styles.tableLink} style={{ fontWeight: 500 }}>{event.projectName}</a>
                        {" · "}{event.actor ? event.actor.name ?? t("Участник проекта") : t("Система")}{" · "}{time(event.createdAt)}
                      </span>
                    </span>
                    {event.unread && <span className={styles.unreadDot} aria-label={t("новое")} />}
                  </li>
                ))}
              </ul>
            </section>
          ))
        ))}
      </main>
    </div>
  );
}
