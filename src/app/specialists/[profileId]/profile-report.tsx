"use client";

import { t } from "@/lib/i18n";
import { useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../projects/journey.module.css";

const reasons: Array<{ key: string; label: string; hint: string }> = [
  { key: "not_theirs", label: t("Это не его работа"), hint: t("Например, сайт делали вы или другая студия.") },
  { key: "unsafe_link", label: t("Опасная ссылка"), hint: t("Ссылка ведёт на мошеннический сайт, вирус или просит ввести пароль.") },
  { key: "offensive", label: t("Оскорбления или чужие данные"), hint: t("Грубые слова, чьи-то телефоны, адреса или фото без согласия.") },
  { key: "fake", label: t("Обман"), hint: t("Выдуманный опыт, чужое имя или карточка-подделка.") },
  { key: "other", label: t("Другое"), hint: t("Опишите, что не так.") },
];

/** A complaint about the card or one of its works. Support decides; the specialist never learns who complained. */
export default function ProfileReport({ profileId, works, pending, onSent }: { profileId: string; works: Array<{ title: string }>; pending: boolean; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("card");
  const [reason, setReason] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  if (sent || pending) return <p className={styles.small} role="status">{t("Ваша жалоба на эту карточку у поддержки. Мы сообщим, что решили.")}</p>;
  if (!open) return <button type="button" className={styles.ghost} style={{ paddingLeft: 0 }} onClick={() => setOpen(true)}>{t("Пожаловаться на карточку")}</button>;

  async function send() {
    setBusy(true); setError("");
    const body = target === "card" ? { target: "card", reason, text: text.trim() } : { target: "work", workIndex: Number(target), reason, text: text.trim() };
    try { await api(`/specialists/${profileId}/report`, { method: "POST", body: JSON.stringify(body) }); setSent(true); onSent(); }
    catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }
  const hint = reasons.find((item) => item.key === reason)?.hint;
  return (
    <section className={styles.card} aria-labelledby="report-title">
      <p id="report-title" className={styles.cardTitle}>{t("Жалоба на карточку")}</p>
      {works.length > 0 && (
        <label className={styles.field}>
          <span className={styles.label}>{t("На что жалуетесь")}</span>
          <select className={styles.input} value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="card">{t("На всю карточку")}</option>
            {works.map((work, index) => <option key={index} value={String(index)}>{t("Работа «{0}»", [work.title])}</option>)}
          </select>
        </label>
      )}
      <fieldset className={styles.field} style={{ border: 0, padding: 0 }}>
        <legend className={styles.label}>{t("Что не так")}</legend>
        <div className={styles.chips}>
          {reasons.map((item) => <button key={item.key} type="button" className={styles.choice} style={{ width: "auto" }} aria-pressed={reason === item.key} onClick={() => setReason(item.key)}>{item.label}</button>)}
        </div>
        {hint && <span className={styles.why}>{hint}</span>}
      </fieldset>
      <label className={styles.field}>
        <span className={styles.label}>{t("Подробности для поддержки")}</span>
        <textarea className={styles.textarea} style={{ minHeight: 80 }} maxLength={1000} value={text} onChange={(event) => setText(event.target.value)} />
        <span className={styles.why}>{t("Специалист не узнает, кто пожаловался. Поддержка может оставить всё как есть, убрать работу из карточки или скрыть карточку из каталога.")}</span>
      </label>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      <div className={styles.row}>
        <button type="button" className={styles.button} disabled={busy || !reason || text.trim().length < 10} onClick={() => void send()}>{busy ? t("Отправляем…") : t("Отправить жалобу")}</button>
        <button type="button" className={styles.ghost} onClick={() => setOpen(false)}>{t("Отмена")}</button>
      </div>
    </section>
  );
}
