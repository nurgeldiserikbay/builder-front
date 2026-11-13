"use client";

import { t , getLocale } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { isPlanMessage, explainError, type CatalogType } from "@/lib/journey";
import styles from "./journey.module.css";
import AppHeader from "../app-header";

type Workspace = { id: string; name: string; role: string };
type Assignment = { id: string; projectId: string; projectName: string; stageKey: string; stageTitle: string; stageStatus: string; role: string; roleTitle: string; status: string };
type TeamProject = { id: string; name: string; status: string; ownerName: string | null; role: string; roleTitle: string };
type Project = { id: string; name: string; status: string; projectType: string | null; createdAt: string; updatedAt: string };

const projectStatus: Record<string, string> = { draft: t("Черновик"), active: t("В работе"), paused: t("На паузе"), completed: t("Завершён"), archived: t("В архиве"), live: t("Опубликован") };

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
  const [typeKey, setTypeKey] = useState<CatalogType["key"] | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState<string>("");
  const [siteLocale, setSiteLocale] = useState<"ru" | "en">(() => (getLocale() === "en" ? "en" : "ru"));
  const [busy, setBusy] = useState(false);
  const [masterPlaces, setMasterPlaces] = useState(0);

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
        setMasterPlaces(master.places.length);
        setTypes(catalog.projectTypes);
        setAssignments(mine);
        const first = workspaces[0] ?? null;
        setWorkspace(first);
        if (first) {
          const list = await api<Project[]>(`/projects?workspaceId=${encodeURIComponent(first.id)}`);
          setProjects(list.filter((project) => project.projectType));
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

  const type = types.find((item) => item.key === typeKey) ?? null;
  const startOptions = type ? type.stages.filter((stage, index) => index > 0 && stage.importHint) : [];

  async function create() {
    if (!workspace || !type) return;
    setBusy(true);
    setError("");
    try {
      const project = await api<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ workspaceId: workspace.id, name: name.trim(), startMode: "build", locale: siteLocale, projectType: type.key, ...(start ? { startStageKey: start } : {}) }),
      });
      router.push(`/projects/${project.id}`);
    } catch (caught) {
      setError(explainError(caught));
      setBusy(false);
    }
  }

  return (
    <div className={styles.shell}>
      <AppHeader />
      <main className={`${styles.container} ${styles.wide}`}>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}{isPlanMessage(error) && <> <a href="/account/plan" style={{ color: "inherit", fontWeight: 700 }}>{t("Открыть тариф →")}</a></>}</p>}
        {loading && <p className={styles.muted}>{t("Загружаем ваши проекты…")}</p>}

        {!loading && !creating && (
          <>
            <div className={styles.pageHead}>
              <div>
                <p className={styles.kicker}>{t("Ваши проекты")}</p>
                <h1 className={styles.h1} style={{ margin: 0 }}>{t("Продолжите с того места, где остановились")}</h1>
              </div>
              <button className={styles.button} onClick={() => { setCreating(true); setStep(1); }}>{t("+ Новый проект")}</button>
            </div>
            <div className={styles.projectGrid}>
              {projects.filter((project) => project.status !== "archived").map((project) => (
                <a key={project.id} className={styles.projectCard} href={`/projects/${project.id}`}>
                  <span className={styles.small}>{types.find((item) => item.key === project.projectType)?.title ?? t("Проект")}</span>
                  <strong>{project.name}</strong>
                  <span className={`${styles.chip} ${styles[project.status === "live" || project.status === "completed" ? "done" : project.status === "active" ? "active" : "closed"]}`} style={{ alignSelf: "flex-start" }}>{projectStatus[project.status] ?? project.status}</span>
                </a>
              ))}
            </div>
            {projects.some((project) => project.status === "archived") && (
              <details className={`${styles.card} ${styles.details}`} style={{ marginTop: 14 }}>
                <summary>{t("Архив (")}{projects.filter((project) => project.status === "archived").length})</summary>
                {projects.filter((project) => project.status === "archived").map((project) => (
                  <a key={project.id} className={styles.projectCard} href={`/projects/${project.id}`}><strong>{project.name}</strong></a>
                ))}
              </details>
            )}
            {masterPlaces > 0 && (
              <a className={styles.projectCard} href="/master" style={{ marginTop: 14 }}>
                <strong>{t("Мои записи как мастера")}</strong>
                <div className={styles.small}>{t("Клиенты, которые записались к вам")}{masterPlaces > 1 ? t(" — в {0} местах", [masterPlaces]) : ""}</div>
              </a>
            )}
            {teamProjects.length > 0 && (
              <>
                <h2 className={styles.h2} style={{ marginTop: 22 }}>{t("Вы в команде")}</h2>
                {teamProjects.map((item) => (
                  <a key={item.id} className={styles.projectCard} href={`/projects/${item.id}`}>
                    <strong>{item.name}</strong>
                    <div className={styles.small}>{item.roleTitle}{item.ownerName ? ` · ${t("владелец:")} ${item.ownerName}` : ""} · {projectStatus[item.status] ?? item.status}</div>
                  </a>
                ))}
              </>
            )}
            {assignments.length > 0 && (
              <>
                <h2 className={styles.h2} style={{ marginTop: 22 }}>{t("Вы помогаете в проектах")}</h2>
                <p className={styles.small} style={{ margin: "0 0 10px" }}>{t("Сюда попадают этапы, на которые вас пригласили как специалиста.")}</p>
                {assignments.map((item) => (
                  <a key={item.id} className={styles.projectCard} href={`/projects/${item.projectId}/stages/${item.stageKey}`}>
                    <strong>{item.projectName}</strong>
                    <div className={styles.small}>{t("Этап «")}{item.stageTitle}» · {item.roleTitle}{item.status === "completed" ? t(" · этап принят") : item.stageStatus === "in_review" ? t(" · на приёмке") : item.stageStatus === "changes_requested" ? t(" · нужны правки") : ""}</div>
                  </a>
                ))}
              </>
            )}
          </>
        )}

        {!loading && creating && (
          <>
            <p className={styles.kicker}>{t("Новый проект · шаг")}{" "}{step}{" "}{t("из 3")}</p>
            {step === 1 && (
              <>
                <h1 className={styles.h1}>{t("Какой сайт вам нужен?")}</h1>
                <p className={styles.lead}>{t("Выберите самое близкое. От этого зависят этапы, которые мы пройдём вместе. Тип можно будет уточнить по ходу работы.")}</p>
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
                <p className={styles.small} style={{ marginTop: 14 }}>{t("Мобильные приложения, магазины с оплатой и личные кабинеты появятся позже.")}</p>
                <div className={styles.row} style={{ marginTop: 18 }}>
                  {projects.length > 0 && <button className={styles.ghost} onClick={() => setCreating(false)}>{t("Отмена")}</button>}
                  <div className={styles.spacer} />
                  <button className={styles.button} disabled={!typeKey} onClick={() => setStep(2)}>{t("Дальше")}</button>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h1 className={styles.h1}>{t("Как назовём проект?")}</h1>
                <p className={styles.lead}>{t("Это название для вас — посетители сайта его не увидят. Можно изменить позже.")}</p>
                <label className={styles.field}>
                  <span className={styles.label}>{t("Название проекта")}</span>
                  <input className={styles.input} value={name} maxLength={120} autoFocus placeholder={t("Например: Сайт для тортов")} onChange={(event) => setName(event.target.value)} />
                </label>
                <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: "16px 0 20px" }}>
                  <legend className={styles.label}>{t("Язык сайта")}</legend>
                  <div className={styles.row} role="radiogroup" aria-label={t("Язык сайта")}>
                    {(["ru", "en"] as const).map((code) => (
                      <button key={code} type="button" role="radio" aria-checked={siteLocale === code} className={siteLocale === code ? styles.button : styles.ghost} onClick={() => setSiteLocale(code)}>
                        {code === "ru" ? "Русский" : "English"}
                      </button>
                    ))}
                  </div>
                  <span className={styles.small}>{t("На этом языке будут кнопки, формы и страницы записи на сайте, письма вашим клиентам, шаблоны и черновики ИИ. Интерфейс BuildPath остаётся на вашем языке. Поменять язык сайта после создания пока нельзя.")}</span>
                </fieldset>
                <div className={styles.row}>
                  <button className={styles.ghost} onClick={() => setStep(1)}>{t("Назад")}</button>
                  <div className={styles.spacer} />
                  <button className={styles.button} disabled={!name.trim()} onClick={() => setStep(3)}>{t("Дальше")}</button>
                </div>
              </>
            )}
            {step === 3 && type && (
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
                <div className={styles.row} style={{ marginTop: 18 }}>
                  <button className={styles.ghost} onClick={() => setStep(2)}>{t("Назад")}</button>
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
