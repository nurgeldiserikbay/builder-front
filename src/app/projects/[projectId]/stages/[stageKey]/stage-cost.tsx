"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { formatTenge } from "@/lib/money";
import styles from "../../../journey.module.css";

type StageBudget = {
  key: string; done: boolean; aiUsed: boolean; spent: number; requests: number;
  planned: { requestsMin: number; requestsMax: number; min: number; max: number } | null;
  expectedRequests?: { min: number; max: number };
  specialists?: { count: number; planned: number; openEnded?: number; due: number; paid: number } | null;
};
type Budget = { pricingConfigured: boolean; stages: StageBudget[]; limit: { left: number } | null };

/**
 * «Стоимость этапа» beside the work: what the AI usually costs here (before anyone starts), what was already spent,
 * and — for those who decide — what the specialists on this stage may cost under their terms and what is due or paid.
 */
export default function StageCost({ projectId, stageKey }: { projectId: string; stageKey: string }) {
  const [budget, setBudget] = useState<Budget | null>(null);
  useEffect(() => { api<Budget>(`/projects/${projectId}/budget`).then(setBudget).catch(() => undefined); }, [projectId, stageKey]);
  const stage = budget?.stages.find((item) => item.key === stageKey);
  if (!budget || !stage) return null;
  const people = stage.specialists ?? null;
  const expected = stage.planned ? { min: stage.planned.requestsMin, max: stage.planned.requestsMax } : stage.expectedRequests ?? null;
  const over = stage.planned && stage.spent > stage.planned.max;

  return (
    <section className={styles.card} aria-labelledby="stage-cost-title">
      <h2 id="stage-cost-title" className={styles.h2}>{t("Стоимость этапа")}</h2>
      <dl className={styles.facts}>
        {stage.aiUsed ? (
          <>
            <dt>{t("ИИ по смете")}</dt>
            <dd>
              {stage.planned ? `${formatTenge(stage.planned.min)} – ${formatTenge(stage.planned.max)}` : t("цены ещё не заданы")}
              {expected && <span className={styles.cellSub}>{t("обычно {0}–{1} запросов", [expected.min, expected.max])}</span>}
            </dd>
            <dt>{t("ИИ потрачено")}</dt>
            <dd style={over ? { color: "var(--attention)" } : undefined}>
              {budget.pricingConfigured ? formatTenge(stage.spent) : "—"}
              <span className={styles.cellSub}>{t("запросов: {0}", [stage.requests])}</span>
            </dd>
          </>
        ) : (
          <><dt>{t("ИИ")}</dt><dd>{t("на этом этапе не работает")}</dd></>
        )}
        {people && (
          <>
            <dt>{t("Специалисты")}</dt>
            <dd>
              {people.count === 0 ? t("не приглашены") : people.openEnded ? (people.planned > 0 ? t("от {0}, часть — почасово без лимита", [formatTenge(people.planned)]) : t("почасово, без лимита часов")) : t("до {0} по условиям", [formatTenge(people.planned)])}
              {people.count > 0 && <span className={styles.cellSub}>{people.due > 0 ? t("к оплате {0}", [formatTenge(people.due)]) + " · " : ""}{t("оплачено {0}", [formatTenge(people.paid)])}</span>}
            </dd>
          </>
        )}
      </dl>
      <p className={styles.small} style={{ margin: "10px 0 0" }}>
        {stage.done ? t("Этап принят — расход больше не растёт, если его не открыть снова.")
          : over ? t("Расход вышел за смету: так бывает, когда черновик переделывают много раз. Короткие точные замечания экономят запросы.")
          : t("Смета — сколько обычно уходит на этот этап. Специалисту платят только за принятую работу.")}
      </p>
    </section>
  );
}
