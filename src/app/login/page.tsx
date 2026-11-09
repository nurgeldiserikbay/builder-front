"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import styles from "./login.module.css";

/** Only same-site relative paths are allowed as a post-login destination. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/projects";
}

type User = { id: string; email: string; name: string | null; emailVerified: boolean };

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const next = typeof window === "undefined" ? "/projects" : safeNext(new URLSearchParams(window.location.search).get("next"));
  useEffect(() => {
    api<User>("/me").then(() => router.replace(next)).catch(() => undefined);
  }, [router, next]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "register") {
        await api<{ status: string }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password, name: name || undefined, locale: "ru" }),
        });
        setMessage("Письмо отправлено. Откройте его и подтвердите адрес, затем войдите.");
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
        ? error.message === "EMAIL_NOT_VERIFIED" ? "Сначала подтвердите email по ссылке из письма." : error.message
        : "Не удалось связаться с API. Проверьте NEXT_PUBLIC_API_BASE_URL и доступность backend.";
      setMessage(text);
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.shell}>
    <a href="/" className={styles.brand}><span>B</span> BuildPath</a>
    <section className={styles.card}>
      <p className={styles.kicker}>РАБОЧЕЕ ПРОСТРАНСТВО</p>
      <h1>{mode === "login" ? "Войти в BuildPath" : "Создать аккаунт"}</h1>
      <p className={styles.sub}>{mode === "login" ? "Войдите, чтобы продолжить работу над своими проектами." : "После регистрации подтвердите email — так мы защитим ваши проекты."}</p>
      <form onSubmit={submit}>
        {mode === "register" && <label>Имя<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></label>}
        <label>Email<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} /></label>
        <label>Пароль<input type="password" required minLength={mode === "register" ? 12 : 1} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {mode === "register" && <small className={styles.hint}>Не менее 12 символов.</small>}
        {message && <p className={styles.message} role="status">{message}</p>}
        <button className={styles.primary} disabled={busy}>{busy ? "Подождите…" : mode === "login" ? "Войти" : "Зарегистрироваться"}</button>
      </form>
      <button className={styles.switch} onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }}>
        {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
      </button>
      <a className={styles.back} href="/">← На главную</a>
    </section>
  </main>;
}
