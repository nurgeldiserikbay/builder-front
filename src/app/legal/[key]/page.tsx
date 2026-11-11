"use client";

import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { Markdown } from "@/lib/markdown";
import styles from "../../projects/journey.module.css";

type LegalDocument = { key: string; title: string; version: string; effectiveDate: string; markdown: string };

export default function LegalPage() {
  const { key } = useParams<{ key: string }>();
  const [doc, setDoc] = useState<LegalDocument | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (key !== "terms" && key !== "privacy") { setError(t("Такого документа нет.")); return; }
    api<LegalDocument>(`/legal/${key}`).then((value) => { setDoc(value); document.title = `${value.title} — BuildPath`; }).catch((caught) => setError(explainError(caught)));
  }, [key]);

  return (
    <div className={styles.shell}>
      <header className={styles.top}><div className={styles.topInner}>
        <a className={styles.brand} href="/"><span aria-hidden="true">B</span>BuildPath</a>
        <div className={styles.spacer} />
        <a className={styles.back} href={key === "terms" ? "/legal/privacy" : "/legal/terms"}>{key === "terms" ? t("Политика конфиденциальности") : t("Оферта")}</a>
      </div></header>
      <main className={`${styles.container} ${styles.legal}`}>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!doc && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}
        {doc && <article>
          <p className={styles.kicker}>{t("Документ")}</p>
          <h1 className={styles.h1}>{doc.title}</h1>
          <Markdown source={doc.markdown} tableClassName={styles.legalTable} />
        </article>}
      </main>
    </div>
  );
}
