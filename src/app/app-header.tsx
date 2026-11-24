"use client";

import { t } from "@/lib/i18n";
import { api } from "@/lib/api";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./projects/journey.module.css";

type Me = { id: string; email: string; name: string | null };
type Workspace = { id: string; name: string; role: string };
type PlanOverview = { plan: { title: string }; usage: Array<{ key: string; title: string; used: number; limit: number }> };
type ProjectRow = { id: string; name: string; projectType: string | null; startMode?: string; status: string; overview?: { waiting: number } };
type Frame = { me: Me | null; workspace: Workspace | null; plan: PlanOverview | null; projects: ProjectRow[]; waiting: number; unread: number; specialist: boolean };

/** The frame data is the same on every screen: asked once per page load, shared by every header on it. */
let frameRequest: Promise<Frame> | null = null;
function loadFrame(): Promise<Frame> {
  frameRequest ??= (async () => {
    const [me, workspaces, plan, inbox, assignments] = await Promise.all([
      api<Me>("/me").catch(() => null),
      api<Workspace[]>("/workspaces").catch(() => [] as Workspace[]),
      api<PlanOverview>("/me/plan").catch(() => null),
      api<{ waiting: unknown[]; unreadUpdates: number }>("/me/inbox").catch(() => null),
      api<unknown[]>("/me/assignments").catch(() => [] as unknown[]),
    ]);
    const workspace = workspaces[0] ?? null;
    const projects = workspace ? await api<ProjectRow[]>(`/projects?workspaceId=${encodeURIComponent(workspace.id)}&limit=100`).catch(() => [] as ProjectRow[]) : [];
    return { me, workspace, plan, projects: projects.filter((project) => project.projectType || project.startMode === "analysis_only"), waiting: inbox?.waiting.length ?? 0, unread: inbox?.unreadUpdates ?? 0, specialist: assignments.length > 0 };
  })();
  return frameRequest;
}

const icons = {
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" /></>,
  projects: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1-3.5 3.6-5.5 6.5-5.5s5.5 2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14.6c2.4.2 4.2 1.9 5 5.4" /></>,
  review: <><rect x="3" y="4" width="8" height="16" rx="1.5" /><rect x="13" y="4" width="8" height="16" rx="1.5" /></>,
  account: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  plan: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></>,
  specialist: <><path d="M12 3 4 7v5c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V7z" /><path d="m9 12 2 2 4-4" /></>,
  work: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>,
};
function Icon({ name }: { name: keyof typeof icons }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}

function initials(me: Me | null): string {
  const source = (me?.name || me?.email || "?").trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * The app frame: a light sidebar with the workspace, search (⌘K), the sections and, at the bottom, plan usage and the
 * account; on phones the sections become a bottom tab bar. Optionally a bar with the way back, the page title and actions.
 * `minimal` hides the sections for pages opened by people without an account (invitations).
 */
export default function AppHeader({ back, title, minimal = false, extra }: {
  back?: { href: string; label: string };
  title?: string;
  minimal?: boolean;
  extra?: React.ReactNode;
}) {
  const path = usePathname() ?? "";
  const [frame, setFrame] = useState<Frame | null>(null);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    if (minimal) return;
    let alive = true;
    loadFrame().then((value) => { if (alive) setFrame(value); }).catch(() => undefined);
    return () => { alive = false; };
  }, [minimal]);

  useEffect(() => {
    if (minimal) return;
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette((open) => !open); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [minimal]);

  const work = [
    { href: "/projects", label: t("Проекты"), active: path === "/projects" || path.startsWith("/projects/"), icon: "projects" as const },
    { href: "/inbox", label: t("Входящие"), active: path.startsWith("/inbox"), icon: "inbox" as const, count: frame?.waiting ?? 0, dot: Boolean(frame?.unread) },
    // «Моя работа» — for those who work on other people's stages (or opened it from the profile).
    ...(frame?.specialist || path.startsWith("/work") ? [{ href: "/work", label: t("Моя работа"), active: path.startsWith("/work"), icon: "work" as const, mobileHide: !path.startsWith("/work") }] : []),
    { href: "/specialists", label: t("Специалисты"), active: path.startsWith("/specialists"), icon: "people" as const },
  ];
  const tools = [
    { href: "/review", label: t("Сверка сайта"), active: path.startsWith("/review"), icon: "review" as const, mobileHide: true },
  ];
  const settings = [
    { href: "/account", label: t("Аккаунт"), active: path === "/account" || (path.startsWith("/account/") && !path.startsWith("/account/plan") && !path.startsWith("/account/specialist")), icon: "account" as const, mobileHide: false },
    { href: "/account/specialist", label: t("Профиль специалиста"), active: path.startsWith("/account/specialist"), icon: "specialist" as const, mobileHide: true },
    { href: "/account/plan", label: t("Тариф и лимиты"), active: path.startsWith("/account/plan"), icon: "plan" as const, mobileHide: true },
  ];
  const aiUsage = frame?.plan?.usage.find((item) => item.key === "aiPerMonth") ?? null;
  const link = (item: { href: string; label: string; active: boolean; icon: keyof typeof icons; count?: number; dot?: boolean; mobileHide?: boolean }) => (
    <a key={item.href} href={item.href} className={`${styles.navLink} ${item.mobileHide ? styles.navMobileHide : ""}`} aria-current={item.active ? "page" : undefined}>
      <Icon name={item.icon} />
      <span>{item.label}</span>
      {item.count ? <span className={styles.navCount} aria-label={t("ждут решения: {0}", [item.count])}>{item.count}</span>
        : item.dot ? <span className={styles.navDot} aria-label={t("есть новые обновления")} /> : null}
    </a>
  );

  return (
    <header className={styles.top}>
      <div className={styles.topInner}>
        <a className={styles.brand} href={minimal ? "/" : "/projects"}>
          <span aria-hidden="true">B</span>
          <span className={styles.brandText}>BuildPath{!minimal && frame?.workspace && <small>{frame.workspace.name === "My workspace" ? t("Моё пространство") : frame.workspace.name}</small>}</span>
        </a>
        {!minimal && (
          <>
            <button type="button" className={styles.search} onClick={() => setPalette(true)}>
              <Icon name="search" />
              <span>{t("Поиск и переход")}</span>
              <kbd>⌘K</kbd>
            </button>
            <nav className={styles.nav} aria-label={t("Навигация")}>
              <p className={`${styles.navGroup} ${styles.navMobileHide}`}>{t("Работа")}</p>
              {work.map(link)}
              <p className={`${styles.navGroup} ${styles.navMobileHide}`}>{t("Инструменты")}</p>
              {tools.map(link)}
              <p className={`${styles.navGroup} ${styles.navMobileHide}`}>{t("Настройки")}</p>
              {settings.map(link)}
            </nav>
            <div className={styles.railFoot}>
              {frame?.plan && (
                <a className={styles.usage} href="/account/plan">
                  <span><b>{t("Тариф «{0}»", [frame.plan.plan.title])}</b></span>
                  {aiUsage && aiUsage.limit > 0 && (
                    <>
                      <span>{aiUsage.title}: <span className={styles.num}>{aiUsage.used} / {aiUsage.limit}</span></span>
                      <span className={styles.usageBar}><span style={{ width: `${Math.min(100, Math.round((aiUsage.used / aiUsage.limit) * 100))}%` }} /></span>
                    </>
                  )}
                </a>
              )}
              {frame?.me && (
                <a className={styles.me} href="/account">
                  <span className={styles.avatar} aria-hidden="true">{initials(frame.me)}</span>
                  <span className={styles.meText}><b>{frame.me.name || frame.me.email}</b>{frame.me.name && <small>{frame.me.email}</small>}</span>
                </a>
              )}
            </div>
          </>
        )}
        <div className={styles.spacer} />
        {extra}
      </div>
      {(back || title) && (
        <div className={styles.crumbs}>
          <div className={styles.crumbsInner}>
            {back && <a className={styles.back} href={back.href}>{back.label}</a>}
            {back && title && <span className={styles.crumbSep} aria-hidden="true">/</span>}
            {title && <span className={styles.topTitle}>{title}</span>}
          </div>
        </div>
      )}
      {palette && <CommandPalette projects={frame?.projects ?? []} onClose={() => setPalette(false)} />}
    </header>
  );
}

/** ⌘K: jump to any project or section by typing a few letters. */
function CommandPalette({ projects, onClose }: { projects: ProjectRow[]; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  const items = useMemo(() => {
    const all = [
      ...projects.filter((project) => project.status !== "archived").map((project) => ({
        group: t("Проекты"), label: project.name, hint: project.overview?.waiting ? t("ждут решения: {0}", [project.overview.waiting]) : "",
        href: project.projectType ? `/projects/${project.id}` : `/projects/${project.id}/analysis`,
      })),
      { group: t("Действия"), label: t("Новый проект"), hint: "", href: "/projects?new=1" },
      { group: t("Разделы"), label: t("Входящие"), hint: "", href: "/inbox" },
      { group: t("Разделы"), label: t("Моя работа"), hint: "", href: "/work" },
      { group: t("Разделы"), label: t("Проекты"), hint: "", href: "/projects" },
      { group: t("Разделы"), label: t("Специалисты"), hint: "", href: "/specialists" },
      { group: t("Разделы"), label: t("Сверка сайта"), hint: "", href: "/review" },
      { group: t("Разделы"), label: t("Тариф и лимиты"), hint: "", href: "/account/plan" },
      { group: t("Разделы"), label: t("Профиль специалиста"), hint: "", href: "/account/specialist" },
      { group: t("Разделы"), label: t("Аккаунт"), hint: "", href: "/account" },
    ];
    const needle = query.trim().toLowerCase();
    return needle ? all.filter((item) => item.label.toLowerCase().includes(needle)) : all;
  }, [projects, query]);

  useEffect(() => { setIndex(0); }, [query]);

  function go(href: string) { onClose(); router.push(href); }

  return (
    <div className={styles.palette} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={styles.paletteBox} role="dialog" aria-modal="true" aria-label={t("Поиск и переход")}>
        <input ref={input} className={styles.paletteInput} value={query} placeholder={t("Проект или раздел…")} aria-label={t("Поиск")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            else if (event.key === "ArrowDown") { event.preventDefault(); setIndex((value) => Math.min(items.length - 1, value + 1)); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); }
            else if (event.key === "Enter" && items[index]) { event.preventDefault(); go(items[index].href); }
          }} />
        {items.length === 0 ? <p className={styles.paletteEmpty}>{t("Ничего не нашли")}</p> : (
          <ul className={styles.paletteList} role="listbox">
            {items.map((item, position) => (
              <li key={`${item.group}-${item.href}-${item.label}`}>
                {(position === 0 || items[position - 1]!.group !== item.group) && <div className={styles.paletteGroup}>{item.group}</div>}
                <a className={styles.paletteItem} href={item.href} role="option" aria-selected={position === index}
                  onMouseEnter={() => setIndex(position)} onClick={(event) => { event.preventDefault(); go(item.href); }}>
                  <span>{item.label}</span>{item.hint && <small>{item.hint}</small>}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
