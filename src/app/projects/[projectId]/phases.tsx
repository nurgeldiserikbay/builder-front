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
      <p id="phases-title" className={styles.kicker} style={{ marginBottom: 6 }}>{t("Путь проекта")}</p>
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {phases.map((phase, index) => (
          <li key={phase.key} style={{ flex: "0 0 auto" }}>
            <button type="button" onClick={() => onOpen(phase)} aria-current={phase.status === "current" ? "step" : undefined}
              className={`${styles.chip} ${styles[tone[phase.status]]}`}
              style={{ marginTop: 0, cursor: "pointer", fontSize: 15, padding: "8px 12px", border: phase.status === "current" ? "2px solid currentColor" : undefined }}>
              {phase.status === "done" ? "✓ " : `${index + 1}. `}{phase.title}
              {phase.kind === "stages" && phase.status !== "done" && <span style={{ opacity: 0.75 }}>{" · "}{phase.done}/{phase.total}</span>}
            </button>
          </li>
        ))}
      </ol>
      {current && <p className={styles.small} style={{ margin: "6px 0 0" }}>{t("Сейчас: {0} — {1}", [current.title, current.short])}</p>}
    </section>
  );
}
