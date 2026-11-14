"use client";

import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../projects/journey.module.css";
import AppHeader from "../../app-header";

type Invite = { projectName: string; invitedBy: string | null; role: string; roleTitle: string; roleExplanation: string; expired: boolean; revoked: boolean; accepted: boolean; ownership?: boolean };

/** Invitation to a project team: what the role allows, then joining with the invited address. */
export default function TeamInvitePage() {
  const router = useRouter();
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Invite>(`/team-invites/${token}`).then(setInvite).catch((caught) => setError(explainError(caught)));
    api("/me").then(() => setSignedIn(true)).catch(() => setSignedIn(false));
  }, [token]);

  async function accept() {
    setBusy(true); setError("");
    try {
      const result = await api<{ projectId: string; ownershipOffered?: boolean }>(`/team-invites/${token}/accept`, { method: "POST" });
      // A hand-over: straight to the team tab, where the offer is waiting.
      router.replace(`/projects/${result.projectId}${result.ownershipOffered ? "#team" : ""}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) setSignedIn(false);
      setError(explainError(caught));
      setBusy(false);
    }
  }

  const loginHref = `/login?next=${encodeURIComponent(`/team-invite/${token}`)}`;
  const unavailable = invite && (invite.expired || invite.revoked || invite.accepted);

  return (
    <div className={styles.shell}>
      <AppHeader minimal />
      <main className={styles.container}>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!invite && !error && <p className={styles.muted}>{t("Загружаем приглашение…")}</p>}
        {invite && (
          <>
            <p className={styles.kicker}>{t("Приглашение в команду")}</p>
            <h1 className={styles.h1}>{invite.invitedBy ? t("{0} приглашает вас в проект «{1}»", [invite.invitedBy, invite.projectName]) : t("Вас приглашают в проект «{0}»", [invite.projectName])}</h1>
            {invite.ownership && (
              <section className={`${styles.notice} ${styles.info}`}>
                <p style={{ margin: "0 0 6px" }}><strong>{t("Вам предлагают стать владельцем этого проекта.")}</strong></p>
                <p style={{ margin: 0 }}>{t("Сначала вы войдёте в команду администратором. Затем во вкладке «Команда» увидите условия передачи и решите: принять проект в свой аккаунт или отказаться. Пока вы не согласились, проект остаётся у прежнего владельца.")}</p>
              </section>
            )}
            <section className={styles.card}>
              <p className={styles.cardTitle}>{t("Ваша роль:")}{" "}{invite.roleTitle}</p>
              <p style={{ margin: 0 }}>{invite.roleExplanation}</p>
              <p className={styles.small} style={{ marginTop: 10 }}>{t("Владелец проекта может изменить роль или закрыть доступ. Материалы проекта принадлежат владельцу.")}</p>
            </section>
            {unavailable && <p className={`${styles.notice} ${styles.warn}`}>{invite.expired ? t("Срок приглашения истёк. Попросите владельца проекта прислать новое.") : t("Приглашение больше не действует.")}</p>}
            {!unavailable && (signedIn === false ? (
              <section className={styles.card}>
                <p style={{ margin: "0 0 10px" }}>{t("Войдите или зарегистрируйтесь с той почтой, на которую пришло приглашение, затем вернитесь по этой же ссылке.")}</p>
                <a className={`${styles.button} ${styles.block}`} href={loginHref}>{t("Войти или зарегистрироваться")}</a>
              </section>
            ) : (
              <button className={`${styles.button} ${styles.block}`} disabled={busy || signedIn === null} onClick={accept}>{busy ? t("Подключаем…") : t("Присоединиться к команде")}</button>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
