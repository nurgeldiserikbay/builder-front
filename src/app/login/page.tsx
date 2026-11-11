"use client";

import { t, getLocale } from "@/lib/i18n";
import LanguageSwitch from "../language-switch";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
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
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [consentText, setConsentText] = useState("");

  const next = typeof window === "undefined" ? "/projects" : safeNext(new URLSearchParams(window.location.search).get("next"));
  useEffect(() => {
    api<User>("/me").then(() => router.replace(next)).catch(() => undefined);
    api<{ statement: string }>("/legal/consent").then((info) => setConsentText(info.statement)).catch(() => undefined);
  }, [router, next]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "register") {
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
      const text = error instanceof ApiError
        ? loginMessages[error.message] ?? error.message
        : t("Не удалось связаться с API. Проверьте NEXT_PUBLIC_API_BASE_URL и доступность backend.");
      setMessage(text);
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.shell}>
    <a href="/" className={styles.brand}><span>B</span> BuildPath</a>
    <section className={styles.card}>
      <p className={styles.kicker}>{t("РАБОЧЕЕ ПРОСТРАНСТВО")}</p>
      <LanguageSwitch style={{ marginBottom: 12 }} />
      <h1>{mode === "login" ? t("Войти в BuildPath") : t("Создать аккаунт")}</h1>
      <p className={styles.sub}>{mode === "login" ? t("Войдите, чтобы продолжить работу над своими проектами.") : t("После регистрации подтвердите email — так мы защитим ваши проекты.")}</p>
      <form onSubmit={submit}>
        {mode === "register" && <label>{t("Имя")}<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></label>}
        <label>Email<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} /></label>
        <label>{t("Пароль")}<input type="password" required minLength={mode === "register" ? 12 : 1} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {mode === "register" && <small className={styles.hint}>{t("Не менее 12 символов.")}</small>}
        {mode === "register" && <label className={styles.consent}>
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required />
          <span>
            {consentText || t("Я принимаю оферту и политику конфиденциальности и соглашаюсь на обработку моих данных, в том числе на их передачу за границу.")}{" "}
            {t("Прочитать:")}{" "}<a href="/legal/terms" target="_blank">{t("оферта")}</a>, <a href="/legal/privacy" target="_blank">{t("политика конфиденциальности")}</a>.
          </span>
        </label>}
        {message && <p className={styles.message} role="status">{message}</p>}
        <button className={styles.primary} disabled={busy || (mode === "register" && !accepted)}>{busy ? t("Подождите…") : mode === "login" ? t("Войти") : t("Зарегистрироваться")}</button>
      </form>
      <button className={styles.switch} onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }}>
        {mode === "login" ? t("Нет аккаунта? Зарегистрироваться") : t("Уже есть аккаунт? Войти")}
      </button>
      <a className={styles.back} href="/">{t("← На главную")}</a>
    </section>
  </main>;
}
