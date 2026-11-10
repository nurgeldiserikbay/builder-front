"use client";

import styles from "../../../journey.module.css";

type Item = { title: string; plain: string; technical: string };
export type TechPlan = {
  planVersion: string; summary: string; features: Item[]; roles: Item[]; data: Item[];
  pages: Array<{ path: string; title: string; plain: string }>; notifications: string[]; hosting: Array<{ option: string; plain: string }>;
  limits: string[]; api: string; ownerNotes: string | null;
};
export type TechPlanOptions = { preview: TechPlan | null; outdated: boolean };

function Items({ title, items }: { title: string; items: Item[] }) {
  return (
    <section className={styles.card} aria-label={title}>
      <p className={styles.cardTitle}>{title}</p>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.title}>
            <strong>{item.title}.</strong> {item.plain}
            <details><summary className={styles.small}>Для разработчика</summary><p className={styles.small} style={{ margin: "4px 0 0" }}>{item.technical}</p></details>
          </li>
        ))}
      </ul>
    </section>
  );
}

function download(name: string, text: string, type: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name; document.body.appendChild(link); link.click(); link.remove();
}

/**
 * The plan is made by the platform from the accepted stages; the owner reads it, adds notes and approves it as the contract.
 * When the inputs change, «Обновить план» saves a new version computed on the server.
 */
export function TechPlanView({ plan, outdated, notes, onNotes, disabled, onRefresh, busy }: {
  plan: TechPlan | null; outdated: boolean; notes: string; onNotes: (value: string) => void; disabled: boolean; onRefresh: (() => void) | null; busy: boolean;
}) {
  if (!plan) return <div className={`${styles.notice} ${styles.info}`}>План появится, когда будут приняты «Цель сайта» и «Расписание и запись».</div>;
  return (
    <>
      {outdated && (
        <div className={`${styles.notice} ${styles.warning}`}>
          Принятые этапы изменились, и план нужно обновить — иначе его нельзя принять.
          {onRefresh && <button className={styles.secondary} style={{ marginTop: 8 }} disabled={busy} onClick={onRefresh}>{busy ? "Обновляем…" : "Обновить план"}</button>}
        </div>
      )}
      <section className={styles.card} aria-label="Коротко">
        <p className={styles.cardTitle}>Что будет сделано</p>
        <p style={{ margin: 0 }}>{plan.summary}</p>
      </section>
      <Items title="Что умеет" items={plan.features} />
      <Items title="Кто пользуется" items={plan.roles} />
      <Items title="Какие данные хранятся" items={plan.data} />
      <section className={styles.card} aria-label="Страницы и где работает">
        <p className={styles.cardTitle}>Страницы</p>
        <ul className={styles.list}>{plan.pages.map((item) => <li key={item.path}><code>{item.path}</code> — <strong>{item.title}</strong>: {item.plain}</li>)}</ul>
        <p className={styles.cardTitle} style={{ marginTop: 12 }}>Уведомления</p>
        <ul className={styles.list}>{plan.notifications.map((item) => <li key={item}>{item}</li>)}</ul>
        <p className={styles.cardTitle} style={{ marginTop: 12 }}>Где может работать</p>
        <ul className={styles.list}>{plan.hosting.map((item) => <li key={item.option}><strong>{item.option}:</strong> {item.plain}</li>)}</ul>
        <p className={styles.cardTitle} style={{ marginTop: 12 }}>Чего в этой версии нет</p>
        <ul className={styles.list}>{plan.limits.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section className={styles.card} aria-label="Контракт API">
        <p className={styles.cardTitle}>Контракт API</p>
        <p className={styles.small} style={{ marginTop: 0 }}>Точное описание адресов и форм записи в формате OpenAPI — передайте разработчику, если он будет что-то дорабатывать. Сайт на BuildPath и программа для своего сервера работают по нему одинаково.</p>
        <details><summary className={styles.small}>Показать</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: 12, overflowX: "auto" }}>{plan.api}</pre></details>
        <button className={styles.ghost} style={{ marginTop: 8 }} onClick={() => download("booking-api.yaml", plan.api, "text/yaml")}>Скачать booking-api.yaml</button>
      </section>
      <section className={styles.card} aria-label="Заметки">
        <label className={styles.field} style={{ margin: 0 }}>
          <span className={styles.cardTitle}>Ваши заметки для разработчиков</span>
          <span className={styles.why}>Что важно учесть потом: например, «нужна предоплата через Kaspi» или «мастер Тимур работает через неделю». План от заметок не меняется — это пожелания на будущее.</span>
          <textarea className={styles.textarea} value={notes} maxLength={2000} disabled={disabled} onChange={(event) => onNotes(event.target.value)} placeholder="Необязательно" />
        </label>
      </section>
    </>
  );
}
