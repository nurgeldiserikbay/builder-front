"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../projects/journey.module.css";

type Invite = {
  projectName: string; invitedBy: string; stageKey: string; stageTitle: string; stagePurpose: string; role: "lead" | "consultant"; roleTitle: string; roleExplanation: string;
  can: string[]; cannot: string[]; afterAcceptance: string; aiBudget: number | null; email: string; status: string; expired: boolean; projectId: string | null; termsText: string; timeRules: string[];
};

export default function InvitePage() {
  const router = useRouter();
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Invite>(`/invites/${token}`).then(setInvite).catch((caught) => setError(explainError(caught)));
    api("/me").then(() => setSignedIn(true)).catch(() => setSignedIn(false));
  }, [token]);

  async function accept() {
    setBusy(true); setError("");
    try {
      const result = await api<{ projectId: string; stageKey: string }>(`/invites/${token}/accept`, { method: "POST" });
      router.replace(`/projects/${result.projectId}/stages/${result.stageKey}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) setSignedIn(false);
      setError(explainError(caught));
      setBusy(false);
    }
  }

  const loginHref = `/login?next=${encodeURIComponent(`/invite/${token}`)}`;
  const unavailable = invite && (invite.expired || invite.status === "revoked" || invite.status === "completed");

  return (
    <div className={styles.shell}>
      <header className={styles.top}><div className={styles.topInner}><a className={styles.brand} href="/"><span aria-hidden="true">B</span>BuildPath</a></div></header>
      <main className={styles.container}>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!invite && !error && <p className={styles.muted}>Загружаем приглашение…</p>}
        {invite && (
          <>
            <p className={styles.kicker}>Приглашение</p>
            <h1 className={styles.h1}>{invite.invitedBy} приглашает вас в проект «{invite.projectName}»</h1>
            <section className={styles.card}>
              <p className={styles.cardTitle}>Этап «{invite.stageTitle}» · {invite.roleTitle}</p>
              <p style={{ margin: "0 0 8px" }}>{invite.roleExplanation}</p>
              <p className={styles.small} style={{ margin: 0 }}>Об этапе: {invite.stagePurpose}</p>
            </section>
            <section className={styles.card}>
              <p className={styles.cardTitle}>Что вам будет доступно</p>
              <ul className={styles.list}>{invite.can.map((item) => <li key={item}>{item}</li>)}</ul>
              {invite.role === "lead" && <p className={styles.small}>{invite.aiBudget === null ? "Запросы к ИИ — в пределах дневного лимита проекта. Их оплачивает владелец." : `Запросов к ИИ: до ${invite.aiBudget}. Их оплачивает владелец проекта.`}</p>}
              <p className={styles.cardTitle} style={{ marginTop: 14 }}>Что будет недоступно</p>
              <ul className={styles.list}>{invite.cannot.map((item) => <li key={item}>{item}</li>)}</ul>
              <div className={`${styles.notice} ${styles.info}`} style={{ marginTop: 12 }}>
                <strong>Оплата</strong>
                <p style={{ margin: "4px 0 6px" }}>{invite.termsText}</p>
                <strong>Как считается время</strong>
                <ul className={styles.list}>{invite.timeRules.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              <p className={styles.small} style={{ marginTop: 12 }}>{invite.afterAcceptance} Результаты этапа принадлежат владельцу проекта.</p>
            </section>

            {invite.status === "active" && invite.projectId && <a className={`${styles.button} ${styles.block}`} href={`/projects/${invite.projectId}/stages/${invite.stageKey}`}>Открыть этап</a>}
            {unavailable && <p className={`${styles.notice} ${styles.warn}`}>{invite.expired ? "Срок приглашения истёк. Попросите владельца проекта прислать новое." : "Приглашение больше не действует."}</p>}
            {invite.status === "invited" && !invite.expired && (
              signedIn === false ? (
                <section className={styles.card}>
                  <p style={{ margin: "0 0 10px" }}>Приглашение отправлено на {invite.email}. Войдите или зарегистрируйтесь с этой почтой, затем вернитесь по этой же ссылке.</p>
                  <a className={`${styles.button} ${styles.block}`} href={loginHref}>Войти или зарегистрироваться</a>
                </section>
              ) : (
                <>
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "0 0 14px" }}>
                    <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} style={{ width: 22, height: 22, flex: "none" }} />
                    <span>Я буду хранить материалы проекта в тайне и использовать их только для работы над этим этапом</span>
                  </label>
                  <button className={`${styles.button} ${styles.block}`} disabled={!agreed || busy || signedIn === null} onClick={accept}>{busy ? "Подключаем…" : "Принять приглашение"}</button>
                </>
              )
            )}
          </>
        )}
      </main>
    </div>
  );
}
