"use client";

import { t } from "@/lib/i18n";
import { statusTone, type JourneyStage } from "@/lib/journey";
import styles from "../journey.module.css";

/** Rows of the stage graph: a stage sits one row below the deepest stage it depends on. Stages in one row can run in parallel. */
export function mapRows(stages: JourneyStage[]): JourneyStage[][] {
  const visible = new Map(stages.map((stage) => [stage.key, stage]));
  const depth = new Map<string, number>();
  const depthOf = (stage: JourneyStage): number => {
    const known = depth.get(stage.key);
    if (known !== undefined) return known;
    const inputs = stage.inputs.map((input) => visible.get(input.key)).filter((item): item is JourneyStage => Boolean(item));
    const value = inputs.length ? 1 + Math.max(...inputs.map(depthOf)) : 0;
    depth.set(stage.key, value);
    return value;
  };
  const rows: JourneyStage[][] = [];
  for (const stage of stages) (rows[depthOf(stage)] ??= []).push(stage);
  return rows.filter(Boolean);
}

function who(stage: JourneyStage, aiOn: boolean): string {
  const lead = stage.people?.lead;
  const extra = stage.people?.consultants ? t(" · консультантов: {0}", [stage.people.consultants]) : "";
  if (!lead || lead.kind === "owner") return t("Ведёте вы{0}{1}", [aiOn && stage.aiLevel !== "none" ? t(" с ИИ") : "", extra]);
  if (lead.kind === "you") return t("Ваш этап");
  if (lead.kind === "invited") return t("Ждём специалиста: {0}{1}", [lead.name ?? "", extra]);
  return t("Специалист: {0}{1}", [lead.name ?? "", extra]);
}

/** Lines from every stage in the previous row to the stages in this row that depend on it. */
function Connectors({ from, to }: { from: JourneyStage[]; to: JourneyStage[] }) {
  const x = (index: number, count: number) => ((index + 0.5) / count) * 100;
  const lines: Array<{ x1: number; x2: number; changed: boolean }> = [];
  to.forEach((stage, target) => {
    from.forEach((source, origin) => {
      if (stage.inputs.some((input) => input.key === source.key)) lines.push({ x1: x(origin, from.length), x2: x(target, to.length), changed: Boolean(stage.changes?.incoming.some((item) => item.sourceKey === source.key)) });
    });
  });
  if (!lines.length) return <div style={{ height: 14 }} />;
  return (
    <svg className={styles.mapLinks} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      {lines.map((line, index) => (
        <path key={index} d={`M${line.x1} 0 C${line.x1} 14 ${line.x2} 14 ${line.x2} 28`} fill="none" stroke={line.changed ? "#c98a00" : "#b9c7bd"} strokeWidth={line.changed ? 2 : 1.5} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/** Project map: the stage graph with status, who leads each stage and what waits for the viewer. */
export default function ProjectMap({ projectId, stages, aiOn }: { projectId: string; stages: JourneyStage[]; aiOn: boolean }) {
  const rows = mapRows(stages);
  return (
    <div className={styles.map} role="list" aria-label={t("Карта проекта")}>
      {rows.map((row, rowIndex) => (
        <div key={row.map((stage) => stage.key).join()}>
          {rowIndex > 0 && <Connectors from={rows[rowIndex - 1]} to={row} />}
          <div className={styles.mapRow} style={{ gridTemplateColumns: `repeat(${row.length}, minmax(${row.length > 2 ? 150 : 0}px, 1fr))` }}>
            {row.map((stage) => {
              const tone = statusTone[stage.status];
              const locked = stage.status === "locked";
              const waiting = stage.inputs.filter((input) => !input.satisfied).map((input) => input.title);
              const version = stage.acceptedVersionNumber ?? stage.currentVersionNumber;
              return (
                <a key={stage.key} role="listitem" href={`/projects/${projectId}/stages/${stage.key}`} aria-disabled={locked}
                  className={`${styles.mapNode} ${styles[tone]} ${stage.needsYou ? styles.mapNodeAttention : ""}`}>
                  {stage.needsYou && <span className={styles.mapBadge}>{stage.needsYou}</span>}
                  {stage.contract && <span className={styles.mapContract}>{t("Контракт")}</span>}
                  <strong className={styles.mapTitle}>{tone === "done" ? "✓ " : ""}{stage.title}</strong>
                  <span className={`${styles.chip} ${styles[tone]}`}>{stage.statusLabel}{version ? t(" · версия {0}", [version]) : ""}</span>
                  <span className={styles.mapWho}>{locked && waiting.length ? t("Откроется после: {0}", [waiting.join(", ")]) : who(stage, aiOn)}</span>
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
