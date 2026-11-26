"use client";

import { t, getLocale, dateLocale } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { isPlanMessage, explainError, statusTone, type CatalogType, type StageStatus } from "@/lib/journey";
import { dueText, inboxLine, type Inbox } from "@/lib/inbox";
import { formatTenge } from "@/lib/money";
import styles from "./journey.module.css";
import AppHeader from "../app-header";

type Workspace = { id: string; name: string; role: string };
type Assignment = { id: string; projectId: string; projectName: string; stageKey: string; stageTitle: string; stageStatus: string; role: string; roleTitle: string; status: string };
type TeamProject = { id: string; name: string; status: string; ownerName: string | null; role: string; roleTitle: string };
type Overview = {
  stagesTotal: number; stagesAccepted: number; currentStage: { key: string; status: StageStatus } | null; waiting: number; openChanges: number; people: number;
  publication: { slug: string; status: string; monitor: string } | null; lastActivityAt: string | null;
};
type Project = { id: string; name: string; status: string; projectType: string | null; startMode?: string; createdAt: string; updatedAt: string; overview?: Overview };
type Filter = "open" | "live" | "archived" | "all";
type RouteEstimate = { requests: { min: number; max: number }; pricingConfigured: boolean; perRequest: number | null; cost: { min: number; max: number } | null; stages: Array<{ key: string; title: string; brought: boolean; aiUsed: boolean; requests: { min: number; max: number } }> };
const stageStatusText: Record<StageStatus, string> = {
  locked: t("Закрыт"), ready: t("Можно начинать"), awaiting_lead: t("Ждёт ведущего"), in_progress: t("В работе"), in_review: t("На приёмке"),
  changes_requested: t("Нужны правки"), approved: t("Принят"), stale: t("Устарел"), imported: t("Свои материалы"), skipped: t("Пропущен"), blocked: t("Заблокирован"),
};
/** «5 мин назад», «вчера», «3 дн. назад», then the date. */
function ago(value: string | null | undefined): string {
  if (!value) return "—";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return t("только что");
  if (minutes < 60) return t("{0} мин назад", [minutes]);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("{0} ч назад", [hours]);
  const days = Math.round(hours / 24);
  if (days === 1) return t("вчера");
  if (days < 7) return t("{0} дн. назад", [days]);
  return new Date(value).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" });
}

const ANALYSIS = "__analysis" as const;
type Answers = { appointments?: boolean; products?: boolean; accounts?: boolean; size?: "one" | "few" | "many" };
type TypeQuestion = { key: keyof Answers; question: string; hint: string; options: Array<{ value: string; label: string }> };
type Suggestion = { questions: TypeQuestion[]; hinted: Answers; answers: Answers; suggestion: { type: CatalogType["key"]; reason: string; alternatives: Array<CatalogType["key"]> } | null; missing: string[] };
const projectStatus: Record<string, string> = { draft: t("Черновик"), active: t("В работе"), paused: t("На паузе"), completed: t("Завершён"), archived: t("В архиве"), live: t("Опубликован"), cancelled: t("Отменён") };

export default function ProjectsPage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teamProjects, setTeamProjects] = useState<TeamProject[]>([]);
  const [types, setTypes] = useState<CatalogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(1);
  const [typeKey, setTypeKey] = useState<CatalogType["key"] | typeof ANALYSIS | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState<string>("");
  const [siteLocale, setSiteLocale] = useState<"ru" | "en">(() => (getLocale() === "en" ? "en" : "ru"));
  const [busy, setBusy] = useState(false);
  const [masterPlaces, setMasterPlaces] = useState(0);
  // «Расскажите о своём деле»: the story, the owner's answers and the type the server suggests from them.
  const [story, setStory] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [suggested, setSuggested] = useState<Suggestion | null>(null);
  const [pickYourself, setPickYourself] = useState(false);
  const [filter, setFilter] = useState<Filter>("open");
  const [aiUsage, setAiUsage] = useState<{ used: number; limit: number } | null>(null);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [estimate, setEstimate] = useState<RouteEstimate | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [workspaces, catalog, mine, master, team] = await Promise.all([
          api<Workspace[]>("/workspaces"),
          api<{ version: string; projectTypes: CatalogType[] }>("/journey/catalog"),
          api<Assignment[]>("/me/assignments"),
          api<{ places: Array<{ accessId: string }> }>("/me/master-bookings").catch(() => ({ places: [] })),
          api<TeamProject[]>("/me/team-projects").catch(() => []),
        ]);
        setTeamProjects(team);
        api<Inbox>("/me/inbox").then(setInbox).catch(() => undefined);
        api<{ usage: Array<{ key: string; used: number; limit: number }> }>("/me/plan").then((plan) => setAiUsage(plan.usage.find((item) => item.key === "aiPerMonth") ?? null)).catch(() => undefined);
        if (new URLSearchParams(window.location.search).get("new") === "1") setCreating(true);
        setMasterPlaces(master.places.length);
        setTypes(catalog.projectTypes);
        setAssignments(mine);
        const first = workspaces[0] ?? null;
        setWorkspace(first);
        if (first) {
          const list = await api<Project[]>(`/projects?workspaceId=${encodeURIComponent(first.id)}&limit=100`);
          // Projects without a route are «Только анализ»: code analysis and site checks, no development stages.
          setProjects(list.filter((project) => project.projectType || project.startMode === "analysis_only"));
          if (!list.some((project) => project.projectType) && mine.length === 0 && master.places.length === 0 && team.length === 0) setCreating(true);
        }
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
        setError(explainError(caught));
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!creating || step !== 2) return;
    let cancelled = false;
    api<Suggestion>("/journey/type-suggestion", { method: "POST", body: JSON.stringify({ description: story.trim(), answers }) })
      .then((result) => {
        if (cancelled) return;
        setSuggested(result);
        // The suggestion is the choice until the owner picks a type themselves.
        if (!pickYourself) setTypeKey(result.suggestion?.type ?? null);
      })
      .catch((caught) => { if (!cancelled) setError(explainError(caught)); });
    return () => { cancelled = true; };
  }, [creating, step, story, answers, pickYourself]);

  const type = types.find((item) => item.key === typeKey) ?? null;
  // What the chosen route costs before anything is created: AI requests (and tenge once prices are set) from the start.
  useEffect(() => {
    if (step !== 4 || !type) return;
    let alive = true;
    const params = new URLSearchParams({ projectType: type.key, ...(start ? { startStageKey: start } : {}) });
    api<RouteEstimate>(`/journey/estimate?${params}`).then((value) => { if (alive) setEstimate(value); }).catch(() => { if (alive) setEstimate(null); });
    return () => { alive = false; };
  }, [step, type, start]);
  const startOptions = type ? type.stages.filter((stage, index) => index > 0 && stage.importHint) : [];

  const analysisOnly = typeKey === ANALYSIS;

  async function create() {
    if (!workspace || (!type && !analysisOnly)) return;
    setBusy(true);
    setError("");
    try {
      const project = await api<Project>("/projects", {
        method: "POST",
        body: JSON.stringify(analysisOnly
          ? { workspaceId: workspace.id, name: name.trim(), startMode: "analysis_only", locale: getLocale() }
          : { workspaceId: workspace.id, name: name.trim(), startMode: "build", locale: siteLocale, projectType: type!.key, ...(start ? { startStageKey: start } : {}), ...(story.trim() ? { summary: story.trim() } : {}) }),
      });
      router.push(analysisOnly ? `/projects/${project.id}/analysis` : `/projects/${project.id}`);
    } catch (caught) {
      setError(explainError(caught));
      setBusy(false);
    }
  }

  return (
    <div className={styles.shell}>
      <AppHeader />
      <main className={`${styles.container} ${creating ? "" : styles.wide}`}>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}{isPlanMessage(error) && <> <a href="/account/plan" style={{ color: "inherit", fontWeight: 700 }}>{t("Открыть тариф →")}</a></>}</p>}
        {loading && <p className={styles.muted}>{t("Загружаем ваши проекты…")}</p>}

        {!loading && !creating && (() => {
          const typeTitle = (project: Project) => project.projectType ? types.find((item) => item.key === project.projectType)?.title ?? t("Проект") : t("Только анализ");
          const stageTitle = (project: Project, key: string) => types.find((item) => item.key === project.projectType)?.stages.find((stage) => stage.key === key)?.title ?? key;
          const isLive = (project: Project) => project.status === "live" || project.overview?.publication?.status === "live";
          const open = projects.filter((project) => !["archived", "cancelled", "completed"].includes(project.status));
          const live = projects.filter(isLive);
          const archived = projects.filter((project) => project.status === "archived");
          const waiting = inbox?.waiting ?? [];
          const waitingProjects = new Set(waiting.map((item) => item.projectId)).size;
          const stageOf = (projectType: string | null, key: string | null) => types.find((item) => item.key === projectType)?.stages.find((stage) => stage.key === key)?.title ?? key ?? "";
          const shown = filter === "open" ? open : filter === "live" ? live : filter === "archived" ? archived : projects;
          const filters: Array<{ key: Filter; label: string; count: number }> = [
            { key: "open", label: t("В работе"), count: open.length }, { key: "live", label: t("Опубликованы"), count: live.length },
            { key: "archived", label: t("Архив"), count: archived.length }, { key: "all", label: t("Все"), count: projects.length },
          ];
          return (
          <>
            <div className={styles.pageHead}>
              <div>
                <p className={styles.kicker}>{!workspace || workspace.name === "My workspace" ? t("Моё пространство") : workspace.name}</p>
                <h1 className={styles.h1}>{t("Проекты")}</h1>
              </div>
              <button className={styles.button} onClick={() => { setCreating(true); setStep(1); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                {t("Новый проект")}
              </button>
            </div>

            <div className={styles.stats}>
              <div className={styles.stat}><span>{t("В работе")}</span><b>{open.length}</b><small>{t("из {0} проектов", [projects.length])}</small></div>
              <a className={styles.stat} href="/inbox" style={{ color: "inherit", textDecoration: "none" }}><span>{t("Ждут вашего решения")}</span><b style={waiting.length ? { color: "#8a4b00" } : undefined}>{inbox ? waiting.length : "—"}</b><small>{waiting.length ? t("в {0} проектах", [waitingProjects]) : t("всё решено")}</small></a>
              <div className={styles.stat}><span>{t("Опубликовано")}</span><b>{live.length}</b><small>{t("сайтов и приложений")}</small></div>
              <div className={styles.stat}><span>{t("Запросы к ИИ")}</span><b>{aiUsage ? aiUsage.used : "—"}</b><small>{aiUsage ? t("из {0} в этом месяце", [aiUsage.limit]) : t("в этом месяце")}</small></div>
            </div>

            {waiting.length > 0 && (
              <>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.h2}>{t("Требует решения")}</h2>
                  <a className={styles.small} href="/inbox" style={{ marginLeft: "auto", color: "var(--brand)", fontWeight: 600, textDecoration: "none" }}>{t("Все входящие")}{waiting.length > 5 ? ` (${waiting.length})` : ""} →</a>
                </div>
                <ul className={styles.attnList}>
                  {waiting.slice(0, 5).map((item) => {
                    const line = inboxLine(item, stageOf);
                    const due = item.dueAt ? dueText(item.dueAt) : null;
                    return (
                      <li key={item.id}>
                        <a href={line.href}>
                          <span className={styles.attnDot} aria-hidden="true" style={item.kind === "dispute" || due?.overdue ? { background: "var(--danger)" } : undefined} />
                          <span><b>{line.title}</b><span className={styles.cellSub}>{item.projectName}{item.who ? ` · ${item.who}` : ""}</span></span>
                          {due && <span className={`${styles.due} ${due.overdue ? styles.overdue : ""}`}>{due.text}</span>}
                          <span className={styles.small} style={{ color: "var(--brand)", fontWeight: 600 }}>{line.action}</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <div className={styles.sectionHeader}>
              <h2 className={styles.h2}>{t("Все проекты")}</h2>
              <div className={styles.segmented} role="group" aria-label={t("Показать")} style={{ marginLeft: "auto" }}>
                {filters.map((item) => (
                  <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label} <span className={styles.num} style={{ opacity: .6 }}>{item.count}</span></button>
                ))}
              </div>
            </div>
            {shown.length === 0 ? (
              <div className={styles.empty}>
                {filter === "open" ? <>{t("Нет проектов в работе.")} <button type="button" className={styles.linkButton} onClick={() => { setCreating(true); setStep(1); }}>{t("Начать новый")}</button></> : t("Здесь пока пусто.")}
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t("Проект")}</th>
                      <th>{t("Сейчас")}</th>
                      <th className={styles.hideMobile}>{t("Прогресс")}</th>
                      <th className={styles.hideMobile} style={{ textAlign: "center" }} title={t("Этапы на приёмке, доработке или устаревшие и изменения без решения — у всех участников проекта")}>{t("Открыто")}</th>
                      <th className={styles.hideMobile} style={{ textAlign: "center" }}>{t("Люди")}</th>
                      <th className={styles.hideMobile}>{t("Обновлён")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((project) => {
                      const view = project.overview;
                      const current = view?.currentStage;
                      const percent = view && view.stagesTotal ? Math.round((view.stagesAccepted / view.stagesTotal) * 100) : 0;
                      const href = project.projectType ? `/projects/${project.id}` : `/projects/${project.id}/analysis`;
                      return (
                        <tr key={project.id}>
                          <td>
                            <a className={styles.tableLink} href={href}>{project.name}</a>
                            <span className={styles.cellSub}>{typeTitle(project)}</span>
                          </td>
                          <td>
                            {project.status !== "active" || !current
                              ? <span className={`${styles.chip} ${styles[isLive(project) || project.status === "completed" ? "done" : project.status === "paused" ? "attention" : project.status === "active" ? "active" : "closed"]}`} style={{ marginTop: 0 }}>{isLive(project) ? t("Опубликован") : projectStatus[project.status] ?? project.status}</span>
                              : <>
                                  <span style={{ fontWeight: 500 }}>{stageTitle(project, current.key)}</span>
                                  <span className={styles.cellSub}><span className={`${styles.chip} ${styles[statusTone[current.status]]}`} style={{ marginTop: 2 }}>{stageStatusText[current.status]}</span></span>
                                </>}
                          </td>
                          <td className={styles.hideMobile}>
                            {view && view.stagesTotal > 0
                              ? <span className={`${styles.meter} ${percent === 100 ? styles.complete : ""}`}><span><i style={{ width: `${percent}%` }} /></span><small>{view.stagesAccepted}/{view.stagesTotal}</small></span>
                              : <span className={styles.small}>—</span>}
                          </td>
                          <td className={styles.hideMobile} style={{ textAlign: "center" }}><span className={`${styles.count} ${view?.waiting ? "" : styles.zero}`}>{view?.waiting ?? 0}</span></td>
                          <td className={`${styles.hideMobile} ${styles.num}`} style={{ textAlign: "center", color: "var(--muted)" }}>{view?.people ?? "—"}</td>
                          <td className={`${styles.hideMobile} ${styles.small}`} style={{ whiteSpace: "nowrap" }}>{ago(view?.lastActivityAt ?? project.updatedAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {(masterPlaces > 0 || teamProjects.length > 0 || assignments.length > 0) && (
              <div className={styles.sectionHeader}>
                <h2 className={styles.h2}>{t("Где вы участвуете")}</h2>
                {assignments.length > 0 && <a className={styles.small} href="/work" style={{ marginLeft: "auto", color: "var(--brand)", fontWeight: 600, textDecoration: "none" }}>{t("Моя работа: время и выплаты")} →</a>}
              </div>
            )}
            <div className={styles.projectGrid}>
              {masterPlaces > 0 && (
                <a className={styles.projectCard} href="/master">
                  <span className={styles.kicker} style={{ margin: 0 }}>{t("Мастер")}</span>
                  <strong>{t("Мои записи как мастера")}</strong>
                  <div className={styles.small}>{t("Клиенты, которые записались к вам")}{masterPlaces > 1 ? t(" — в {0} местах", [masterPlaces]) : ""}</div>
                </a>
              )}
              {teamProjects.map((item) => (
                <a key={item.id} className={styles.projectCard} href={`/projects/${item.id}`}>
                  <span className={styles.kicker} style={{ margin: 0 }}>{t("Команда проекта")}</span>
                  <strong>{item.name}</strong>
                  <div className={styles.small}>{item.roleTitle}{item.ownerName ? ` · ${t("владелец:")} ${item.ownerName}` : ""} · {projectStatus[item.status] ?? item.status}</div>
                </a>
              ))}
              {assignments.map((item) => (
                <a key={item.id} className={styles.projectCard} href={`/projects/${item.projectId}/stages/${item.stageKey}`}>
                  <span className={styles.kicker} style={{ margin: 0 }}>{t("Вы специалист")} · {item.roleTitle}</span>
                  <strong>{item.projectName}</strong>
                  <div className={styles.small}>{t("Этап «")}{item.stageTitle}»{item.status === "completed" ? t(" · этап принят") : item.stageStatus === "in_review" ? t(" · на приёмке") : item.stageStatus === "changes_requested" ? t(" · нужны правки") : ""}</div>
                </a>
              ))}
            </div>
          </>
          );
        })()}

        {!loading && creating && (
          <>
            <p className={styles.kicker}>{t("Новый проект · шаг")}{" "}{analysisOnly ? (step === 1 ? 1 : 2) : step}{" "}{analysisOnly ? t("из 2") : t("из 4")}</p>
            {step === 1 && (
              <>
                <h1 className={styles.h1}>{t("Расскажите о своём деле")}</h1>
                <p className={styles.lead}>{t("Пару предложений своими словами: чем занимаетесь, кто ваши клиенты, как они к вам приходят. Мы подберём, что нужно сделать, а рассказ станет первым этапом — «Идея своими словами».")}</p>
                <label className={styles.field}>
                  <span className={styles.label}>{t("О вашем деле")}</span>
                  <textarea className={styles.textarea} style={{ minHeight: 140 }} value={story} maxLength={1000} autoFocus
                    placeholder={t("Например: у меня барбершоп в центре Алматы, три мастера. Клиенты сейчас записываются по телефону и в WhatsApp, хочу, чтобы записывались сами.")}
                    onChange={(event) => setStory(event.target.value)} />
                  <span className={styles.small}>{t("Не думайте о сайте — пишите о бизнесе. Технику подберём сами.")}</span>
                </label>
                <div className={styles.row} style={{ marginTop: 18 }}>
                  {projects.length > 0 && <button className={styles.ghost} onClick={() => setCreating(false)}>{t("Отмена")}</button>}
                  <div className={styles.spacer} />
                  <button className={styles.button} disabled={story.trim().length < 10} onClick={() => { setPickYourself(false); setAnswers({}); if (typeKey === ANALYSIS) setTypeKey(null); setStep(2); }}>{t("Дальше")}</button>
                </div>
                <p className={styles.small} style={{ marginTop: 18 }}>
                  <button type="button" className={styles.linkButton} onClick={() => { setPickYourself(true); setTypeKey(null); setStep(2); }}>{t("Я знаю, какой сайт нужен — выбрать самому")}</button>
                  {" · "}
                  <button type="button" className={styles.linkButton} onClick={() => { setTypeKey(ANALYSIS); setStep(3); }}>{t("Нужен только разбор кода или ТЗ")}</button>
                </p>
              </>
            )}
            {step === 2 && (
              <>
                <h1 className={styles.h1}>{pickYourself ? t("Какой сайт вам нужен?") : t("Уточним пару вещей")}</h1>
                {!pickYourself && (
                  <>
                    <p className={styles.lead}>{t("Ответьте о вашем бизнесе — по ответам видно, какой сайт подойдёт.")}</p>
                    {suggested && Object.keys(suggested.hinted).length > 0 && <p className={styles.small}>{t("Часть ответов мы отметили по вашему рассказу — проверьте их.")}</p>}
                    <div style={{ display: "grid", gap: 14, marginTop: 8 }}>
                      {(suggested?.questions ?? []).map((question) => {
                        const value = suggested?.answers[question.key];
                        const current = typeof value === "boolean" ? (value ? "yes" : "no") : value;
                        return (
                          <fieldset key={question.key} className={styles.field} style={{ border: 0, padding: 0, margin: 0 }}>
                            <legend className={styles.label} style={{ fontSize: 17 }}>{question.question}</legend>
                            <span className={styles.small} style={{ display: "block", marginBottom: 6 }}>{question.hint}</span>
                            <div className={styles.row} role="radiogroup" aria-label={question.question}>
                              {question.options.map((option) => (
                                <button key={option.value} type="button" role="radio" aria-checked={current === option.value} className={current === option.value ? styles.button : styles.secondary}
                                  onClick={() => setAnswers((list) => ({ ...list, [question.key]: question.key === "size" ? option.value : option.value === "yes" }))}>
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </fieldset>
                        );
                      })}
                    </div>
                    {suggested?.suggestion && (() => {
                      const pick = types.find((item) => item.key === suggested.suggestion!.type);
                      if (!pick) return null;
                      return (
                        <section className={`${styles.card}`} style={{ marginTop: 18 }} aria-live="polite">
                          <span className={`${styles.chip} ${styles.done}`} style={{ marginTop: 0 }}>{t("Рекомендуем")}</span>
                          <p className={styles.cardTitle} style={{ margin: "8px 0 4px" }}>{pick.title}</p>
                          <p style={{ margin: "0 0 6px" }}>{suggested.suggestion.reason}</p>
                          <p className={styles.small} style={{ margin: 0 }}>{t("Этапы:")}{" "}{pick.stages.map((stage) => stage.title).join(" → ")}</p>
                          {suggested.suggestion.alternatives.length > 0 && (
                            <p className={styles.small} style={{ margin: "8px 0 0" }}>{t("Если главное у вас другое:")}{" "}
                              {suggested.suggestion.alternatives.map((key, index) => {
                                const other = types.find((item) => item.key === key);
                                return other ? <span key={key}>{index > 0 ? ", " : ""}<button type="button" className={styles.linkButton} onClick={() => { setPickYourself(true); setTypeKey(key); }}>{other.title}</button></span> : null;
                              })}
                            </p>
                          )}
                        </section>
                      );
                    })()}
                    <p className={styles.small} style={{ marginTop: 14 }}>
                      <button type="button" className={styles.linkButton} onClick={() => { setPickYourself(true); }}>{t("Выбрать тип самому")}</button>
                    </p>
                  </>
                )}
                {pickYourself && (
                  <>
                    <p className={styles.lead}>{t("Выберите самое близкое. От этого зависят этапы, которые мы пройдём вместе.")}</p>
                <div className={styles.typeGrid}>
                  {types.map((item) => (
                    <button key={item.key} type="button" className={styles.typeCard} aria-pressed={typeKey === item.key} onClick={() => setTypeKey(item.key)}>
                      <strong style={{ fontSize: 18 }}>{item.title}</strong>
                      <p style={{ margin: "6px 0" }}>{item.description}</p>
                      <p className={styles.small} style={{ margin: "0 0 8px" }}>{t("Подходит:")}{" "}{item.goodFor}</p>
                      <p className={styles.small} style={{ margin: 0 }}>{t("Этапы:")}{" "}{item.stages.map((stage) => stage.title).join(" → ")}</p>
                    </button>
                  ))}
                </div>
                    {story.trim().length >= 10 && <p className={styles.small} style={{ marginTop: 14 }}><button type="button" className={styles.linkButton} onClick={() => { setPickYourself(false); }}>{t("← Подобрать по ответам о бизнесе")}</button></p>}
                  </>
                )}
                <p className={styles.small} style={{ marginTop: 14 }}>{t("Мобильные приложения пока не делаем.")}</p>
                <div className={styles.row} style={{ marginTop: 18 }}>
                  <button className={styles.ghost} onClick={() => setStep(1)}>{t("Назад")}</button>
                  <div className={styles.spacer} />
                  <button className={styles.button} disabled={!typeKey || typeKey === ANALYSIS} onClick={() => setStep(3)}>{t("Дальше")}</button>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <h1 className={styles.h1}>{t("Как назовём проект?")}</h1>
                <p className={styles.lead}>{t("Это название для вас — посетители сайта его не увидят. Можно изменить позже.")}</p>
                <label className={styles.field}>
                  <span className={styles.label}>{t("Название проекта")}</span>
                  <input className={styles.input} value={name} maxLength={120} autoFocus placeholder={t("Например: Сайт для тортов")} onChange={(event) => setName(event.target.value)} />
                </label>
                {!analysisOnly && <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: "16px 0 20px" }}>
                  <legend className={styles.label}>{t("Язык сайта")}</legend>
                  <div className={styles.row} role="radiogroup" aria-label={t("Язык сайта")}>
                    {(["ru", "en"] as const).map((code) => (
                      <button key={code} type="button" role="radio" aria-checked={siteLocale === code} className={siteLocale === code ? styles.button : styles.ghost} onClick={() => setSiteLocale(code)}>
                        {code === "ru" ? "Русский" : "English"}
                      </button>
                    ))}
                  </div>
                  <span className={styles.small}>{t("На этом языке будут кнопки, формы и страницы записи на сайте, письма вашим клиентам, шаблоны и черновики ИИ. Интерфейс BuildPath остаётся на вашем языке. Поменять язык сайта после создания пока нельзя.")}</span>
                </fieldset>}
                <div className={styles.row}>
                  <button className={styles.ghost} onClick={() => setStep(analysisOnly ? 1 : 2)}>{t("Назад")}</button>
                  <div className={styles.spacer} />
                  {analysisOnly
                    ? <button className={styles.button} disabled={busy || !name.trim() || !workspace} onClick={create}>{busy ? t("Создаём…") : t("Создать и перейти к разбору")}</button>
                    : <button className={styles.button} disabled={!name.trim()} onClick={() => setStep(4)}>{t("Дальше")}</button>}
                </div>
              </>
            )}
            {step === 4 && type && (
              <>
                <h1 className={styles.h1}>{t("С чего начнём?")}</h1>
                <p className={styles.lead}>{t("Если что-то у вас уже готово, начните сразу с этого этапа — не придётся делать работу заново.")}</p>
                <div className={styles.choices}>
                  <button type="button" className={styles.choice} aria-pressed={start === ""} onClick={() => setStart("")}>
                    <strong>{t("С самого начала")}</strong>
                    <span className={styles.small}>{t("Ответите на несколько вопросов о бизнесе — ИИ поможет со всем остальным.")}</span>
                  </button>
                  {startOptions.map((stage) => (
                    <button key={stage.key} type="button" className={styles.choice} aria-pressed={start === stage.key} onClick={() => setStart(stage.key)}>
                      <strong>{t("У меня уже есть:")}{" "}{stage.title.toLowerCase()}</strong>
                      <span className={styles.small}>{stage.importHint}</span>
                    </button>
                  ))}
                </div>
                {start && <p className={`${styles.notice} ${styles.info}`} style={{ marginTop: 14 }}>{t("Мы откроем этот этап и предыдущие, чтобы вы могли вставить готовые материалы. Остальное сделаем вместе.")}</p>}
                {estimate && (
                  <section className={styles.estimate} aria-labelledby="estimate-title">
                    <h2 id="estimate-title" className={styles.h2}>{t("Сколько это будет стоить")}</h2>
                    <dl className={styles.facts}>
                      <dt>{t("Работа ИИ")}</dt>
                      <dd>
                        {estimate.cost ? `${formatTenge(estimate.cost.min)} – ${formatTenge(estimate.cost.max)}` : t("{0}–{1} запросов", [estimate.requests.min, estimate.requests.max])}
                        {estimate.cost && <span className={styles.cellSub}>{t("{0}–{1} запросов, один — около {2}", [estimate.requests.min, estimate.requests.max, formatTenge(estimate.perRequest ?? 0)])}</span>}
                      </dd>
                      {aiUsage && aiUsage.limit > 0 && (
                        <>
                          <dt>{t("По вашему тарифу")}</dt>
                          <dd>{t("в этом месяце осталось: {0}", [Math.max(0, aiUsage.limit - aiUsage.used)])}<span className={styles.cellSub}>{t("запросов из {0} по тарифу", [aiUsage.limit])}</span></dd>
                        </>
                      )}
                      <dt>{t("Специалисты")}</dt>
                      <dd>{t("по желанию")}<span className={styles.cellSub}>{t("цену или ставку вы согласуете сами")}</span></dd>
                    </dl>
                    <p className={styles.small} style={{ margin: "10px 0 0" }}>
                      {t("Смета — сколько запросов обычно уходит на этапы, которые сделает ИИ")}{estimate.stages.some((stage) => stage.brought) ? t("; этапы с вашими готовыми материалами не считаются") : ""}{t(". Ничего не списывается заранее: платите за фактические запросы, а специалисту — только за принятую работу. Лимит расходов можно поставить в проекте.")}
                    </p>
                  </section>
                )}
                <div className={styles.row} style={{ marginTop: 18 }}>
                  <button className={styles.ghost} onClick={() => setStep(3)}>{t("Назад")}</button>
                  <div className={styles.spacer} />
                  <button className={styles.button} disabled={busy || !workspace} onClick={create}>{busy ? t("Создаём…") : t("Создать проект")}</button>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
