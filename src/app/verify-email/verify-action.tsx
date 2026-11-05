"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import styles from "../login/login.module.css";

export default function VerifyAction({ token }: { token: string }) {
  const [message, setMessage] = useState(token ? "Подтверждаем адрес…" : "В ссылке нет токена подтверждения.");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!token) return;
    api<void>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) })
      .then(() => { setMessage("Email подтверждён. Теперь можно войти."); setDone(true); })
      .catch(() => setMessage("Ссылка недействительна или срок её действия истёк. Запросите письмо повторно."));
  }, [token]);
  return <main className={styles.shell}>
    <a href="/" className={styles.brand}><span>B</span> BuildPath</a>
    <section className={styles.card}>
      <p className={styles.kicker}>ПОДТВЕРЖДЕНИЕ EMAIL</p>
      <h1>{done ? "Готово" : "Проверяем ссылку"}</h1>
      <p className={styles.message} role="status">{message}</p>
      {done && <a className={styles.primary} style={{display:"grid",placeItems:"center",marginTop:18,textDecoration:"none"}} href="/login">Перейти ко входу</a>}
      {!done && <a className={styles.back} href="/login">← Ко входу</a>}
    </section>
  </main>;
}
