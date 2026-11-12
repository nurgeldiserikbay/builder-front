"use client";

import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import styles from "../login/login.module.css";

export default function VerifyAction({ token }: { token: string }) {
  const [message, setMessage] = useState(token ? t("Подтверждаем адрес…") : t("В ссылке нет токена подтверждения."));
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!token) return;
    api<void>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) })
      .then(() => { setMessage(t("Email подтверждён. Теперь можно войти.")); setDone(true); })
      .catch(() => setMessage(t("Ссылка недействительна или срок её действия истёк. Попробуйте войти — на странице входа можно отправить письмо ещё раз.")));
  }, [token]);
  return <main className={styles.shell}>
    <a href="/" className={styles.brand}><span>B</span> BuildPath</a>
    <section className={styles.card}>
      <h1>{done ? t("Готово") : t("Проверяем ссылку")}</h1>
      <p className={styles.message} role="status">{message}</p>
      {done && <a className={styles.primary} style={{display:"grid",placeItems:"center",marginTop:18,textDecoration:"none"}} href="/login">{t("Перейти ко входу")}</a>}
      {!done && <a className={styles.back} href="/login">{t("← Ко входу")}</a>}
    </section>
  </main>;
}
