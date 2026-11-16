"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { statusTone, type Journey } from "@/lib/journey";
import styles from "../../../journey.module.css";

/** The project's route as a strip of stations: where this stage sits, what is done, what comes next. Tap a station to go there. */
export default function StageRoute({ projectId, stageKey }: { projectId: string; stageKey: string }) {
  const [stages, setStages] = useState<Journey["stages"]>([]);
  useEffect(() => {
    api<Journey>(`/projects/${projectId}/journey`).then((journey) => setStages(journey.stages)).catch(() => setStages([]));
  }, [projectId, stageKey]);
  const index = stages.findIndex((item) => item.key === stageKey);
  if (index < 0) return null;
  return (
    <nav className={styles.stageRoute} aria-label={t("Этап {0} из {1}", [index + 1, stages.length])}>
      <span className={styles.stageRouteLabel}>{t("Этап {0} из {1}", [index + 1, stages.length])}</span>
      <ol>
        {stages.map((item, position) => (
          <li key={item.key} className={`${styles[statusTone[item.status]]} ${position === index ? styles.routeHere : ""}`}>
            <a href={`/projects/${projectId}/stages/${item.key}`} aria-current={position === index ? "step" : undefined} title={`${item.title} — ${item.statusLabel}`}>
              <span className={styles.srOnly}>{item.title}: {item.statusLabel}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
