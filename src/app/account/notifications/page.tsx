"use client";

import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../projects/journey.module.css";
import AppHeader from "../../app-header";

type Channels = { telegram: boolean; email: boolean };
type Category = "stages" | "team" | "money" | "site";
type Settings = { prefs: Record<Category, Channels>; telegramLinked: boolean; email: string };

const categories: Array<{ key: Category; title: string; text: string }> = [
  { key: "stages", title: t("Этапы"), text: t("Этап готов к проверке, возвращён на доработку, принят; изменения в соседних этапах") },
  { key: "team", title: t("Команда и заявки"), text: t("Приглашения, отклики на заявки, назначения специалистов, передача проекта") },
  { key: "money", title: t("Деньги"), text: t("Оплата работы, споры и их решения") },
  { key: "site", title: t("Работа сайта"), text: t("Сайт перестал открываться, снова работает, истекает сертификат") },
];

export default function NotificationsPage() {
  const router = useRouter();
  const [data, setData] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<Settings>("/me/notifications").then(setData).catch((caught) => {
      if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent("/account/notifications")}`); return; }
      setError(explainError(caught));
    });
  }, [router]);

  /** Each switch saves at once; on failure it flips back and says why. */
  async function toggle(category: Category, channel: keyof Channels) {
    if (!data) return;
    const before = data;
    const next = { ...data.prefs[category], [channel]: !data.prefs[category][channel] };
    setData({ ...data, prefs: { ...data.prefs, [category]: next } });
    setSaving(`${category}.${channel}`);
    setError("");
    setSaved(false);
    try {
      setData(await api<Settings>("/me/notifications", { method: "PUT", body: JSON.stringify({ [category]: next }) }));
      setSaved(true);
    } catch (caught) {
      setData(before);
      setError(explainError(caught));
    } finally { setSaving(null); }
  }

  const box = (category: Category, channel: keyof Channels, label: string) => data && <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", minHeight: 40 }}>
    <input type="checkbox" checked={data.prefs[category][channel]} disabled={saving === `${category}.${channel}`} onChange={() => void toggle(category, channel)} style={{ width: 20, height: 20, accentColor: "var(--ink)" }} />
    <span className={styles.srOnly}>{label}</span>
  </label>;

  return (
    <div className={styles.shell}>
      <AppHeader back={{ href: "/account", label: t("← Аккаунт") }} title={t("Уведомления")} />
      <main className={styles.container}>
        <div className={styles.pageHead}>
          <div>
            <p className={styles.kicker}>{t("Аккаунт")}</p>
            <h1 className={styles.h1}>{t("Уведомления")}</h1>
            <p className={styles.small} style={{ margin: "6px 0 0" }}>{t("Выберите, о чём писать в Telegram и на почту. Во «Входящих» видно всё — независимо от этих настроек.")}</p>
          </div>
          {saved && <span className={`${styles.chip} ${styles.done}`} role="status">{t("Сохранено")}</span>}
        </div>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!data && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}
        {data && <>
          {!data.telegramLinked && <p className={`${styles.notice} ${styles.info}`}>{t("Telegram не подключён — пока уведомления приходят только на почту. Откройте бота BuildPath и войдите, чтобы получать их и там.")}</p>}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>{t("События")}</th><th style={{ width: 110, textAlign: "center" }}>Telegram</th><th style={{ width: 110, textAlign: "center" }}>{t("Почта")}</th></tr></thead>
              <tbody>
                {categories.map((category) => <tr key={category.key}>
                  <td><b>{category.title}</b><span className={styles.cellSub}>{category.text}</span></td>
                  <td style={{ textAlign: "center" }}>{box(category.key, "telegram", t("{0} — Telegram", [category.title]))}</td>
                  <td style={{ textAlign: "center" }}>{box(category.key, "email", t("{0} — почта", [category.title]))}</td>
                </tr>)}
                <tr>
                  <td><b>{t("Безопасность")}</b><span className={styles.cellSub}>{t("Вход с нового устройства, включение и выключение входа с кодом. Отключить нельзя.")}</span></td>
                  <td style={{ textAlign: "center" }}><input type="checkbox" checked disabled aria-label={t("Безопасность — Telegram, всегда")} style={{ width: 20, height: 20, accentColor: "var(--ink)" }} /></td>
                  <td style={{ textAlign: "center" }}><input type="checkbox" checked disabled aria-label={t("Безопасность — почта, всегда")} style={{ width: 20, height: 20, accentColor: "var(--ink)" }} /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className={styles.small} style={{ marginTop: 10 }}>{t("Письма приходят на {0}. В каждом письме есть ссылка на эту страницу.", [data.email])}</p>
        </>}
      </main>
    </div>
  );
}
