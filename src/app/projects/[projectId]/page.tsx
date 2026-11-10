"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { download, explainError, isPlanMessage, statusTone, type Journey } from "@/lib/journey";
import styles from "../journey.module.css";
import PublishCard from "./publish-card";
import ProjectMap from "./project-map";
import BudgetCard from "./budget-card";
import WalletCard from "./wallet-card";

type ResultPackage = { generatedAt: string; complete: boolean; openItems: string[]; siteReady: boolean; files: Array<{ name: string; mimeType: string; content: string }> };

const fileLabels: Record<string, string> = {
  "site.html": "Готовая страница сайта (откройте в браузере или загрузите на хостинг)",
  "project.md": "Паспорт проекта и все тексты (удобно читать и пересылать)",
  "project.json": "Все данные проекта (для разработчика или переноса)",
};

export default function JourneyPage() {
  const router = useRouter();
  const { projectId } = useParams<{ projectId: string }>();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResultPackage | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"map" | "list">("map");

  const load = useCallback(async () => {
    try {
      setJourney(await api<Journey>(`/projects/${projectId}/journey`));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
      setError(explainError(caught));
    }
  }, [projectId, router]);

  useEffect(() => { void load(); }, [load]);

  async function prepareResult() {
    setBusy(true);
    setError("");
    try { setResult(await api<ResultPackage>(`/projects/${projectId}/result`)); } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  async function setStatus(action: "complete" | "resume" | "archive" | "unarchive") {
    if (action === "archive" && !window.confirm("Отправить проект в архив? Он перестанет занимать место в тарифе. Специалисты потеряют доступ. Вернуть проект можно в любой момент.")) return;
    setBusy(true);
    setError("");
    try { setJourney(await api<Journey>(`/projects/${projectId}/${action}`, { method: "POST" })); } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  const completed = journey?.project.status === "completed";
  const live = journey?.project.status === "live";
  const specialist = journey?.viewer.kind === "specialist";
  const archived = journey?.project.status === "archived";

  return (
    <div className={styles.shell}>
      <header className={styles.top}><div className={styles.topInner}>
        <a className={styles.back} href="/projects">← Проекты</a>
        <span className={styles.topTitle}>{journey?.project.name ?? ""}</span>
      </div></header>
      <main className={styles.container}>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}{isPlanMessage(error) && <> <a href="/account/plan" style={{ color: "inherit", fontWeight: 800 }}>Открыть тариф →</a></>}</p>}
        {!journey && !error && <p className={styles.muted}>Загружаем проект…</p>}
        {journey && (
          <>
            <p className={styles.kicker}>{journey.project.typeTitle}</p>
            <h1 className={styles.h1}>{journey.project.name}</h1>
            <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={journey.progress.percent} aria-label="Готовность проекта">
              <span style={{ width: `${journey.progress.percent}%` }} />
            </div>
            <p className={styles.small} style={{ margin: "0 0 18px" }}>Принято этапов: {journey.progress.accepted} из {journey.progress.total}</p>
            {specialist && (
              <p className={`${styles.notice} ${styles.info}`}>Вы приглашены в этот проект как специалист. Вам видны только ваши этапы и то, что для них нужно. Принимает работу владелец проекта.</p>
            )}

            {archived ? (
              <div className={`${styles.notice} ${styles.info}`}>
                Проект в архиве: его можно смотреть и скачивать, но не менять. Он не занимает место в тарифе.
                {journey.project.role === "owner" && <div style={{ marginTop: 10 }}><button className={styles.secondary} disabled={busy} onClick={() => setStatus("unarchive")}>Вернуть из архива</button></div>}
              </div>
            ) : completed ? (
              <div className={`${styles.notice} ${styles.success}`}>
                Проект завершён. Скачайте результат ниже или продолжите проект, если хотите что-то изменить.
                <div style={{ marginTop: 10 }}><button className={styles.secondary} disabled={busy} onClick={() => setStatus("resume")}>Продолжить проект</button></div>
              </div>
            ) : (
              <section className={styles.card} aria-labelledby="next-title">
                <p className={styles.kicker}>Что дальше</p>
                <h2 id="next-title" className={styles.h2}>{journey.nextAction.title}</h2>
                <p style={{ margin: "0 0 12px" }}>{journey.nextAction.text}</p>
                {journey.nextAction.stageKey && <a className={`${styles.button} ${styles.block}`} href={`/projects/${projectId}/stages/${journey.nextAction.stageKey}`}>Открыть этап</a>}
              </section>
            )}

            <p className={styles.small} style={{ margin: "0 0 14px" }} hidden={specialist}>
              {journey.ai.configured
                ? `ИИ подключён: на каждом этапе он делает черновик, а вы говорите, что поменять.${journey.ai.month ? ` Запросов по тарифу «${journey.ai.month.planTitle}» в этом месяце: осталось ${journey.ai.month.left} из ${journey.ai.month.limit}.` : ""}`
                : "ИИ пока не подключён: этапы заполняются вручную, а тексты и стиль можно получить по готовому шаблону."}
            </p>

            <h2 className={styles.h2}>{specialist ? "Ваши этапы" : "Карта проекта"}</h2>
            <p className={styles.small} style={{ margin: "0 0 10px" }}>Этап открывается, когда приняты те, от которых он зависит. Этапы в одной строке делаются одновременно: они построены на общем утверждённом контракте. Принятый этап можно изменить позже — следующие этапы получат уведомление.</p>
            {!specialist && ["owner", "manager"].includes(journey.project.role) && journey.project.changeResponseDays && (
              <ResponseDays projectId={projectId} value={journey.project.changeResponseDays} />
            )}
            <div className={styles.viewToggle} role="group" aria-label="Вид">
              <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>Карта</button>
              <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>Список</button>
            </div>
            {view === "map" && <ProjectMap projectId={projectId} stages={journey.stages} aiOn={journey.ai.configured} />}
            {view === "list" && <ol className={styles.stageList}>
              {journey.stages.map((stage, index) => {
                const tone = statusTone[stage.status];
                const locked = stage.status === "locked";
                const waiting = stage.inputs.filter((input) => !input.satisfied).map((input) => input.title);
                return (
                  <li key={stage.key}>
                    <a className={`${styles.stageItem} ${styles[tone]}`} href={`/projects/${projectId}/stages/${stage.key}`} aria-disabled={locked}>
                      <span className={styles.stageNum} aria-hidden="true">{tone === "done" ? "✓" : index + 1}</span>
                      <span className={styles.stageBody}>
                        <strong>{stage.title}</strong>
                        <span className={styles.small}>{stage.outcome}</span><br />
                        <span className={`${styles.chip} ${styles[tone]}`}>{stage.statusLabel}</span>
                        {locked && waiting.length > 0 && <span className={styles.small}> · сначала: {waiting.join(", ")}</span>}
                        {stage.status === "stale" && <span className={styles.small}> · {stage.statusExplanation}</span>}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ol>}

            <p style={{ margin: "4px 0 0" }}><a className={styles.back} href={`/projects/${projectId}/history`}>История запросов к ИИ →</a></p>
            {!specialist && <>
            <div style={{ height: 22 }} />
            {journey.project.projectType === "booking" && (
              <section className={styles.card} aria-labelledby="bookings-title">
                <p className={styles.kicker}>Онлайн-запись</p>
                <h2 id="bookings-title" className={styles.h2}>Записи клиентов</h2>
                <p style={{ margin: "0 0 10px" }}>Кто, когда и к какому мастеру записался. Отменяйте записи и отмечайте, пришёл ли клиент.</p>
                <a className={styles.secondary} href={`/projects/${projectId}/bookings`}>Открыть записи</a>
              </section>
            )}
            <WalletCard projectId={projectId} />
            <BudgetCard projectId={projectId} />
            <PublishCard projectId={projectId} onChange={() => void load()} />

            <section className={styles.card} aria-labelledby="code-title">
              <p className={styles.kicker}>Копия кода</p>
              <h2 id="code-title" className={styles.h2}>Где хранить код</h2>
              <p style={{ margin: "0 0 12px" }}>Сайт работает на BuildPath и без этого. Копия у вас — страховка: можно переехать, отдать разработчику или восстановить. Выберите вариант — мы объясним, что сделать.</p>
              <a className={`${styles.secondary} ${styles.block}`} href={`/projects/${projectId}/choices/code_hosting`}>Выбрать, где хранить код</a>
              <p style={{ margin: "14px 0 8px" }}>Сайт можно разместить не только на BuildPath: на своём сервере или в GitHub Pages. Мы проведём по шагам и проверим, что он открывается.</p>
              <a className={`${styles.secondary} ${styles.block}`} href={`/projects/${projectId}/choices/deployment`}>Где будет работать сайт</a>
            </section>

            <section className={styles.card} aria-labelledby="result-title">
              <p className={styles.kicker}>Результат</p>
              <h2 id="result-title" className={styles.h2}>Забрать результат можно на любом этапе</h2>
              <p style={{ margin: "0 0 12px" }}>{journey.project.resultExplanation} В файлы попадёт только то, что вы приняли.</p>
              {!result && <button className={`${styles.secondary} ${styles.block}`} disabled={busy} onClick={prepareResult}>{busy ? "Готовим…" : "Подготовить файлы"}</button>}
              {result && (
                <>
                  {result.openItems.length > 0 && (
                    <div className={`${styles.notice} ${styles.warn}`}>
                      Ещё не сделано:
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
                  <p className={styles.small} style={{ marginTop: 10 }}>Файл site.html можно загрузить на любой хостинг статических сайтов. Форма заявок работает только на сайте, опубликованном через BuildPath.</p>
                </>
              )}
              {!archived && !live && journey.project.role === "owner" && (
                <button className={styles.ghost} style={{ marginTop: 12, marginLeft: 8 }} disabled={busy} onClick={() => setStatus("archive")}>Отправить в архив</button>
              )}
              {!completed && !live && !archived && journey.project.role === "owner" && (
                <button className={styles.ghost} style={{ marginTop: 12 }} disabled={busy} onClick={() => setStatus("complete")}>Завершить проект на этом этапе</button>
              )}
            </section>
            </>}
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
      <span>Срок ответа на изменения:</span>
      <select className={styles.input} style={{ width: "auto", minHeight: 36, padding: "4px 8px" }} value={days} onChange={(event) => void save(Number(event.target.value))}>
        {[1, 2, 3, 5, 7, 14].map((item) => <option key={item} value={item}>{item} дн.</option>)}
      </select>
      <span>{saved ? "Сохранено." : "Потом — напоминание, а ещё через 2 дня вы сможете решить за этап."}</span>
    </label>
  );
}
