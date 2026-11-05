"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import styles from "./review.module.css";

type User = { id: string; email: string; name: string | null };
type Workspace = { id: string; name: string; role: string };
type Project = { id: string; workspaceId: string; name: string; status: string };
type Review = { id: string; projectId: string; title: string; mode: string; status: string; locale: string; createdAt: string; updatedAt: string };
type Page = { id: string; route: string; label: string; status: string; designAssetId: string | null; viewport: { width: number; height: number; deviceScale: number }; findingCount: number };
type Design = { name: string; url: string };
type CompareMode = "side" | "overlay" | "wipe";

const statusText: Record<string, string> = {
  draft: "Черновик", queued: "В очереди", discovering: "Ищем страницы",
  ready: "Страницы найдены", failed: "Сканирование завершилось с ошибкой",
  cancelled: "Остановлено",
};

export default function ReviewPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [designs, setDesigns] = useState<Record<string, Design>>({});
  const [mode, setMode] = useState<CompareMode>("side");
  const [opacity, setOpacity] = useState(50);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [previewBlocked, setPreviewBlocked] = useState(false);

  useEffect(() => {
    let active = true;
    api<User>("/me")
      .then((currentUser) => {
        if (active) setUser(currentUser);
        return api<Workspace[]>("/workspaces");
      })
      .then((items) => {
        if (!active) return;
        setWorkspaces(items);
        setWorkspaceId(items[0]?.id ?? "");
        if (items.length === 0) setMessage("В аккаунте пока нет доступного рабочего пространства.");
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) router.replace("/login");
        else setMessage(error instanceof Error ? error.message : "Не удалось загрузить рабочее пространство.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!workspaceId) { setProjects([]); setProjectId(""); return; }
    let active = true;
    api<Project[]>(`/projects?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then((items) => {
        if (!active) return;
        setProjects(items);
        setProjectId((current) => items.some((item) => item.id === current) ? current : items[0]?.id ?? "");
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : "Не удалось загрузить проекты.");
      });
    return () => { active = false; };
  }, [workspaceId]);

  useEffect(() => {
    if (!review?.id || ["ready", "failed", "cancelled"].includes(review.status)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const [nextReview, nextPages] = await Promise.all([
          api<Review>(`/reviews/${review.id}`),
          api<Page[]>(`/reviews/${review.id}/pages`),
        ]);
        if (cancelled) return;
        setReview(nextReview);
        setPages(nextPages);
        setSelectedPageId((current) => nextPages.some((page) => page.id === current) ? current : nextPages[0]?.id ?? "");
        if (!["ready", "failed", "cancelled"].includes(nextReview.status)) timer = setTimeout(refresh, 2500);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Не удалось обновить прогресс.");
      }
    };
    timer = setTimeout(refresh, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [review?.id, review?.status]);

  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? null;
  const selectedDesign = selectedPage ? designs[selectedPage.id] : undefined;
  const previewUrl = selectedPage?.route ?? siteUrl;

  useEffect(() => {
    if (!review?.id || !selectedPage?.designAssetId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const asset = await api<{ url: string; expiresInSeconds: number }>(`/reviews/${review.id}/sources/design-upload/${selectedPage.designAssetId}/url`);
        if (!active) return;
        setDesigns((current) => ({ ...current, [selectedPage.id]: { name: current[selectedPage.id]?.name ?? "Сохранённый макет", url: asset.url } }));
        timer = setTimeout(refresh, Math.max(30, asset.expiresInSeconds - 30) * 1000);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Не удалось открыть сохранённый макет.");
      }
    };
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [review?.id, selectedPage?.id, selectedPage?.designAssetId]);


  const previewTitle = useMemo(() => {
    if (!selectedPage) return "Предпросмотр сайта";
    return selectedPage.label + " · " + selectedPage.route;
  }, [selectedPage]);

  async function startScan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    setPages([]);
    setReview(null);
    try {
      const normalizedUrl = new URL(siteUrl).toString();
      let selectedProject = projects.find((item) => item.id === projectId);
      if (!selectedProject) {
        if (!workspaceId) throw new Error("Сначала выберите рабочее пространство.");
        const host = new URL(normalizedUrl).hostname;
        selectedProject = await api<Project>("/projects", {
          method: "POST",
          body: JSON.stringify({
            workspaceId,
            name: ("Анализ " + host).slice(0, 120),
            startMode: "analysis_only",
            locale: "ru",
          }),
        });
        setProjects((items) => [...items, selectedProject!]);
        setProjectId(selectedProject.id);
      }

      const newReview = await api<Review>(`/projects/${selectedProject.id}/reviews`, {
        method: "POST",
        headers: { "Idempotency-Key": globalThis.crypto.randomUUID() },
        body: JSON.stringify({ title: ("Проверка " + new URL(normalizedUrl).hostname).slice(0, 120), mode: "site_and_design", locale: "ru" }),
      });
      setReview(newReview);
      await api<{ jobId: string; status: string }>(`/reviews/${newReview.id}/sources/url`, {
        method: "POST",
        headers: { "Idempotency-Key": globalThis.crypto.randomUUID() },
        body: JSON.stringify({ url: normalizedUrl }),
      });
      setMessage("Ссылка прошла серверную проверку. Страницы будут добавляться по мере работы worker.");
    } catch (error) {
      setReview(null);
      if (error instanceof ApiError && error.status === 401) router.replace("/login");
      else setMessage(error instanceof Error ? error.message : "Не удалось запустить проверку.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadDesign(file?: File) {
    if (!file || !selectedPage || !review) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setMessage("Загрузите макет в формате PNG или JPEG.");
      return;
    }
    if (file.size < 1 || file.size > 20 * 1024 * 1024) {
      setMessage("Размер макета должен быть не больше 20 МБ.");
      return;
    }
    setMessage("");
    setBusy(true);
    try {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const reservation = await api<{ assetId: string; uploadUrl: string; method: "POST"; expiresAt: string; requiredFields: Record<string, string> }>(`/reviews/${review.id}/sources/design-upload`, {
        method: "POST",
        headers: { "Idempotency-Key": globalThis.crypto.randomUUID() },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, sizeBytes: file.size, sha256 }),
      });
      const form = new FormData();
      Object.entries(reservation.requiredFields).forEach(([key, value]) => form.append(key, value));
      form.append("file", file);
      const stored = await fetch(reservation.uploadUrl, { method: reservation.method, body: form });
      if (!stored.ok) throw new Error("Не удалось загрузить файл в приватное хранилище.");
      await api<{ assetId: string; status: string }>(`/reviews/${review.id}/sources/design-upload/${reservation.assetId}/complete`, { method: "POST" });
      await api<Page>(`/reviews/${review.id}/page-mappings/${selectedPage.id}`, {
        method: "PUT",
        body: JSON.stringify({
          designAssetId: reservation.assetId,
          viewport: selectedPage.viewport,
          requirementIds: [],
        }),
      });
      const asset = await api<{ url: string; expiresInSeconds: number }>(`/reviews/${review.id}/sources/design-upload/${reservation.assetId}/url`);
      setPages((current) => current.map((page) => page.id === selectedPage.id
        ? { ...page, designAssetId: reservation.assetId, status: "mapped" }
        : page));
      setDesigns((current) => ({ ...current, [selectedPage.id]: { name: file.name, url: asset.url } }));
      setMessage("Макет проверен, сохранён в приватном хранилище и привязан к странице.");
    } catch (error) {
      const detail = error instanceof ApiError ? error.message : error instanceof Error ? error.message : "";
      if (detail.includes("SCANNER_UNAVAILABLE")) setMessage("Проверка файла пока недоступна: серверный сканер ClamAV не настроен или не отвечает.");
      else if (detail.includes("STORAGE_NOT_CONFIGURED")) setMessage("Загрузка пока недоступна: приватное хранилище не настроено.");
      else setMessage(detail || "Не удалось загрузить и проверить макет.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try { await api<void>("/auth/logout", { method: "POST" }); } finally { router.replace("/login"); }
  }

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <a className={styles.brand} href="/"><span className={styles.logo}>B</span> BuildPath</a>
      <nav aria-label="Навигация"><a href="/">Проект</a><a className={styles.current} href="/review">Сверка</a></nav>
      <div className={styles.account}>{user?.email && <span>{user.email}</span>}<button onClick={logout}>Выйти</button></div>
    </header>

    <section className={styles.intro}>
      <div><p className={styles.eyebrow}>Проверка реализации</p><h1>Сверьте сайт с ТЗ и макетом</h1>
        <p className={styles.subhead}>Найдите страницы, откройте работающий сайт и сопоставьте его с макетом. Проверка не меняет исходный сайт.</p>
      </div>
      {review && <div className={styles.progressCard}><span>Состояние проверки</span><strong>{statusText[review.status] ?? review.status}</strong>
        <div className={styles.progress}><i className={review.status === "ready" ? styles.complete : ""} /></div>
        <small>{pages.length} страниц найдено</small>
      </div>}
    </section>

    <form className={styles.sourcebar} onSubmit={startScan}>
      <label className={styles.urlField}><span>Ссылка на публичный сайт</span><input type="url" required placeholder="https://example.com" value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} aria-label="Ссылка на сайт" /></label>
      {workspaces.length > 1 && <label className={styles.selectField}><span>Рабочее пространство</span><select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {projects.length > 0 && <label className={styles.selectField}><span>Проект</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Новый проект</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <button className={styles.primary} disabled={busy || loading}>{busy ? "Запускаем…" : "Сканировать страницы"}</button>
    </form>

    {loading && <div className={styles.notice}>Загружаем рабочее пространство…</div>}
    {!loading && message && <div className={styles.notice} role="status"><span>i</span>{message}</div>}

    <section className={styles.workspace}>
      <aside className={styles.sidebar}>
        <div className={styles.sideTitle}><strong>Найденные страницы</strong><span>{pages.length}</span></div>
        <p className={styles.sideHelp}>{review ? statusText[review.status] ?? review.status : "Сначала запустите проверку сайта."}</p>
        {pages.length === 0
          ? <div className={styles.emptyPages}>{review?.status === "failed" ? "Не удалось найти доступные страницы. Проверьте ссылку и попробуйте снова." : review ? "Worker ищет страницы на этом сайте…" : "Список появится после сканирования."}</div>
          : <div className={styles.pageList}>{pages.map((page) =>
            <button key={page.id} onClick={() => { setSelectedPageId(page.id); setPreviewBlocked(false); }} className={page.id === selectedPageId ? styles.pageSelected : styles.pageButton}>
              <span className={styles.pageIcon}>{page.status === "failed" ? "!" : "▤"}</span>
              <span className={styles.pageText}><strong>{page.label}</strong><small>{page.route}</small></span>
              {page.findingCount > 0 && <span className={styles.findingCount}>{page.findingCount}</span>}
            </button>)}</div>}
        {selectedPage && <div className={styles.mapping}>
          <div className={styles.mappingInfo}><strong>Макет для этой страницы</strong><small>{selectedDesign?.name ?? (selectedPage.designAssetId ? "Назначен в проекте" : "Макет не выбран")}</small></div>
          <label className={styles.smallUpload}>{busy ? "Проверяем…" : "Загрузить макет"}<input type="file" accept="image/png,image/jpeg" disabled={busy || !review} onChange={(event) => { void uploadDesign(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
        </div>}
        <p className={styles.localOnly}>PNG/JPEG загружается в приватное хранилище только после проверки файла. Figma будет подключена отдельно.</p>
      </aside>

      <div className={styles.review}>
        <div className={styles.reviewHeader}>
          <div><h2>{previewTitle}</h2><p>{selectedPage ? "Откройте страницу и сравните её с макетом." : "После сканирования выберите страницу из списка."}</p></div>
          <label className={styles.viewport}>Режим<select value={mode} onChange={(event) => setMode(event.target.value as CompareMode)}><option value="side">Рядом</option><option value="overlay">Наложение</option><option value="wipe">Сдвижная граница</option></select></label>
        </div>
        <div className={styles.controls}>
          <span className={styles.readOnly}>Только просмотр · страница сайта не изменяется</span>
          {mode !== "side" && <label className={styles.opacity}>Смешивание<input type="range" min="10" max="90" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>}
        </div>
        {!selectedPage ? <div className={styles.previewEmpty}>{review ? "Ожидаем результаты обнаружения страниц." : "Здесь появится выбранная страница и её макет."}</div>
          : mode === "side" ? <div className={styles.compareSide}>
            <PreviewPanel title={selectedDesign ? "Макет · " + selectedDesign.name : "Макет не выбран"} designUrl={selectedDesign?.url} />
            <SitePanel title={"Рабочий сайт · " + selectedPage.label} url={previewUrl} blocked={previewBlocked} onBlocked={() => setPreviewBlocked(true)} />
          </div>
          : <div className={styles.compareLayer}>
            <SitePanel title={"Рабочий сайт · " + selectedPage.label} url={previewUrl} blocked={previewBlocked} onBlocked={() => setPreviewBlocked(true)} />
            {selectedDesign && <div className={mode === "overlay" ? styles.overlay : styles.wipe} style={mode === "overlay" ? { opacity: opacity / 100 } : { clipPath: "inset(0 " + (100 - opacity) + "% 0 0)" }}><PreviewPanel title="" designUrl={selectedDesign.url} /></div>}
            {!selectedDesign && <div className={styles.layerHint}>Загрузите PNG/JPEG макета слева, чтобы включить наложение.</div>}
          </div>}
        <p className={styles.captureInfo}>{selectedPage ? `Маршрут: ${selectedPage.route} · Статус: ${selectedPage.status} · Найдено замечаний: ${selectedPage.findingCount}` : "Снимок страницы пока не создавался."}</p>
        <div className={styles.notReady}>
          <strong>Автоматическая оценка пока не подключена</strong>
          <p>Сканирование сейчас находит страницы. Проверки ТЗ, backend/API и AI-выводы появятся после подключения захвата браузера, источников требований и сервиса сравнения. Пока ни один критерий не отмечается как пройденный.</p>
        </div>
      </div>
    </section>
  </main>;
}

function PreviewPanel({ title, designUrl }: { title: string; designUrl?: string }) {
  return <section className={styles.previewPanel}>
    <div className={styles.panelTitle}>{title}</div>
    {designUrl ? <img className={styles.designImage} src={designUrl} alt="Локально выбранный макет страницы" />
      : <div className={styles.noDesign}><span>◫</span><strong>Добавьте макет страницы</strong><small>PNG или JPEG · приватный макет</small></div>}
  </section>;
}

function SitePanel({ title, url, blocked, onBlocked }: { title: string; url: string; blocked: boolean; onBlocked: () => void }) {
  return <section className={styles.previewPanel}>
    <div className={styles.panelTitle}>{title}</div>
    {blocked ? <div className={styles.noDesign}><strong>Сайт запрещает встроенный просмотр</strong><small>Откройте его в новой вкладке, чтобы сравнить вручную.</small><a href={url} target="_blank" rel="noreferrer">Открыть сайт ↗</a></div>
      : <iframe className={styles.siteFrame} title={title} src={url} sandbox="allow-scripts allow-forms allow-popups" referrerPolicy="no-referrer" onError={onBlocked} />}
  </section>;
}
