"use client";

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
      <p className={styles.kicker}>Деньги на ИИ</p>
      <h2 id="budget-title" className={styles.h2}>Смета и расход</h2>
      {!budget.pricingConfigured ? (
        <p style={{ margin: 0 }}>Цены на запросы к ИИ ещё не установлены, поэтому смету показать нельзя. Запросов сделано: {spent.requests}.</p>
      ) : (
        <>
          <p style={{ margin: "0 0 8px" }}>
            Весь проект по смете: <strong>{formatTenge(estimate!.min)} – {formatTenge(estimate!.max)}</strong>. Потрачено: <strong>{formatTenge(spent.total)}</strong> за {spent.requests} запросов.
          </p>
          <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share} aria-label="Потрачено от верхней границы сметы">
            <span style={{ width: `${share}%`, background: over ? "#c98a00" : undefined }} />
          </div>
          <p className={styles.small} style={{ margin: "6px 0 10px" }}>
            {over ? "Расход вышел за смету — так бывает, когда этап много раз переделывают. " : ""}
            Осталось по смете на непринятые этапы: {formatTenge(estimate!.remainingMin)} – {formatTenge(estimate!.remainingMax)}. Один запрос — около {formatTenge(budget.perRequest!)}.
            {spent.unpricedRequests > 0 ? ` ${spent.unpricedRequests} ранних запросов сделаны до установки цен и в расход не вошли.` : ""}
          </p>
          <details className={styles.details}>
            <summary>По этапам и участникам</summary>
            <ul className={styles.list}>
              {budget.stages.filter((stage) => stage.aiUsed).map((stage) => (
                <li key={stage.key}>
                  <strong>{stage.title}</strong>{stage.done ? " (принят)" : ""}: потрачено {formatTenge(stage.spent)} ({stage.requests} запр.)
                  {stage.planned ? ` · по смете ${formatTenge(stage.planned.min)} – ${formatTenge(stage.planned.max)}` : ""}
                </li>
              ))}
            </ul>
            {budget.participants.length > 0 && <ul className={styles.list}>{budget.participants.map((person) => <li key={person.id}>{person.name}: {formatTenge(person.spent)} ({person.requests} запр.)</li>)}</ul>}
            <p className={styles.small} style={{ margin: 0 }}>Смета — оценка: сколько обычно нужно запросов на этап, умноженное на цену запроса. <a href={`/projects/${projectId}/history`}>Все запросы →</a></p>
          </details>
        </>
      )}
    </section>
  );
}
