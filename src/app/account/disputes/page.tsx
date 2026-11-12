"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../projects/journey.module.css";
import AppHeader from "../../app-header";

type Row = { id: string; status: "open" | "resolved" | "withdrawn"; kind: string; outcome: string | null; createdAt: string; projectId: string; projectName: string; stageKey: string; stageTitle: string; side: "owner" | "specialist" };
const statusLabels: Record<string, string> = { open: t("на рассмотрении"), resolved: t("решён"), withdrawn: t("отозван") };

/** Disputes the person takes part in, as an owner or as a specialist. The thread itself is on the stage page. */
export default function DisputesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Row[]>("/me/disputes").then(setRows).catch((caught) => {
      if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
      setError(explainError(caught));
    });
  }, [router]);

  return (
    <div className={styles.shell}>
      <AppHeader back={{ href: "/account", label: t("← Аккаунт") }} title={t("Споры")} />
      <main className={styles.container}>
        <p className={styles.kicker}>{t("Аккаунт")}</p>
        <h1 className={styles.h1}>{t("Споры")}</h1>
        <p className={styles.muted} style={{ marginTop: 0 }}>{t("Разногласия по работе специалистов и оплате. Переписка и решение — на странице этапа, в карточке «Время и оплата».")}</p>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!rows && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}
        {rows && rows.length === 0 && <section className={styles.card}><p style={{ margin: 0 }}>{t("Споров нет.")}</p></section>}
        {rows?.map((row) => (
          <a key={row.id} href={`/projects/${row.projectId}/stages/${row.stageKey}`} className={styles.card} style={{ display: "block", color: "inherit", textDecoration: "none" }}>
            <div className={styles.row} style={{ justifyContent: "space-between" }}>
              <strong>{row.projectName} · {t(row.stageTitle)}</strong>
              <span className={`${styles.chip} ${row.status === "open" ? styles.attention : styles.closed}`}>{statusLabels[row.status]}</span>
            </div>
            <p className={styles.small} style={{ margin: "6px 0 0" }}>{row.side === "owner" ? t("Вы — владелец проекта") : t("Вы — специалист")} · {new Date(row.createdAt).toLocaleDateString(dateLocale())}</p>
          </a>
        ))}
      </main>
    </div>
  );
}
