"use client";

import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatTenge } from "@/lib/money";
import styles from "../journey.module.css";

type Budget = {
  pricingConfigured: boolean; perRequest: number | null;
  estimate: { min: number; max: number; remainingMin: number; remainingMax: number; basedOnRequests: number } | null;
  spent: { total: number; requests: number; unpricedRequests: number };
  stages: Array<{ key: string; title: string; done: boolean; aiUsed: boolean; spent: number; requests: number; planned: { requestsMin: number; requestsMax: number; min: number; max: number } | null }>;
  participants: Array<{ id: string; name: string; spent: number; requests: number }>;
  specialists: { specialists: number; planned: number; due: number; paid: number } | null;
};

/** Estimate of AI spending for the project and what has been spent, by stage and by participant. */
export default function BudgetCard({ projectId }: { projectId: string }) {
  const [budget, setBudget] = useState<Budget | null>(null);
  useEffect(() => { api<Budget>(`/projects/${projectId}/budget`).then(setBudget).catch(() => undefined); }, [projectId]);
  if (!budget) return null;
  const { estimate, spent } = budget;
  const over = estimate && spent.total > estimate.max;
  const share = estimate && estimate.max > 0 ? Math.min(100, Math.round((spent.total / estimate.max) * 100)) : 0;

  return (
    <section className={styles.card} aria-labelledby="budget-title">
      <p className={styles.kicker}>{t("Деньги на проект")}</p>
      <h2 id="budget-title" className={styles.h2}>{t("Смета и расход")}</h2>
      {budget.specialists && budget.specialists.specialists > 0 && (
        <p style={{ margin: "0 0 10px" }}>
          {t("Специалисты (")}{budget.specialists.specialists}{t("): по условиям — до")}{" "}<strong>{formatTenge(budget.specialists.planned)}</strong>.
          {budget.specialists.due > 0 ? <>{" "}{t("К оплате за принятые этапы:")}{" "}<strong>{formatTenge(budget.specialists.due)}</strong>.</> : null}
          {budget.specialists.paid > 0 ? t(" Оплачено: {0}.", [formatTenge(budget.specialists.paid)]) : ""}
          <span className={styles.small} style={{ display: "block" }}>{t("Начисляется только когда вы принимаете этап; время и оплату смотрите на странице этапа.")}</span>
        </p>
      )}
      {!budget.pricingConfigured ? (
        <p style={{ margin: 0 }}>{t("ИИ: цены на запросы ещё не установлены, поэтому смету показать нельзя. Запросов сделано:")}{" "}{spent.requests}.</p>
      ) : (
        <>
          <p style={{ margin: "0 0 8px" }}>
            {t("ИИ на весь проект по смете:")}{" "}<strong>{formatTenge(estimate!.min)} – {formatTenge(estimate!.max)}</strong>{t(". Потрачено:")}{" "}<strong>{formatTenge(spent.total)}</strong>{" "}{t("за")}{" "}{spent.requests}{" "}{t("запросов.")}
          </p>
          <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share} aria-label={t("Потрачено от верхней границы сметы")}>
            <span style={{ width: `${share}%`, background: over ? "#c98a00" : undefined }} />
          </div>
          <p className={styles.small} style={{ margin: "6px 0 10px" }}>
            {over ? t("Расход вышел за смету — так бывает, когда этап много раз переделывают. ") : ""}
            {t("Осталось по смете на непринятые этапы:")}{" "}{formatTenge(estimate!.remainingMin)} – {formatTenge(estimate!.remainingMax)}{t(". Один запрос — около")}{" "}{formatTenge(budget.perRequest!)}.
            {spent.unpricedRequests > 0 ? t(" {0} ранних запросов сделаны до установки цен и в расход не вошли.", [spent.unpricedRequests]) : ""}
          </p>
          <details className={styles.details}>
            <summary>{t("По этапам и участникам")}</summary>
            <ul className={styles.list}>
              {budget.stages.filter((stage) => stage.aiUsed).map((stage) => (
                <li key={stage.key}>
                  <strong>{stage.title}</strong>{stage.done ? t(" (принят)") : ""}{t(": потрачено")}{" "}{formatTenge(stage.spent)} ({stage.requests}{" "}{t("запр.)")}
                  {stage.planned ? t(" · по смете {0} – {1}", [formatTenge(stage.planned.min), formatTenge(stage.planned.max)]) : ""}
                </li>
              ))}
            </ul>
            {budget.participants.length > 0 && <ul className={styles.list}>{budget.participants.map((person) => <li key={person.id}>{person.name}: {formatTenge(person.spent)} ({person.requests}{" "}{t("запр.)")}</li>)}</ul>}
            <p className={styles.small} style={{ margin: 0 }}>{t("Смета — оценка: сколько обычно нужно запросов на этап, умноженное на цену запроса.")}{" "}<a href={`/projects/${projectId}/history`}>{t("Все запросы →")}</a></p>
          </details>
        </>
      )}
    </section>
  );
}
