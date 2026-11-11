"use client";

import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../projects/journey.module.css";

type Invite = { projectName: string; invitedBy: string; masterName: string | null; email: string; status: "invited" | "active" | "revoked"; expired: boolean };

export default function MasterInvitePage() {
  const router = useRouter();
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Invite>(`/master-invites/${token}`).then(setInvite).catch((caught) => setError(explainError(caught)));
    api("/me").then(() => setSignedIn(true)).catch(() => setSignedIn(false));
  }, [token]);

  async function accept() {
    setBusy(true); setError("");
    try {
      await api(`/master-invites/${token}/accept`, { method: "POST" });
      router.replace("/master");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) setSignedIn(false);
      setError(explainError(caught));
      setBusy(false);
    }
  }

  return (
    <div className={styles.shell}>
      <header className={styles.top}><div className={styles.topInner}><a className={styles.brand} href="/"><span aria-hidden="true">B</span>BuildPath</a></div></header>
      <main className={styles.container}>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!invite && !error && <p className={styles.muted}>{t("Загружаем приглашение…")}</p>}
        {invite && (
          <>
            <p className={styles.kicker}>{t("Приглашение мастеру")}</p>
            <h1 className={styles.h1}>{t("Ваши записи в «")}{invite.projectName}»</h1>
            <section className={styles.card}>
              <p style={{ margin: "0 0 8px" }}>{invite.invitedBy}{" "}{t("приглашает вас видеть записи клиентов")}{invite.masterName ? <>{" "}{t("к мастеру")}{" "}<strong>{invite.masterName}</strong></> : null}.</p>
              <p className={styles.cardTitle}>{t("Что вы увидите")}</p>
              <ul className={styles.list}>
                <li>{t("Только записи к вам: день, время, услугу.")}</li>
                <li>{t("Имя, телефон и комментарий клиента — чтобы связаться по записи.")}</li>
                <li>{t("Новые записи и отмены — в Telegram или на почту.")}</li>
              </ul>
              <p className={styles.cardTitle} style={{ marginTop: 12 }}>{t("Что останется у владельца")}</p>
              <ul className={styles.list}>
                <li>{t("Записи других мастеров, сайт, проект и настройки.")}</li>
                <li>{t("Отмена записей. Вы отмечаете только, пришёл ли клиент.")}</li>
              </ul>
            </section>
            {invite.status === "active" && <a className={`${styles.button} ${styles.block}`} href="/master">{t("Открыть мои записи")}</a>}
            {(invite.expired || invite.status === "revoked") && <p className={`${styles.notice} ${styles.warn}`}>{invite.expired ? t("Срок приглашения истёк. Попросите владельца прислать новое.") : t("Приглашение больше не действует.")}</p>}
            {invite.status === "invited" && !invite.expired && (signedIn === false ? (
              <section className={styles.card}>
                <p style={{ margin: "0 0 10px" }}>{t("Приглашение отправлено на")}{" "}{invite.email}{t(". Войдите или зарегистрируйтесь с этой почтой и вернитесь по этой же ссылке.")}</p>
                <a className={`${styles.button} ${styles.block}`} href={`/login?next=${encodeURIComponent(`/master-invite/${token}`)}`}>{t("Войти или зарегистрироваться")}</a>
              </section>
            ) : (
              <>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "0 0 14px" }}>
                  <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} style={{ width: 22, height: 22, flex: "none" }} />
                  <span>{t("Я использую данные клиентов только для работы по записи и никому их не передаю")}</span>
                </label>
                <button className={`${styles.button} ${styles.block}`} disabled={!agreed || busy || signedIn === null} onClick={accept}>{busy ? t("Подключаем…") : t("Принять приглашение")}</button>
              </>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
