"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_BASE_URL, ApiError, api } from "@/lib/api";
import { explainError, type Lead } from "@/lib/journey";
import styles from "../../journey.module.css";

const channelText: Record<string, string> = {
  sent: "отправлено", failed: "не удалось отправить", off: "выключено", not_linked: "не подключён", not_configured: "не настроено", pending: "отправляется",
};

function contactHref(contact: string): string | null {
  const digits = contact.replace(/[^\d+]/g, "");
  if (/^\+?\d{6,15}$/.test(digits)) return `tel:${digits}`;
  const telegram = contact.match(/^@([a-zA-Z][a-zA-Z0-9_]{4,31})$/);
  if (telegram) return `https://t.me/${telegram[1]}`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return `mailto:${contact}`;
  return null;
}

export default function LeadsPage() {
  const router = useRouter();
  const { projectId } = useParams<{ projectId: string }>();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (after?: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/leads${after ? `?cursor=${after}` : ""}`, { credentials: "include" });
      if (response.status === 401) { router.replace("/login"); return; }
      const payload = await response.json() as { data?: Lead[]; meta?: { nextCursor: string | null }; message?: string };
      if (!response.ok) throw new ApiError(response.status, payload.message ?? "REQUEST_FAILED");
      setLeads((current) => (after && current ? [...current, ...(payload.data ?? [])] : payload.data ?? []));
      setCursor(payload.meta?.nextCursor ?? null);
    } catch (caught) { setError(explainError(caught)); }
  }, [projectId, router]);

  useEffect(() => { void load(); }, [load]);

  async function remove(lead: Lead) {
    if (!window.confirm(`Удалить заявку от «${lead.name}»? Её нельзя будет восстановить.`)) return;
    try {
      await api(`/projects/${projectId}/leads/${lead.id}`, { method: "DELETE" });
      setLeads((current) => current?.filter((item) => item.id !== lead.id) ?? null);
    } catch (caught) { setError(explainError(caught)); }
  }

  return (
    <div className={styles.shell}>
      <header className={styles.top}><div className={styles.topInner}>
        <a className={styles.back} href={`/projects/${projectId}`}>← Проект</a>
        <span className={styles.topTitle}>Заявки</span>
      </div></header>
      <main className={styles.container}>
        <p className={styles.kicker}>С формы на сайте</p>
        <h1 className={styles.h1}>Заявки</h1>
        <p className={styles.small} style={{ margin: "0 0 16px" }}>Заявки хранятся 12 месяцев и затем удаляются автоматически. Если человек попросит удалить его данные — удалите заявку здесь.</p>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!leads && !error && <p className={styles.muted}>Загружаем…</p>}
        {leads && leads.length === 0 && (
          <div className={`${styles.notice} ${styles.info}`}>Заявок пока нет. Они появятся, когда посетители заполнят форму на опубликованном сайте.</div>
        )}
        {leads?.map((lead) => {
          const href = contactHref(lead.contact);
          return (
            <article key={lead.id} className={styles.card}>
              <div className={styles.row}>
                <strong style={{ fontSize: 17 }}>{lead.name}</strong>
                <div className={styles.spacer} />
                <span className={styles.small}>{new Date(lead.createdAt).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              <p style={{ margin: "6px 0" }}>{href ? <a href={href} style={{ color: "#255b42", fontWeight: 800 }}>{lead.contact}</a> : <strong>{lead.contact}</strong>}</p>
              {lead.message && <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{lead.message}</p>}
              <p className={styles.small} style={{ margin: "0 0 8px" }}>Telegram: {channelText[lead.telegramStatus] ?? lead.telegramStatus} · Email: {channelText[lead.emailStatus] ?? lead.emailStatus}</p>
              <div className={styles.row}>
                {href && <a className={styles.secondary} href={href}>{href.startsWith("tel:") ? "Позвонить" : "Написать"}</a>}
                <button className={styles.danger} onClick={() => void remove(lead)}>Удалить</button>
              </div>
            </article>
          );
        })}
        {cursor && <button className={`${styles.ghost} ${styles.block}`} onClick={() => void load(cursor)}>Показать ещё</button>}
      </main>
    </div>
  );
}
