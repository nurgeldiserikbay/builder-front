"use client";

import { t, dateLocale } from "@/lib/i18n";
import LanguageSwitch from "../language-switch";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../projects/journey.module.css";

type Me = { id: string; email: string; name: string | null };
type Preview = { projects: number; liveSites: Array<{ slug: string; projectName: string }>; specialistStages: number; telegramLinked: boolean; retentionDays: number; purgeAfter: string };
type Deleted = { deletionRequestedAt: string; purgeAfter: string; retentionDays: number };

/** "24 ноября 2026" — without the trailing "г." so it reads well mid-sentence. */
const date = (value: string) => new Date(value).toLocaleDateString(dateLocale(), { day: "numeric", month: "long", year: "numeric" }).replace(/\s?г\.$/, "");
const days = (count: number) => `${count} ${count % 10 === 1 && count % 100 !== 11 ? t("день") : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? t("дня") : t("дней")}`;

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState<Deleted | null>(null);

  useEffect(() => {
    api<Me>("/me").then(setMe).catch((caught) => {
      if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent("/account")}`); return; }
      setError(explainError(caught));
    });
  }, [router]);

  async function startDeletion() {
    setError("");
    try {
      setPreview(await api<Preview>("/me/deletion"));
      setOpen(true);
    } catch (caught) { setError(explainError(caught)); }
  }

  async function confirmDeletion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setDeleted(await api<Deleted>("/me/deletion", { method: "POST", body: JSON.stringify({ password, confirm: understood }) }));
    } catch (caught) {
      setError(explainError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (deleted) {
    return (
      <div className={styles.shell}>
        <main className={styles.container}>
          <p className={styles.kicker}>{t("Аккаунт удалён")}</p>
          <h1 className={styles.h1}>{t("Готово, вы вышли из аккаунта")}</h1>
          <p>{t("Сайты сняты с публикации, доступ специалистов закрыт, Telegram отключён.")}</p>
          <p>{t("Остальные данные хранятся до")}{" "}{date(deleted.purgeAfter)}{t(", затем удаляются навсегда. Если удалили по ошибке, напишите в поддержку до этой даты — аккаунт можно восстановить.")}</p>
          <a className={styles.secondary} href="/">{t("На главную")}</a>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.top}><div className={styles.topInner}>
        <a className={styles.back} href="/projects">{t("← Проекты")}</a>
        <span className={styles.topTitle}>{t("Аккаунт")}</span>
      </div></header>
      <main className={styles.container}>
        {error && !open && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!me && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}
        {me && (
          <>
            <p className={styles.kicker}>{t("Ваш аккаунт")}</p>
            <h1 className={styles.h1}>{me.name || me.email}</h1>
            <LanguageSwitch style={{ margin: "0 0 14px" }} />
            {me.name && <p className={styles.small} style={{ marginTop: 0 }}>{me.email}</p>}

            <section className={styles.card}>
              <p className={styles.cardTitle}>{t("Тариф и документы")}</p>
              <ul className={styles.list}>
                <li><a href="/account/plan">{t("Тариф и лимиты")}</a></li>
                <li><a href="/legal/terms">{t("Оферта")}</a></li>
                <li><a href="/legal/privacy">{t("Политика конфиденциальности")}</a>{" "}{t("— какие данные мы храним и зачем")}</li>
              </ul>
            </section>

            <section className={styles.card} aria-labelledby="delete-title">
              <p id="delete-title" className={styles.cardTitle}>{t("Удалить аккаунт")}</p>
              {!open && <>
                <p style={{ marginTop: 0 }}>{t("Аккаунт, проекты, фото и заявки будут удалены. Перед удалением можно скачать результат каждого проекта на его странице.")}</p>
                <button className={styles.danger} onClick={startDeletion}>{t("Удалить аккаунт…")}</button>
              </>}
              {open && preview && <form onSubmit={confirmDeletion}>
                <p style={{ marginTop: 0 }}><strong>{t("Сразу после удаления:")}</strong></p>
                <ul className={styles.list}>
                  <li>{t("вы выйдете на всех устройствах и не сможете войти;")}</li>
                  <li>{preview.liveSites.length ? <>{t("сайты перестанут открываться:")}{" "}{preview.liveSites.map((site) => `«${site.projectName}» (${site.slug})`).join(", ")};</> : t("опубликованных сайтов нет;")}</li>
                  <li>{t("специалисты потеряют доступ к вашим проектам")}{preview.specialistStages ? t(", а вы — к {0} чужим этапам", [preview.specialistStages]) : ""};</li>
                  {preview.telegramLinked && <li>{t("Telegram отключится, уведомления о заявках перестанут приходить.")}</li>}
                </ul>
                <p>{t("Проекты (")}{preview.projects}{t(") и остальные данные мы храним ещё")}{" "}{days(preview.retentionDays)}{" "}{t("— до")}{" "}{date(preview.purgeAfter)}{t(". Пока срок не прошёл, аккаунт можно восстановить через поддержку. Потом всё удаляется навсегда.")}</p>
                <label className={styles.label} htmlFor="delete-password">{t("Пароль от аккаунта")}</label>
                <input id="delete-password" className={styles.input} type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "14px 0" }}>
                  <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} style={{ width: 20, height: 20, flex: "none" }} />
                  <span>{t("Я понимаю, что сайты перестанут работать сразу, а данные будут удалены после")}{" "}{date(preview.purgeAfter)}.</span>
                </label>
                {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
                <div className={styles.row} style={{ gap: 10, flexWrap: "wrap" }}>
                  <button className={styles.danger} disabled={busy || !understood || !password}>{busy ? t("Удаляем…") : t("Удалить аккаунт")}</button>
                  <button type="button" className={styles.ghost} onClick={() => { setOpen(false); setPassword(""); setUnderstood(false); }}>{t("Отмена")}</button>
                </div>
              </form>}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
