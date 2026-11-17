"use client";

// «Уже решено за вас»: every decision about code, hosting, address and technologies is already made — by the platform's
// default until the owner chooses. A newcomer can leave it; someone who knows opens «Изменить» or «Другие варианты».
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { explainError } from "@/lib/journey";
import styles from "../journey.module.css";

type Decision = {
  cardKey: string; title: string; optionKey: string; optionTitle: string; decidedBy: "owner" | "default"; now: string; why: string | null;
  others: Array<{ key: string; title: string; summary: string }>;
};

export default function Decisions({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Decision[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<{ items: Decision[] }>(`/projects/${projectId}/choices`).then((data) => setItems(data.items)).catch((caught) => setError(explainError(caught))); }, [projectId]);
  if (error) return <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>;
  if (!items) return null;
  const defaults = items.filter((item) => item.decidedBy === "default").length;

  return (
    <section className={styles.card} aria-labelledby="decided-title">
      <p id="decided-title" className={styles.cardTitle} style={{ margin: 0 }}>{t("Уже решено за вас")}</p>
      <p className={styles.small}>{defaults ? t("Мы выбрали то, что подходит большинству, — можно ничего не менять. Если разбираетесь или нужен свой вариант, нажмите «Изменить».") : t("Все решения приняты вами. Любое можно поменять.")}</p>
      <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 12 }}>
        {items.map((item) => (
          <li key={item.cardKey} style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span className={styles.small} style={{ margin: 0 }}>{item.title}</span>
              <span className={`${styles.chip} ${styles[item.decidedBy === "owner" ? "done" : "closed"]}`} style={{ marginTop: 0, fontSize: 13 }}>{item.decidedBy === "owner" ? t("ваш выбор") : t("по умолчанию")}</span>
            </div>
            <strong style={{ display: "block", fontSize: 18, margin: "4px 0" }}>{item.optionTitle}</strong>
            <p style={{ margin: "0 0 4px" }}>{item.now}</p>
            {item.why && <p className={styles.small} style={{ margin: "0 0 6px" }}>{t("Почему так:")}{" "}{item.why}</p>}
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <a className={styles.secondary} href={`/projects/${projectId}/choices/${item.cardKey}`}>{t("Изменить")}</a>
            </div>
            {item.others.length > 0 && (
              <details className={styles.details} style={{ marginTop: 8 }}>
                <summary>{t("Другие варианты ({0})", [item.others.length])}</summary>
                <ul className={styles.list} style={{ margin: "6px 0 0" }}>
                  {item.others.map((option) => (
                    <li key={option.key}><a href={`/projects/${projectId}/choices/${item.cardKey}#${option.key}`}><strong>{option.title}</strong></a>{" — "}<span className={styles.small}>{option.summary}</span></li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
