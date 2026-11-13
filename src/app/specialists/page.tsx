"use client";

import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { formatTenge } from "@/lib/money";
import styles from "../projects/journey.module.css";
import AppHeader from "../app-header";
import { Rating, inviteTarget } from "./stars";

type Card = { id: string; displayName: string; headline: string; city: string | null; hourlyRate: number | null; stages: Array<{ key: string; title: string }>; rating: number | null; reviews: number; completedStages: number; works?: number };
type Catalog = { specialists: Card[]; stages: Array<{ key: string; title: string }>; query?: string };

/** Catalog of specialists. Opened from a stage («Найти в каталоге»), it keeps that stage so the owner can invite in one tap. */
export default function SpecialistsPage() {
  const router = useRouter();
  const [stage, setStage] = useState<string | null | undefined>(undefined);
  const [target, setTarget] = useState<{ projectId: string; stageKey: string } | null>(null);
  const [data, setData] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const found = inviteTarget();
    setTarget(found);
    const params = new URLSearchParams(window.location.search);
    setStage(found?.stageKey ?? params.get("stage"));
    const q = params.get("q") ?? "";
    setDraft(q); setQuery(q);
  }, []);

  useEffect(() => {
    if (stage === undefined) return;
    setData(null); setError("");
    const params = new URLSearchParams();
    if (stage) params.set("stage", stage);
    if (query.trim()) params.set("q", query.trim());
    api<Catalog>(`/specialists${params.size ? `?${params}` : ""}`).then(setData).catch((caught) => {
      if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
      setError(explainError(caught));
    });
  }, [stage, query, router]);

  const keep = target ? `?invite=1&project=${target.projectId}&stage=${target.stageKey}` : "";
  return (
    <div className={styles.shell}>
      <AppHeader back={target ? { href: `/projects/${target.projectId}/stages/${target.stageKey}`, label: t("← К этапу") } : { href: "/projects", label: t("← Проекты") }} title={t("Специалисты")} />
      <main className={styles.container}>
        <p className={styles.kicker}>{t("Каталог")}</p>
        <h1 className={styles.h1}>{t("Специалисты")}</h1>
        <p className={styles.muted} style={{ marginTop: 0 }}>{t("Люди, которые направляют ИИ на этапах и доводят результат. Оценки ставят владельцы проектов после того, как приняли работу.")}</p>
        {target && <p className={`${styles.notice} ${styles.info}`}>{t("Выберите специалиста — условия работы вы зададите на странице этапа перед отправкой приглашения.")}</p>}
        <form role="search" className={styles.row} style={{ margin: "0 0 12px", flexWrap: "nowrap" }} onSubmit={(event) => { event.preventDefault(); setQuery(draft); }}>
          <input className={styles.input} type="search" enterKeyHint="search" value={draft} maxLength={80} onChange={(event) => { setDraft(event.target.value); if (!event.target.value) setQuery(""); }}
            placeholder={t("Например: тексты для кафе, Алматы")} aria-label={t("Поиск по карточкам")} style={{ flex: 1, minWidth: 0 }} />
          <button className={styles.secondary} style={{ flexShrink: 0 }}>{t("Найти")}</button>
        </form>
        {data && (
          <div className={styles.chips} role="group" aria-label={t("Этап")} style={{ margin: "0 0 18px" }}>
            {!target && <button className={styles.choice} style={{ width: "auto" }} aria-pressed={!stage} onClick={() => setStage(null)}>{t("Все этапы")}</button>}
            {data.stages.filter((item) => !target || item.key === target.stageKey).map((item) => (
              <button key={item.key} className={styles.choice} style={{ width: "auto" }} aria-pressed={stage === item.key} onClick={() => !target && setStage(item.key)}>{t(item.title)}</button>
            ))}
          </div>
        )}
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!data && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}
        {data && data.specialists.length === 0 && (
          <section className={styles.card}>
            <p style={{ margin: 0 }}>{query.trim()
              ? t("По запросу «{0}» никого не нашли. Ищем все слова сразу по имени, описанию, городу и работам — попробуйте меньше слов.", [query.trim()])
              : t("Пока здесь никого нет. Если вы знаете специалиста, пригласите его по почте на странице этапа.")}</p>
          </section>
        )}
        {data && query.trim() && data.specialists.length > 0 && <p className={styles.small} role="status">{t("Найдено: {0}", [data.specialists.length])}</p>}
        {data?.specialists.map((card) => (
          <a key={card.id} href={`/specialists/${card.id}${keep}`} className={styles.card} style={{ display: "block", color: "inherit", textDecoration: "none" }}>
            <div className={styles.row} style={{ justifyContent: "space-between" }}>
              <strong style={{ fontSize: 19 }}>{card.displayName}</strong>
              <span className={styles.small}><Rating rating={card.rating} reviews={card.reviews} /></span>
            </div>
            <p style={{ margin: "6px 0 8px" }}>{card.headline}</p>
            <div className={styles.chips}>{card.stages.map((item) => <span key={item.key} className={`${styles.chip} ${styles.closed}`}>{t(item.title)}</span>)}</div>
            <p className={styles.small} style={{ margin: "8px 0 0" }}>
              {t("Принято этапов: {0}", [card.completedStages])}
              {card.works ? t(" · работ в портфолио: {0}", [card.works]) : ""}
              {card.hourlyRate !== null ? t(" · от {0} в час", [formatTenge(card.hourlyRate)]) : ""}
              {card.city ? ` · ${card.city}` : ""}
            </p>
          </a>
        ))}
        <p className={styles.small}><a href="/account/specialist">{t("Вы специалист? Разместите свою карточку →")}</a></p>
      </main>
    </div>
  );
}
