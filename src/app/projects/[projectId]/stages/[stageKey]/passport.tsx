"use client";

// The stage passport (builder-docs PRODUCT_LIFECYCLE.md §2): every stage is described the same way — why it is there,
// what it needs, how it goes, what comes out, what the platform checks, how it is accepted, when it is done and what
// it gives the next stages. Open while the stage is new, folded once there is a result.
import { t } from "@/lib/i18n";
import type { StageGuide } from "@/lib/journey";
import styles from "../../../journey.module.css";

export default function StagePassport({ purpose, outcome, guide, inputs, acceptance, open }: {
  purpose: string; outcome: string; guide?: StageGuide; inputs: Array<{ key: string; title: string; satisfied: boolean }>;
  acceptance: string[]; open: boolean;
}) {
  const passport = guide?.passport;
  const head = (text: string) => <p className={styles.label} style={{ margin: "16px 0 6px" }}>{text}</p>;
  return (
    <details className={`${styles.card} ${styles.details}`} open={open} style={{ marginBottom: 16 }}>
      <summary>{t("Паспорт этапа: зачем он, как проходит и когда готов")}</summary>
      <p style={{ margin: "10px 0 6px" }}>{purpose}</p>
      {guide && <p className={styles.small} style={{ margin: 0 }}>{guide.why}</p>}

      {passport && (
        <p className={`${styles.notice} ${styles.success}`} style={{ margin: "14px 0 0" }}><strong>{t("Готово, когда:")}</strong> {passport.doneWhen}</p>
      )}

      {inputs.length > 0 && <>
        {head(t("Что нужно на входе"))}
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {inputs.map((input) => <li key={input.key} style={{ marginBottom: 4 }}><span aria-hidden="true" style={{ color: input.satisfied ? "var(--success, #128a5e)" : "var(--muted)", marginRight: 8 }}>{input.satisfied ? "✓" : "○"}</span>{input.title}{input.satisfied ? t(" — принят") : t(" — ещё не принят")}</li>)}
        </ul>
      </>}

      {passport && <>
        {head(t("Как проходит этап"))}
        <ol className={styles.list} style={{ margin: 0 }}>{passport.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      </>}

      {head(t("Результат"))}
      <p style={{ margin: 0 }}>{outcome}</p>

      {passport && passport.checks.length > 0 && <>
        {head(t("Что проверяет платформа"))}
        <ul className={styles.list} style={{ margin: 0 }}>{passport.checks.map((check) => <li key={check}>{check}</li>)}</ul>
        <p className={styles.small} style={{ margin: "6px 0 0" }}>{t("Блокирующие замечания не дают принять этап; остальные можно пропустить, объяснив почему.")}</p>
      </>}

      {acceptance.length > 0 && <>
        {head(t("Как принимают этап"))}
        <ul className={styles.list} style={{ margin: 0 }}>{acceptance.map((item) => <li key={item}>{item}</li>)}</ul>
      </>}

      {guide && <>
        {head(t("Что дальше"))}
        <p style={{ margin: 0 }}>{guide.next}</p>
        {head(t("Пример"))}
        <p style={{ margin: 0 }}>{guide.example}</p>
        {guide.terms.length > 0 && <>
          {head(t("Слова этапа"))}
          <dl style={{ margin: 0 }}>
            {guide.terms.map((item) => (
              <div key={item.term} style={{ marginBottom: 6 }}>
                <dt style={{ fontWeight: 600, display: "inline" }}>{item.term}</dt>
                <dd className={styles.small} style={{ display: "inline", margin: 0 }}>{" — "}{item.meaning}</dd>
              </div>
            ))}
          </dl>
        </>}
      </>}
    </details>
  );
}
