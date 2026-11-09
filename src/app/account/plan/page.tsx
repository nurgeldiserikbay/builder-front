"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../projects/journey.module.css";

type Overview = {
  plan: { key: string; title: string; specialists: boolean; validUntil: string | null; expired: boolean; expiredPlanTitle: string | null };
  usage: Array<{ key: string; title: string; explanation: string; used: number; limit: number }>;
  periodStart: string;
  plans: Array<{ key: string; title: string; description: string; limits: { projects: number; aiPerMonth: number; liveSites: number }; specialists: boolean; price: string | null }>;
  upgrade: { contactUrl: string | null };
};

export default function PlanPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Overview>("/me/plan").then(setData).catch((caught) => {
      if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
      setError(explainError(caught));
    });
  }, [router]);

  return (
    <div className={styles.shell}>
      <header className={styles.top}><div className={styles.topInner}>
        <a className={styles.back} href="/projects">← Проекты</a>
        <span className={styles.topTitle}>Тариф</span>
      </div></header>
      <main className={styles.container}>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!data && !error && <p className={styles.muted}>Загружаем…</p>}
        {data && (
          <>
            <p className={styles.kicker}>Ваш тариф</p>
            <h1 className={styles.h1}>{data.plan.title}</h1>
            {data.plan.validUntil && <p className={styles.small} style={{ marginTop: 0 }}>Действует до {new Date(data.plan.validUntil).toLocaleDateString("ru-RU", { dateStyle: "long" })}.</p>}
            {data.plan.expired && <p className={`${styles.notice} ${styles.warn}`}>Срок тарифа «{data.plan.expiredPlanTitle}» закончился, сейчас действуют лимиты бесплатного тарифа. Ваши проекты и сайты сохранены.</p>}

            <section className={styles.card} aria-label="Использование">
              <p className={styles.cardTitle}>Сколько уже использовано</p>
              {data.usage.map((item) => {
                const percent = Math.min(100, Math.round((item.used / Math.max(1, item.limit)) * 100));
                return (
                  <div key={item.key} style={{ marginBottom: 14 }}>
                    <div className={styles.row}><strong>{item.title}</strong><div className={styles.spacer} /><span>{item.used} из {item.limit}</span></div>
                    <div className={styles.progress} role="progressbar" aria-label={item.title} aria-valuemin={0} aria-valuemax={item.limit} aria-valuenow={item.used}>
                      <span style={{ width: `${percent}%`, background: percent >= 100 ? "#b42323" : percent >= 80 ? "#c98a00" : undefined }} />
                    </div>
                    <p className={styles.small} style={{ margin: 0 }}>{item.explanation}</p>
                  </div>
                );
              })}
              <p className={styles.small} style={{ margin: 0 }}>Когда лимит исчерпан, всё созданное продолжает работать: опубликованные сайты открываются, заявки приходят. Нельзя только создавать новое сверх лимита.</p>
            </section>

            <h2 className={styles.h2}>Тарифы</h2>
            {data.plans.map((plan) => (
              <article key={plan.key} className={styles.card} style={plan.key === data.plan.key ? { borderColor: "#255b42", borderWidth: 2 } : undefined}>
                <div className={styles.row}>
                  <p className={styles.cardTitle} style={{ margin: 0 }}>{plan.title}</p>
                  <div className={styles.spacer} />
                  <strong>{plan.price ?? "Цена по запросу"}</strong>
                </div>
                <p style={{ margin: "6px 0 8px" }}>{plan.description}</p>
                <ul className={styles.list}>
                  <li>Проектов: до {plan.limits.projects}</li>
                  <li>Запросов к ИИ в месяц: до {plan.limits.aiPerMonth}</li>
                  <li>Опубликованных сайтов: до {plan.limits.liveSites}</li>
                  <li>{plan.specialists ? "Можно приглашать специалистов на этапы" : "Без приглашения специалистов"}</li>
                </ul>
                {plan.key === data.plan.key && <p className={styles.small} style={{ marginBottom: 0 }}>Это ваш тариф.</p>}
              </article>
            ))}
            <section className={`${styles.notice} ${styles.info}`}>
              Оплата картой прямо в BuildPath появится позже. Сейчас тариф подключается после оплаты по счёту — напишите нам, и мы включим его в течение рабочего дня.
              {data.upgrade.contactUrl && <div style={{ marginTop: 10 }}><a className={styles.button} href={data.upgrade.contactUrl} target="_blank" rel="noopener">Написать о тарифе</a></div>}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
