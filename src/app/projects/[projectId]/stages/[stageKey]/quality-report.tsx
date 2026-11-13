"use client";

import { t } from "@/lib/i18n";
import type { QualityReport } from "@/lib/journey";
import styles from "../../../journey.module.css";

const severityLabel: Record<string, string> = { critical: t("критично"), high: t("важно"), medium: t("желательно"), low: t("мелочь") };

/** The release gate of a build: categories, what blocks publication, what is only advice, and what was not measured. */
export default function QualityReportView({ report }: { report: QualityReport | null }) {
  if (!report) {
    return <p className={`${styles.notice} ${styles.warn}`}>{t("Эта сборка сделана до проверки качества. Соберите сайт заново — без проверки его нельзя принять и опубликовать.")}</p>;
  }
  const blocking = report.findings.filter((finding) => finding.blocking);
  const advice = report.findings.filter((finding) => !finding.blocking);
  return (
    <div style={{ marginTop: 16 }}>
      <p className={styles.cardTitle}>{t("Проверка перед публикацией")}</p>
      <p className={`${styles.notice} ${report.status === "passed" ? styles.success : styles.error}`} role="status">{report.summary}</p>
      <ul className={styles.checks}>
        {report.categories.map((category) => (
          <li key={category.id}>
            <span className={`${styles.checkIcon} ${styles[category.status === "failed" ? "failed" : category.status === "warning" ? "warning" : "passed"]}`} aria-hidden="true">{category.status === "failed" ? "✕" : category.status === "warning" ? "!" : category.status === "off" ? "–" : "✓"}</span>
            <span><strong>{category.title}</strong>{category.status === "off" ? ` · ${t("не проверяется")}` : !category.required ? ` · ${t("не обязательно")}` : ""}
              {category.status !== "off" && <><br /><span className={styles.small}>{category.counts.critical + category.counts.high + category.counts.medium + category.counts.low === 0 ? t("Замечаний нет.") : t("Замечаний: {0}.", [category.counts.critical + category.counts.high + category.counts.medium + category.counts.low])}</span></>}
            </span>
          </li>
        ))}
      </ul>
      {blocking.length > 0 && (
        <>
          <p className={styles.cardTitle} style={{ marginTop: 12 }}>{t("Мешает публикации")}</p>
          <ul className={styles.list}>{blocking.map((finding) => <li key={finding.id}><strong>{finding.title}</strong> ({severityLabel[finding.severity]}): {finding.details}{finding.pages.length > 1 || finding.pages[0] !== "/" ? ` ${t("Страницы: {0}.", [finding.pages.join(", ")])}` : ""}</li>)}</ul>
        </>
      )}
      {advice.length > 0 && (
        <details className={styles.details} style={{ marginTop: 10 }}>
          <summary>{t("Рекомендации ({0})", [advice.length])}</summary>
          <ul className={styles.list}>{advice.map((finding) => <li key={finding.id}><strong>{finding.title}</strong> ({severityLabel[finding.severity]}): {finding.details}</li>)}</ul>
        </details>
      )}
      <details className={styles.details} style={{ marginTop: 10 }}>
        <summary>{t("Что не проверяется автоматически")}</summary>
        <ul className={styles.list}>{report.unmeasured.map((item) => <li key={item.id}><strong>{item.title}</strong>: {item.why}</li>)}</ul>
        <p className={styles.small}>{t("Вес страниц: {0}.", [report.pages.map((page) => `${page.path} — ${page.htmlKb + page.imagesKb} КБ`).join(", ")])}{" "}{report.profile ? t("Правила проверки: «{0}», версия {1}.", [report.profile.key, report.profile.version]) : t("Правила проверки: стандартные BuildPath.")}</p>
        <p className={styles.small}>{t("Это автоматическая проверка, а не сертификат качества или безопасности.")}</p>
      </details>
    </div>
  );
}
