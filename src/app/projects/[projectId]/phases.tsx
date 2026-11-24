"use client";

// The common path from an idea to a working product, phase by phase: where the owner is and how much is left.
import { t } from "@/lib/i18n";
import type { Phase } from "@/lib/journey";
import styles from "../journey.module.css";

const tone = { done: "done", current: "active", upcoming: "closed" } as const;

export default function PhaseStrip({ phases, onOpen }: { phases: Phase[]; onOpen: (phase: Phase) => void }) {
  if (!phases.length) return null;
  const current = phases.find((phase) => phase.status === "current");
  return (
    <section aria-labelledby="phases-title" className={styles.phases}>
      <p id="phases-title" className={styles.srOnly}>{t("Путь проекта")}</p>
      <ol className={styles.stepper}>
        {phases.map((phase, index) => (
          <li key={phase.key} className={styles[tone[phase.status]]}>
            <button type="button" onClick={() => onOpen(phase)} aria-current={phase.status === "current" ? "step" : undefined}>
              <span className={styles.stepDot} aria-hidden="true">{phase.status === "done" ? "✓" : index + 1}</span>
              <span className={styles.stepText}>
                <b>{phase.title}</b>
                <small>{phase.status === "done" ? t("Готово") : phase.kind === "stages" ? t("{0} из {1} этапов", [phase.done, phase.total]) : phase.status === "current" ? t("Сейчас") : t("Впереди")}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {current && <p className={styles.small} style={{ margin: "8px 0 0" }}>{t("Сейчас: {0} — {1}", [current.title, current.short])}</p>}
    </section>
  );
}
