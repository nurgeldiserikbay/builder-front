"use client";

import ApprovalPanel from "./approval";
import { t, dateLocale } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import {
  explainError, isPlanMessage, originLabels, statusTone, type Content, type Design, type Journey, type Offer, type SiteCheck, type QualityReport, type StageDetail, type Sitemap, type Catalog,
} from "@/lib/journey";
import { ContentEditor, DesignPicker, FieldsForm } from "./editors";
import { SpecialistsPanel, SuggestionsPanel } from "./specialists";
import ChangesPanel from "./changes";
import QualityReportView from "./quality-report";
import { TimesheetPanel } from "./timesheet";
import { ScheduleEditor, type Schedule } from "./schedule-editor";
import { TechPlanView, type TechPlan } from "./techplan-view";
import { ProcessEditor, blankProcess, type BusinessProcess } from "./process-editor";
import { SitemapEditor, blankSitemap } from "./sitemap-editor";
import { CatalogEditor } from "./catalog-editor";
import { formatTenge } from "@/lib/money";
import styles from "../../../journey.module.css";
import AppHeader from "../../../../app-header";

type SaveAs = "one_off" | "stage_rule" | "project_rule";
const defaultDesign: Design = { palette: "forest", font: "modern", corners: "rounded", heroLayout: "centered" };
const blankContent: Content = {
  sections: [
    { key: "hero", type: "hero", title: "", text: "", items: [], buttonLabel: t("Связаться") },
    { key: "contacts", type: "contacts", title: t("Контакты"), text: "", items: [], buttonLabel: t("Связаться") },
  ],
  seo: { title: "", description: "" },
};

function summarize(key: string, content: unknown): string {
  if (!content) return "";
  if (key === "goal") { const brief = content as Record<string, string | null>; return [brief.businessName, brief.whatYouDo].filter(Boolean).join(" — "); }
  if (key === "offer") return t("Услуг: {0}", [(content as Offer).services.length]);
  if (key === "content") return t("Блоков: {0}", [(content as Content).sections.length]);
  if (key === "design") return t("Стиль выбран");
  if (key === "techplan") return t("План версии {0}", [(content as TechPlan).planVersion]);
  if (key === "schedule") { const schedule = content as Schedule; return t("Услуг для записи: {0}, мастеров: {1}", [schedule.services.length, schedule.masters.length]); }
  return "";
}

export default function StagePage() {
  const router = useRouter();
  const { projectId, stageKey } = useParams<{ projectId: string; stageKey: string }>();
  const [detail, setDetail] = useState<StageDetail | null>(null);
  const [draft, setDraft] = useState<unknown>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [instruction, setInstruction] = useState("");
  const [saveAs, setSaveAs] = useState<SaveAs>("one_off");
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  // Multi-page sites: the pages the preview can switch between, and which one is shown.
  const [previewPages, setPreviewPages] = useState<Array<{ path: string; title: string }>>([]);
  const [previewPage, setPreviewPage] = useState("/");
  const [previewVersion, setPreviewVersion] = useState<string | undefined>(undefined);
  const [nextStageKey, setNextStageKey] = useState<string | null>(null);
  const [requestPrice, setRequestPrice] = useState<number | null>(null);
  const [spendLimit, setSpendLimit] = useState<{ amount: number; left: number; percent: number; warn: boolean; blocked: boolean } | null>(null);
  const loadBudget = useCallback(() => {
    // Specialists don't see project money; the request just fails quietly for them.
    api<{ perRequest: number | null; limit: typeof spendLimit }>(`/projects/${projectId}/budget`).then((budget) => { setRequestPrice(budget.perRequest); setSpendLimit(budget.limit ?? null); }).catch(() => undefined);
  }, [projectId]);
  useEffect(() => { loadBudget(); }, [loadBudget]);

  const load = useCallback(async () => {
    try {
      const next = await api<StageDetail>(`/projects/${projectId}/stages/${stageKey}`);
      setDetail(next);
      const type = next.stage.artifactType;
      setDraft(next.current?.content ?? (type === "brief" ? {} : type === "offer" ? { services: [], hours: null } : type === "design" ? defaultDesign : type === "schedule" ? next.options.schedule?.template ?? null : type === "techplan" ? { ownerNotes: null } : null));
      // A first style choice or the prefilled schedule is a ready-to-save draft: offer «Сохранить» right away.
      setDirty(!next.current && (type === "design" || type === "schedule" || (type === "techplan" && Boolean(next.options.techplan?.preview))) && next.stage.canEdit);
      return next;
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`); return null; }
      setError(explainError(caught));
      return null;
    }
  }, [projectId, stageKey, router]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label); setError(""); setMessage("");
    try { await action(); } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }

  const edit = (next: unknown) => { setDraft(next); setDirty(true); };

  async function saveDraft(): Promise<StageDetail | null> {
    const saved = await api<{ versionNumber: number; changed: string[] }>(`/projects/${projectId}/stages/${stageKey}/draft`, {
      method: "PUT", body: JSON.stringify({ content: draft, baseVersionId: detail?.current?.id ?? null }),
    });
    const next = await load();
    setMessage(saved.changed.length ? t("Сохранено — версия {0}. Изменённые вами места защищены от перезаписи ИИ.", [saved.versionNumber]) : t("Изменений нет."));
    return next;
  }

  async function askAi(options: { instruction?: string; targetKey?: string; saveAs?: SaveAs }) {
    if (dirty) await saveDraft();
    const result = await api<{ versionNumber: number; provider: string }>(`/projects/${projectId}/stages/${stageKey}/generate`, {
      method: "POST",
      body: JSON.stringify({ ...(options.instruction ? { instruction: options.instruction, saveAs: options.saveAs ?? "one_off" } : {}), ...(options.targetKey ? { targetKey: options.targetKey } : {}) }),
    });
    await load();
    setPreview(null);
    setMessage(result.provider === "template"
      ? t("Готов черновик по шаблону (версия {0}). Замените места в [квадратных скобках] своими данными.", [result.versionNumber])
      : t("ИИ подготовил версию {0}. Проверьте её — если что-то не так, напишите, что поменять.", [result.versionNumber]));
  }

  async function showPreview(versionId?: string, page = "/") {
    if (dirty) await saveDraft();
    const query = new URLSearchParams({ ...(versionId ? { versionId } : {}), ...(page !== "/" ? { page } : {}) }).toString();
    const data = await api<{ html: string; pages?: Array<{ path: string; title: string }> }>(`/projects/${projectId}/preview${query ? `?${query}` : ""}`);
    setPreview(data.html);
    setPreviewPages(data.pages ?? []);
    setPreviewPage(page);
    setPreviewVersion(versionId);
  }

  async function toggleLock(key: string, locked: boolean) {
    await run("lock", async () => {
      const data = await api<{ lockedKeys: string[] }>(`/projects/${projectId}/stages/${stageKey}/locks`, { method: "POST", body: JSON.stringify({ key, locked }) });
      setDetail((current) => (current ? { ...current, stage: { ...current.stage, lockedKeys: data.lockedKeys } } : current));
    });
  }

  async function accept() {
    if (!detail?.current) return;
    await run("accept", async () => {
      const journey = await api<Journey>(`/projects/${projectId}/stages/${stageKey}/accept`, { method: "POST", body: JSON.stringify({ versionId: detail.current!.id }) });
      await load();
      setNextStageKey(journey.nextAction.stageKey);
      setMessage(journey.nextAction.stageKey ? t("Этап принят. Дальше: «{0}».", [journey.nextAction.title]) : t("Этап принят. Все этапы проекта готовы — скачайте результат на странице проекта."));
    });
  }

  async function submit() {
    if (!detail?.current) return;
    await run("submit", async () => {
      await api(`/projects/${projectId}/stages/${stageKey}/submit`, { method: "POST", body: JSON.stringify({ versionId: detail.current!.id }) });
      await load();
      setMessage(t("Отправлено владельцу на приёмку. Пока он проверяет, этап нельзя менять."));
    });
  }

  async function approve() {
    if (!detail?.current) return;
    const comment = window.prompt(t("Одобрить версию {0}? Можно оставить комментарий (необязательно).", [detail.current.versionNumber]), "");
    if (comment === null) return;
    await run("approve", async () => {
      const next = await api<StageDetail>(`/projects/${projectId}/stages/${stageKey}/approve`, { method: "POST", body: JSON.stringify({ versionId: detail.current!.id, comment: comment.trim() || null }) });
      await load();
      setMessage(next.stage.status === "approved" ? t("Одобрено. Набраны все нужные одобрения — этап принят.") : t("Одобрено: {0} из {1}.", [next.stage.approval.approved ?? 0, next.stage.approval.required ?? 0]));
    });
  }

  async function requestChanges() {
    const note = window.prompt(t("Что нужно доработать? Специалист увидит этот комментарий."));
    if (!note || note.trim().length < 2) return;
    await run("changes", async () => {
      await api(`/projects/${projectId}/stages/${stageKey}/request-changes`, { method: "POST", body: JSON.stringify({ note: note.trim() }) });
      await load();
      setMessage(t("Этап возвращён на доработку с вашим комментарием."));
    });
  }

  async function reopen() {
    if (!window.confirm(t("Изменить принятый этап? Этапы, которые построены на нём, нужно будет проверить ещё раз."))) return;
    await run("reopen", async () => {
      await api(`/projects/${projectId}/stages/${stageKey}/reopen`, { method: "POST" });
      await load();
      setMessage(t("Этап снова открыт для изменений."));
    });
  }

  if (error && !detail) return <Shell projectId={projectId} title=""><p className={`${styles.notice} ${styles.error}`} role="alert">{error}{isPlanMessage(error) && <> <a href="/account/plan" style={{ color: "inherit", fontWeight: 700 }}>{t("Открыть тариф →")}</a></>}</p></Shell>;
  if (!detail) return <Shell projectId={projectId} title=""><p className={styles.muted}>{t("Загружаем этап…")}</p></Shell>;

  const { stage, ai } = detail;
  const tone = statusTone[stage.status];
  const accepted = stage.status === "approved" || stage.status === "imported";
  const aiUsable = ai.level !== "none" && ai.configured && stage.canEdit && stage.inputsReady;
  const issueKeys = detail.issues.map((issue) => issue.key);
  const siteChecks = stage.artifactType === "site" ? ((detail.current?.content as { checks?: SiteCheck[] } | undefined)?.checks ?? []) : [];
  const quality = stage.artifactType === "site" ? ((detail.current?.content as { quality?: QualityReport | null } | undefined)?.quality ?? null) : null;
  const failedRequired = [...siteChecks.filter((check) => check.required && check.status === "failed"),
    ...(stage.artifactType === "site" && detail.current && (!quality || quality.status === "failed") ? [{ id: "quality", status: "failed" as const, title: t("Проверка перед публикацией"), details: "", required: true }] : [])];
  const specialist = detail.viewer.kind === "specialist";
  const policy = Boolean(stage.approval?.policy);
  const assignment = detail.viewer.assignments.find((item) => item.stageKey === stage.key) ?? null;
  const submitBlocked = dirty || !stage.canSubmit || detail.issues.length > 0 || !stage.inputsReady;
  const submitReason = stage.changesPending ? t("Сначала решите по изменению предыдущего этапа (вверху страницы).") : dirty ? t("Сначала сохраните изменения.") : !detail.current ? t("Сначала сделайте черновик.")
    : !stage.inputsReady ? t("Предыдущие этапы ещё не приняты владельцем.") : detail.issues.length > 0 ? t("Заполните то, чего не хватает (список выше).") : t("Владелец проверит результат и примет этап или вернёт с комментарием.");
  const sectionTargets = stage.artifactType === "content" && detail.current
    ? (detail.current.content as Content).sections.map((section) => ({ key: section.key, label: section.title || detail.options.sectionTypes[section.type] })) : [];
  const acceptBlocked = dirty || !stage.canAccept || detail.issues.length > 0 || failedRequired.length > 0;
  const impactText = stage.impact?.willNotify.length ? t("Этапы {0} получат уведомление об изменении.", [stage.impact.willNotify.map((item) => `«${item.title}»`).join(", ")]) : stage.impact?.opens.length ? t("Откроется: {0}.", [stage.impact.opens.map((item) => `«${item.title}»`).join(", ")]) : "";
  const acceptReason = stage.waitingBranches?.length ? t("Ждём решения по изменениям (вверху страницы).") : stage.changesPending ? t("Сначала решите по изменению предыдущего этапа (вверху страницы).") : dirty ? t("Сначала сохраните изменения.")
    : !stage.inputsReady ? t("Сначала примите предыдущие этапы.")
      : detail.issues.length > 0 ? t("Заполните то, чего не хватает (список выше).")
        : failedRequired.length > 0 ? t("Исправьте непройденные проверки.")
          : !detail.current ? t("Сначала сделайте черновик.") : [stage.acceptExplanation, impactText].filter(Boolean).join(" ");

  return (
    <Shell projectId={projectId} title={stage.title}>
      <div className={styles.split}>
      <div className={styles.work}>
      <div className={styles.workHead}>
        <h1 className={styles.h1}>{stage.title}</h1>
        <span className={`${styles.chip} ${styles[tone]}`} title={stage.statusExplanation}>{stage.statusLabel}</span>
      </div>
      {stage.statusExplanation && <p className={styles.small} style={{ margin: "0 0 16px" }}>{stage.statusExplanation}</p>}
      {stage.artifactType === "site" && detail.options.technology === "developer" && (
        <p className={`${styles.notice} ${styles.info}`}>{t("Выбран свой стек у разработчика: сайт он делает и размещает сам, проверки и публикация BuildPath к нему не применяются. Сборка с ИИ ниже сделает сайт на технологиях BuildPath — это удобно как образец для разработчика.")}{" "}<a href={`/projects/${projectId}/choices/technologies`}>{t("Изменить решение →")}</a></p>
      )}
      {stage.artifactType === "site" && detail.options.technology === "constructor" && (
        <p className={`${styles.notice} ${styles.info}`}>{t("Выбран конструктор сайтов: сайт соберёте там, перенеся тексты вручную. Сборка с ИИ сделает сайт на технологиях BuildPath — как образец того, что получится.")}{" "}<a href={`/projects/${projectId}/choices/technologies`}>{t("Изменить решение →")}</a></p>
      )}
      {stage.artifactType === "site" && detail.options.technology === null && (
        <p className={styles.small} style={{ margin: "-6px 0 14px" }}>{t("Сборка делается на технологиях BuildPath. Нужен свой стек или конструктор?")}{" "}<a href={`/projects/${projectId}/choices/technologies`}>{t("Сравнить варианты →")}</a></p>
      )}

      {specialist && assignment && (
        <p className={`${styles.notice} ${styles.info}`}>
          {assignment.status === "completed"
            ? t("Владелец принял этап. Менять его больше нельзя, смотреть можно ещё несколько дней.")
            : assignment.role === "lead"
              ? t("Вы ведущий этого этапа: направляйте ИИ, правьте результат и отправьте его владельцу на приёмку.{0}", [assignment.aiBudget !== null ? t(" Запросов к ИИ: {0} из {1}.", [assignment.aiUsed, assignment.aiBudget]) : ""])
              : t("Вы консультант этого этапа: смотрите результат и предлагайте правки — ведущий или владелец отправит их ИИ.")}
        </p>
      )}
      {stage.status === "changes_requested" && stage.reviewNote && (
        <p className={`${styles.notice} ${styles.warn}`}><strong>{policy ? t("Просят доработать:") : t("Владелец просит доработать:")}</strong> {stage.reviewNote}</p>
      )}
      {stage.status === "in_review" && policy && (
        <p className={`${styles.notice} ${styles.info}`}>{stage.approval.canApprove ? t("Этап ждёт вашей проверки. Посмотрите результат: одобрите версию или верните с комментарием.") : t("Этап на проверке. Пока проверяющие смотрят, менять его нельзя.")}</p>
      )}
      {stage.status === "in_review" && !policy && (
        <p className={`${styles.notice} ${styles.info}`}>{stage.canRequestChanges ? t("Специалист отправил этап вам на приёмку. Посмотрите результат и примите его или верните с комментарием.") : t("Этап на приёмке у владельца. Пока он проверяет, менять его нельзя.")}</p>
      )}

      <ChangesPanel projectId={projectId} stageKey={stageKey} onChange={() => void load()} />

      {stage.contract && (
        <section className={`${styles.card} ${styles.contractCard}`} aria-label={t("Контракт")}>
          <p className={styles.kicker}>{t("Контракт этапов")}</p>
          <p style={{ margin: "0 0 8px" }}>{stage.contract.explanation}</p>
          {stage.impact && stage.impact.opens.length > 1 && <p className={styles.small} style={{ margin: 0 }}>{t("После утверждения одновременно откроются:")}{" "}{stage.impact.opens.map((item) => `«${item.title}»`).join(", ")}.</p>}
        </section>
      )}
      {stage.waitingBranches && stage.waitingBranches.length > 0 && (
        <div className={`${styles.notice} ${styles.warn}`}>
          {[...new Set(stage.waitingBranches.map((item) => item.sourceTitle))].map((source) => (
            <p key={source} style={{ margin: "0 0 6px" }}>
              {t("Изменился этап «")}{source}{t("». Ждём решения этапов:")}{" "}{stage.waitingBranches!.filter((item) => item.sourceTitle === source).map((item, index) => (
                <span key={item.stageKey}>{index > 0 ? ", " : ""}<a href={`/projects/${projectId}/stages/${item.stageKey}`}>«{item.title}»</a></span>
              ))}.
            </p>
          ))}
          <span>{t("Пока они не решат, этот этап нельзя собрать и принять — иначе части сайта будут сделаны по разным версиям.")}</span>
        </div>
      )}



      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}{isPlanMessage(error) && <> <a href="/account/plan" style={{ color: "inherit", fontWeight: 700 }}>{t("Открыть тариф →")}</a></>}</p>}
      {message && (
        <p className={`${styles.notice} ${styles.success}`} role="status">{message}
          {nextStageKey && accepted && <><br /><a className={styles.back} href={`/projects/${projectId}/stages/${nextStageKey}`}>{t("Перейти к следующему этапу →")}</a></>}
        </p>
      )}

      {stage.status === "locked" && (
        <div className={`${styles.notice} ${styles.info}`}>
          {t("Этот этап откроется, когда будут приняты:")}{" "}{detail.inputs.filter((input) => !input.satisfied).map((input) => `«${input.title}»`).join(", ")}.
          <br /><a className={styles.back} href={`/projects/${projectId}`}>{t("← К списку этапов")}</a>
        </div>
      )}


      {stage.status === "stale" && <p className={`${styles.notice} ${styles.warn}`}>{t("Предыдущий этап изменился. Посмотрите, что изменилось, вверху страницы и решите: обновить этот этап или оставить его как есть.")}</p>}
      {!stage.inputsReady && stage.status !== "locked" && !accepted && (
        <p className={`${styles.notice} ${styles.info}`}>{t("Можно готовить этап заранее, но принять его получится после того, как будут приняты предыдущие этапы.")}</p>
      )}

      {/* Stage with AI-first start for the brief */}
      {stage.artifactType === "brief" && stage.canEdit && ai.level !== "none" && (
        <section className={styles.card} aria-label={t("Описать бизнес своими словами")}>
          <p className={styles.cardTitle}>{t("Расскажите о бизнесе своими словами")}</p>
          <p className={styles.small} style={{ marginTop: 0 }}>{ai.configured ? `${ai.whatItDoes}${requestPrice !== null ? t(" Один запрос к ИИ стоит около {0}.", [formatTenge(requestPrice)]) : ""}` : t("ИИ пока не подключён — заполните поля ниже вручную. Это займёт пару минут.")}</p>
          {ai.configured && (
            <>
              <textarea className={styles.textarea} value={instruction} maxLength={1000} placeholder={ai.describeHint ?? ""} aria-label={t("Описание бизнеса")} onChange={(event) => setInstruction(event.target.value)} />
              <button className={`${styles.button} ${styles.block}`} style={{ marginTop: 10 }} disabled={Boolean(busy) || instruction.trim().length < 2}
                onClick={() => run("ai", async () => { await askAi({ instruction: instruction.trim() }); setInstruction(""); })}>{busy === "ai" ? t("ИИ заполняет…") : t("✨ Заполнить поля с ИИ")}</button>
              <p className={styles.small}>{t("Поля, которые вы уже заполнили сами, ИИ не тронет.")}</p>
            </>
          )}
        </section>
      )}

      {/* Starting point for an empty content stage */}
      {stage.artifactType === "content" && !detail.current && draft === null && stage.canEdit && (
        <section className={styles.card} aria-label={t("Как начать")}>
          <p className={styles.cardTitle}>{t("Как начнём тексты?")}</p>
          <div style={{ display: "grid", gap: 10 }}>
            {ai.configured && stage.inputsReady && (
              <button className={styles.button} disabled={Boolean(busy)} onClick={() => run("ai", () => askAi({}))}>{busy === "ai" ? t("ИИ пишет тексты…") : t("✨ Пусть ИИ напишет тексты")}</button>
            )}
            {!ai.configured && ai.templateAvailable && stage.inputsReady && (
              <button className={styles.button} disabled={Boolean(busy)} onClick={() => run("ai", () => askAi({}))}>{t("Сделать черновик по шаблону")}</button>
            )}
            <button className={styles.secondary} onClick={() => edit(blankContent)}>{t("Написать самому с чистого листа")}</button>
          </div>
          {!stage.inputsReady && <p className={styles.small}>{t("Черновик от ИИ или по шаблону станет доступен, когда будет принят паспорт проекта. Свои тексты можно вставить уже сейчас (ниже).")}</p>}
        </section>
      )}

      {/* Starting point for an empty business process */}
      {stage.artifactType === "process" && !detail.current && draft === null && stage.canEdit && (
        <section className={styles.card} aria-label={t("Как начать")}>
          <p className={styles.cardTitle}>{t("Как начнём описывать процесс?")}</p>
          <div style={{ display: "grid", gap: 10 }}>
            {ai.configured && stage.inputsReady && (
              <button className={styles.button} disabled={Boolean(busy)} onClick={() => run("ai", () => askAi({}))}>{busy === "ai" ? t("ИИ описывает процесс…") : t("✨ Пусть ИИ опишет процесс")}</button>
            )}
            {!ai.configured && ai.templateAvailable && stage.inputsReady && (
              <button className={styles.button} disabled={Boolean(busy)} onClick={() => run("ai", () => askAi({}))}>{t("Взять типичный процесс")}</button>
            )}
            <button className={styles.secondary} onClick={() => edit(blankProcess)}>{t("Описать самому с чистого листа")}</button>
          </div>
          {!stage.inputsReady && <p className={styles.small}>{t("Черновик от ИИ станет доступен, когда будет принят паспорт проекта. Описать процесс самому можно уже сейчас.")}</p>}
        </section>
      )}
      {/* Starting point for an empty catalogue */}
      {stage.artifactType === "catalog" && !detail.current && draft === null && stage.canEdit && detail.options.catalog && (
        <section className={styles.card} aria-label={t("Как начать")}>
          <p className={styles.cardTitle}>{t("Как начнём каталог?")}</p>
          <p className={styles.small} style={{ marginTop: 0 }}>{t("Если список товаров уже есть, вставьте его ниже, в «У меня уже есть готовое». Или заполните каталог по одному товару.")}</p>
          <button className={styles.button} onClick={() => edit(detail.options.catalog!.template)}>{t("Заполнить вручную")}</button>
        </section>
      )}
      {stage.artifactType === "catalog" && stage.status !== "locked" && draft !== null && detail.options.catalog && (
        <CatalogEditor projectId={projectId} value={draft as Catalog} onChange={edit} options={detail.options.catalog} disabled={!stage.canEdit}
          issues={dirty ? [] : detail.issues.map((issue) => issue.message)} />
      )}
      {/* Starting point for an empty sitemap */}
      {stage.artifactType === "sitemap" && !detail.current && draft === null && stage.canEdit && (
        <section className={styles.card} aria-label={t("Как начать")}>
          <p className={styles.cardTitle}>{t("Как начнём карту сайта?")}</p>
          <div style={{ display: "grid", gap: 10 }}>
            {ai.configured && stage.inputsReady && (
              <button className={styles.button} disabled={Boolean(busy)} onClick={() => run("ai", () => askAi({}))}>{busy === "ai" ? t("ИИ подбирает страницы…") : t("✨ Пусть ИИ предложит страницы")}</button>
            )}
            {detail.options.sitemap?.template && (
              <button className={ai.configured ? styles.secondary : styles.button} onClick={() => edit(detail.options.sitemap!.template)}>{t("Взять типовой набор: главная, услуги, о нас, вопросы, контакты")}</button>
            )}
            <button className={styles.secondary} onClick={() => edit(blankSitemap())}>{t("Собрать самому, начиная с главной")}</button>
          </div>
          {!stage.inputsReady && <p className={styles.small}>{t("Предложение от ИИ станет доступно, когда будут приняты паспорт проекта и услуги.")}</p>}
        </section>
      )}
      {stage.artifactType === "sitemap" && stage.status !== "locked" && draft !== null && detail.options.sitemap && (
        <SitemapEditor value={draft as Sitemap} onChange={edit} options={detail.options.sitemap} sectionTypes={detail.options.sectionTypes} disabled={!stage.canEdit}
          issues={dirty ? [] : detail.issues.map((issue) => issue.message)} />
      )}
      {stage.artifactType === "process" && stage.status !== "locked" && draft !== null && detail.options.process && (
        <ProcessEditor value={draft as BusinessProcess} onChange={edit} options={detail.options.process} disabled={!stage.canEdit}
          issues={dirty ? [] : detail.issues.map((issue) => issue.message)} />
      )}

      {/* Editors */}
      {stage.status !== "locked" && stage.fields && (stage.artifactType === "brief" || stage.artifactType === "offer") && draft !== null && (
        <section className={styles.card}>
          <p className={styles.cardTitle}>{stage.artifactType === "brief" ? t("Паспорт проекта") : t("Услуги")}</p>
          <FieldsForm fields={stage.fields} value={draft as Record<string, unknown>} onChange={edit} issueKeys={issueKeys} disabled={!stage.canEdit}
            lockedKeys={stage.lockedKeys} onToggleLock={toggleLock} canLock={stage.canEdit && Boolean(detail.current)} />
        </section>
      )}
      {stage.artifactType === "content" && draft !== null && (
        <ContentEditor projectId={projectId} content={draft as Content} onChange={edit} sectionTypes={detail.options.sectionTypes} disabled={!stage.canEdit} pages={detail.options.pages ?? null}
          aiAvailable={aiUsable && Boolean(detail.current)} issueKeys={issueKeys}
          onAskAi={(targetKey, text) => run("ai", () => askAi({ instruction: text, targetKey }))}
          lockedKeys={stage.lockedKeys} onToggleLock={toggleLock} canLock={stage.canEdit && Boolean(detail.current)} />
      )}
      {stage.artifactType === "design" && stage.status !== "locked" && draft !== null && (
        <section className={styles.card}>
          <DesignPicker design={draft as Design} onChange={edit} options={detail.options} disabled={!stage.canEdit} />
        </section>
      )}

      {stage.artifactType === "schedule" && stage.status !== "locked" && draft !== null && detail.options.schedule && (
        <ScheduleEditor value={draft as Schedule} onChange={edit} options={detail.options.schedule} disabled={!stage.canEdit}
          offerServices={((detail.inputs.find((input) => input.key === "offer")?.content as Offer | null)?.services ?? []).map((service) => service.name)}
          issues={dirty ? [] : detail.issues.map((issue) => issue.message)} />
      )}

      {stage.artifactType === "techplan" && stage.status !== "locked" && detail.options.techplan && (
        <TechPlanView plan={(detail.options.techplan.outdated || !detail.current ? detail.options.techplan.preview : detail.current.content as TechPlan) ?? null}
          outdated={detail.options.techplan.outdated} notes={((draft as { ownerNotes?: string | null } | null)?.ownerNotes) ?? ""} disabled={!stage.canEdit}
          onNotes={(value) => edit({ ownerNotes: value })} busy={busy === "plan"}
          onRefresh={stage.canEdit ? () => run("plan", async () => { await saveDraft(); setMessage(t("Архитектура обновлена по принятым этапам. Проверьте и примите её.")); }) : null} />
      )}

      {/* Build stage */}
      {stage.artifactType === "site" && stage.status !== "locked" && (
        <section className={styles.card} aria-label={t("Сборка")}>
          <p className={styles.cardTitle}>{t("Сборка сайта")}</p>
          <p className={styles.small} style={{ marginTop: 0 }}>{t("Платформа соберёт страницу из принятых текстов и стиля и проверит её. Это занимает секунду.")}</p>
          {stage.canEdit && (
            <button className={`${styles.button} ${styles.block}`} disabled={Boolean(busy) || !stage.inputsReady}
              onClick={() => run("build", async () => {
                await api(`/projects/${projectId}/build`, { method: "POST" });
                const next = await load();
                if (next?.current) await showPreview(next.current.id);
                setMessage(t("Сайт собран. Посмотрите результат и проверки ниже."));
              })}>{busy === "build" ? t("Собираем…") : detail.current ? t("Собрать заново") : t("Собрать сайт")}</button>
          )}
          {siteChecks.length > 0 && (
            <>
              <p className={styles.cardTitle} style={{ marginTop: 16 }}>{t("Проверки")}</p>
              <ul className={styles.checks}>
                {siteChecks.map((check) => (
                  <li key={check.id}>
                    <span className={`${styles.checkIcon} ${styles[check.status]}`} aria-hidden="true">{check.status === "passed" ? "✓" : check.status === "warning" ? "!" : "✕"}</span>
                    <span><strong>{check.title}</strong>{check.required ? "" : t(" (рекомендация)")}<br /><span className={styles.small}>{check.details}</span></span>
                  </li>
                ))}
              </ul>
              <p className={styles.small}>{t("Это автоматические проверки содержимого. Они не заменяют просмотр сайта на вашем телефоне.")}</p>
              <QualityReportView report={quality} />
            </>
          )}
          {detail.current && !preview && <button className={styles.ghost} style={{ marginTop: 10 }} onClick={() => run("preview", () => showPreview(detail.current!.id))}>{t("Показать сайт")}</button>}
        </section>
      )}

      {/* Preview for content/design drafts */}
      {(stage.artifactType === "content" || stage.artifactType === "design") && detail.current && !preview && (
        <button className={`${styles.ghost} ${styles.block}`} style={{ marginBottom: 14 }} onClick={() => run("preview", () => showPreview())}>{t("👁 Посмотреть, как это выглядит на телефоне")}</button>
      )}
      {preview && (
        <section className={styles.card} aria-label={t("Предпросмотр")}>
          <div className={styles.row} style={{ marginBottom: 10 }}>
            <p className={styles.cardTitle} style={{ margin: 0 }}>{t("Предпросмотр")}</p><div className={styles.spacer} />
            <button className={styles.ghost} style={{ minHeight: 40 }} onClick={() => setPreview(null)}>{t("Скрыть")}</button>
          </div>
          {previewPages.length > 1 && (
            <div className={styles.chips} role="tablist" aria-label={t("Страницы сайта")} style={{ marginBottom: 10 }}>
              {previewPages.map((page) => (
                <button key={page.path} type="button" role="tab" aria-selected={page.path === previewPage} className={page.path === previewPage ? styles.button : styles.ghost}
                  style={{ minHeight: 40, padding: "4px 12px" }} disabled={Boolean(busy)} onClick={() => run("preview", () => showPreview(previewVersion, page.path))}>{page.title}</button>
              ))}
            </div>
          )}
          <div className={styles.phone}><iframe title={t("Предпросмотр сайта")} sandbox="" srcDoc={preview} /></div>
          {previewPages.length > 1 && <p className={styles.small}>{t("В предпросмотре меню не переходит по страницам — переключайте их кнопками выше.")}</p>}
          {stage.artifactType !== "site" && <p className={styles.small}>{t("Это черновик: здесь видны последние сохранённые версии этапов, даже не принятые.")}</p>}
        </section>
      )}

      {/* What is missing */}
      {detail.current && detail.issues.length > 0 && stage.artifactType !== "site" && (
        <section className={`${styles.notice} ${styles.warn}`} aria-label={t("Чего не хватает")}>
          <strong>{t("Чего не хватает, чтобы принять этап:")}</strong>
          <ul className={styles.list}>{[...new Set(detail.issues.map((issue) => issue.message))].map((text) => <li key={text}>{text}</li>)}</ul>
        </section>
      )}

      {/* AI instruction panel */}
      {ai.level !== "none" && stage.artifactType !== "brief" && detail.current && stage.canEdit && (
        <section className={styles.card} aria-label={t("Инструкция для ИИ")}>
          <p className={styles.cardTitle}>{t("✨ Попросить ИИ")}</p>
          {!ai.configured && <p className={styles.small} style={{ marginTop: 0 }}>{t("ИИ пока не подключён к платформе — правьте вручную.")}</p>}
          {ai.configured && (
            <>
              <p className={styles.small} style={{ marginTop: 0 }}>{ai.whatItDoes}{" "}{t("Защищённые места ИИ не тронет.")}{requestPrice !== null ? t(" Один запрос к ИИ стоит около {0}.", [formatTenge(requestPrice)]) : ""}</p>
              <textarea className={styles.textarea} value={instruction} maxLength={1000} aria-label={t("Инструкция для ИИ")} placeholder={t("Напишите, что изменить")} onChange={(event) => setInstruction(event.target.value)} />
              {ai.instructionExamples.length > 0 && (
                <div className={styles.chips} style={{ margin: "10px 0" }} aria-label={t("Примеры")}>
                  {ai.instructionExamples.map((example) => <button key={example} type="button" className={styles.exampleChip} onClick={() => setInstruction(example)}>{example}</button>)}
                </div>
              )}
              <fieldset style={{ border: 0, padding: 0, margin: "8px 0 12px" }}>
                <legend className={styles.label} style={{ marginBottom: 6 }}>{t("Запомнить эту просьбу?")}</legend>
                {([["one_off", t("Нет, только сейчас")], ["stage_rule", t("Да, для этого этапа")], ...(specialist ? [] : [["project_rule", t("Да, для всего проекта")]] as const)] as const).map(([value, label]) => (
                  <label key={value} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 36 }}>
                    <input type="radio" name="saveAs" checked={saveAs === value} onChange={() => setSaveAs(value)} /> {label}
                  </label>
                ))}
                <p className={styles.why}>{t("Запомненные правила ИИ будет учитывать каждый раз, например «пиши без канцелярита».")}</p>
              </fieldset>
              {spendLimit?.blocked ? (
                <p className={`${styles.notice} ${styles.error}`} role="alert">{t("Лимит расходов на ИИ по проекту исчерпан. Владелец может увеличить его на странице проекта, в карточке «Смета и расход».")}</p>
              ) : spendLimit?.warn ? (
                <p className={`${styles.notice} ${styles.warn}`} role="status">{t("Потрачено {0}% лимита на ИИ — осталось {1}.", [spendLimit.percent, formatTenge(spendLimit.left)])}</p>
              ) : null}
              <button className={`${styles.button} ${styles.block}`} disabled={Boolean(busy) || instruction.trim().length < 2 || Boolean(spendLimit?.blocked)}
                onClick={() => run("ai", async () => { try { await askAi({ instruction: instruction.trim(), saveAs }); setInstruction(""); setSaveAs("one_off"); } finally { loadBudget(); } })}>{busy === "ai" ? t("ИИ работает…") : t("Попросить ИИ")}</button>
              <p className={styles.small}>{ai.budget && ai.budget.limit !== null ? t("Ваших запросов к ИИ: {0} из {1}", [ai.budget.used, ai.budget.limit]) : ai.month ? t("Запросов к ИИ в этом месяце осталось: {0} из {1}", [ai.month.left, ai.month.limit]) : t("Осталось запросов сегодня: {0}", [ai.remainingToday])}</p>
            </>
          )}
          {!ai.configured && ai.templateAvailable && stage.inputsReady && (
            <button className={styles.ghost} disabled={Boolean(busy)} onClick={() => run("ai", () => askAi({}))}>{t("Обновить черновик по шаблону")}</button>
          )}
        </section>
      )}

      <SuggestionsPanel projectId={projectId} stageKey={stageKey} suggestions={detail.suggestions} canSuggest={stage.canSuggest} canResolve={stage.canEdit}
        aiReady={ai.configured && stage.inputsReady} targets={sectionTargets} onChanged={load} onError={setError} onMessage={setMessage} />


      {stage.canImport && stage.importHint && (
        <details className={`${styles.card} ${styles.details}`} open={!detail.current && stage.artifactType !== "brief"}>
          <summary>{t("У меня уже есть готовое")}</summary>
          <p className={styles.small}>{stage.importHint}</p>
          <textarea className={styles.textarea} style={{ minHeight: 140 }} value={importText} maxLength={20000} aria-label={t("Ваши материалы")} onChange={(event) => setImportText(event.target.value)} />
          <button className={styles.secondary} style={{ marginTop: 10 }} disabled={Boolean(busy) || importText.trim().length < 2}
            onClick={() => run("import", async () => {
              const result = await api<{ status: string; issues: Array<{ message: string }> }>(`/projects/${projectId}/stages/${stageKey}/import`, { method: "POST", body: JSON.stringify({ text: importText }) });
              await load(); setImportText("");
              setMessage(result.status === "imported" ? t("Материалы добавлены, этап засчитан. Следующие этапы открыты.") : t("Материалы добавлены как черновик. Проверьте его и дополните то, чего не хватает."));
            })}>{t("Добавить мои материалы")}</button>
        </details>
      )}


      </div>
      <aside className={styles.context} aria-label={t("Об этапе")}>
      {!specialist && stage.status !== "locked" && <ApprovalPanel key={JSON.stringify(stage.approval.policy)} projectId={projectId} stageKey={stageKey} approval={stage.approval} onChange={() => void load()} />}
      <section className={styles.card} aria-label={t("Зачем этот этап")}>
        <p className={styles.cardTitle}>{t("Зачем этот этап")}</p>
        <p style={{ margin: "0 0 8px" }}>{stage.purpose}</p>
        <p className={styles.small} style={{ margin: 0 }}><strong>{t("Результат:")}</strong> {stage.outcome}</p>
      </section>
      {detail.inputs.length > 0 && stage.status !== "locked" && (
        <details className={`${styles.card} ${styles.details}`}>
          <summary>{t("Что берём из прошлых этапов")}</summary>
          <ul className={styles.list}>
            {detail.inputs.map((input) => (
              <li key={input.key}>
                <strong>{input.title}</strong>{input.satisfied ? t(" (версия {0}): {1}", [input.versionNumber, summarize(input.key, input.content)]) : t(" — ещё не принят")}
                {!input.satisfied && <> · <a className={styles.back} href={`/projects/${projectId}/stages/${input.key}`}>{t("открыть")}</a></>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {stage.canInvite && stage.status !== "locked" && (
        <SpecialistsPanel projectId={projectId} stageKey={stageKey} editable={!accepted} />
      )}

      {(stage.canInvite || specialist) && (
        <TimesheetPanel key={stage.status} projectId={projectId} stageKey={stageKey} specialistActive={specialist && assignment?.status === "active"} />
      )}

      {detail.rules.length > 0 && (
        <details className={`${styles.card} ${styles.details}`}>
          <summary>{t("Правила для ИИ (")}{detail.rules.filter((rule) => rule.status === "active").length})</summary>
          <ul className={styles.versions}>
            {detail.rules.map((rule) => (
              <li key={rule.id}>
                <div>{rule.text}</div>
                <div className={styles.row}>
                  <span className={styles.small}>{rule.kind === "project_rule" ? t("Для всего проекта") : t("Для этого этапа")} · {rule.status === "active" ? t("действует") : t("выключено")}</span>
                  <div className={styles.spacer} />
                  {!specialist && <button className={styles.ghost} style={{ minHeight: 40 }} disabled={Boolean(busy)}
                    onClick={() => run("rule", async () => { await api(`/projects/${projectId}/rules/${rule.id}/status`, { method: "POST", body: JSON.stringify({ status: rule.status === "active" ? "disabled" : "active" }) }); await load(); })}>
                    {rule.status === "active" ? t("Выключить") : t("Включить")}</button>}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      {detail.versions.length > 0 && (
        <details className={`${styles.card} ${styles.details}`}>
          <summary>{t("История версий (")}{detail.versions.length})</summary>
          <p className={styles.small}>{t("Каждое изменение сохраняется. К любой версии можно вернуться.")}</p>
          <ul className={styles.versions}>
            {detail.versions.map((version) => (
              <li key={version.id}>
                <div className={styles.row}>
                  <strong>{t("Версия")}{" "}{version.versionNumber}</strong>
                  {version.accepted && <span className={`${styles.chip} ${styles.done}`} style={{ marginTop: 0 }}>{t("принята")}</span>}
                  {detail.current?.id === version.id && <span className={`${styles.chip} ${styles.active}`} style={{ marginTop: 0 }}>{t("текущая")}</span>}
                </div>
                <div className={styles.small}>{originLabels[version.origin] ?? version.origin} · {new Date(version.createdAt).toLocaleString(dateLocale())}</div>
                {version.provenance?.instruction && <div className={styles.small}>{t("Просьба: «")}{version.provenance.instruction}»{version.provenance.targetKey ? t(" (один блок)") : ""}</div>}
                {version.provenance && version.provenance.rulesApplied > 0 && <div className={styles.small}>{t("Учтено правил:")}{" "}{version.provenance.rulesApplied}</div>}
                {stage.canEdit && detail.current?.id !== version.id && stage.artifactType !== "site" && (
                  <button className={styles.ghost} style={{ minHeight: 40, marginTop: 6 }} disabled={Boolean(busy)}
                    onClick={() => run("restore", async () => { await api(`/projects/${projectId}/stages/${stageKey}/versions/${version.id}/restore`, { method: "POST" }); await load(); setMessage(t("Вернули версию {0} — она сохранена как новая.", [version.versionNumber])); })}>{t("Вернуть эту версию")}</button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {stage.acceptance.length > 0 && stage.status !== "locked" && (
        <details className={`${styles.card} ${styles.details}`}>
          <summary>{t("Когда этап можно принимать")}</summary>
          <ul className={styles.list}>{stage.acceptance.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      )}
      </aside>
      </div>

      {stage.status !== "locked" && (
        <div className={styles.bottomBar}><div className={styles.bottomInner}>
          {accepted ? (
            <>
              <span className={styles.bottomText}>{t("Этап принят")}{detail.versions.find((version) => version.accepted) ? t(" (версия {0})", [detail.versions.find((version) => version.accepted)!.versionNumber]) : ""}.</span>
              {nextStageKey && <a className={styles.button} href={`/projects/${projectId}/stages/${nextStageKey}`}>{t("Дальше →")}</a>}
              {stage.canReopen && <button className={styles.ghost} disabled={Boolean(busy)} onClick={reopen}>{t("Изменить этап")}</button>}
            </>
          ) : dirty ? (
            <>
              <span className={styles.bottomText}>{t("Есть несохранённые изменения.")}</span>
              <button className={styles.ghost} disabled={Boolean(busy)} onClick={() => void load()}>{t("Отменить")}</button>
              <button className={styles.button} disabled={Boolean(busy)} onClick={() => run("save", async () => { await saveDraft(); })}>{busy === "save" ? t("Сохраняем…") : t("Сохранить")}</button>
            </>
          ) : policy && stage.status === "in_review" ? (
            <>
              <span className={styles.bottomText}>{t("Одобрено {0} из {1} нужных.", [stage.approval.approved ?? 0, stage.approval.required ?? 0])}{" "}{stage.approval.approveBlocker === "AUTHOR_CANNOT_APPROVE" ? t("Свою версию одобряют другие.") : stage.approval.approveBlocker === "ALREADY_APPROVED" ? t("Вы уже одобрили.") : ""}</span>
              {stage.canRequestChanges && <button className={styles.ghost} disabled={Boolean(busy)} onClick={requestChanges}>{t("Вернуть на доработку")}</button>}
              {stage.approval.canApprove && <button className={styles.button} disabled={Boolean(busy) || failedRequired.length > 0} onClick={approve}>{busy === "approve" ? t("Одобряем…") : t("Одобрить версию")}</button>}
            </>
          ) : policy ? (
            <>
              <span className={styles.bottomText}>{stage.canSubmit ? submitReason.replace(t("Владелец проверит результат и примет этап или вернёт с комментарием."), t("Проверяющие посмотрят результат и одобрят его или вернут с комментарием.")) : t("Этап принимают проверяющие после отправки на проверку.")}</span>
              {stage.canSubmit && <button className={styles.button} disabled={Boolean(busy) || submitBlocked} onClick={submit}>{busy === "submit" ? t("Отправляем…") : t("Отправить на проверку")}</button>}
            </>
          ) : stage.status === "in_review" && !stage.canRequestChanges ? (
            <span className={styles.bottomText}>{t("На приёмке у владельца проекта.")}</span>
          ) : stage.status === "in_review" ? (
            <>
              <span className={styles.bottomText}>{failedRequired.length > 0 ? t("Есть непройденные проверки.") : t("Примите результат специалиста или верните его с комментарием.")}</span>
              <button className={styles.ghost} disabled={Boolean(busy)} onClick={requestChanges}>{t("Вернуть на доработку")}</button>
              <button className={styles.button} disabled={Boolean(busy) || acceptBlocked} onClick={accept}>{busy === "accept" ? t("Принимаем…") : t("Принять этап")}</button>
            </>
          ) : specialist && assignment?.role === "consultant" ? (
            <span className={styles.bottomText}>{t("Вы консультант: предлагайте правки выше. Принимает этап владелец.")}</span>
          ) : specialist || (stage.canSubmit && !stage.canAccept) ? (
            <>
              <span className={styles.bottomText}>{submitReason}</span>
              <button className={styles.button} disabled={Boolean(busy) || submitBlocked} onClick={submit}>{busy === "submit" ? t("Отправляем…") : t("Отправить на приёмку")}</button>
            </>
          ) : (
            <>
              <span className={styles.bottomText}>{acceptReason}</span>
              <button className={styles.button} disabled={Boolean(busy) || acceptBlocked} onClick={accept}>{busy === "accept" ? t("Принимаем…") : stage.status === "stale" ? t("Подтвердить") : stage.contract ? t("Утвердить") : t("Принять этап")}</button>
            </>
          )}
        </div></div>
      )}
    </Shell>
  );
}

function Shell({ projectId, title, children }: { projectId: string; title: string; children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <AppHeader back={{ href: `/projects/${projectId}`, label: t("← Этапы") }} title={title} />
      <main className={styles.stageMain}>{children}</main>
    </div>
  );
}
