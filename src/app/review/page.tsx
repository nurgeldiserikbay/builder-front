"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import styles from "./review.module.css";
import ApiCheckPanel from "./api-check-panel";

type User = { id: string; email: string; name: string | null };
type Workspace = { id: string; name: string; role: string };
type Project = { id: string; workspaceId: string; name: string; status: string };
type Review = { id: string; projectId: string; title: string; mode: string; status: string; locale: string; createdAt: string; updatedAt: string };
type FigmaConnectionStatus = { connected: boolean; figmaUserId: string | null; expiresAt: string | null; connectedAt: string | null };
type Page = { id: string; route: string; label: string; status: string; designAssetId: string | null; viewport: { width: number; height: number; deviceScale: number }; findingCount: number };
type Design = { name: string; url: string };
type Capture = { captureId: string; status: "queued" | "captured" | "failed"; screenshotUrl: string | null; sha256: string | null; viewport: Page["viewport"]; safeErrorCode: string | null; capturedAt: string | null; visualDiff: { status: "ready" | "failed"; changedPercent?: number; changedPixels?: number; totalPixels?: number; regions?: { x: number; y: number; width: number; height: number; changedPercent: number }[]; diffOverlayUrl: string | null; safeErrorCode?: string } | null };
type CompareMode = "side" | "overlay" | "wipe";
type FindingPoint = { x: number; y: number; left: number; top: number };
type Requirement = { id: string; pageId: string | null; category: string; title: string; details: string | null; status: "pending" | "satisfied" | "failed" | "blocked" | "unknown"; verificationNote: string | null; evidenceCaptureId: string | null; createdAt: string; updatedAt: string };
type Finding = { id: string; pageId: string | null; category: string; severity: string; status: string; confidence: string; summary: string; coordinates: { x: number; y: number } | null; evidence: unknown; createdAt: string; updatedAt: string };
type ReviewReport = {
  schemaVersion: number;
  generatedAt: string;
  review: { id: string; title: string; mode: string; status: string; siteOrigin: string | null; createdAt: string };
  summary: {
    pages: { total: number; mapped: number; captured: number };
    visualDiff: { compared: number; averageChangedPercent: number | null };
    requirements: { total: number; byStatus: Record<string, number> };
    findings: { total: number; byStatus: Record<string, number> };
    apiChecks: { totalRecent: number; passedRecent: number };
  };
  pages: Array<{
    id: string; route: string; title: string | null; status: string; designMapped: boolean;
    latestCapture: { status: "queued" | "captured" | "failed"; capturedAt: string | null; visualDiff: { status: "ready" | "failed"; changedPercent: number | null } | null } | null;
    requirements: Array<{ id: string; category: string; title: string; status: string; verificationNote: string | null; evidenceCaptureId: string | null }>;
    findings: Array<{ id: string; category: string; severity: string; status: string; summary: string; createdAt: string }>;
    apiChecks: Array<{ id: string; requirementId: string | null; method: "GET" | "HEAD"; endpoint: string; expectedStatus: number; actualStatus: number | null; durationMs: number; passed: boolean; jsonPath: string | null; jsonMatches: boolean | null; safeErrorCode: string | null; checkedAt: string }>;
  }>;
  limitations: string[];
};

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
  const [figmaConnection, setFigmaConnection] = useState<FigmaConnectionStatus | null>(null);
  const [figmaUrlDraft, setFigmaUrlDraft] = useState("");
  const [figmaBusy, setFigmaBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [designs, setDesigns] = useState<Record<string, Design>>({});
  const [captures, setCaptures] = useState<Record<string, Capture>>({});
  const [findings, setFindings] = useState<Finding[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [reportData, setReportData] = useState<ReviewReport | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [requirementDraft, setRequirementDraft] = useState("");
  const [requirementCategory, setRequirementCategory] = useState("requirement");
  const [requirementBusy, setRequirementBusy] = useState(false);
  const [requirementStatusBusy, setRequirementStatusBusy] = useState<string | null>(null);
  const [findingCategory, setFindingCategory] = useState("design");
  const [findingSeverity, setFindingSeverity] = useState("medium");
  const [findingSummary, setFindingSummary] = useState("");
  const [findingPoint, setFindingPoint] = useState<FindingPoint | null>(null);
  const [findingBusy, setFindingBusy] = useState(false);
  const [findingStatusBusy, setFindingStatusBusy] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [mode, setMode] = useState<CompareMode>("side");
  const [showDiff, setShowDiff] = useState(false);
  const [opacity, setOpacity] = useState(50);
  const [compareZoom, setCompareZoom] = useState(100);
  const [syncCompareScroll, setSyncCompareScroll] = useState(true);
  const designViewportRef = useRef<HTMLDivElement>(null);
  const siteViewportRef = useRef<HTMLDivElement>(null);
  const compareScrollLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [previewBlocked, setPreviewBlocked] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("figma") === "connected") {
      setMessage("Аккаунт Figma подключён. Теперь вставьте ссылку на нужный кадр.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api<User>("/me")
      .then((currentUser) => {
        if (active) setUser(currentUser);
        return api<Workspace[]>("/workspaces");
      })
      .then(async (items) => {
        if (!active) return;
        setWorkspaces(items);
        setWorkspaceId(items[0]?.id ?? "");
        if (items.length === 0) setMessage("В аккаунте пока нет доступного рабочего пространства.");
        const figma = await api<FigmaConnectionStatus>("/integrations/figma/status");
        if (active) setFigmaConnection(figma);
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

  const backendCoverage = reportData ? reportData.pages.flatMap((page) =>
    page.requirements.filter((requirement) => requirement.category === "backend").map((requirement) => ({
      requirement,
      check: page.apiChecks.find((item) => item.requirementId === requirement.id) ?? null,
    })),
  ) : [];
  const checkedBackendRequirements = backendCoverage.filter((item) => item.check !== null).length;

  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? null;
  const selectedDesign = selectedPage ? designs[selectedPage.id] : undefined;
  const selectedCapture = selectedPage ? captures[selectedPage.id] : undefined;

  function syncCompareViewport(source: HTMLDivElement, target: HTMLDivElement | null) {
    if (!syncCompareScroll || !target || compareScrollLock.current) return;
    compareScrollLock.current = true;
    target.scrollTop = source.scrollTop;
    requestAnimationFrame(() => { compareScrollLock.current = false; });
  }
  useEffect(() => {
    if (!review?.id || !selectedPage || !selectedCapture?.captureId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const next = await api<Capture>(`/reviews/${review.id}/captures/${selectedCapture.captureId}`);
        if (!active) return;
        setCaptures((current) => ({ ...current, [selectedPage.id]: next }));
        if (next.status === "queued") setMessage("Браузерный worker готовит снимок страницы…");
        else if (next.status === "failed") setMessage(next.safeErrorCode?.includes("BROWSER") ? "Worker не настроен: установите Chromium и задайте CAPTURE_CHROMIUM_EXECUTABLE_PATH." : "Не удалось снять страницу: " + (next.safeErrorCode ?? "CAPTURE_FAILED"));
        else if (next.status === "captured") setMessage("Снимок сайта готов и привязан к выбранному макету.");
        if (next.status === "queued") timer = setTimeout(refresh, 1_500);
        else if (next.status === "captured") timer = setTimeout(refresh, 240_000);
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Не удалось получить снимок страницы.");
          timer = setTimeout(refresh, 10_000);
        }
      }
    };
    timer = setTimeout(refresh, selectedCapture.status === "queued" ? 1_000 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [review?.id, selectedPage?.id, selectedCapture?.captureId, selectedCapture?.status]);

  useEffect(() => {
    if (!review?.id || !selectedPage?.id) { setFindings([]); return; }
    let active = true;
    api<Finding[]>(`/reviews/${review.id}/pages/${selectedPage.id}/findings`)
      .then((items) => { if (active) setFindings(items); })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Не удалось загрузить замечания."); });
    return () => { active = false; };
  }, [review?.id, selectedPage?.id]);

  useEffect(() => { setFindingPoint(null); }, [selectedPageId]);

  useEffect(() => {
    if (!review?.id || !selectedPage?.id) { setRequirements([]); return; }
    let active = true;
    api<Requirement[]>(`/reviews/${review.id}/pages/${selectedPage.id}/requirements`)
      .then((items) => { if (active) setRequirements(items); })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Не удалось загрузить чеклист ТЗ."); });
    return () => { active = false; };
  }, [review?.id, selectedPage?.id]);

  const previewUrl = selectedPage ? resolvePreviewUrl(selectedPage.route, siteUrl) : siteUrl;

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
    setReportData(null);
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

  async function connectFigma() {
    setFigmaBusy(true);
    try {
      const result = await api<{ authorizationUrl: string }>("/integrations/figma/connect", { method: "POST" });
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      setMessage(detail.includes("FIGMA_INTEGRATION_NOT_CONFIGURED")
        ? "Figma пока не настроена на сервере. Нужны OAuth Client ID, Client Secret, callback URL и ключ шифрования."
        : detail || "Не удалось открыть подключение Figma.");
      setFigmaBusy(false);
    }
  }

  async function disconnectFigma() {
    setFigmaBusy(true);
    try {
      await api<{ connected: boolean }>("/integrations/figma/connection", { method: "DELETE" });
      setFigmaConnection({ connected: false, figmaUserId: null, expiresAt: null, connectedAt: null });
      setMessage("Связь с Figma отключена.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отключить Figma.");
    } finally {
      setFigmaBusy(false);
    }
  }

  async function importFigmaDesign() {
    if (!review || !selectedPage || !figmaConnection?.connected || !figmaUrlDraft.trim()) return;
    setFigmaBusy(true);
    setMessage("");
    try {
      const imported = await api<{ assetId: string; status: string; fileKey: string; nodeId: string }>(`/reviews/${review.id}/sources/figma-import`, {
        method: "POST",
        body: JSON.stringify({ pageId: selectedPage.id, figmaUrl: figmaUrlDraft.trim(), viewport: selectedPage.viewport }),
      });
      const asset = await api<{ url: string; expiresInSeconds: number }>(`/reviews/${review.id}/sources/design-upload/${imported.assetId}/url`);
      setPages((current) => current.map((page) => page.id === selectedPage.id
        ? { ...page, designAssetId: imported.assetId, status: "mapped" }
        : page));
      setDesigns((current) => ({ ...current, [selectedPage.id]: { name: `Figma · ${imported.nodeId}`, url: asset.url } }));
      setFigmaUrlDraft("");
      setMessage("Макетный кадр импортирован из Figma, проверен и привязан к странице.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      if (detail.includes("FIGMA_RECONNECT_REQUIRED")) {
        setFigmaConnection((current) => current ? { ...current, connected: false } : current);
        setMessage("Срок доступа к Figma истёк. Подключите аккаунт заново.");
      } else if (detail.includes("FIGMA_NOT_CONNECTED")) {
        setFigmaConnection({ connected: false, figmaUserId: null, expiresAt: null, connectedAt: null });
        setMessage("Сначала подключите аккаунт Figma.");
      } else if (detail.includes("SCANNER_UNAVAILABLE") || detail.includes("SCANNER")) {
        setMessage("Кадр получен, но серверный сканер ClamAV недоступен. Настройте сканер и повторите импорт.");
      } else if (detail.includes("FIGMA_INTEGRATION_NOT_CONFIGURED")) {
        setMessage("Интеграция Figma ещё не настроена на сервере.");
      } else {
        setMessage(detail || "Не удалось импортировать кадр из Figma.");
      }
    } finally {
      setFigmaBusy(false);
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

  async function captureSelectedPage() {
    if (!review || !selectedPage?.designAssetId) {
      setMessage("Сначала загрузите и привяжите проверенный макет к странице.");
      return;
    }
    setCaptureBusy(true);
    setMessage("");
    try {
      const queued = await api<{ jobId: string; captureId: string; status: string }>(`/reviews/${review.id}/captures`, {
        method: "POST",
        headers: { "Idempotency-Key": globalThis.crypto.randomUUID() },
        body: JSON.stringify({ pageId: selectedPage.id, viewport: selectedPage.viewport }),
      });
      setCaptures((current) => ({
        ...current,
        [selectedPage.id]: {
          captureId: queued.captureId, status: "queued", screenshotUrl: null, sha256: null, visualDiff: null,
          viewport: selectedPage.viewport, safeErrorCode: null, capturedAt: null,
        },
      }));
      setMessage("Снимок поставлен в очередь. Это может занять несколько секунд.");
    } catch (error) {
      const detail = error instanceof ApiError ? error.message : error instanceof Error ? error.message : "";
      if (detail.includes("CHROMIUM")) setMessage("Для захвата страницы настройте путь к Chromium в worker.");
      else setMessage(detail || "Не удалось поставить снимок в очередь.");
    } finally {
      setCaptureBusy(false);
    }
  }

  async function saveRequirements(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!review || !selectedPage) return;
    const titles = requirementDraft.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (titles.length === 0) return;
    if (titles.length > 100 || titles.some((title) => title.length > 500)) {
      setMessage("Можно добавить до 100 требований за раз, по одному на строку; длина пункта — до 500 символов.");
      return;
    }
    setRequirementBusy(true);
    try {
      const created: Requirement[] = [];
      for (const title of titles) {
        const item = await api<Requirement>(`/reviews/${review.id}/requirements`, {
          method: "POST",
          headers: { "Idempotency-Key": globalThis.crypto.randomUUID() },
          body: JSON.stringify({ pageId: selectedPage.id, title, category: requirementCategory }),
        });
        created.push(item);
      }
      setRequirements((current) => [...current, ...created]);
      setRequirementDraft("");
      setMessage(`Добавлено требований: ${created.length}. Отметка «Выполнено» потребует снимок страницы.`);
    } catch (error) {
      try {
        const latest = await api<Requirement[]>(`/reviews/${review.id}/pages/${selectedPage.id}/requirements`);
        setRequirements(latest);
      } catch { /* Preserve the original save error for the user. */ }
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить требования.");
    } finally {
      setRequirementBusy(false);
    }
  }

  async function updateRequirementStatus(requirementId: string, status: Requirement["status"]) {
    if (!review) return;
    setRequirementStatusBusy(requirementId);
    try {
      const updated = await api<Requirement>(`/reviews/${review.id}/requirements/${requirementId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          evidenceCaptureId: status === "pending" ? null : selectedCapture?.status === "captured" ? selectedCapture.captureId : null,
        }),
      });
      setRequirements((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить статус требования.");
    } finally {
      setRequirementStatusBusy(null);
    }
  }

  async function saveFinding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!review || !selectedPage || !selectedCapture || selectedCapture.status !== "captured" || !findingSummary.trim()) return;
    setFindingBusy(true);
    try {
      const created = await api<Finding>(`/reviews/${review.id}/findings`, {
        method: "POST",
        headers: { "Idempotency-Key": globalThis.crypto.randomUUID() },
        body: JSON.stringify({
          evidenceCaptureId: selectedCapture.captureId,
          category: findingCategory,
          severity: findingSeverity,
          summary: findingSummary.trim(),
          coordinate: findingPoint ? { x: findingPoint.x, y: findingPoint.y } : null,
        }),
      });
      setFindings((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setPages((current) => current.map((page) => page.id === selectedPage.id ? { ...page, findingCount: page.findingCount + 1 } : page));
      setFindingSummary("");
      setFindingPoint(null);
      setMessage("Замечание сохранено с привязкой к снимку страницы" + (findingPoint ? " и отмеченной точкой." : "."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить замечание.");
    } finally {
      setFindingBusy(false);
    }
  }

  async function updateFindingStatus(findingId: string, status: string) {
    if (!review) return;
    setFindingStatusBusy(findingId);
    try {
      const updated = await api<Finding>(`/reviews/${review.id}/findings/${findingId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setFindings((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить статус замечания.");
    } finally {
      setFindingStatusBusy(null);
    }
  }

  async function loadReport() {
    if (!review) return null;
    setReportBusy(true);
    try {
      const report = await api<ReviewReport>(`/reviews/${review.id}/report`);
      setReportData(report);
      return report;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить сводку проверки.");
      return null;
    } finally {
      setReportBusy(false);
    }
  }

  async function downloadReport() {
    const report = await loadReport();
    if (!report || !review) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `buildpath-review-${review.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("JSON-отчёт сохранён. Его можно приложить к задаче или передать разработчику.");
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
            <button key={page.id} onClick={() => { setSelectedPageId(page.id); setPreviewBlocked(false); setShowDiff(false); }} className={page.id === selectedPageId ? styles.pageSelected : styles.pageButton}>
              <span className={styles.pageIcon}>{page.status === "failed" ? "!" : "▤"}</span>
              <span className={styles.pageText}><strong>{page.label}</strong><small>{page.route}</small></span>
              {page.findingCount > 0 && <span className={styles.findingCount}>{page.findingCount}</span>}
            </button>)}</div>}
        {selectedPage && <div className={styles.mapping}>
          <div className={styles.mappingInfo}><strong>Макет для этой страницы</strong><small>{selectedDesign?.name ?? (selectedPage.designAssetId ? "Назначен в проекте" : "Макет не выбран")}</small></div>
          <label className={styles.smallUpload}>{busy ? "Проверяем…" : "Загрузить PNG/JPEG"}<input type="file" accept="image/png,image/jpeg" disabled={busy || !review} onChange={(event) => { void uploadDesign(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
          <div className={styles.figmaImport}>
            <strong>Импорт из Figma</strong>
            {figmaConnection?.connected ? <>
              <input type="url" value={figmaUrlDraft} onChange={(event) => setFigmaUrlDraft(event.target.value)} placeholder="Ссылка на кадр с node-id" aria-label="Ссылка на кадр Figma" />
              <button type="button" disabled={figmaBusy || !figmaUrlDraft.trim()} onClick={() => void importFigmaDesign()}>{figmaBusy ? "Импортируем…" : "Импортировать кадр"}</button>
              <button type="button" className={styles.figmaDisconnect} disabled={figmaBusy} onClick={() => void disconnectFigma()}>Отключить Figma</button>
            </> : <button type="button" disabled={figmaBusy} onClick={() => void connectFigma()}>{figmaBusy ? "Подключаем…" : "Подключить аккаунт Figma"}</button>}
          </div>
        </div>}
        <p className={styles.localOnly}>Импортированный кадр хранится приватно, проходит ClamAV и привязывается к выбранной странице.</p>
      </aside>

      <div className={styles.review}>
        <div className={styles.reviewHeader}>
          <div><h2>{previewTitle}</h2><p>{selectedPage ? "Откройте страницу и сравните её с макетом." : "После сканирования выберите страницу из списка."}</p></div>
          <label className={styles.viewport}>Режим<select value={mode} onChange={(event) => setMode(event.target.value as CompareMode)}><option value="side">Рядом</option><option value="overlay">Наложение</option><option value="wipe">Сдвижная граница</option></select></label>
        </div>
        <div className={styles.controls}>
          <span className={styles.readOnly}>Только просмотр · страница сайта не изменяется</span>
          {review && <button className={styles.captureButton} disabled={reportBusy} onClick={() => reportData ? setReportData(null) : void loadReport()}>{reportBusy ? "Загружаем…" : reportData ? "Скрыть сводку" : "Показать сводку"}</button>}
          {review && <button className={styles.captureButton} disabled={reportBusy} onClick={() => void downloadReport()}>Скачать отчёт JSON</button>}
          <button className={styles.captureButton} disabled={!selectedPage?.designAssetId || captureBusy || selectedCapture?.status === "queued"} onClick={() => void captureSelectedPage()}>{captureBusy || selectedCapture?.status === "queued" ? "Снимок готовится…" : selectedCapture?.status === "captured" ? "Обновить снимок" : "Сделать снимок"}</button>
          {selectedCapture?.visualDiff?.status === "ready" && <button className={styles.captureButton} onClick={() => setShowDiff((value) => !value)}>{showDiff ? "Обычный снимок" : "Показать зоны отличий"}</button>}
          {mode !== "side" && <label className={styles.opacity}>Смешивание<input type="range" min="10" max="90" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>}
          {mode === "side" && selectedDesign && selectedCapture?.status === "captured" && <div className={styles.compareZoomControls}>
            <label>Масштаб <input type="range" min="75" max="200" step="25" value={compareZoom} onChange={(event) => { setCompareZoom(Number(event.target.value)); setFindingPoint(null); }} /> {compareZoom}%</label>
            <label className={styles.syncToggle}><input type="checkbox" checked={syncCompareScroll} onChange={(event) => setSyncCompareScroll(event.target.checked)} /> Синхр. прокрутка</label>
            <button type="button" onClick={() => { setCompareZoom(100); setFindingPoint(null); }}>100%</button>
          </div>}
        </div>
        {reportData && <section className={styles.reportSummary} aria-live="polite">
          <div className={styles.reportHeading}>
            <div><h3>Сводка проверки</h3><small>{reportData.review.title} · сформировано {new Date(reportData.generatedAt).toLocaleString("ru-RU")}</small></div>
            <div className={styles.reportActions}>
              <button className={styles.reportPrint} onClick={() => window.print()}>Печать / PDF</button>
              <button className={styles.reportClose} onClick={() => setReportData(null)} aria-label="Скрыть сводку">×</button>
            </div>
          </div>
          <div className={styles.reportMetrics}>
            <div><strong>{reportData.summary.pages.total}</strong><span>страниц</span></div>
            <div><strong>{reportData.summary.pages.mapped}</strong><span>с макетом</span></div>
            <div><strong>{reportData.summary.pages.captured}</strong><span>снимков готово</span></div>
            <div><strong>{reportData.summary.requirements.total}</strong><span>пунктов ТЗ</span></div>
            <div><strong>{reportData.summary.findings.total}</strong><span>замечаний</span></div>
            <div><strong>{reportData.summary.apiChecks.passedRecent}/{reportData.summary.apiChecks.totalRecent}</strong><span>API-проверок пройдено</span></div>
            <div><strong>{checkedBackendRequirements}/{backendCoverage.length}</strong><span>backend-ТЗ с API-проверкой</span></div>
            <div><strong>{reportData.summary.visualDiff.averageChangedPercent === null ? "—" : `${reportData.summary.visualDiff.averageChangedPercent}%`}</strong><span>среднее отличие</span></div>
          </div>
          <div className={styles.reportColumns}>
            <section><h4>Статусы требований</h4>
              {Object.keys(reportData.summary.requirements.byStatus).length === 0 ? <p>Требования ещё не добавлены.</p> :
                <ul>{Object.entries(reportData.summary.requirements.byStatus).map(([status, count]) => <li key={status}><span>{({ pending: "Ожидает проверки", satisfied: "Выполнено", failed: "Не выполнено", blocked: "Заблокировано", unknown: "Неизвестно" } as Record<string, string>)[status] ?? status}</span><strong>{count}</strong></li>)}</ul>}
            </section>
            <section><h4>Статусы замечаний</h4>
              {Object.keys(reportData.summary.findings.byStatus).length === 0 ? <p>Замечаний ещё нет.</p> :
                <ul>{Object.entries(reportData.summary.findings.byStatus).map(([status, count]) => <li key={status}><span>{({ open: "Открыто", accepted: "Принято", dismissed: "Отклонено", fixed: "Исправлено", unknown: "Не проверено" } as Record<string, string>)[status] ?? status}</span><strong>{count}</strong></li>)}</ul>}
            </section>
          </div>
          <h4 className={styles.reportPagesTitle}>По страницам</h4>
          <ul className={styles.reportPageList}>{reportData.pages.map((page) =>
            <li key={page.id}>
              <div><strong>{page.title || page.route}</strong><small>{page.route}</small></div>
              <span className={page.designMapped ? styles.reportGood : styles.reportPending}>{page.designMapped ? "Макет есть" : "Нет макета"}</span>
              <span className={page.latestCapture?.status === "captured" ? styles.reportGood : styles.reportPending}>{page.latestCapture?.status === "captured" ? "Снимок готов" : page.latestCapture?.status === "queued" ? "Снимок в очереди" : page.latestCapture?.status === "failed" ? "Снимок с ошибкой" : "Нет снимка"}</span>
              <span className={page.latestCapture?.visualDiff?.status === "ready" ? styles.reportGood : styles.reportPending}>{page.latestCapture?.visualDiff?.status === "ready" ? page.latestCapture.visualDiff.changedPercent === null ? "Сравнение готово" : `Отличие ${page.latestCapture.visualDiff.changedPercent}%` : page.latestCapture?.visualDiff?.status === "failed" ? "Сравнение недоступно" : "Нет сравнения"}</span>
              <small>{page.requirements.length} требований · {page.findings.length} замечаний · {page.apiChecks.length} API-проверок</small>
              {page.requirements.some((item) => item.category === "backend") && <details className={styles.reportPageChecks}>
                <summary>Backend-ТЗ · {page.requirements.filter((item) => item.category === "backend" && page.apiChecks.some((check) => check.requirementId === item.id)).length}/{page.requirements.filter((item) => item.category === "backend").length} с API-проверкой</summary>
                <ul>{page.requirements.filter((item) => item.category === "backend").map((requirement) => {
                  const latestCheck = page.apiChecks.find((check) => check.requirementId === requirement.id);
                  const labels: Record<string, string> = { pending: "Ожидает проверки", satisfied: "Выполнено", failed: "Не выполнено", blocked: "Заблокировано", unknown: "Неизвестно" };
                  return <li key={requirement.id}>
                    <strong className={requirement.status === "satisfied" ? styles.reportGood : requirement.status === "failed" ? styles.reportBad : styles.reportPending}>{labels[requirement.status] ?? requirement.status}</strong>
                    <span>{requirement.title}</span>
                    <small>{latestCheck ? latestCheck.passed ? "Последняя API-проверка пройдена" : "Последняя API-проверка не пройдена" : "API-проверка не привязана"}</small>
                    {requirement.verificationNote && <small>Комментарий: {requirement.verificationNote}</small>}
                  </li>;
                })}</ul>
              </details>}
              {page.apiChecks.length > 0 && <details className={styles.reportPageChecks}>
                <summary>Проверки Backend / API</summary>
                <ul>{page.apiChecks.map((check) => {
                  const requirement = page.requirements.find((item) => item.id === check.requirementId);
                  return <li key={check.id}>
                    <strong className={check.passed ? styles.reportGood : styles.reportPending}>{check.passed ? "Пройдена" : "Не пройдена"}</strong>
                    <span>{requirement ? "ТЗ: " + requirement.title : "Без привязки к пункту ТЗ"}</span>
                    <code>{check.method} {check.endpoint}</code>
                    <small>HTTP {check.actualStatus ?? "—"} / ожидался {check.expectedStatus} · {check.durationMs} мс · {new Date(check.checkedAt).toLocaleString("ru-RU")}</small>
                  </li>;
                })}</ul>
              </details>}
            </li>)}</ul>
          <details className={styles.reportLimitations}><summary>Границы этой проверки</summary><ul>{reportData.limitations.map((item) => <li key={item}>{item}</li>)}</ul></details>
        </section>}
        {!selectedPage ? <div className={styles.previewEmpty}>{review ? "Ожидаем результаты обнаружения страниц." : "Здесь появится выбранная страница и её макет."}</div>
          : mode === "side" ? <div className={styles.compareSide}>
            <PreviewPanel title={selectedDesign ? "Макет · " + selectedDesign.name : "Макет не выбран"} designUrl={selectedDesign?.url}
              zoom={compareZoom / 100} viewportRef={designViewportRef}
              onViewportScroll={(source) => { setFindingPoint(null); syncCompareViewport(source, siteViewportRef.current); }} />
            <SitePanel title={showDiff ? "Пиксельные отличия · " + selectedPage.label : selectedCapture?.status === "captured" ? "Снимок сайта · " + selectedPage.label : "Рабочий сайт · " + selectedPage.label} url={previewUrl} screenshotUrl={(showDiff ? selectedCapture?.visualDiff?.diffOverlayUrl : selectedCapture?.screenshotUrl) ?? undefined} blocked={previewBlocked} onBlocked={() => setPreviewBlocked(true)} point={findingPoint} onPoint={selectedCapture?.status === "captured" ? setFindingPoint : undefined}
              zoom={compareZoom / 100} viewportRef={siteViewportRef}
              onViewportScroll={(source) => { setFindingPoint(null); syncCompareViewport(source, designViewportRef.current); }} />
          </div>
          : <div className={styles.compareLayer}>
            <SitePanel title={selectedCapture?.status === "captured" ? "Снимок сайта · " + selectedPage.label : "Рабочий сайт · " + selectedPage.label} url={previewUrl} screenshotUrl={selectedCapture?.screenshotUrl ?? undefined} blocked={previewBlocked} onBlocked={() => setPreviewBlocked(true)} point={findingPoint} onPoint={selectedCapture?.status === "captured" ? setFindingPoint : undefined} />
            {selectedDesign && <div className={mode === "overlay" ? styles.overlay : styles.wipe} style={mode === "overlay" ? { opacity: opacity / 100 } : { clipPath: "inset(0 " + (100 - opacity) + "% 0 0)" }}><PreviewPanel title="" designUrl={selectedDesign.url} /></div>}
            {!selectedDesign && <div className={styles.layerHint}>Загрузите PNG/JPEG макета слева, чтобы включить наложение.</div>}
          </div>}
        <p className={styles.captureInfo}>{selectedPage ? `Маршрут: ${selectedPage.route} · Статус: ${selectedPage.status} · Найдено замечаний: ${selectedPage.findingCount}` : "Снимок страницы пока не создавался."}</p>
        {selectedCapture?.visualDiff?.status === "ready" && <>
          <p className={styles.captureInfo}>Пиксельно отличаются {selectedCapture.visualDiff.changedPercent ?? 0}% области · найдено зон: {selectedCapture.visualDiff.regions?.length ?? 0}. Это визуальная метрика, не оценка соответствия ТЗ. Отличия могут включать смещение, масштаб и сглаживание шрифтов.</p>
          {(selectedCapture.visualDiff.regions?.length ?? 0) > 0 && <details className={styles.diffRegions}>
            <summary>Где отличия заметнее всего</summary>
            <ol>{selectedCapture.visualDiff.regions?.slice(0, 8).map((region, index) => <li key={index}>
              <span>Участок {index + 1}</span>
              <small>{region.y < 0.33 ? "сверху" : region.y < 0.67 ? "в середине" : "снизу"}, {region.x < 0.33 ? "слева" : region.x < 0.67 ? "по центру" : "справа"}</small>
              <strong>{region.changedPercent}% пикселей отличаются</strong>
            </li>)}</ol>
          </details>}
        </>}
        {selectedPage && <ApiCheckPanel reviewId={review?.id ?? ""} pageId={selectedPage.id} />}
        {selectedPage && <section className={styles.requirements}>
          <h3>Требования для этой страницы</h3>
          <p>Добавьте пункты ТЗ по одному на строку. Статус «Выполнено» можно поставить только со снимком-доказательством.</p>
          <form onSubmit={(event) => void saveRequirements(event)}>
            <textarea value={requirementDraft} onChange={(event) => setRequirementDraft(event.target.value)} maxLength={50_000} rows={3} placeholder={"Например:\nВ шапке есть кнопка входа\nФорма показывает ошибку при неверном email"} aria-label="Требования к странице, по одному на строку" />
            <div>
              <label>Тип<select value={requirementCategory} onChange={(event) => setRequirementCategory(event.target.value)}><option value="requirement">ТЗ</option><option value="design">Дизайн</option><option value="backend">Backend/API</option><option value="accessibility">Доступность</option><option value="performance">Производительность</option><option value="seo">SEO</option><option value="security">Безопасность</option></select></label>
              <button type="submit" disabled={requirementBusy || !requirementDraft.trim()}>{requirementBusy ? "Сохраняем…" : "Добавить в чеклист"}</button>
            </div>
          </form>
          {requirements.length > 0 && <ul>{requirements.map((item) => <li key={item.id}>
            <span className={styles.requirementCategory}>{item.category}</span><span>{item.title}</span>
            <select aria-label={`Статус требования: ${item.title}`} value={item.status} disabled={requirementStatusBusy === item.id || (item.status === "pending" && !selectedCapture)} onChange={(event) => void updateRequirementStatus(item.id, event.target.value as Requirement["status"])}>
              <option value="pending">Ожидает проверки</option><option value="satisfied" disabled={selectedCapture?.status !== "captured"}>Выполнено</option><option value="failed">Не выполнено</option><option value="blocked">Заблокировано</option><option value="unknown">Неизвестно</option>
            </select>
            <small>{item.evidenceCaptureId ? "Есть снимок-доказательство" : "Пока без доказательства"}</small>
          </li>)}</ul>}
        </section>}
        {selectedCapture?.status === "captured" && <section className={styles.findings}>
          <h3>Замечания по этой странице</h3>
          <form onSubmit={(event) => void saveFinding(event)}>
            <small className={styles.pointHint}>{findingPoint ? `Точка отмечена: ${(findingPoint.x * 100).toFixed(0)}%, ${(findingPoint.y * 100).toFixed(0)}%` : "Чтобы привязать замечание к месту, нажмите на снимок сайта."}</small>
            <input value={findingSummary} onChange={(event) => setFindingSummary(event.target.value)} maxLength={500} placeholder="Опишите, что нужно проверить или исправить" aria-label="Текст замечания" required />
            <div>
              <label>Категория<select value={findingCategory} onChange={(event) => setFindingCategory(event.target.value)}><option value="design">Макет</option><option value="requirement">Требование</option><option value="backend">Backend/API</option><option value="accessibility">Доступность</option><option value="performance">Производительность</option><option value="seo">SEO</option><option value="security">Безопасность</option></select></label>
              <label>Приоритет<select value={findingSeverity} onChange={(event) => setFindingSeverity(event.target.value)}><option value="critical">Критичный</option><option value="high">Высокий</option><option value="medium">Средний</option><option value="low">Низкий</option><option value="info">Информация</option></select></label>
              <button type="submit" disabled={findingBusy || !findingSummary.trim()}>{findingBusy ? "Сохраняем…" : "Добавить замечание"}</button>
            </div>
          </form>
          {findings.length > 0 && <ul>{findings.slice(0, 8).map((finding) => <li key={finding.id}>
            <span className={styles.findingBadge}>{finding.severity}</span><span>{finding.summary}</span>
            <small>{finding.category}{finding.coordinates ? ` · точка ${Math.round(finding.coordinates.x * 100)}%, ${Math.round(finding.coordinates.y * 100)}%` : ""}</small>
            <select aria-label={`Статус замечания: ${finding.summary}`} value={finding.status} disabled={findingStatusBusy === finding.id} onChange={(event) => void updateFindingStatus(finding.id, event.target.value)}>
              <option value="open">Открыто</option><option value="accepted">Принято</option><option value="dismissed">Отклонено</option><option value="fixed">Исправлено</option><option value="unknown">Не проверено</option>
            </select>
          </li>)}</ul>}
        </section>}
        <div className={styles.notReady}>
          <strong>Автоматическая оценка пока не подключена</strong>
          <p>Сейчас доступны захват страницы и пиксельная маска отличий от макета. Она помогает найти визуальные расхождения, но не оценивает требования, backend/API или смысловое соответствие дизайну.</p>
        </div>
      </div>
    </section>
  </main>;
}

function resolvePreviewUrl(route: string, base: string) {
  try { return new URL(route, base).toString(); } catch { return base; }
}

function PreviewPanel({ title, designUrl, zoom = 1, viewportRef, onViewportScroll }: {
  title: string;
  designUrl?: string;
  zoom?: number;
  viewportRef?: { current: HTMLDivElement | null };
  onViewportScroll?: (element: HTMLDivElement) => void;
}) {
  return <section className={styles.previewPanel}>
    <div className={styles.panelTitle}>{title}</div>
    {designUrl ? <div className={styles.compareViewport} ref={viewportRef} onScroll={(event) => onViewportScroll?.(event.currentTarget)}>
      <img className={styles.designImage} src={designUrl} alt="Локально выбранный макет страницы" style={{ transform: `scale(${zoom})` }} />
    </div> : <div className={styles.noDesign}><span>◫</span><strong>Добавьте макет страницы</strong><small>PNG или JPEG · приватный макет</small></div>}
  </section>;
}

function SitePanel({ title, url, screenshotUrl, blocked, onBlocked, point, onPoint, zoom = 1, viewportRef, onViewportScroll }: {
  title: string;
  url: string;
  screenshotUrl?: string;
  blocked: boolean;
  onBlocked: () => void;
  point?: FindingPoint | null;
  onPoint?: (point: FindingPoint) => void;
  zoom?: number;
  viewportRef?: { current: HTMLDivElement | null };
  onViewportScroll?: (element: HTMLDivElement) => void;
}) {
  function setPointFromImage(image: HTMLImageElement, clientX: number, clientY: number) {
    if (!onPoint) return;
    const rect = image.getBoundingClientRect();
    const frameRect = image.closest("[data-capture-frame]")?.getBoundingClientRect() ?? rect;
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const boxRatio = rect.width / rect.height;
    const renderedWidth = imageRatio > boxRatio ? rect.width : rect.height * imageRatio;
    const renderedHeight = imageRatio > boxRatio ? rect.width / imageRatio : rect.height;
    const offsetX = (rect.width - renderedWidth) / 2;
    const offsetY = (rect.height - renderedHeight) / 2;
    const localX = clientX - rect.left - offsetX;
    const localY = clientY - rect.top - offsetY;
    if (localX < 0 || localY < 0 || localX > renderedWidth || localY > renderedHeight) return;
    onPoint({
      x: localX / renderedWidth,
      y: localY / renderedHeight,
      left: rect.left - frameRect.left + offsetX + localX,
      top: rect.top - frameRect.top + offsetY + localY,
    });
  }
  return <section className={styles.previewPanel}>
    <div className={styles.panelTitle}>{title}</div>
    {screenshotUrl ? <div className={styles.captureImageFrame} data-capture-frame>
      <div className={styles.compareViewport} ref={viewportRef} onScroll={(event) => onViewportScroll?.(event.currentTarget)}>
        <img
          className={styles.captureScreenshot}
          src={screenshotUrl}
          alt="Снимок выбранной страницы сайта. Нажмите, чтобы отметить точку замечания."
          role={onPoint ? "button" : undefined}
          tabIndex={onPoint ? 0 : undefined}
          onClick={(event) => setPointFromImage(event.currentTarget, event.clientX, event.clientY)}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && onPoint) {
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              setPointFromImage(event.currentTarget, rect.left + rect.width / 2, rect.top + rect.height / 2);
            }
          }}
          style={{ transform: `scale(${zoom})`, ...(onPoint ? { cursor: "crosshair" } : {}) }}
        />
      </div>
      {point && <span className={styles.capturePoint} style={{ left: point.left, top: point.top }} aria-hidden="true" />}
    </div> : blocked ? <div className={styles.noDesign}><strong>Сайт запрещает встроенный просмотр</strong><small>Откройте его в новой вкладке, чтобы сравнить вручную.</small><a href={url} target="_blank" rel="noreferrer">Открыть сайт ↗</a></div>
      : <iframe className={styles.siteFrame} title={title} src={url} sandbox="allow-scripts allow-forms allow-popups" referrerPolicy="no-referrer" onError={onBlocked} />}
  </section>;
}
