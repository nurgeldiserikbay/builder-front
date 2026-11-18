"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { t } from "@/lib/i18n";
import styles from "../../../journey.module.css";

export type Deployment = { url: string; ok: boolean; status: number | null; database: string | null; error: string | null; checkedAt: string };

const causes: Record<string, string> = {
  NOT_PUBLIC: t("Адрес ведёт во внутреннюю сеть — BuildPath проверяет только общедоступные адреса."),
  DNS: t("Такого адреса нет. Проверьте, что скопировали его целиком."),
  TIMEOUT: t("Приложение не ответило за минуту. Бесплатный Render засыпает — подождите и проверьте ещё раз."),
  TLS: t("У адреса нет рабочего HTTPS."),
  REFUSED: t("Сервер отказал в соединении: приложение не запущено или слушает другой порт."),
  NOT_HEALTH_ANSWER: t("По адресу отвечает что-то другое, а не это приложение (/api/health не вернул status: ok)."),
};
const cause = (error: string | null) => (error ? causes[error] ?? (error.startsWith("HTTP_") ? t("Приложение ответило ошибкой {0}. Посмотрите журнал в Render или на сервере.", [error.slice(5)]) : t("Не получилось связаться с приложением.")) : "");

/**
 * Step 4: the owner launches the application on their own Render or server — BuildPath explains how and checks the address.
 * Nothing is deployed from BuildPath and it asks for no secret: the database password and admin password stay with the owner.
 */
export default function AppLaunch({ projectId, deployment, canEdit, onChecked }: { projectId: string; deployment: Deployment | null; canEdit: boolean; onChecked: () => Promise<unknown> }) {
  const [where, setWhere] = useState<"render" | "server">("render");
  const [url, setUrl] = useState(deployment?.url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function check() {
    setBusy(true); setError("");
    try { await api(`/projects/${projectId}/agent/deployment/check`, { method: "POST", body: JSON.stringify({ url }) }); await onChecked(); }
    catch (caught) { setError(caught instanceof Error && caught.message === "APP_URL_INVALID" ? t("Нужен адрес вида https://my-app.onrender.com") : explainError(caught)); }
    finally { setBusy(false); }
  }
  const step = (n: number, title: string, text: React.ReactNode) => (
    <li style={{ marginBottom: 8 }}><strong>{n}. {title}</strong><div className={styles.small} style={{ marginTop: 2 }}>{text}</div></li>
  );
  return (
    <div style={{ marginTop: 12 }}>
      <p className={styles.label} style={{ margin: "0 0 4px" }}>{t("Запуск у вас")}</p>
      {deployment && (
        <p className={`${styles.notice} ${deployment.ok ? styles.success : styles.warn}`} role="status" style={{ margin: "0 0 8px", overflowWrap: "anywhere" }}>
          {deployment.ok
            ? t("Приложение работает: {0}. База данных: {1}.", [deployment.url, deployment.database === "postgres" ? "PostgreSQL" : deployment.database === "memory" ? t("в памяти — данные пропадут при перезапуске, подключите DATABASE_URL") : "—"])
            : `${t("Не отвечает: {0}.", [deployment.url])} ${cause(deployment.error)}`}
          <span style={{ display: "block", marginTop: 2 }} className={styles.small}>{t("Проверено {0}", [new Date(deployment.checkedAt).toLocaleString()])}</span>
          {deployment.ok && <a href={deployment.url} target="_blank" rel="noreferrer">{t("Открыть приложение")}</a>}
        </p>
      )}
      <div role="tablist" className={styles.row} style={{ gap: 6, marginBottom: 8 }}>
        <button type="button" role="tab" aria-selected={where === "render"} className={where === "render" ? styles.secondary : styles.ghost} onClick={() => setWhere("render")}>{t("Render (бесплатно)")}</button>
        <button type="button" role="tab" aria-selected={where === "server"} className={where === "server" ? styles.secondary : styles.ghost} onClick={() => setWhere("server")}>{t("Свой сервер")}</button>
      </div>
      {where === "render" ? (
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {step(1, t("Слейте код"), t("Откройте запрос на слияние от агента и слейте его в основную ветку — Render берёт код оттуда."))}
          {step(2, t("Создайте базу данных"), <>{t("Бесплатная база Render удаляется через 30 дней, поэтому для настоящих данных удобнее Neon: зарегистрируйтесь, создайте проект и скопируйте строку подключения (postgresql://…).")} <a href="https://console.neon.tech" target="_blank" rel="noreferrer">neon.tech</a></>)}
          {step(3, t("Создайте приложение в Render"), <>{t("В Render нажмите «New» → «Blueprint» и выберите репозиторий: Render прочитает render.yaml. Впишите DATABASE_URL (строка из Neon), ADMIN_EMAIL и ADMIN_PASSWORD — первый вход администратора. SESSION_SECRET Render создаст сам. Нажмите «Apply».")} <a href="https://dashboard.render.com/blueprints" target="_blank" rel="noreferrer">dashboard.render.com</a></>)}
          {step(4, t("Проверьте"), t("Через несколько минут у приложения появится адрес вида https://имя.onrender.com — вставьте его ниже."))}
        </ol>
      ) : (
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {step(1, t("Подготовьте сервер"), t("Нужен сервер с Docker и доменом, который на него указывает (для HTTPS удобно поставить Caddy перед приложением)."))}
          {step(2, t("Скачайте код"), t("Склонируйте репозиторий или скачайте архив выше, скопируйте .env.example в .env и заполните пароли."))}
          {step(3, t("Запустите"), <code>docker compose up -d</code>)}
          {step(4, t("Проверьте"), t("Вставьте адрес приложения ниже."))}
        </ol>
      )}
      {canEdit && (
        <form onSubmit={(event) => { event.preventDefault(); void check(); }} style={{ marginTop: 6 }}>
          <label className={styles.label} htmlFor="app-url">{t("Адрес приложения")}</label>
          <input id="app-url" className={styles.input} type="url" inputMode="url" required maxLength={300} placeholder="https://my-app.onrender.com" value={url} onChange={(event) => setUrl(event.target.value)} />
          <button className={styles.button} style={{ marginTop: 8 }} disabled={busy || !url.trim()}>{busy ? t("Проверяем… (до минуты)") : t("Проверить")}</button>
          <p className={styles.small}>{t("BuildPath откроет /api/health приложения. Пароли и строку базы данных сюда вводить не нужно — они остаются у вас.")}</p>
        </form>
      )}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    </div>
  );
}
