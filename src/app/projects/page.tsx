"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { isPlanMessage, explainError, type CatalogType } from "@/lib/journey";
import styles from "./journey.module.css";

type Workspace = { id: string; name: string; role: string };
type Assignment = { id: string; projectId: string; projectName: string; stageKey: string; stageTitle: string; stageStatus: string; role: string; roleTitle: string; status: string };
type Project = { id: string; name: string; status: string; projectType: string | null; createdAt: string; updatedAt: string };

const projectStatus: Record<string, string> = { draft: "Черновик", active: "В работе", paused: "На паузе", completed: "Завершён", archived: "В архиве", live: "Опубликован" };

export default function ProjectsPage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [types, setTypes] = useState<CatalogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(1);
  const [typeKey, setTypeKey] = useState<CatalogType["key"] | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [workspaces, catalog, mine] = await Promise.all([
          api<Workspace[]>("/workspaces"),
          api<{ version: string; projectTypes: CatalogType[] }>("/journey/catalog"),
          api<Assignment[]>("/me/assignments"),
        ]);
        setTypes(catalog.projectTypes);
        setAssignments(mine);
        const first = workspaces[0] ?? null;
        setWorkspace(first);
        if (first) {
          const list = await api<Project[]>(`/projects?workspaceId=${encodeURIComponent(first.id)}`);
          setProjects(list.filter((project) => project.projectType));
          if (!list.some((project) => project.projectType) && mine.length === 0) setCreating(true);
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
        body: JSON.stringify({ workspaceId: workspace.id, name: name.trim(), startMode: "build", locale: "ru", projectType: type.key, ...(start ? { startStageKey: start } : {}) }),
      });
      router.push(`/projects/${project.id}`);
    } catch (caught) {
      setError(explainError(caught));
      setBusy(false);
    }
  }

  return (
    <div className={styles.shell}>
      <header className={styles.top}><div className={styles.topInner}>
        <a className={styles.brand} href="/"><span aria-hidden="true">B</span>BuildPath</a>
        <div className={styles.spacer} />
        <a className={styles.back} href="/account/plan">Тариф</a>
        <a className={styles.back} href="/review" style={{ marginLeft: 12 }}>Сверка сайта</a>
      </div></header>
      <main className={styles.container}>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}{isPlanMessage(error) && <> <a href="/account/plan" style={{ color: "inherit", fontWeight: 800 }}>Открыть тариф →</a></>}</p>}
        {loading && <p className={styles.muted}>Загружаем ваши проекты…</p>}

        {!loading && !creating && (
          <>
            <p className={styles.kicker}>Ваши проекты</p>
            <h1 className={styles.h1}>Продолжите с того места, где остановились</h1>
            <button className={`${styles.button} ${styles.block}`} onClick={() => { setCreating(true); setStep(1); }}>+ Новый проект</button>
            <div style={{ height: 18 }} />
            {projects.filter((project) => project.status !== "archived").map((project) => (
              <a key={project.id} className={styles.projectCard} href={`/projects/${project.id}`}>
                <strong style={{ fontSize: 17 }}>{project.name}</strong>
                <div className={styles.small}>{types.find((item) => item.key === project.projectType)?.title ?? "Проект"} · {projectStatus[project.status] ?? project.status}</div>
              </a>
            ))}
            {projects.some((project) => project.status === "archived") && (
              <details className={`${styles.card} ${styles.details}`} style={{ marginTop: 14 }}>
                <summary>Архив ({projects.filter((project) => project.status === "archived").length})</summary>
                {projects.filter((project) => project.status === "archived").map((project) => (
                  <a key={project.id} className={styles.projectCard} href={`/projects/${project.id}`}><strong>{project.name}</strong></a>
                ))}
              </details>
            )}
            {assignments.length > 0 && (
              <>
                <h2 className={styles.h2} style={{ marginTop: 22 }}>Вы помогаете в проектах</h2>
                <p className={styles.small} style={{ margin: "0 0 10px" }}>Сюда попадают этапы, на которые вас пригласили как специалиста.</p>
                {assignments.map((item) => (
                  <a key={item.id} className={styles.projectCard} href={`/projects/${item.projectId}/stages/${item.stageKey}`}>
                    <strong style={{ fontSize: 17 }}>{item.projectName}</strong>
                    <div className={styles.small}>Этап «{item.stageTitle}» · {item.roleTitle}{item.status === "completed" ? " · этап принят" : item.stageStatus === "in_review" ? " · на приёмке" : item.stageStatus === "changes_requested" ? " · нужны правки" : ""}</div>
                  </a>
                ))}
              </>
            )}
          </>
        )}

        {!loading && creating && (
          <>
            <p className={styles.kicker}>Новый проект · шаг {step} из 3</p>
            {step === 1 && (
              <>
                <h1 className={styles.h1}>Какой сайт вам нужен?</h1>
                <p className={styles.lead}>Выберите самое близкое. От этого зависят этапы, которые мы пройдём вместе. Тип можно будет уточнить по ходу работы.</p>
                <div className={styles.typeGrid}>
                  {types.map((item) => (
                    <button key={item.key} type="button" className={styles.typeCard} aria-pressed={typeKey === item.key} onClick={() => setTypeKey(item.key)}>
                      <strong style={{ fontSize: 18 }}>{item.title}</strong>
                      <p style={{ margin: "6px 0" }}>{item.description}</p>
                      <p className={styles.small} style={{ margin: "0 0 8px" }}>Подходит: {item.goodFor}</p>
                      <p className={styles.small} style={{ margin: 0 }}>Этапы: {item.stages.map((stage) => stage.title).join(" → ")}</p>
                    </button>
                  ))}
                </div>
                <p className={styles.small} style={{ marginTop: 14 }}>Мобильные приложения, магазины с оплатой и личные кабинеты появятся позже.</p>
                <div className={styles.row} style={{ marginTop: 18 }}>
                  {projects.length > 0 && <button className={styles.ghost} onClick={() => setCreating(false)}>Отмена</button>}
                  <div className={styles.spacer} />
                  <button className={styles.button} disabled={!typeKey} onClick={() => setStep(2)}>Дальше</button>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h1 className={styles.h1}>Как назовём проект?</h1>
                <p className={styles.lead}>Это название для вас — посетители сайта его не увидят. Можно изменить позже.</p>
                <label className={styles.field}>
                  <span className={styles.label}>Название проекта</span>
                  <input className={styles.input} value={name} maxLength={120} autoFocus placeholder="Например: Сайт для тортов" onChange={(event) => setName(event.target.value)} />
                </label>
                <div className={styles.row}>
                  <button className={styles.ghost} onClick={() => setStep(1)}>Назад</button>
                  <div className={styles.spacer} />
                  <button className={styles.button} disabled={!name.trim()} onClick={() => setStep(3)}>Дальше</button>
                </div>
              </>
            )}
            {step === 3 && type && (
              <>
                <h1 className={styles.h1}>С чего начнём?</h1>
                <p className={styles.lead}>Если что-то у вас уже готово, начните сразу с этого этапа — не придётся делать работу заново.</p>
                <div className={styles.choices}>
                  <button type="button" className={styles.choice} aria-pressed={start === ""} onClick={() => setStart("")}>
                    <strong>С самого начала</strong>
                    <span className={styles.small}>Ответите на несколько вопросов о бизнесе — ИИ поможет со всем остальным.</span>
                  </button>
                  {startOptions.map((stage) => (
                    <button key={stage.key} type="button" className={styles.choice} aria-pressed={start === stage.key} onClick={() => setStart(stage.key)}>
                      <strong>У меня уже есть: {stage.title.toLowerCase()}</strong>
                      <span className={styles.small}>{stage.importHint}</span>
                    </button>
                  ))}
                </div>
                {start && <p className={`${styles.notice} ${styles.info}`} style={{ marginTop: 14 }}>Мы откроем этот этап и предыдущие, чтобы вы могли вставить готовые материалы. Остальное сделаем вместе.</p>}
                <div className={styles.row} style={{ marginTop: 18 }}>
                  <button className={styles.ghost} onClick={() => setStep(2)}>Назад</button>
                  <div className={styles.spacer} />
                  <button className={styles.button} disabled={busy || !workspace} onClick={create}>{busy ? "Создаём…" : "Создать проект"}</button>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
