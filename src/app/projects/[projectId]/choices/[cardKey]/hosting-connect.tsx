"use client";

import { useState } from "react";
import { dateLocale, t } from "@/lib/i18n";
import styles from "../../../journey.module.css";

export type Hosting = { provider: string; account: string; siteUrl: string; adminUrl: string | null; tokenHint: string; deployedAt: string | null; upToDate: boolean; lastError: string | null };

/** Connect an external hosting with an access token (kept encrypted), or show what is connected. */
export function HostingConnect({ provider, title, hosting, canDecide, busy, onConnect, onDisconnect }: {
  provider: string; title: string; hosting: Hosting | null; canDecide: boolean; busy: string;
  onConnect: (input: { token: string; siteId: string | null }) => void; onDisconnect: () => void;
}) {
  const [token, setToken] = useState("");
  const [siteId, setSiteId] = useState("");
  const [confirm, setConfirm] = useState(false);
  if (hosting) {
    return (
      <div className={styles.small}>
        {t("Подключено: {0}, ключ {1}.", [hosting.account, hosting.tokenHint])}{" "}
        <a href={hosting.siteUrl} target="_blank" rel="noopener noreferrer">{hosting.siteUrl}</a>
        {hosting.adminUrl && <>{" · "}<a href={hosting.adminUrl} target="_blank" rel="noopener noreferrer">{t("открыть в {0}", [title])}</a></>}
        {canDecide && <>{" · "}<button type="button" className={styles.inlineLinkButton} disabled={Boolean(busy)} onClick={onDisconnect}>{t("Отключить")}</button></>}
      </div>
    );
  }
  if (!canDecide) return <p className={styles.small}>{t("Подключить может владелец или менеджер проекта.")}</p>;
  return (
    <form onSubmit={(event) => { event.preventDefault(); onConnect({ token: token.trim(), siteId: siteId.trim() || null }); }} style={{ marginTop: 6 }}>
      <label className={styles.label} htmlFor={`token-${provider}`}>{t("Ключ доступа {0}", [title])}</label>
      <input id={`token-${provider}`} className={styles.input} type="password" autoComplete="off" required maxLength={300} value={token} onChange={(event) => setToken(event.target.value)} />
      <label className={styles.label} htmlFor={`site-${provider}`} style={{ marginTop: 10 }}>{t("ID существующего сайта (необязательно)")}</label>
      <input id={`site-${provider}`} className={styles.input} maxLength={80} value={siteId} onChange={(event) => setSiteId(event.target.value)} placeholder={t("Пусто — создадим новый сайт")} />
      <label className={styles.checkRow} style={{ marginTop: 10 }}>
        <input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} />
        <span>{siteId.trim() ? t("Разрешаю BuildPath отправлять принятую версию сайта на этот сайт в моём аккаунте {0}.", [title]) : t("Разрешаю BuildPath создать сайт в моём аккаунте {0} и отправлять туда принятую версию.", [title])}</span>
      </label>
      <button className={styles.button} disabled={Boolean(busy) || !token.trim() || !confirm}>{busy === "hosting" ? t("Проверяем…") : t("Подключить")}</button>
    </form>
  );
}

/** Send the accepted page to the connected hosting, with an explicit confirmation every time. */
export function HostingDeploy({ title, hosting, siteAccepted, canDecide, busy, onDeploy }: { title: string; hosting: Hosting | null; siteAccepted: boolean; canDecide: boolean; busy: string; onDeploy: () => void }) {
  if (!hosting) return <p className={styles.small}>{t("Сначала подключите {0}.", [title])}</p>;
  return (
    <div className={styles.small}>
      {hosting.deployedAt
        ? <>{hosting.upToDate ? t("Отправлена последняя принятая версия: {0}.", [new Date(hosting.deployedAt).toLocaleString(dateLocale())]) : t("Отправлена прошлая версия ({0}) — есть новая принятая.", [new Date(hosting.deployedAt).toLocaleString(dateLocale())])}</>
        : t("Ещё не отправляли.")}
      {hosting.lastError && <span className={styles.errorText}>{" "}{t("Последняя попытка не удалась.")}</span>}
      {canDecide && (
        <div style={{ marginTop: 6 }}>
          <button type="button" className={styles.button} disabled={Boolean(busy) || !siteAccepted || hosting.upToDate} onClick={() => {
            if (window.confirm(t("Отправить принятую версию сайта на {0}? Сайт по адресу {1} обновится.", [title, hosting.siteUrl]))) onDeploy();
          }}>{busy === "deploy" ? t("Отправляем…") : t("Отправить на {0}", [title])}</button>
          {!siteAccepted && <p className={styles.small}>{t("Сначала примите этап «Сборка и проверка».")}</p>}
        </div>
      )}
    </div>
  );
}
