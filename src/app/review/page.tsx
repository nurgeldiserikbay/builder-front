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
type AiDesignAnalysis = { status: "complete"; provider: "openai"; model: string; createdAt: string; summary: string; limitation: string; findings: Array<{ category: "design"; severity: "critical" | "high" | "medium" | "low" | "info"; confidence: "low" | "medium" | "high"; summary: string; details: string; evidence: string }> };
type Capture = { captureId: string; status: "queued" | "captured" | "failed"; screenshotUrl: string | null; sha256: string | null; viewport: Page["viewport"]; safeErrorCode: string | null; capturedAt: string | null; aiAnalysis: AiDesignAnalysis | null; visualDiff: { status: "ready" | "failed"; changedPercent?: number; changedPixels?: number; totalPixels?: number; regions?: { x: number; y: number; width: number; height: number; changedPercent: number }[]; diffOverlayUrl: string | null; safeErrorCode?: string } | null };
type CompareMode = "side" | "overlay" | "wipe";
type FindingPoint = { x: number; y: number; left: number; top: number };
type Requirement = { id: string; pageId: string | null; category: string; title: string; details: string | null; status: "pending" | "satisfied" | "failed" | "blocked" | "unknown"; verificationNote: string | null; evidenceCaptureId: string | null; createdAt: string; updatedAt: string };
type Finding = { id: string; pageId: string | null; category: string; severity: string; status: string; confidence: string; summary: string; coordinates: { x: number; y: number } | null; evidence: unknown; createdAt: string; updatedAt: string };
type ReviewReport = {
  schemaVersion: number;
  generatedAt: string;
  signals: Array<{ id: string; code: string; severity: "high" | "medium" | "info"; pageId: string; requirementId: string | null; title: string; details: string }>;
  review: { id: string; title: string; mode: string; status: string; siteOrigin: string | null; createdAt: string };
  summary: {
    coverage: {
      site: { checked: number; total: number };
      requirements: { satisfied: number; total: number };
      design: { compared: number; total: number };
      backend: { checked: number; total: number };
    };
    pages: { total: number; mapped: number; captured: number };
    visualDiff: { compared: number; averageChangedPercent: number | null };
    requirements: { total: number; byStatus: Record<string, number> };
    findings: { total: number; byStatus: Record<string, number> };
    apiChecks: { totalRecent: number; passedRecent: number };
    aiReview: { analyzedCaptures: number; totalSuggestions: number; byConfidence: Record<string, number> };
    analysis: { source: "rules_v1"; totalSignals: number; bySeverity: Record<string, number> };
  };
  pages: Array<{
    id: string; route: string; title: string | null; status: string; designMapped: boolean;
    latestCapture: { status: "queued" | "captured" | "failed"; capturedAt: string | null; aiAnalysis: AiDesignAnalysis | null; visualDiff: { status: "ready" | "failed"; changedPercent: number | null } | null; qualityAudit: { checkedAt: string | null; pageTitlePresent: boolean; languagePresent: boolean; h1Count: number; imagesMissingAlt: number; linksMissingName: number; buttonsMissingName: number; formControlsMissingLabel: number } | null } | null;
    requirements: Array<{ id: string; category: string; title: string; status: string; verificationNote: string | null; evidenceCaptureId: string | null }>;
    findings: Array<{ id: string; category: string; severity: string; status: string; summary: string; createdAt: string }>;
    apiChecks: Array<{ id: string; requirementId: string | null; method: "GET" | "HEAD"; endpoint: string; expectedStatus: number; actualStatus: number | null; durationMs: number; passed: boolean; jsonPath: string | null; jsonMatches: boolean | null; safeErrorCode: string | null; checkedAt: string }>;
  }>;
  limitations: string[];
};

function escapeReportHtml(value: unknown): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  };
  return String(value ?? "").replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

function buildStaticHtmlReport(report: ReviewReport): string {
  const escape = escapeReportHtml;
  const labels: Record<string, string> = {
    pending: "Ожидает проверки",
    satisfied: "Подтверждено",
    failed: "Не выполнено",
    blocked: "Заблокировано",
    unknown: "Не проверено",
    open: "Открыто",
    in_progress: "В работе",
    resolved: "Решено",
    dismissed: "Отклонено",
  };
  const statusLabel = (value: string) => labels[value] ?? value;
  const coverageRows: Array<{ label: string; checked: number; total: number }> = [
    { label: "Рабочий сайт", checked: report.summary.coverage.site.checked, total: report.summary.coverage.site.total },
    { label: "ТЗ подтверждено", checked: report.summary.coverage.requirements.satisfied, total: report.summary.coverage.requirements.total },
    { label: "Сравнено с макетом", checked: report.summary.coverage.design.compared, total: report.summary.coverage.design.total },
    { label: "Backend проверен API", checked: report.summary.coverage.backend.checked, total: report.summary.coverage.backend.total },
  ];
  const coverageHtml = coverageRows.map((item) => {
    const percent = item.total > 0 ? Math.min(100, Math.round(item.checked / item.total * 100)) : 0;
    const count = item.total > 0 ? item.checked + "/" + item.total + " · " + percent + "%" : "Нет данных";
    return "<article class=\"coverage-card\"><div><strong>" + escape(item.label) + "</strong><b>" + escape(count) + "</b></div><div class=\"track\"><i style=\"width:" + percent + "%\"></i></div></article>";
  }).join("");
  const requirementStatusHtml = Object.entries(report.summary.requirements.byStatus).map(([status, count]) =>
    "<li><span>" + escape(statusLabel(status)) + "</span><strong>" + count + "</strong></li>",
  ).join("");
  const signalHtml = report.signals.map((signal) =>
    "<li><div><strong>" + escape(signal.title) + "</strong><span class=\"badge\">" + escape(statusLabel(signal.severity)) + "</span></div><p>" + escape(signal.details) + "</p></li>",
  ).join("");
  const pageHtml = report.pages.map((page, index) => {
    const requirements = page.requirements.map((requirement) =>
      "<li><span>" + escape(requirement.title) + "</span><strong>" + escape(statusLabel(requirement.status)) + "</strong></li>",
    ).join("");
    const findings = page.findings.map((finding) =>
      "<li><span>" + escape(finding.summary) + "</span><strong>" + escape(finding.severity) + " · " + escape(statusLabel(finding.status)) + "</strong></li>",
    ).join("");
    const apiChecks = page.apiChecks.map((check) =>
      "<li><code>" + escape(check.method) + " " + escape(check.endpoint) + "</code><strong>" + (check.passed ? "Пройдено" : "Не пройдено") + (check.actualStatus === null ? "" : " · HTTP " + check.actualStatus) + "</strong></li>",
    ).join("");
    const captureStatus = page.latestCapture ? statusLabel(page.latestCapture.status) : "Нет снимка";
    const diff = page.latestCapture?.visualDiff?.changedPercent === null || page.latestCapture?.visualDiff?.changedPercent === undefined
      ? "Нет данных"
      : page.latestCapture.visualDiff.changedPercent + "%";
    const quality = page.latestCapture?.qualityAudit
      ? "H1: " + page.latestCapture.qualityAudit.h1Count + ", изображения без alt: " + page.latestCapture.qualityAudit.imagesMissingAlt + ", ссылки без названия: " + page.latestCapture.qualityAudit.linksMissingName + ", кнопки без названия: " + page.latestCapture.qualityAudit.buttonsMissingName + ", поля без подписи: " + page.latestCapture.qualityAudit.formControlsMissingLabel
      : "Аудит пока не запускался";
    return "<section class=\"page-card\"><h3>" + (index + 1) + ". " + escape(page.title || page.route) + "</h3><p class=\"muted\">" + escape(page.route) + " · снимок: " + escape(captureStatus) + " · отличие: " + escape(diff) + " · макет: " + (page.designMapped ? "привязан" : "не привязан") + "</p><p>" + escape(quality) + "</p>" +
      (requirements ? "<h4>Требования</h4><ul class=\"rows\">" + requirements + "</ul>" : "") +
      (findings ? "<h4>Замечания</h4><ul class=\"rows\">" + findings + "</ul>" : "") +
      (apiChecks ? "<h4>API-проверки</h4><ul class=\"rows\">" + apiChecks + "</ul>" : "") +
      "</section>";
  }).join("");
  const limitationsHtml = report.limitations.map((limitation) => "<li>" + escape(limitation) + "</li>").join("");
  const generatedAt = new Date(report.generatedAt);
  const dateLabel = Number.isNaN(generatedAt.getTime()) ? report.generatedAt : generatedAt.toLocaleString("ru-RU");
  const pageTitle = escape(report.review.title) + " — BuildPath";
  return [
    "<!doctype html>",
    "<html lang=\"ru\">",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<title>" + pageTitle + "</title>",
    "<style>",
    "body{margin:0;background:#f4f7f3;color:#24352b;font:15px/1.55 Arial,sans-serif}main{max-width:1040px;margin:0 auto;padding:32px 20px 56px}header,.panel,.page-card{background:#fff;border:1px solid #e0e8df;border-radius:14px;padding:20px;margin:0 0 16px}h1{margin:0 0 5px;font-size:26px}h2{font-size:18px;margin:0 0 12px}h3{font-size:16px;margin:0 0 4px}h4{font-size:13px;margin:16px 0 5px;color:#405647}.muted{color:#6f7e72;font-size:13px}.coverage{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.coverage-card{padding:12px;border:1px solid #e5ece4;border-radius:10px}.coverage-card>div:first-child{display:flex;justify-content:space-between;gap:8px;font-size:12px}.coverage-card b{white-space:nowrap;color:#2d6749}.track{height:6px;margin-top:9px;background:#e9eee8;border-radius:99px;overflow:hidden}.track i{display:block;height:100%;background:#64a978;border-radius:99px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.stats article{padding:12px;border-radius:9px;background:#f1f5ef}.stats strong{display:block;color:#2d6749;font-size:20px}.rows{list-style:none;padding:0;margin:6px 0}.rows li{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #edf1ec;font-size:13px}.rows strong{color:#405647;text-align:right}.rows code{overflow-wrap:anywhere}.signal-list{padding-left:20px}.signal-list li{margin:8px 0}.signal-list li>div{display:flex;justify-content:space-between;gap:10px}.signal-list p{margin:3px 0;color:#657268;font-size:13px}.badge{padding:2px 7px;border-radius:99px;background:#fff4df;color:#775a22;font-size:11px;white-space:nowrap}.page-card{break-inside:avoid}.page-card h3{overflow-wrap:anywhere}.footnote{font-size:12px;color:#68776b} @media(max-width:700px){main{padding:14px 10px 32px}.coverage{grid-template-columns:repeat(2,minmax(0,1fr))}.stats{grid-template-columns:repeat(2,1fr)}} @media(max-width:420px){.coverage{grid-template-columns:1fr}.rows li{align-items:flex-start;flex-direction:column}.rows strong{text-align:left}} @media print{body{background:#fff}main{max-width:none;padding:0}.panel,.page-card,header{box-shadow:none;break-inside:avoid}}",
    "</style>",
    "</head>",
    "<body><main>",
    "<header><h1>" + escape(report.review.title) + "</h1><div class=\"muted\">Сформировано " + escape(dateLabel) + " · состояние: " + escape(statusLabel(report.review.status)) + (report.review.siteOrigin ? " · сайт: " + escape(report.review.siteOrigin) : "") + "</div></header>",
    "<section class=\"panel\"><h2>Покрытие проверки</h2><p class=\"muted\">Индикаторы показывают объём собранных доказательств, а не автоматическую оценку качества продукта.</p><div class=\"coverage\">" + coverageHtml + "</div></section>",
    "<section class=\"panel\"><h2>Сводка</h2><div class=\"stats\"><article><strong>" + report.summary.pages.total + "</strong>страниц</article><article><strong>" + report.summary.visualDiff.compared + "</strong>визуальных сравнений</article><article><strong>" + report.summary.findings.total + "</strong>замечаний</article><article><strong>" + report.summary.apiChecks.passedRecent + "/" + report.summary.apiChecks.totalRecent + "</strong>API-проверок пройдено</article><article><strong>" + report.summary.aiReview.analyzedCaptures + "</strong>ИИ-разборов</article><article><strong>" + report.summary.aiReview.totalSuggestions + "</strong>ИИ-предложений</article><article><strong>" + (report.summary.visualDiff.averageChangedPercent === null ? "—" : report.summary.visualDiff.averageChangedPercent + "%") + "</strong>среднее отличие</article><article><strong>" + report.summary.analysis.totalSignals + "</strong>сигналов правил</article></div></section>",
    "<section class=\"panel\"><h2>Статусы требований</h2>" + (requirementStatusHtml ? "<ul class=\"rows\">" + requirementStatusHtml + "</ul>" : "<p class=\"muted\">Требования ещё не добавлены.</p>") + "</section>",
    "<section class=\"panel\"><h2>Что требует внимания</h2>" + (signalHtml ? "<ul class=\"signal-list\">" + signalHtml + "</ul>" : "<p class=\"muted\">Автоматические сигналы не найдены.</p>") + "</section>",
    "<section><h2>Страницы</h2>" + (pageHtml || "<p class=\"muted\">Страницы не найдены.</p>") + "</section>",
    "<section class=\"panel\"><h2>Ограничения отчёта</h2><ul>" + limitationsHtml + "</ul><p class=\"footnote\">Пиксельные отличия, API-проверки и ИИ-рекомендации являются отдельными свидетельствами. ИИ-результаты не подтверждают требования автоматически. Сформировано BuildPath, версия схемы " + report.schemaVersion + ".</p></section>",
    "</main></body>",
    "</html>",
  ].join("\n");
}

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
  const [aiAnalysisBusy, setAiAnalysisBusy] = useState(false);
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

  const reviewCoverage = reportData ? [
    { label: "Рабочий сайт", done: reportData.summary.coverage.site.checked, total: reportData.summary.coverage.site.total, detail: "страниц со снимком" },
    { label: "ТЗ", done: reportData.summary.coverage.requirements.satisfied, total: reportData.summary.coverage.requirements.total, detail: "пунктов подтверждено" },
    { label: "Макет", done: reportData.summary.coverage.design.compared, total: reportData.summary.coverage.design.total, detail: "страниц сравнено с макетом" },
    { label: "Backend", done: reportData.summary.coverage.backend.checked, total: reportData.summary.coverage.backend.total, detail: "backend-пунктов проверено API" },
  ] : [];

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

  async function analyzeSelectedCapture() {
    if (!review || !selectedCapture || selectedCapture.status !== "captured" || !selectedDesign || !selectedPage) return;
    setAiAnalysisBusy(true);
    setMessage("");
    try {
      const result = await api<{ analysis: AiDesignAnalysis; reused: boolean }>(
        `/reviews/${review.id}/captures/${selectedCapture.captureId}/ai-analysis`,
        { method: "POST" },
      );
      setCaptures((current) => ({
        ...current,
        [selectedPage.id]: { ...current[selectedPage.id], aiAnalysis: result.analysis },
      }));
      setMessage(result.reused ? "Показан сохранённый ИИ-разбор." : "ИИ-разбор готов. Проверьте каждое замечание вручную.");
      void loadReport();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      setMessage(detail.includes("AI_REVIEW_NOT_CONFIGURED")
        ? "ИИ-анализ не настроен на сервере. Добавьте AI_REVIEW_OPENAI_API_KEY и AI_REVIEW_OPENAI_MODEL."
        : detail.includes("AI_REVIEW_IN_PROGRESS")
          ? "Разбор этой страницы уже выполняется."
          : detail || "Не удалось выполнить ИИ-разбор.");
    } finally {
      setAiAnalysisBusy(false);
    }
  }

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
          captureId: queued.captureId, status: "queued", screenshotUrl: null, sha256: null, visualDiff: null, aiAnalysis: null,
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

  async function downloadHtmlReport() {
    const report = await loadReport();
    if (!report) return;
    const blob = new Blob([buildStaticHtmlReport(report)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `buildpath-review-${report.review.id}.html`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("HTML-отчёт сохранён. Его можно открыть в браузере или передать команде.");
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
              <button className={styles.reportPrint} onClick={downloadHtmlReport} disabled={reportBusy}>Скачать HTML</button>
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
            <div><strong>{reportData.summary.coverage.backend.checked}/{reportData.summary.coverage.backend.total}</strong><span>backend-ТЗ с API-проверкой</span></div>
            <div><strong>{reportData.summary.visualDiff.averageChangedPercent === null ? "—" : `${reportData.summary.visualDiff.averageChangedPercent}%`}</strong><span>среднее отличие</span></div>
            <div><strong>{reportData.summary.aiReview.analyzedCaptures}</strong><span>ИИ-разборов</span></div>
          </div>
          <section className={styles.reportCoverage} aria-label="Покрытие проверки">
            <div className={styles.reportCoverageHeading}>
              <h4>Покрытие проверки</h4>
              <p>Показывает, какие части проекта уже проверены по собранным данным.</p>
            </div>
            <ul>{reviewCoverage.map((item) => {
              const percentage = item.total > 0 ? Math.min(100, Math.round((item.done / item.total) * 100)) : 0;
              return <li key={item.label}>
                <div className={styles.reportCoverageLabel}><strong>{item.label}</strong><span>{item.total > 0 ? `${item.done}/${item.total} · ${percentage}%` : "Нет данных"}</span></div>
                <div className={styles.reportCoverageTrack} role="progressbar" aria-label={item.label} aria-valuemin={0} aria-valuemax={item.total} aria-valuenow={Math.min(item.done, item.total)}><i style={{ width: `${percentage}%` }} /></div>
                <small>{item.detail}</small>
              </li>;
            })}</ul>
          </section>
          {reportData.summary.aiReview.analyzedCaptures > 0 && <p className={styles.captureInfo}>ИИ-предложений: {reportData.summary.aiReview.totalSuggestions} · высокая уверенность: {reportData.summary.aiReview.byConfidence.high ?? 0} · средняя: {reportData.summary.aiReview.byConfidence.medium ?? 0} · низкая: {reportData.summary.aiReview.byConfidence.low ?? 0}</p>}
          <section className={styles.reportSignals} aria-label="Автоматические сигналы проверки">
            <div className={styles.reportSignalsHeading}>
              <div><h4>Что требует внимания</h4><p>Правила подсвечивают пробелы в данных и результатах. Это не ИИ-оценка макета.</p></div>
              <div className={styles.reportSignalCounts}>
                <span data-level="high">{reportData.summary.analysis.bySeverity.high ?? 0} важных</span>
                <span data-level="medium">{reportData.summary.analysis.bySeverity.medium ?? 0} требуют проверки</span>
              </div>
            </div>
            {reportData.signals.length === 0 ? <p className={styles.reportSignalsEmpty}>По текущим данным автоматические сигналы не найдены.</p> :
              <ul>{reportData.signals.slice(0, 40).map((signal) => {
                const page = reportData.pages.find((item) => item.id === signal.pageId);
                return <li key={signal.id} data-level={signal.severity}>
                  <div><strong>{signal.title}</strong><small>{page?.title || page?.route || "Страница"}</small></div>
                  <p>{signal.details}</p>
                  <button type="button" onClick={() => setSelectedPageId(signal.pageId)}>Открыть страницу</button>
                </li>;
              })}</ul>}
            {reportData.signals.length > 40 && <small className={styles.reportSignalsMore}>Показаны первые 40 из {reportData.signals.length} сигналов. Все сигналы сохранены в JSON-отчёте.</small>}
          </section>
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
              {page.latestCapture?.qualityAudit && <details className={styles.reportPageChecks}>
                <summary>Проверка доступности и структуры страницы</summary>
                <ul>{(() => {
                  const audit = page.latestCapture!.qualityAudit!;
                  const checks = [
                    ["Заголовок вкладки", audit.pageTitlePresent ? "Есть" : "Не найдено"],
                    ["Язык документа", audit.languagePresent ? "Указан" : "Не указан"],
                    ["Заголовок H1", audit.h1Count > 0 ? "Найдено: " + audit.h1Count : "Не найден"],
                    ["Изображения без alt", String(audit.imagesMissingAlt)],
                    ["Ссылки без подписи", String(audit.linksMissingName)],
                    ["Кнопки без подписи", String(audit.buttonsMissingName)],
                    ["Поля формы без подписи", String(audit.formControlsMissingLabel)],
                  ];
                  return checks.map(([label, value], index) => <li key={index}><span>{label}</span><strong>{value}</strong></li>);
                })()}</ul>
                {page.latestCapture.qualityAudit.checkedAt && <small>Проверено {new Date(page.latestCapture.qualityAudit.checkedAt).toLocaleString("ru-RU")}</small>}
              </details>}
              {page.latestCapture?.aiAnalysis && <details className={styles.reportPageChecks}>
                <summary>ИИ-анализ · {page.latestCapture.aiAnalysis.findings.length} предложений</summary>
                <p>{page.latestCapture.aiAnalysis.summary}</p>
                <ul>{page.latestCapture.aiAnalysis.findings.map((item, index) => <li key={index}>
                  <strong>{item.summary} · {item.confidence}</strong><span>{item.details}</span><small>Доказательство: {item.evidence}</small>
                </li>)}</ul>
                <small>{page.latestCapture.aiAnalysis.limitation}</small>
              </details>}
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
        {selectedCapture?.status === "captured" && selectedDesign && <section className={styles.findings}>
          <h3>ИИ-сверка макета и сайта</h3>
          <p>При запуске сохранённый снимок и выбранный макет будут отправлены в настроенный OpenAI сервис; запрос может тарифицироваться провайдером. Результат — предложения для проверки, а не подтверждение соответствия.</p>
          <button type="button" onClick={() => void analyzeSelectedCapture()} disabled={aiAnalysisBusy}>
            {aiAnalysisBusy ? "Анализируем…" : selectedCapture.aiAnalysis ? "Показать сохранённый разбор" : "Сравнить с помощью ИИ"}
          </button>
          {selectedCapture.aiAnalysis && <div className={styles.reportSignals}>
            <p>{selectedCapture.aiAnalysis.summary}</p>
            {selectedCapture.aiAnalysis.findings.length === 0 ? <p>ИИ не нашёл конкретных расхождений. Это не гарантирует полное соответствие макету.</p> :
              <ul>{selectedCapture.aiAnalysis.findings.map((item, index) => <li key={index} data-level={item.severity}>
                <div><strong>{item.summary}</strong><small>{item.category} · уверенность: {item.confidence}</small></div>
                <p>{item.details}</p><small>Доказательство: {item.evidence}</small>
              </li>)}</ul>}
            <small>{selectedCapture.aiAnalysis.limitation} · {selectedCapture.aiAnalysis.model} · {new Date(selectedCapture.aiAnalysis.createdAt).toLocaleString("ru-RU")}</small>
          </div>}
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
          <strong>ИИ-разбор доступен для сохранённого снимка с привязанным макетом</strong>
          <p>Пиксельное сравнение и DOM-аудит остаются отдельными техническими сигналами. ИИ-замечания не проверяют backend/API и требуют подтверждения ревьюером.</p>
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
