"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { formatTenge } from "@/lib/money";
import styles from "../../projects/journey.module.css";
import AppHeader from "../../app-header";
import { Rating, Stars, inviteTarget } from "../stars";

type Review = { id: string; rating: number; text: string | null; reply: string | null; createdAt: string; stageTitle: string; projectTypeTitle: string | null; canReply: boolean; reportStatus?: "none" | "pending" | "kept" | "hidden"; canReport?: boolean };
type Profile = {
  id: string; displayName: string; headline: string; about: string | null; city: string | null; hourlyRate: number | null; stages: Array<{ key: string; title: string }>;
  rating: number | null; reviewCount: number; reviews: Review[]; completedStages: number; own: boolean; published: boolean;
  portfolio?: Array<{ title: string; description: string | null; url: string | null; stageTitle: string | null; host: string | null }>;
};

export default function SpecialistPage() {
  const { profileId } = useParams<{ profileId: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [target, setTarget] = useState<{ projectId: string; stageKey: string } | null>(null);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => api<Profile>(`/specialists/${profileId}`).then(setProfile).catch((caught) => {
    if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
    setError(explainError(caught));
  }), [profileId, router]);
  useEffect(() => { setTarget(inviteTarget()); void load(); }, [load]);

  async function sendReply(reviewId: string) {
    setBusy(true); setError("");
    try { await api(`/me/reviews/${reviewId}/reply`, { method: "POST", body: JSON.stringify({ text: reply.trim() }) }); setReplyFor(null); setReply(""); await load(); }
    catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  async function sendReport(reviewId: string) {
    setBusy(true); setError("");
    try { await api(`/me/reviews/${reviewId}/report`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) }); setReportFor(null); setReason(""); await load(); }
    catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  const back = target ? `/specialists?invite=1&project=${target.projectId}&stage=${target.stageKey}` : "/specialists";
  const canInvite = target && profile && !profile.own && profile.published && profile.stages.some((item) => item.key === target.stageKey);
  return (
    <div className={styles.shell}>
      <AppHeader back={{ href: back, label: t("← Каталог") }} title={t("Специалист")} />
      <main className={styles.container}>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!profile && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}
        {profile && (
          <>
            {profile.own && !profile.published && <p className={`${styles.notice} ${styles.warn}`}>{t("Карточка скрыта: её видите только вы.")}{" "}<a href="/account/specialist">{t("Опубликовать →")}</a></p>}
            <p className={styles.kicker}>{profile.stages.map((item) => t(item.title)).join(" · ")}</p>
            <h1 className={styles.h1}>{profile.displayName}</h1>
            <p style={{ fontSize: 18, marginTop: 0 }}>{profile.headline}</p>
            <p className={styles.muted}>
              <Rating rating={profile.rating} reviews={profile.reviewCount} />{" · "}{t("Принято этапов: {0}", [profile.completedStages])}
              {profile.hourlyRate !== null ? t(" · от {0} в час", [formatTenge(profile.hourlyRate)]) : ""}{profile.city ? ` · ${profile.city}` : ""}
            </p>
            {canInvite && (
              <a className={`${styles.button} ${styles.block}`} style={{ margin: "0 0 18px" }}
                href={`/projects/${target!.projectId}/stages/${target!.stageKey}?inviteProfile=${profile.id}&inviteName=${encodeURIComponent(profile.displayName)}`}>{t("Пригласить на этап")}</a>
            )}
            {profile.own && <p><a className={styles.secondary} href="/account/specialist">{t("Изменить карточку")}</a></p>}
            {profile.about && <section className={styles.card}><p className={styles.cardTitle}>{t("О себе")}</p><p style={{ margin: 0, whiteSpace: "pre-line" }}>{profile.about}</p></section>}
            {Boolean(profile.portfolio?.length) && (
              <section className={styles.card} aria-labelledby="works-title">
                <p id="works-title" className={styles.cardTitle}>{t("Примеры работ")}</p>
                <ul className={styles.versions}>
                  {profile.portfolio!.map((work, index) => (
                    <li key={index}>
                      <strong>{work.title}</strong>{work.stageTitle ? <span className={styles.small}>{" · "}{t(work.stageTitle)}</span> : null}
                      {work.description && <p style={{ margin: "4px 0 0", whiteSpace: "pre-line" }}>{work.description}</p>}
                      {/* The link is the specialist's word: no referrer, no search weight, a new tab. */}
                      {work.url && <p style={{ margin: "4px 0 0" }}><a href={work.url} target="_blank" rel="noopener noreferrer nofollow ugc">{work.host} ↗</a></p>}
                    </li>
                  ))}
                </ul>
                <p className={styles.small}>{t("Ссылки указал специалист, BuildPath их не проверял.")}</p>
              </section>
            )}
            <section className={styles.card} aria-labelledby="reviews-title">
              <p id="reviews-title" className={styles.cardTitle}>{t("Отзывы владельцев")}</p>
              {profile.reviews.length === 0 && <p style={{ margin: 0 }} className={styles.muted}>{t("Отзывов пока нет. Их оставляют владельцы проектов после приёмки этапа.")}</p>}
              <ul className={styles.versions}>
                {profile.reviews.map((review) => (
                  <li key={review.id}>
                    <div className={styles.row}><Stars value={review.rating} /><span className={styles.small}>{t(review.stageTitle)}{review.projectTypeTitle ? ` · ${t(review.projectTypeTitle)}` : ""} · {new Date(review.createdAt).toLocaleDateString(dateLocale())}</span></div>
                    {review.text && <p style={{ margin: "6px 0 0", whiteSpace: "pre-line" }}>{review.text}</p>}
                    {review.reply && <p className={styles.small} style={{ margin: "6px 0 0", paddingLeft: 12, borderLeft: "3px solid var(--line)" }}><strong>{t("Ответ специалиста:")}</strong> {review.reply}</p>}
                    {review.canReply && replyFor !== review.id && <button className={styles.ghost} onClick={() => { setReplyFor(review.id); setReply(""); }}>{t("Ответить")}</button>}
                    {review.reportStatus === "pending" && <p className={styles.small} style={{ margin: "6px 0 0" }}>{t("Вы пожаловались на этот отзыв — поддержка проверит его.")}</p>}
                    {review.reportStatus === "kept" && <p className={styles.small} style={{ margin: "6px 0 0" }}>{t("Поддержка проверила отзыв и оставила его.")}</p>}
                    {review.canReport && reportFor !== review.id && replyFor !== review.id && <button className={styles.ghost} onClick={() => { setReportFor(review.id); setReason(""); }}>{t("Пожаловаться")}</button>}
                    {reportFor === review.id && (
                      <div style={{ marginTop: 8 }}>
                        <textarea className={styles.textarea} style={{ minHeight: 80 }} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} aria-label={t("Что не так с отзывом")} placeholder={t("Что не так с отзывом")} />
                        <p className={styles.why}>{t("Например: отзыв оскорбительный или про другую работу. Поддержка проверит его по истории этапа и скроет, если вы правы. Пожаловаться можно один раз; несогласие с оценкой — не причина.")}</p>
                        <div className={styles.row}>
                          <button className={styles.button} disabled={busy || reason.trim().length < 10} onClick={() => void sendReport(review.id)}>{busy ? t("Отправляем…") : t("Отправить жалобу")}</button>
                          <button className={styles.ghost} onClick={() => setReportFor(null)}>{t("Отмена")}</button>
                        </div>
                      </div>
                    )}
                    {replyFor === review.id && (
                      <div style={{ marginTop: 8 }}>
                        <textarea className={styles.textarea} style={{ minHeight: 80 }} maxLength={1000} value={reply} onChange={(event) => setReply(event.target.value)} aria-label={t("Ваш ответ")} />
                        <p className={styles.why}>{t("Ответить можно один раз, ответ увидят все.")}</p>
                        <div className={styles.row}>
                          <button className={styles.button} disabled={busy || reply.trim().length < 2} onClick={() => void sendReply(review.id)}>{busy ? t("Отправляем…") : t("Отправить ответ")}</button>
                          <button className={styles.ghost} onClick={() => setReplyFor(null)}>{t("Отмена")}</button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
