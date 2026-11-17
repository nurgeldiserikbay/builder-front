"use client";

import { t } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { download, explainError, isPlanMessage, statusTone, type Journey } from "@/lib/journey";
import styles from "../journey.module.css";
import PublishCard from "./publish-card";
import QuickEditCard from "./quick-edit-card";
import InsightsCard from "./insights-card";
import MonitoringCard from "./monitoring-card";
import ProjectMap from "./project-map";
import PhaseStrip from "./phases";
import BudgetCard from "./budget-card";
import WalletCard from "./wallet-card";
import AppHeader from "../../app-header";
import TeamCard from "./team-card";
import ProposalsPanel from "./proposals";

type ResultPackage = { generatedAt: string; complete: boolean; openItems: string[]; siteReady: boolean; files: Array<{ name: string; mimeType: string; content: string }> };

const fileLabels: Record<string, string> = {
  "site.html": t("Готовая страница сайта (откройте в браузере или загрузите на хостинг)"),
  "project.md": t("Паспорт проекта и все тексты (удобно читать и пересылать)"),
  "project.json": t("Все данные проекта (для разработчика или переноса)"),
};

export default function JourneyPage() {
  const router = useRouter();
  const { projectId } = useParams<{ projectId: string }>();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResultPackage | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"map" | "list">("map");
  type Tab = "stages" | "team" | "money" | "publish" | "decisions" | "result";
  const [tab, setTab] = useState<Tab>("stages");
  // Money, publishing and decisions are for those who run the project; every team member sees stages, the team and the result.
  const managing = ["owner", "manager"].includes(journey?.project.role ?? "");
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "stages", label: t("Этапы") }, { key: "team", label: t("Команда") },
    // A web application is not published by BuildPath: its result is the package for developers.
    ...(managing ? [{ key: "money" as const, label: t("Деньги") }, ...(journey?.project.projectType === "web_app" ? [] : [{ key: "publish" as const, label: t("Публикация") }]), { key: "decisions" as const, label: t("Решения") }] : []),
    { key: "result", label: t("Результат") },
  ];
  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (["stages", "team", "money", "publish", "decisions", "result"].includes(fromHash)) setTab(fromHash as Tab);
  }, []);
  function openTab(next: Tab) {
    setTab(next);
    window.history.replaceState(null, "", next === "stages" ? window.location.pathname : `#${next}`);
  }

  const load = useCallback(async () => {
    try {
      setJourney(await api<Journey>(`/projects/${projectId}/journey`));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
      // A project started as «Только анализ» has no stages: its home is the code analysis page.
      if (caught instanceof ApiError && caught.message === "PROJECT_HAS_NO_ROUTE") { router.replace(`/projects/${projectId}/analysis`); return; }
      setError(explainError(caught));
    }
  }, [projectId, router]);

  useEffect(() => { void load(); }, [load]);

  async function prepareResult() {
    setBusy(true);
    setError("");
    try { setResult(await api<ResultPackage>(`/projects/${projectId}/result`)); } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  async function setStatus(action: "complete" | "resume" | "archive" | "unarchive" | "pause" | "cancel", reason?: string) {
    if (action === "archive" && !window.confirm(t("Отправить проект в архив? Он перестанет занимать место в тарифе. Специалисты потеряют доступ. Вернуть проект можно в любой момент."))) return;
    setBusy(true);
    setError("");
    try {
      setJourney(await api<Journey>(`/projects/${projectId}/${action}`, { method: "POST", body: action === "cancel" ? JSON.stringify({ reason: reason?.trim() || undefined }) : undefined }));
      setCancelOpen(false);
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  const completed = journey?.project.status === "completed";
  const live = journey?.project.status === "live";
  const specialist = journey?.viewer.kind === "specialist";
  const archived = journey?.project.status === "archived";
  const paused = journey?.project.status === "paused";
  const cancelled = journey?.project.status === "cancelled";

  return (
    <div className={styles.shell}>
      <AppHeader back={{ href: "/projects", label: t("← Проекты") }} title={journey?.project.name ?? ""} />
      <main className={styles.appMain}>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}{isPlanMessage(error) && <> <a href="/account/plan" style={{ color: "inherit", fontWeight: 700 }}>{t("Открыть тариф →")}</a></>}</p>}
        {!journey && !error && <p className={styles.muted} style={{ padding: 24 }}>{t("Загружаем проект…")}</p>}
        {journey && (
          <>
            <div className={styles.projectBar}>
              <div className={styles.projectBarTitle}>
                <h1 className={styles.h1}>{journey.project.name}</h1>
                <span className={styles.small}>{journey.project.typeTitle}</span>
              </div>
              <div className={styles.progressInline}>
                <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={journey.progress.percent} aria-label={t("Готовность проекта")}>
                  <span style={{ width: `${journey.progress.percent}%` }} />
                </div>
                <span className={styles.small}>{t("Принято этапов:")}{" "}{journey.progress.accepted}{" "}{t("из")}{" "}{journey.progress.total}</span>
              </div>
            </div>
            {!specialist && (
              <div className={styles.tabs} role="tablist" aria-label={t("Разделы проекта")}>
                {tabs.map((item) => (
                  <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={styles.tab} onClick={() => openTab(item.key)}>{item.label}</button>
                ))}
              </div>
            )}

            <div className={styles.tabBody}>
            {specialist && (
              <p className={`${styles.notice} ${styles.info}`}>{t("Вы приглашены в этот проект как специалист. Вам видны только ваши этапы и то, что для них нужно. Принимает работу владелец проекта.")}</p>
            )}

            {tab === "stages" && <>
            {(journey.openProposals ?? 0) > 0 && (managing || specialist) && <ProposalsPanel projectId={projectId} aiReady={journey.ai.configured} onDecided={() => void load()} />}
            {cancelled ? (
              <div className={`${styles.notice} ${styles.info}`}>
                {t("Проект отменён: его можно смотреть и скачивать, но не менять. Он не занимает место в тарифе, специалисты больше не имеют доступа.")}
                {journey.project.role === "owner" && <div style={{ marginTop: 10 }}><button className={styles.secondary} disabled={busy} onClick={() => setStatus("archive")}>{t("Убрать в архив")}</button></div>}
              </div>
            ) : paused ? (
              <div className={`${styles.notice} ${styles.info}`}>
                {t("Проект на паузе: этапы не меняются, пока вы не продолжите. Специалисты сохраняют доступ.")}
                <div style={{ marginTop: 10 }}><button className={styles.secondary} disabled={busy} onClick={() => setStatus("resume")}>{t("Продолжить проект")}</button></div>
              </div>
            ) : archived ? (
              <div className={`${styles.notice} ${styles.info}`}>
                {t("Проект в архиве: его можно смотреть и скачивать, но не менять. Он не занимает место в тарифе.")}
                {journey.project.role === "owner" && <div style={{ marginTop: 10 }}><button className={styles.secondary} disabled={busy} onClick={() => setStatus("unarchive")}>{t("Вернуть из архива")}</button></div>}
              </div>
            ) : completed ? (
              <div className={`${styles.notice} ${styles.success}`}>
                {t("Проект завершён. Скачайте результат ниже или продолжите проект, если хотите что-то изменить.")}
                <div style={{ marginTop: 10 }}><button className={styles.secondary} disabled={busy} onClick={() => setStatus("resume")}>{t("Продолжить проект")}</button></div>
              </div>
            ) : (
              <section className={styles.nextCard} aria-labelledby="next-title">
                <div>
                  <p className={styles.kicker}>{t("Что дальше")}</p>
                  <h2 id="next-title" className={styles.h2}>{journey.nextAction.title}</h2>
                  <p style={{ margin: 0 }}>{journey.nextAction.text}</p>
                </div>
                {journey.nextAction.stageKey && <a className={styles.button} href={`/projects/${projectId}/stages/${journey.nextAction.stageKey}`}>{t("Открыть этап")}</a>}
              </section>
            )}

            <PhaseStrip phases={journey.phases?.items ?? []} onOpen={(phase) => {
              // A stage phase opens its first unfinished stage; launch and after-launch live on the publication tab.
              if (phase.kind === "publish") { openTab("publish"); return; }
              const first = journey.stages.find((stage) => phase.stageKeys.includes(stage.key) && !["approved", "imported", "skipped"].includes(stage.status)) ?? journey.stages.find((stage) => phase.stageKeys.includes(stage.key));
              if (first) window.location.href = `/projects/${projectId}/stages/${first.key}`;
            }} />
            <div className={styles.toolbar}>
              <div className={styles.viewToggle} role="group" aria-label={t("Вид")}>
                <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>{t("Карта")}</button>
                <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>{t("Список")}</button>
              </div>
              {!specialist && ["active", "live"].includes(journey.project.status) && ["owner", "manager"].includes(journey.project.role) && journey.project.changeResponseDays && (
                <ResponseDays projectId={projectId} value={journey.project.changeResponseDays} />
              )}
              <div className={styles.spacer} />
              <a className={styles.back} href={`/projects/${projectId}/history`}>{t("История запросов к ИИ →")}</a>
              {!specialist && <a className={styles.back} href={`/projects/${projectId}/analysis`}>{t("Разбор кода и ТЗ →")}</a>}
            </div>
            {view === "map" && <ProjectMap projectId={projectId} stages={journey.stages} aiOn={journey.ai.configured} />}
            {view === "list" && <ol className={styles.stageList}>
              {journey.stages.map((stage, index) => {
                const phase = journey.phases?.items.find((item) => item.stageKeys.includes(stage.key));
                const firstOfPhase = phase && phase.stageKeys[0] === stage.key;
                const tone = statusTone[stage.status];
                const locked = stage.status === "locked";
                const waiting = stage.inputs.filter((input) => !input.satisfied).map((input) => input.title);
                return (
                  <li key={stage.key}>
                    {firstOfPhase && <p className={styles.kicker} style={{ margin: index === 0 ? "0 0 6px" : "14px 0 6px" }}>{phase.title}</p>}
                    <a className={`${styles.stageItem} ${styles[tone]}`} href={`/projects/${projectId}/stages/${stage.key}`} aria-disabled={locked}>
                      <span className={styles.stageNum} aria-hidden="true">{tone === "done" ? "✓" : index + 1}</span>
                      <span className={styles.stageBody}>
                        <strong>{stage.title}</strong>
                        <span className={styles.small}>{stage.outcome}</span><br />
                        <span className={`${styles.chip} ${styles[tone]}`}>{stage.statusLabel}</span>
                        {locked && waiting.length > 0 && <span className={styles.small}>{" "}{t("· сначала:")}{" "}{waiting.join(", ")}</span>}
                        {stage.status === "stale" && <span className={styles.small}> · {stage.statusExplanation}</span>}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ol>}
            <p className={styles.small} style={{ margin: "16px 0 0", maxWidth: "80ch" }}>{t("Этап открывается, когда приняты те, от которых он зависит. Этапы в одной строке делаются одновременно: они построены на общем утверждённом контракте. Принятый этап можно изменить позже — следующие этапы получат уведомление.")}</p>
            </>}

            {tab === "team" && !specialist && <TeamCard projectId={projectId} />}

            {tab === "money" && !specialist && managing && <>
            <p className={styles.small} style={{ margin: "0 0 14px" }} hidden={specialist}>
              {journey.ai.configured
                ? t("ИИ подключён: на каждом этапе он делает черновик, а вы говорите, что поменять.{0}", [journey.ai.month ? t(" Запросов по тарифу «{0}» в этом месяце: осталось {1} из {2}.", [journey.ai.month.planTitle, journey.ai.month.left, journey.ai.month.limit]) : ""])
                : t("ИИ пока не подключён: этапы заполняются вручную, а тексты и стиль можно получить по готовому шаблону.")}
            </p>
              <div className={styles.panels}>
                <WalletCard projectId={projectId} />
                <BudgetCard projectId={projectId} />
              </div>
            </>}

            {tab === "publish" && !specialist && managing && (
              <div className={styles.panels}>
                <QuickEditCard projectId={projectId} onPublished={() => void load()} />
                <PublishCard projectId={projectId} onChange={() => void load()} />
                <MonitoringCard projectId={projectId} />
                <InsightsCard projectId={projectId} />
                {journey.project.projectType === "booking" && (
              <section className={styles.card} aria-labelledby="bookings-title">
                <p className={styles.kicker}>{t("Онлайн-запись")}</p>
                <h2 id="bookings-title" className={styles.h2}>{t("Записи клиентов")}</h2>
                <p style={{ margin: "0 0 10px" }}>{t("Кто, когда и к какому мастеру записался. Отменяйте записи и отмечайте, пришёл ли клиент.")}</p>
                <a className={styles.secondary} href={`/projects/${projectId}/bookings`}>{t("Открыть записи")}</a>
              </section>
            )}
            {journey.project.projectType === "store" && (
              <section className={styles.card} aria-labelledby="orders-title">
                <p className={styles.kicker}>{t("Магазин")}</p>
                <h2 id="orders-title" className={styles.h2}>{t("Заказы")}</h2>
                <p style={{ margin: "0 0 10px" }}>{t("Что заказали, как доставить и как клиент платит. Подтверждайте заказы и отмечайте выполненные.")}</p>
                <a className={styles.secondary} href={`/projects/${projectId}/orders`}>{t("Открыть заказы")}</a>
              </section>
            )}
              </div>
            )}

            {tab === "decisions" && !specialist && managing && <>
            <section aria-labelledby="code-title">
              <h2 id="code-title" className={styles.h2}>{t("Технологии, код и адрес")}</h2>
              <div className={styles.tiles}>
                <div className={styles.tile}><p>{t("На чём делать сайт: BuildPath соберёт его сам, а для личного кабинета или оплаты онлайн понадобится разработчик со своим стеком. Сравним варианты.")}</p><a className={styles.secondary} href={`/projects/${projectId}/choices/technologies`}>{t("Технологии")}</a></div>
                <div className={styles.tile}><p>{t("Сайт работает на BuildPath и без этого. Копия у вас — страховка: можно переехать, отдать разработчику или восстановить. Выберите вариант — мы объясним, что сделать.")}</p><a className={styles.secondary} href={`/projects/${projectId}/choices/code_hosting`}>{t("Выбрать, где хранить код")}</a></div>
                <div className={styles.tile}><p>{t("Сайт можно разместить не только на BuildPath: на своём сервере или в GitHub Pages. Мы проведём по шагам и проверим, что он открывается.")}</p><a className={styles.secondary} href={`/projects/${projectId}/choices/deployment`}>{t("Где будет работать сайт")}</a></div>
                <div className={styles.tile}><p>{t("Свой домен вроде barber-usy.com вместо адреса BuildPath — объясним, где купить и что вписать у регистратора.")}</p><a className={styles.secondary} href={`/projects/${projectId}/choices/domain`}>{t("Адрес сайта")}</a></div>
              </div>
            </section>
            </>}

            {tab === "result" && !specialist && (
              <div className={styles.panels}>
            <section className={styles.card} aria-labelledby="result-title">
              <p className={styles.kicker}>{t("Результат")}</p>
              <h2 id="result-title" className={styles.h2}>{t("Забрать результат можно на любом этапе")}</h2>
              <p style={{ margin: "0 0 12px" }}>{journey.project.resultExplanation}{" "}{t("В файлы попадёт только то, что вы приняли.")}</p>
              {!result && <button className={`${styles.secondary} ${styles.block}`} disabled={busy} onClick={prepareResult}>{busy ? t("Готовим…") : t("Подготовить файлы")}</button>}
              {result && (
                <>
                  {result.openItems.length > 0 && (
                    <div className={`${styles.notice} ${styles.warn}`}>
                      {t("Ещё не сделано:")}
                      <ul className={styles.list}>{result.openItems.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                  )}
                  <div style={{ display: "grid", gap: 10 }}>
                    {result.files.map((file) => (
                      <button key={file.name} className={styles.ghost} style={{ justifyContent: "flex-start", textAlign: "left", padding: "10px 14px", height: "auto" }} onClick={() => download(file.name, file.mimeType, file.content)}>
                        <span>⬇ <strong>{file.name}</strong><br /><span className={styles.small}>{fileLabels[file.name] ?? ""}</span></span>
                      </button>
                    ))}
                  </div>
                  <p className={styles.small} style={{ marginTop: 10 }}>{t("Файл site.html можно загрузить на любой хостинг статических сайтов. Форма заявок работает только на сайте, опубликованном через BuildPath.")}</p>
                </>
              )}
            </section>
            {!specialist && ["draft", "active", "paused", "completed"].includes(journey.project.status) && (
              <section className={styles.card} aria-labelledby="lifecycle-title">
                <p id="lifecycle-title" className={styles.cardTitle}>{t("Состояние проекта")}</p>
                <p className={styles.small} style={{ marginTop: 0 }}>{t("Пауза останавливает работу, пока вы не вернётесь. Завершить — забрать результат и остановиться. Отменить — бросить проект: он перестанет занимать место в тарифе.")}</p>
                <div className={styles.row} style={{ gap: 8, flexWrap: "wrap" }}>
              {!archived && !live && !cancelled && journey.project.role === "owner" && (
                <button className={styles.ghost} disabled={busy} onClick={() => setStatus("archive")}>{t("Отправить в архив")}</button>
              )}
              {!completed && !live && !archived && !cancelled && journey.project.role === "owner" && (
                <button className={styles.ghost} disabled={busy} onClick={() => setStatus("complete")}>{t("Завершить проект на этом этапе")}</button>
              )}
              {journey.project.status === "active" && ["owner", "manager"].includes(journey.project.role) && (
                <button className={styles.ghost} disabled={busy} onClick={() => setStatus("pause")}>{t("Поставить на паузу")}</button>
              )}
              {["draft", "active", "paused"].includes(journey.project.status) && journey.project.role === "owner" && !cancelOpen && (
                <button className={styles.ghost} style={{ color: "var(--danger)" }} disabled={busy} onClick={() => setCancelOpen(true)}>{t("Отменить проект…")}</button>
              )}
              {cancelOpen && (
                <form className={styles.card} style={{ width: "100%", margin: "6px 0 0", borderColor: "#f1c2bb", boxShadow: "none" }} onSubmit={(event) => { event.preventDefault(); void setStatus("cancel", cancelReason); }}>
                  <p className={styles.cardTitle}>{t("Отменить проект?")}</p>
                  <p style={{ marginTop: 0 }}>{t("Проект останется доступен для просмотра и скачивания, но менять его будет нельзя. Он перестанет занимать место в тарифе, специалисты сразу потеряют доступ. Уже начисленные им оплаты сохранятся. Потом проект можно только убрать в архив.")}</p>
                  <label className={styles.label} htmlFor="cancel-reason">{t("Почему отменяете (необязательно)")}</label>
                  <textarea id="cancel-reason" className={styles.textarea} rows={2} maxLength={300} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
                  <div className={styles.row} style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <button className={styles.danger} disabled={busy}>{busy ? t("Отменяем…") : t("Отменить проект")}</button>
                    <button type="button" className={styles.ghost} onClick={() => setCancelOpen(false)}>{t("Не отменять")}</button>
                  </div>
                </form>
              )}
                </div>
              </section>
            )}
              </div>
            )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/** How long the next stage has to answer a change: then a reminder, and two days later the owner can decide for it. */
function ResponseDays({ projectId, value }: { projectId: string; value: number }) {
  const [days, setDays] = useState(value);
  const [saved, setSaved] = useState(false);
  async function save(next: number) {
    setDays(next); setSaved(false);
    try { await api(`/projects/${projectId}/change-settings`, { method: "POST", body: JSON.stringify({ responseDays: next }) }); setSaved(true); } catch { setDays(value); }
  }
  return (
    <label className={styles.small} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "0 0 10px" }}>
      <span>{t("Срок ответа на изменения:")}</span>
      <select className={styles.input} style={{ width: "auto", minHeight: 36, padding: "4px 8px" }} value={days} onChange={(event) => void save(Number(event.target.value))}>
        {[1, 2, 3, 5, 7, 14].map((item) => <option key={item} value={item}>{item}{" "}{t("дн.")}</option>)}
      </select>
      <span>{saved ? t("Сохранено.") : t("Потом — напоминание, а ещё через 2 дня вы сможете решить за этап.")}</span>
    </label>
  );
}
