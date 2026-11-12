"use client";

import { t } from "@/lib/i18n";
import { useState } from "react";
import { ApiError, api } from "@/lib/api";
import styles from "../login/login.module.css";

/** New password by the one-hour link from the «Forgot password» e-mail. */
export default function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState(token ? "" : t("В ссылке нет кода. Запросите новое письмо на странице входа."));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== repeat) { setMessage(t("Пароли не совпадают.")); return; }
    setBusy(true);
    setMessage("");
    try {
      await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      setDone(true);
      setMessage(t("Пароль изменён. Войдите с новым паролем — на других устройствах вход нужно будет выполнить заново."));
    } catch (error) {
      const code = error instanceof ApiError ? error.message : "";
      setMessage(code === "RESET_TOKEN_INVALID" ? t("Ссылка недействительна или уже использована. Запросите новую на странице входа.")
        : code === "TOO_MANY_ATTEMPTS" ? t("Слишком много попыток. Подождите немного и попробуйте снова.")
          : code ? t("Что-то пошло не так ({0}). Попробуйте ещё раз.", [code]) : t("Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз."));
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.shell}>
    <a href="/" className={styles.brand}><span>B</span> BuildPath</a>
    <section className={styles.card}>
      <h1>{t("Новый пароль")}</h1>
      <p className={styles.sub}>{t("Придумайте пароль не короче 12 символов.")}</p>
      {!done && token && <form onSubmit={submit}>
        <label>{t("Новый пароль")}<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label>{t("Повторите пароль")}<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={repeat} onChange={(event) => setRepeat(event.target.value)} /></label>
        {message && <p className={styles.message} role="status">{message}</p>}
        <button className={styles.primary} disabled={busy}>{busy ? t("Подождите…") : t("Сохранить пароль")}</button>
      </form>}
      {(done || !token) && <p className={styles.message} role="status">{message}</p>}
      {done && <a className={styles.primary} style={{ display: "grid", placeItems: "center", marginTop: 18, textDecoration: "none" }} href="/login">{t("Перейти ко входу")}</a>}
      <a className={styles.back} href="/login">{t("← Ко входу")}</a>
    </section>
  </main>;
}
