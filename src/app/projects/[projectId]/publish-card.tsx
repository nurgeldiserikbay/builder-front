"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError, type Publication } from "@/lib/journey";
import styles from "../journey.module.css";

export default function PublishCard({ projectId, onChange }: { projectId: string; onChange: () => void }) {
  const [state, setState] = useState<Publication | null>(null);
  const [slug, setSlug] = useState("");
  const [check, setCheck] = useState<{ available: boolean; reason: string | null; url: string | null } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [waitingTelegram, setWaitingTelegram] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await api<Publication>(`/projects/${projectId}/publication`);
      setState(next);
      setSlug((current) => current || next.publication?.slug || next.suggestedSlug);
    } catch (caught) { setError(explainError(caught)); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label); setError(""); setMessage("");
    try { await action(); } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }

  async function checkSlug(value: string) {
    if (!value) { setCheck(null); return; }
    const result = await api<{ available: boolean; reason: string | null; url: string | null }>(`/projects/${projectId}/publication/slug-check?slug=${encodeURIComponent(value)}`);
    setCheck(result);
  }

  async function publish() {
    await run("publish", async () => {
      const next = await api<Publication>(`/projects/${projectId}/publication`, { method: "POST", body: JSON.stringify({ slug, confirm: true }) });
      setState(next); setConfirmed(false); onChange();
      setMessage("Сайт опубликован. Откройте его по ссылке и проверьте на своём телефоне.");
    });
  }

  async function setChannels(patch: Partial<{ notifyTelegram: boolean; notifyEmail: boolean }>) {
    if (!state?.publication) return;
    await run("settings", async () => {
      setState(await api<Publication>(`/projects/${projectId}/publication/settings`, {
        method: "POST", body: JSON.stringify({ notifyTelegram: state.publication!.notifyTelegram, notifyEmail: state.publication!.notifyEmail, ...patch }),
      }));
    });
  }

  if (!state) return error ? <p className={`${styles.notice} ${styles.error}`}>{error}</p> : null;
  const live = state.publication?.status === "live";
  const suffix = `.${state.baseDomain}`;
  const showChannels = Boolean(state.publication || state.acceptedBuild?.hasForm);

  return (
    <section className={styles.card} aria-labelledby="publish-title">
      <p className={styles.kicker}>Публикация</p>
      <h2 id="publish-title" className={styles.h2}>{live ? "Сайт работает в интернете" : "Опубликовать сайт"}</h2>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {message && <p className={`${styles.notice} ${styles.success}`} role="status">{message}</p>}

      {!state.acceptedBuild && !state.publication && (
        <p style={{ margin: 0 }}>Опубликовать сайт можно после того, как вы примете этап «Сборка и проверка». <a className={styles.back} href={`/projects/${projectId}/stages/build`}>Открыть этап →</a></p>
      )}

      {live && state.publication && (
        <>
          <p style={{ margin: "0 0 10px" }}>Адрес сайта: <a href={state.publication.url} target="_blank" rel="noopener" style={{ color: "#255b42", fontWeight: 800, wordBreak: "break-all" }}>{state.publication.url.replace(/^https?:\/\//, "")}</a></p>
          <div className={styles.row} style={{ marginBottom: 10 }}>
            <a className={styles.button} href={state.publication.url} target="_blank" rel="noopener">Открыть сайт</a>
            <button className={styles.ghost} onClick={() => { void navigator.clipboard?.writeText(state.publication!.url); setMessage("Ссылка скопирована — можно отправить клиентам."); }}>Скопировать ссылку</button>
          </div>
          <p className={styles.small} style={{ margin: "0 0 10px" }}>Опубликована сборка версии {state.publication.publishedVersionNumber}.</p>
          {state.outdated && state.canManage && (
            <div className={`${styles.notice} ${styles.warn}`}>
              Есть новая принятая сборка (версия {state.acceptedBuild?.versionNumber}), которой ещё нет на сайте.
              <div style={{ marginTop: 8 }}><button className={styles.button} disabled={Boolean(busy)} onClick={publish}>{busy === "publish" ? "Обновляем…" : "Обновить сайт"}</button></div>
            </div>
          )}
          {state.canManage && (
            <button className={styles.danger} disabled={Boolean(busy)} onClick={() => {
              if (!window.confirm("Снять сайт с публикации? Он перестанет открываться по ссылке. Заявки и проект сохранятся, опубликовать снова можно в любой момент.")) return;
              void run("unpublish", async () => { setState(await api<Publication>(`/projects/${projectId}/publication/unpublish`, { method: "POST" })); onChange(); setMessage("Сайт снят с публикации."); });
            }}>Снять с публикации</button>
          )}
        </>
      )}

      {!live && state.acceptedBuild && state.canManage && (
        <>
          <p style={{ margin: "0 0 12px" }}>Сайт будет доступен всем по короткой ссылке на BuildPath. Это бесплатно, отдельный хостинг и аккаунты не нужны.</p>
          <label className={styles.field}>
            <span className={styles.label}>Адрес сайта</span>
            <span className={styles.why}>Латинские буквы, цифры и дефис. Мы предложили вариант по названию — можно изменить.</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <input className={styles.input} style={{ flex: "1 1 160px" }} value={slug} maxLength={40} autoCapitalize="off" autoCorrect="off" spellCheck={false}
                onChange={(event) => { setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setCheck(null); }}
                onBlur={() => void checkSlug(slug).catch(() => undefined)} aria-describedby="slug-suffix" />
              <span id="slug-suffix" className={styles.muted}>{suffix}</span>
            </span>
          </label>
          {check && <p className={`${styles.notice} ${check.available ? styles.success : styles.warn}`}>{check.available ? `Свободен: ${check.url?.replace(/^https?:\/\//, "")}` : check.reason}</p>}
          <ul className={styles.list} style={{ margin: "0 0 12px" }}>
            <li>Сайт увидит любой, у кого есть ссылка, и его смогут найти поисковики.</li>
            <li>Снять с публикации можно в любой момент одной кнопкой.</li>
            {state.acceptedBuild.hasForm && <li>Начнёт работать форма заявок — заявки придут вам туда, куда выберете ниже.</li>}
          </ul>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "0 0 12px" }}>
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} style={{ width: 22, height: 22, flex: "none" }} />
            <span>Я проверил(а) сайт и согласен(на) сделать его доступным всем в интернете</span>
          </label>
          <button className={`${styles.button} ${styles.block}`} disabled={Boolean(busy) || !confirmed || slug.length < 3 || check?.available === false} onClick={publish}>
            {busy === "publish" ? "Публикуем…" : state.publication ? "Опубликовать снова" : "Опубликовать"}
          </button>
        </>
      )}
      {!live && state.acceptedBuild && !state.canManage && <p className={styles.small}>Опубликовать сайт может владелец или менеджер проекта.</p>}

      {showChannels && (
        <div style={{ borderTop: "1px solid #e3e8e1", marginTop: 16, paddingTop: 14 }}>
          <p className={styles.cardTitle}>Куда присылать заявки с сайта</p>
          {!state.acceptedBuild?.hasForm && <p className={styles.small} style={{ marginTop: 0 }}>На сайте сейчас нет формы заявки. Её можно включить на этапе «Цель сайта»: главное действие — «Оставить заявку на сайте».</p>}
          <div className={styles.item}>
            <strong>Telegram</strong>
            {!state.channels.telegram.configured && <span className={styles.small}>Бот для уведомлений пока не настроен на платформе.</span>}
            {state.channels.telegram.configured && state.channels.telegram.linked && (
              <>
                <span className={styles.small}>Подключён{state.channels.telegram.username ? ` (@${state.channels.telegram.username})` : ""}.</span>
                {state.publication && <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 40 }}><input type="checkbox" checked={state.publication.notifyTelegram} disabled={Boolean(busy)} onChange={(event) => void setChannels({ notifyTelegram: event.target.checked })} /> Присылать заявки в Telegram</label>}
              </>
            )}
            {state.channels.telegram.configured && !state.channels.telegram.linked && (
              <>
                <span className={styles.small}>Подключите Telegram, чтобы заявки приходили сразу на телефон. Откроется бот @{state.channels.telegram.botUsername} — нажмите в нём «Start».</span>
                <div className={styles.row}>
                  <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => void run("telegram", async () => {
                    const link = await api<{ deepLink: string }>("/me/telegram/link", { method: "POST" });
                    setWaitingTelegram(true);
                    window.open(link.deepLink, "_blank", "noopener");
                  })}>Подключить Telegram</button>
                  {waitingTelegram && <button className={styles.ghost} onClick={() => void load().then(() => setWaitingTelegram(false))}>Я нажал(а) Start</button>}
                </div>
              </>
            )}
          </div>
          <div className={styles.item}>
            <strong>Email</strong>
            {state.channels.email.configured
              ? state.publication && <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 40 }}><input type="checkbox" checked={state.publication.notifyEmail} disabled={Boolean(busy)} onChange={(event) => void setChannels({ notifyEmail: event.target.checked })} /> Присылать на {state.channels.email.address}</label>
              : <span className={styles.small}>Отправка писем пока не настроена на платформе.</span>}
          </div>
          <p className={styles.small}>Все заявки также сохраняются в проекте. <a className={styles.back} href={`/projects/${projectId}/leads`}>Заявки ({state.leadsCount}) →</a></p>
        </div>
      )}
    </section>
  );
}
