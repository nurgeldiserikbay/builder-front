"use client";

import { t, dateLocale, getLocale } from "@/lib/i18n";
import LanguageSwitch from "../language-switch";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL, ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../projects/journey.module.css";
import AppHeader from "../app-header";
import { InstallApp } from "../pwa";

type Me = { id: string; email: string; name: string | null; hasPassword?: boolean };
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
  const [confirmEmail, setConfirmEmail] = useState("");
  const [reauth, setReauth] = useState(false);
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

  async function logout() {
    // The session ends on the server; the next page is the sign-in, as after any other way out.
    try { await api<void>("/auth/logout", { method: "POST" }); } catch { /* already signed out */ }
    window.location.replace("/login");
  }

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
      const proof = me?.hasPassword === false ? { confirmEmail } : { password };
      setDeleted(await api<Deleted>("/me/deletion", { method: "POST", body: JSON.stringify({ ...proof, confirm: understood }) }));
    } catch (caught) {
      setReauth(caught instanceof ApiError && caught.message === "REAUTH_REQUIRED");
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
      <AppHeader back={{ href: "/projects", label: t("← Проекты") }} title={t("Аккаунт")} />
      <main className={styles.container}>
        {error && !open && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!me && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}
        {me && (
          <>
            <div className={styles.profileHead}>
              <span className={styles.avatar} aria-hidden="true">{(me.name || me.email).trim().charAt(0).toUpperCase()}</span>
              <div>
                <p className={styles.kicker}>{t("Ваш аккаунт")}</p>
                <h1 className={styles.h1} style={{ margin: 0 }}>{me.name || me.email}</h1>
              </div>
            </div>
            <LanguageSwitch style={{ margin: "0 0 14px" }} />
            {me.name && <p className={styles.small} style={{ marginTop: 0 }}>{me.email}</p>}
            <InstallApp className={styles.small} buttonClassName={styles.secondary} />

            <section className={styles.card}>
              <p className={styles.cardTitle}>{t("Тариф и документы")}</p>
              <nav className={styles.settingsList}>
                <a href="/account/plan"><b>{t("Тариф и лимиты")}</b><small>{t("Сколько проектов и запросов к ИИ доступно")}</small></a>
                <a href="/account/specialist"><b>{t("Карточка специалиста")}</b><small>{t("Чтобы владельцы находили вас в каталоге")}</small></a>
                <a href="/account/playbooks"><b>{t("Мои плейбуки")}</b><small>{t("Ваши приёмы работы с ИИ для разных этапов")}</small></a>
                <a href="/account/disputes"><b>{t("Споры")}</b><small>{t("Разногласия по работе специалистов и оплате")}</small></a>
                <a href="/legal/terms"><b>{t("Оферта")}</b><small>{t("Условия работы платформы")}</small></a>
                <a href="/legal/privacy"><b>{t("Политика конфиденциальности")}</b><small>{t("Какие данные мы храним и зачем")}</small></a>
              </nav>
            </section>

            <section className={styles.card}>
              <p className={styles.cardTitle} style={{ marginTop: 0 }}>{t("Выход")}</p>
              <p className={styles.small} style={{ marginTop: 0 }}>{t("Выйти на этом устройстве. Проекты и данные остаются, войти можно в любой момент.")}</p>
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => void logout()}>{t("Выйти из аккаунта")}</button>
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
                {me.hasPassword === false ? <>
                  <label className={styles.label} htmlFor="delete-email">{t("Введите почту аккаунта: {0}", [me.email])}</label>
                  <input id="delete-email" className={styles.input} type="email" autoComplete="off" required maxLength={320} value={confirmEmail} onChange={(event) => setConfirmEmail(event.target.value)} />
                  <p className={styles.small}>{t("Вы входите через Google, пароля у аккаунта нет. Если вход был больше 15 минут назад, попросим войти ещё раз.")}</p>
                </> : <>
                  <label className={styles.label} htmlFor="delete-password">{t("Пароль от аккаунта")}</label>
                  <input id="delete-password" className={styles.input} type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
                </>}
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "14px 0" }}>
                  <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} style={{ width: 20, height: 20, flex: "none" }} />
                  <span>{t("Я понимаю, что сайты перестанут работать сразу, а данные будут удалены после")}{" "}{date(preview.purgeAfter)}.</span>
                </label>
                {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
                {reauth && <a className={styles.secondary} style={{ marginBottom: 12 }} href={`${API_BASE_URL}/auth/google/start?next=${encodeURIComponent("/account")}&locale=${getLocale()}`}>{t("Войти через Google ещё раз")}</a>}
                <div className={styles.row} style={{ gap: 10, flexWrap: "wrap" }}>
                  <button className={styles.danger} disabled={busy || !understood || (me.hasPassword === false ? !confirmEmail : !password)}>{busy ? t("Удаляем…") : t("Удалить аккаунт")}</button>
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
