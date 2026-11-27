"use client";

import { t } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../journey.module.css";

type Group = {
  configured: boolean; botUsername: string | null; canManage: boolean;
  group: { title: string | null; linkedAt: string; lastSentAt: string | null; lastFailedAt: string | null } | null;
  waiting: { expiresAt: string } | null;
  events: Array<{ type: string; title: string }>;
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** The project's Telegram group: key events of the stages as short lines for the whole team. */
export default function TelegramGroupCard({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Group | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => api<Group>(`/projects/${projectId}/telegram-group`).then(setData).catch(() => setData(null)), [projectId]);
  useEffect(() => { void load(); }, [load]);

  async function connect() {
    setBusy(true); setError("");
    try {
      const result = await api<{ deepLink: string }>(`/projects/${projectId}/telegram-group/link`, { method: "POST" });
      setLink(result.deepLink);
      window.open(result.deepLink, "_blank", "noopener");
      await load();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }
  async function disconnect() {
    if (!window.confirm(t("Отключить группу? Бот напишет в ней, что сообщений о проекте больше не будет."))) return;
    setBusy(true); setError("");
    try { setData(await api<Group>(`/projects/${projectId}/telegram-group/unlink`, { method: "POST" })); setLink(null); } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  if (!data) return null;
  return (
    <section className={styles.card} aria-labelledby="telegram-group-title">
      <h2 id="telegram-group-title" className={styles.cardTitle}>{t("Группа в Telegram")}</h2>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Бот пишет в общий чат команды, что происходит с этапами. В сообщениях только название проекта и этапа и кнопка «Открыть в BuildPath» — без текстов, контактов и денег: в группе могут быть люди не из проекта.")}</p>
      {!data.configured && <p className={`${styles.notice} ${styles.info}`}>{t("Бот Telegram на этом сервере не настроен.")}</p>}
      {data.group ? (
        <>
          <p style={{ margin: "8px 0 4px" }}><b>{data.group.title ?? t("Группа")}</b> · {t("подключена {0}", [when(data.group.linkedAt)])}</p>
          {data.group.lastFailedAt && (!data.group.lastSentAt || data.group.lastFailedAt > data.group.lastSentAt) && (
            <p className={`${styles.notice} ${styles.warn}`}>{t("Последнее сообщение в группу не дошло ({0}). Проверьте, что бот всё ещё в группе и может писать.", [when(data.group.lastFailedAt)])}</p>
          )}
        </>
      ) : data.configured && (
        <p className={styles.small}>{data.waiting ? t("Ждём, когда бота добавят в группу: ссылка действует до {0}.", [when(data.waiting.expiresAt)]) : t("Группа не подключена.")}</p>
      )}
      <details style={{ margin: "6px 0" }}>
        <summary className={styles.small}>{t("Что приходит в группу")}</summary>
        <ul className={styles.list}>{data.events.map((event) => <li key={event.type}>{event.title}</li>)}</ul>
      </details>
      {link && !data.group && (
        <div className={`${styles.notice} ${styles.info}`}>
          {t("Telegram откроет выбор группы: выберите чат команды и добавьте бота. Если окно не открылось, откройте ссылку на телефоне с Telegram:")}
          <input className={styles.input} readOnly value={link} style={{ marginTop: 8 }} onFocus={(event) => event.target.select()} aria-label={t("Ссылка для группы")} />
          <button type="button" className={styles.ghost} style={{ marginTop: 6 }} onClick={() => void load()}>{t("Я добавил бота — обновить")}</button>
        </div>
      )}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {data.canManage && data.configured && (
        <div className={styles.row} style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {data.group
            ? <button type="button" className={styles.ghost} disabled={busy} onClick={() => void disconnect()}>{t("Отключить группу")}</button>
            : <button type="button" className={styles.secondary} disabled={busy} onClick={() => void connect()}>{busy ? t("Готовим ссылку…") : t("Подключить группу")}</button>}
        </div>
      )}
      {!data.canManage && !data.group && <p className={styles.small}>{t("Подключить группу может владелец или администратор проекта.")}</p>}
    </section>
  );
}
