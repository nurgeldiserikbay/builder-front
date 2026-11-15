"use client";

import { t, getLocale } from "@/lib/i18n";
import LanguageSwitch from "../language-switch";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL, ApiError, api } from "@/lib/api";
import styles from "./login.module.css";

/** Only same-site relative paths are allowed as a post-login destination. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/projects";
}

type User = { id: string; email: string; name: string | null; emailVerified: boolean };

const loginMessages: Record<string, string> = {
  EMAIL_NOT_VERIFIED: t("Сначала подтвердите email по ссылке из письма."),
  INVALID_CREDENTIALS: t("Неверная почта или пароль."),
  ACCOUNT_DELETED: t("Этот аккаунт удалён. Если вы удалили его по ошибке, напишите в поддержку — аккаунт можно восстановить, пока не истёк срок хранения данных."),
  CONSENT_REQUIRED: t("Отметьте согласие с офертой и политикой конфиденциальности."),
  LOGIN_RATE_LIMITED: t("Слишком много попыток входа. Подождите 15 минут или восстановите пароль."),
  TOO_MANY_ATTEMPTS: t("Слишком много попыток. Подождите немного и попробуйте снова."),
  EMAIL_DELIVERY_UNAVAILABLE: t("Не удалось отправить письмо. Попробуйте через несколько минут."),
  EMAIL_DELIVERY_NOT_CONFIGURED: t("Отправка писем пока не настроена. Напишите в поддержку."),
  INVALID_EMAIL: t("Проверьте адрес почты."),
  INVALID_PASSWORD: t("Пароль должен быть от 12 до 128 символов."),
  GOOGLE_NOT_CONFIGURED: t("Вход через Google пока не включён. Войдите по почте и паролю."),
  GOOGLE_CANCELLED: t("Вход через Google отменён."),
  GOOGLE_STATE_INVALID: t("Ссылка входа через Google устарела или открыта в другом браузере. Нажмите «Продолжить с Google» ещё раз."),
  GOOGLE_EMAIL_NOT_VERIFIED: t("Google не подтвердил адрес почты этого аккаунта. Подтвердите его в Google или войдите по почте и паролю."),
  GOOGLE_ACCOUNT_MISMATCH: t("К аккаунту с этой почтой уже привязан другой аккаунт Google. Войдите через него или по паролю."),
  GOOGLE_UNAVAILABLE: t("Google сейчас не отвечает. Попробуйте через минуту или войдите по паролю."),
  GOOGLE_TOKEN_INVALID: t("Не удалось проверить ответ Google. Попробуйте ещё раз."),
  GOOGLE_TOKEN_EXPIRED: t("Ответ Google устарел. Попробуйте ещё раз."),
  GOOGLE_CODE_REJECTED: t("Google не принял вход. Попробуйте ещё раз."),
  GOOGLE_RETRY: t("Не получилось с первого раза. Нажмите «Продолжить с Google» ещё раз."),
  GOOGLE_FAILED: t("Не получилось войти через Google. Попробуйте ещё раз или войдите по паролю."),
};

/** Google refuses sign-in inside in-app browsers such as Telegram's; there the button is not offered. */
const inTelegram = () => typeof window !== "undefined" && Boolean((window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData);

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [unverified, setUnverified] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [consentText, setConsentText] = useState("");
  const [google, setGoogle] = useState(false);

  const next = typeof window === "undefined" ? "/projects" : safeNext(new URLSearchParams(window.location.search).get("next"));
  useEffect(() => {
    api<User>("/me").then(() => router.replace(next)).catch(() => undefined);
    api<{ statement: string }>("/legal/consent").then((info) => setConsentText(info.statement)).catch(() => undefined);
    api<{ google: boolean }>("/auth/providers").then((info) => setGoogle(info.google && !inTelegram())).catch(() => undefined);
    // Coming back from Google with a problem: say what happened.
    const error = new URLSearchParams(window.location.search).get("error");
    if (error && /^[A-Z_]{3,60}$/.test(error)) setMessage(loginMessages[error] ?? loginMessages.GOOGLE_FAILED!);
  }, [router, next]);
  const googleHref = `${API_BASE_URL}/auth/google/start?next=${encodeURIComponent(next)}&locale=${getLocale()}`;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setUnverified(false);
    try {
      if (mode === "forgot") {
        await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
        setMessage(t("Если такой аккаунт есть, мы отправили на почту ссылку для нового пароля. Она действует один час."));
      } else if (mode === "register") {
        if (!accepted) { setMessage(t("Чтобы создать аккаунт, отметьте согласие с офертой и политикой конфиденциальности.")); return; }
        await api<{ status: string }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password, name: name || undefined, locale: getLocale(), acceptLegal: true }),
        });
        setMessage(t("Письмо отправлено. Откройте его и подтвердите адрес, затем войдите."));
        setMode("login");
      } else {
        await api<User>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        router.replace(next);
      }
    } catch (error) {
      if (error instanceof ApiError && error.message === "EMAIL_NOT_VERIFIED") setUnverified(true);
      const text = error instanceof ApiError
        ? loginMessages[error.message] ?? t("Что-то пошло не так ({0}). Попробуйте ещё раз.", [error.message])
        : t("Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.");
      setMessage(text);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    try {
      await api("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });
      setMessage(t("Отправили новое письмо. Если его нет во «Входящих», проверьте «Спам»."));
      setUnverified(false);
    } catch (error) {
      setMessage(error instanceof ApiError ? loginMessages[error.message] ?? t("Не удалось отправить письмо. Попробуйте через несколько минут.") : t("Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз."));
    } finally {
      setBusy(false);
    }
  }

  const titles = { login: t("Войти в BuildPath"), register: t("Создать аккаунт"), forgot: t("Восстановить пароль") };
  const subtitles = {
    login: t("Войдите, чтобы продолжить работу над своими проектами."),
    register: t("После регистрации подтвердите email — так мы защитим ваши проекты."),
    forgot: t("Укажите почту аккаунта — пришлём ссылку, по которой можно задать новый пароль."),
  };

  return <main className={styles.shell}>
    <aside className={styles.route} aria-hidden="true">
      <a href="/" className={styles.brand}><span>B</span> BuildPath</a>
      <ol className={styles.stations}>
        <li className={styles.done}><b>{t("Идея и цель")}</b><small>{t("Что сайт должен делать")}</small></li>
        <li className={styles.done}><b>{t("Тексты и внешний вид")}</b><small>{t("ИИ предлагает, вы выбираете")}</small></li>
        <li className={styles.here}><b>{t("Проверка")}</b><small>{t("Скорость, безопасность, телефоны")}</small></li>
        <li><b>{t("Публикация")}</b><small>{t("Свой адрес и заявки клиентов")}</small></li>
      </ol>
      <p className={styles.routeNote}>{t("Можно остановиться на любом этапе и вернуться позже — с телефона или из Telegram.")}</p>
    </aside>
    <a href="/" className={`${styles.brand} ${styles.brandMobile}`}><span>B</span> BuildPath</a>
    <section className={styles.card}>
      <LanguageSwitch style={{ marginBottom: 16 }} />
      <h1>{titles[mode]}</h1>
      <p className={styles.sub}>{subtitles[mode]}</p>
      {google && mode !== "forgot" && <>
        <a className={styles.google} href={googleHref}>{t("Продолжить с Google")}</a>
        {mode === "register" && <p className={styles.fine}>{t("Аккаунт создастся сразу, почта уже подтверждена Google. Перед началом работы мы попросим принять оферту и политику конфиденциальности.")}</p>}
        <div className={styles.divider}>{t("или по почте")}</div>
      </>}
      <form onSubmit={submit}>
        {mode === "register" && <label>{t("Имя")}<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></label>}
        <label>Email<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} /></label>
        {mode !== "forgot" && <label>{t("Пароль")}<input type="password" required minLength={mode === "register" ? 12 : 1} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
        {mode === "login" && <button type="button" className={styles.inlineLink} onClick={() => { setMode("forgot"); setMessage(""); }}>{t("Забыли пароль?")}</button>}
        {mode === "register" && <small className={styles.hint}>{t("Не менее 12 символов.")}</small>}
        {mode === "register" && <label className={styles.consent}>
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required />
          <span>
            {consentText || t("Я принимаю оферту и политику конфиденциальности и соглашаюсь на обработку моих данных, в том числе на их передачу за границу.")}{" "}
            {t("Прочитать:")}{" "}<a href="/legal/terms" target="_blank">{t("оферта")}</a>, <a href="/legal/privacy" target="_blank">{t("политика конфиденциальности")}</a>.
          </span>
        </label>}
        {message && <p className={styles.message} role="status">{message}</p>}
        {unverified && <button type="button" className={styles.inlineLink} disabled={busy} onClick={() => void resend()}>{t("Отправить письмо ещё раз")}</button>}
        <button className={styles.primary} disabled={busy || (mode === "register" && !accepted)}>{busy ? t("Подождите…") : mode === "login" ? t("Войти") : mode === "forgot" ? t("Прислать ссылку") : t("Зарегистрироваться")}</button>
      </form>
      <button className={styles.switch} onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); setUnverified(false); }}>
        {mode === "login" ? t("Нет аккаунта? Зарегистрироваться") : t("Уже есть аккаунт? Войти")}
      </button>
      <a className={styles.back} href="/">{t("← На главную")}</a>
    </section>
  </main>;
}
