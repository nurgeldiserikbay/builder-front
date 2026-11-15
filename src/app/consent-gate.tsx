"use client";

import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "./projects/journey.module.css";

const publicPrefixes = ["/login", "/legal", "/verify-email", "/invite"];
type Info = { statement: string; termsVersion: string; privacyVersion: string };

/** Asks a signed-in user to accept updated legal documents; the API refuses other work until then (CONSENT_REQUIRED). */
export default function ConsentGate() {
  const pathname = usePathname() ?? "/";
  const [info, setInfo] = useState<Info | null>(null);
  // A new account (made with Google) has never accepted the documents: ask, do not announce an update.
  const [firstTime, setFirstTime] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const skip = pathname === "/" || publicPrefixes.some((prefix) => pathname.startsWith(prefix));

  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    api<{ consentRequired?: boolean; consentFirstTime?: boolean }>("/me")
      .then(async (me) => {
        if (!me?.consentRequired) return;
        setFirstTime(Boolean(me.consentFirstTime));
        const value = await api<Info>("/legal/consent");
        if (!cancelled) setInfo(value);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [skip, pathname]);

  if (!info) return null;

  async function accept() {
    if (!info) return;
    setBusy(true);
    setError("");
    try {
      await api("/me/consent", { method: "POST", body: JSON.stringify({ termsVersion: info.termsVersion, privacyVersion: info.privacyVersion }) });
      window.location.reload();
    } catch (caught) {
      setError(explainError(caught));
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className={styles.overlayCard}>
        <p className={styles.kicker}>{firstTime ? t("Добро пожаловать") : t("Обновление документов")}</p>
        <h2 id="consent-title" className={styles.h2} style={{ marginTop: 0 }}>{firstTime ? t("Осталось принять оферту и политику конфиденциальности") : t("Мы обновили оферту и политику конфиденциальности")}</h2>
        <p>{firstTime ? t("Прочитайте:") : t("Прочитайте новую редакцию:")}{" "}<a href="/legal/terms" target="_blank">{t("оферта")}</a>{" "}{t("и")}{" "}<a href="/legal/privacy" target="_blank">{t("политика конфиденциальности")}</a>{t(". Чтобы продолжить работу, нужно ваше согласие.")}</p>
        <p className={styles.small}>{info.statement}</p>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        <button className={styles.button} onClick={accept} disabled={busy}>{busy ? t("Сохраняем…") : t("Принимаю")}</button>
        <p className={styles.small} style={{ marginBottom: 0, marginTop: 14 }}>{firstTime ? t("Не согласны? Аккаунт можно") : t("Не согласны? Вы можете")}{" "}<a href="/account">{t("удалить аккаунт")}</a>.</p>
      </div>
    </div>
  );
}
