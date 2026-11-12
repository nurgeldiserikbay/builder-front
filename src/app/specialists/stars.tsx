import { t } from "@/lib/i18n";

/** «★ 4.7 · 12 отзывов» or «Пока без отзывов». */
export function Rating({ rating, reviews }: { rating: number | null; reviews: number }) {
  if (rating === null) return <span>{t("Пока без отзывов")}</span>;
  return <span aria-label={t("Оценка {0} из 5, отзывов: {1}", [rating, reviews])}><span aria-hidden="true" style={{ color: "#c98a00" }}>★</span> <strong>{rating.toFixed(1)}</strong> · {t("отзывов: {0}", [reviews])}</span>;
}

export function Stars({ value }: { value: number }) {
  return <span aria-label={t("Оценка {0} из 5", [value])} style={{ color: "#c98a00", letterSpacing: 2 }}>{"★".repeat(value)}<span style={{ color: "var(--line)" }}>{"★".repeat(5 - value)}</span></span>;
}

/** Where to come back after picking someone: the stage the owner was inviting to. */
export function inviteTarget(): { projectId: string; stageKey: string } | null {
  if (typeof window === "undefined") return null;
  const query = new URLSearchParams(window.location.search);
  const projectId = query.get("project");
  const stageKey = query.get("stage");
  return projectId && stageKey && /^[0-9a-f-]{36}$/i.test(projectId) && /^[a-z]+$/.test(stageKey) && query.get("invite") === "1" ? { projectId, stageKey } : null;
}
