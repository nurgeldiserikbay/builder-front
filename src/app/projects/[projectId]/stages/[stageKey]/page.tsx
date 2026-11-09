"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import {
  explainError, isPlanMessage, originLabels, statusTone, type Content, type Design, type Journey, type Offer, type SiteCheck, type StageDetail,
} from "@/lib/journey";
import { ContentEditor, DesignPicker, FieldsForm } from "./editors";
import { SpecialistsPanel, SuggestionsPanel } from "./specialists";
import styles from "../../../journey.module.css";

type SaveAs = "one_off" | "stage_rule" | "project_rule";
const defaultDesign: Design = { palette: "forest", font: "modern", corners: "rounded", heroLayout: "centered" };
const blankContent: Content = {
  sections: [
    { key: "hero", type: "hero", title: "", text: "", items: [], buttonLabel: "Связаться" },
    { key: "contacts", type: "contacts", title: "Контакты", text: "", items: [], buttonLabel: "Связаться" },
  ],
  seo: { title: "", description: "" },
};

function summarize(key: string, content: unknown): string {
  if (!content) return "";
  if (key === "goal") { const brief = content as Record<string, string | null>; return [brief.businessName, brief.whatYouDo].filter(Boolean).join(" — "); }
  if (key === "offer") return `Услуг: ${(content as Offer).services.length}`;
  if (key === "content") return `Блоков: ${(content as Content).sections.length}`;
  if (key === "design") return `Стиль выбран`;
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
  const [nextStageKey, setNextStageKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await api<StageDetail>(`/projects/${projectId}/stages/${stageKey}`);
      setDetail(next);
      const type = next.stage.artifactType;
      setDraft(next.current?.content ?? (type === "brief" ? {} : type === "offer" ? { services: [], hours: null } : type === "design" ? defaultDesign : null));
      // A first style choice is a ready-to-save draft: offer «Сохранить» right away.
      setDirty(!next.current && type === "design" && next.stage.canEdit);
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
    setMessage(saved.changed.length ? `Сохранено — версия ${saved.versionNumber}. Изменённые вами места защищены от перезаписи ИИ.` : "Изменений нет.");
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
      ? `Готов черновик по шаблону (версия ${result.versionNumber}). Замените места в [квадратных скобках] своими данными.`
      : `ИИ подготовил версию ${result.versionNumber}. Проверьте её — если что-то не так, напишите, что поменять.`);
  }

  async function showPreview(versionId?: string) {
    if (dirty) await saveDraft();
    const data = await api<{ html: string }>(`/projects/${projectId}/preview${versionId ? `?versionId=${versionId}` : ""}`);
    setPreview(data.html);
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
      setMessage(journey.nextAction.stageKey ? `Этап принят. Дальше: «${journey.nextAction.title}».` : "Этап принят. Все этапы проекта готовы — скачайте результат на странице проекта.");
    });
  }

  async function submit() {
    if (!detail?.current) return;
    await run("submit", async () => {
      await api(`/projects/${projectId}/stages/${stageKey}/submit`, { method: "POST", body: JSON.stringify({ versionId: detail.current!.id }) });
      await load();
      setMessage("Отправлено владельцу на приёмку. Пока он проверяет, этап нельзя менять.");
    });
  }

  async function requestChanges() {
    const note = window.prompt("Что нужно доработать? Специалист увидит этот комментарий.");
    if (!note || note.trim().length < 2) return;
    await run("changes", async () => {
      await api(`/projects/${projectId}/stages/${stageKey}/request-changes`, { method: "POST", body: JSON.stringify({ note: note.trim() }) });
      await load();
      setMessage("Этап возвращён на доработку с вашим комментарием.");
    });
  }

  async function reopen() {
    if (!window.confirm("Изменить принятый этап? Этапы, которые построены на нём, нужно будет проверить ещё раз.")) return;
    await run("reopen", async () => {
      await api(`/projects/${projectId}/stages/${stageKey}/reopen`, { method: "POST" });
      await load();
      setMessage("Этап снова открыт для изменений.");
    });
  }

  if (error && !detail) return <Shell projectId={projectId} title=""><p className={`${styles.notice} ${styles.error}`} role="alert">{error}{isPlanMessage(error) && <> <a href="/account/plan" style={{ color: "inherit", fontWeight: 800 }}>Открыть тариф →</a></>}</p></Shell>;
  if (!detail) return <Shell projectId={projectId} title=""><p className={styles.muted}>Загружаем этап…</p></Shell>;

  const { stage, ai } = detail;
  const tone = statusTone[stage.status];
  const accepted = stage.status === "approved" || stage.status === "imported";
  const aiUsable = ai.level !== "none" && ai.configured && stage.canEdit && stage.inputsReady;
  const issueKeys = detail.issues.map((issue) => issue.key);
  const siteChecks = stage.artifactType === "site" ? ((detail.current?.content as { checks?: SiteCheck[] } | undefined)?.checks ?? []) : [];
  const failedRequired = siteChecks.filter((check) => check.required && check.status === "failed");
  const specialist = detail.viewer.kind === "specialist";
  const assignment = detail.viewer.assignments.find((item) => item.stageKey === stage.key) ?? null;
  const submitBlocked = dirty || !stage.canSubmit || detail.issues.length > 0 || !stage.inputsReady;
  const submitReason = dirty ? "Сначала сохраните изменения." : !detail.current ? "Сначала сделайте черновик."
    : !stage.inputsReady ? "Предыдущие этапы ещё не приняты владельцем." : detail.issues.length > 0 ? "Заполните то, чего не хватает (список выше)." : "Владелец проверит результат и примет этап или вернёт с комментарием.";
  const sectionTargets = stage.artifactType === "content" && detail.current
    ? (detail.current.content as Content).sections.map((section) => ({ key: section.key, label: section.title || detail.options.sectionTypes[section.type] })) : [];
  const acceptBlocked = dirty || !stage.canAccept || detail.issues.length > 0 || failedRequired.length > 0;
  const acceptReason = dirty ? "Сначала сохраните изменения."
    : !stage.inputsReady ? "Сначала примите предыдущие этапы."
      : detail.issues.length > 0 ? "Заполните то, чего не хватает (список выше)."
        : failedRequired.length > 0 ? "Исправьте непройденные проверки."
          : !detail.current ? "Сначала сделайте черновик." : stage.acceptExplanation;

  return (
    <Shell projectId={projectId} title={stage.title}>
      <p className={styles.kicker}>Этап</p>
      <h1 className={styles.h1}>{stage.title}</h1>
      <span className={`${styles.chip} ${styles[tone]}`} title={stage.statusExplanation}>{stage.statusLabel}</span>
      <p className={styles.small} style={{ margin: "6px 0 14px" }}>{stage.statusExplanation}</p>

      {specialist && assignment && (
        <p className={`${styles.notice} ${styles.info}`}>
          {assignment.status === "completed"
            ? "Владелец принял этап. Менять его больше нельзя, смотреть можно ещё несколько дней."
            : assignment.role === "lead"
              ? `Вы ведущий этого этапа: направляйте ИИ, правьте результат и отправьте его владельцу на приёмку.${assignment.aiBudget !== null ? ` Запросов к ИИ: ${assignment.aiUsed} из ${assignment.aiBudget}.` : ""}`
              : "Вы консультант этого этапа: смотрите результат и предлагайте правки — ведущий или владелец отправит их ИИ."}
        </p>
      )}
      {stage.status === "changes_requested" && stage.reviewNote && (
        <p className={`${styles.notice} ${styles.warn}`}><strong>Владелец просит доработать:</strong> {stage.reviewNote}</p>
      )}
      {stage.status === "in_review" && (
        <p className={`${styles.notice} ${styles.info}`}>{stage.canRequestChanges ? "Специалист отправил этап вам на приёмку. Посмотрите результат и примите его или верните с комментарием." : "Этап на приёмке у владельца. Пока он проверяет, менять его нельзя."}</p>
      )}

      <section className={styles.card} aria-label="Зачем этот этап">
        <p className={styles.cardTitle}>Зачем этот этап</p>
        <p style={{ margin: "0 0 8px" }}>{stage.purpose}</p>
        <p className={styles.small} style={{ margin: 0 }}><strong>Результат:</strong> {stage.outcome}</p>
      </section>

      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}{isPlanMessage(error) && <> <a href="/account/plan" style={{ color: "inherit", fontWeight: 800 }}>Открыть тариф →</a></>}</p>}
      {message && (
        <p className={`${styles.notice} ${styles.success}`} role="status">{message}
          {nextStageKey && accepted && <><br /><a className={styles.back} href={`/projects/${projectId}/stages/${nextStageKey}`}>Перейти к следующему этапу →</a></>}
        </p>
      )}

      {stage.status === "locked" && (
        <div className={`${styles.notice} ${styles.info}`}>
          Этот этап откроется, когда будут приняты: {detail.inputs.filter((input) => !input.satisfied).map((input) => `«${input.title}»`).join(", ")}.
          <br /><a className={styles.back} href={`/projects/${projectId}`}>← К списку этапов</a>
        </div>
      )}

      {detail.inputs.length > 0 && stage.status !== "locked" && (
        <details className={`${styles.card} ${styles.details}`}>
          <summary>Что берём из прошлых этапов</summary>
          <ul className={styles.list}>
            {detail.inputs.map((input) => (
              <li key={input.key}>
                <strong>{input.title}</strong>{input.satisfied ? ` (версия ${input.versionNumber}): ${summarize(input.key, input.content)}` : " — ещё не принят"}
                {!input.satisfied && <> · <a className={styles.back} href={`/projects/${projectId}/stages/${input.key}`}>открыть</a></>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {stage.status === "stale" && <p className={`${styles.notice} ${styles.warn}`}>Предыдущий этап изменился. Посмотрите, всё ли здесь ещё верно: если да — нажмите «Подтвердить», если нет — поправьте или попросите ИИ обновить.</p>}
      {!stage.inputsReady && stage.status !== "locked" && !accepted && (
        <p className={`${styles.notice} ${styles.info}`}>Можно готовить этап заранее, но принять его получится после того, как будут приняты предыдущие этапы.</p>
      )}

      {/* Stage with AI-first start for the brief */}
      {stage.artifactType === "brief" && stage.canEdit && ai.level !== "none" && (
        <section className={styles.card} aria-label="Описать бизнес своими словами">
          <p className={styles.cardTitle}>Расскажите о бизнесе своими словами</p>
          <p className={styles.small} style={{ marginTop: 0 }}>{ai.configured ? ai.whatItDoes : "ИИ пока не подключён — заполните поля ниже вручную. Это займёт пару минут."}</p>
          {ai.configured && (
            <>
              <textarea className={styles.textarea} value={instruction} maxLength={1000} placeholder={ai.describeHint ?? ""} aria-label="Описание бизнеса" onChange={(event) => setInstruction(event.target.value)} />
              <button className={`${styles.button} ${styles.block}`} style={{ marginTop: 10 }} disabled={Boolean(busy) || instruction.trim().length < 2}
                onClick={() => run("ai", async () => { await askAi({ instruction: instruction.trim() }); setInstruction(""); })}>{busy === "ai" ? "ИИ заполняет…" : "✨ Заполнить поля с ИИ"}</button>
              <p className={styles.small}>Поля, которые вы уже заполнили сами, ИИ не тронет.</p>
            </>
          )}
        </section>
      )}

      {/* Starting point for an empty content stage */}
      {stage.artifactType === "content" && !detail.current && draft === null && stage.canEdit && (
        <section className={styles.card} aria-label="Как начать">
          <p className={styles.cardTitle}>Как начнём тексты?</p>
          <div style={{ display: "grid", gap: 10 }}>
            {ai.configured && stage.inputsReady && (
              <button className={styles.button} disabled={Boolean(busy)} onClick={() => run("ai", () => askAi({}))}>{busy === "ai" ? "ИИ пишет тексты…" : "✨ Пусть ИИ напишет тексты"}</button>
            )}
            {!ai.configured && ai.templateAvailable && stage.inputsReady && (
              <button className={styles.button} disabled={Boolean(busy)} onClick={() => run("ai", () => askAi({}))}>Сделать черновик по шаблону</button>
            )}
            <button className={styles.secondary} onClick={() => edit(blankContent)}>Написать самому с чистого листа</button>
          </div>
          {!stage.inputsReady && <p className={styles.small}>Черновик от ИИ или по шаблону станет доступен, когда будет принят паспорт проекта. Свои тексты можно вставить уже сейчас (ниже).</p>}
        </section>
      )}

      {/* Editors */}
      {stage.status !== "locked" && stage.fields && (stage.artifactType === "brief" || stage.artifactType === "offer") && draft !== null && (
        <section className={styles.card}>
          <p className={styles.cardTitle}>{stage.artifactType === "brief" ? "Паспорт проекта" : "Услуги"}</p>
          <FieldsForm fields={stage.fields} value={draft as Record<string, unknown>} onChange={edit} issueKeys={issueKeys} disabled={!stage.canEdit}
            lockedKeys={stage.lockedKeys} onToggleLock={toggleLock} canLock={stage.canEdit && Boolean(detail.current)} />
        </section>
      )}
      {stage.artifactType === "content" && draft !== null && (
        <ContentEditor projectId={projectId} content={draft as Content} onChange={edit} sectionTypes={detail.options.sectionTypes} disabled={!stage.canEdit}
          aiAvailable={aiUsable && Boolean(detail.current)} issueKeys={issueKeys}
          onAskAi={(targetKey, text) => run("ai", () => askAi({ instruction: text, targetKey }))}
          lockedKeys={stage.lockedKeys} onToggleLock={toggleLock} canLock={stage.canEdit && Boolean(detail.current)} />
      )}
      {stage.artifactType === "design" && stage.status !== "locked" && draft !== null && (
        <section className={styles.card}>
          <DesignPicker design={draft as Design} onChange={edit} options={detail.options} disabled={!stage.canEdit} />
        </section>
      )}

      {/* Build stage */}
      {stage.artifactType === "site" && stage.status !== "locked" && (
        <section className={styles.card} aria-label="Сборка">
          <p className={styles.cardTitle}>Сборка сайта</p>
          <p className={styles.small} style={{ marginTop: 0 }}>Платформа соберёт страницу из принятых текстов и стиля и проверит её. Это занимает секунду.</p>
          {stage.canEdit && (
            <button className={`${styles.button} ${styles.block}`} disabled={Boolean(busy) || !stage.inputsReady}
              onClick={() => run("build", async () => {
                await api(`/projects/${projectId}/build`, { method: "POST" });
                const next = await load();
                if (next?.current) await showPreview(next.current.id);
                setMessage("Сайт собран. Посмотрите результат и проверки ниже.");
              })}>{busy === "build" ? "Собираем…" : detail.current ? "Собрать заново" : "Собрать сайт"}</button>
          )}
          {siteChecks.length > 0 && (
            <>
              <p className={styles.cardTitle} style={{ marginTop: 16 }}>Проверки</p>
              <ul className={styles.checks}>
                {siteChecks.map((check) => (
                  <li key={check.id}>
                    <span className={`${styles.checkIcon} ${styles[check.status]}`} aria-hidden="true">{check.status === "passed" ? "✓" : check.status === "warning" ? "!" : "✕"}</span>
                    <span><strong>{check.title}</strong>{check.required ? "" : " (рекомендация)"}<br /><span className={styles.small}>{check.details}</span></span>
                  </li>
                ))}
              </ul>
              <p className={styles.small}>Это автоматические проверки содержимого. Они не заменяют просмотр сайта на вашем телефоне.</p>
            </>
          )}
          {detail.current && !preview && <button className={styles.ghost} style={{ marginTop: 10 }} onClick={() => run("preview", () => showPreview(detail.current!.id))}>Показать сайт</button>}
        </section>
      )}

      {/* Preview for content/design drafts */}
      {(stage.artifactType === "content" || stage.artifactType === "design") && detail.current && !preview && (
        <button className={`${styles.ghost} ${styles.block}`} style={{ marginBottom: 14 }} onClick={() => run("preview", () => showPreview())}>👁 Посмотреть, как это выглядит на телефоне</button>
      )}
      {preview && (
        <section className={styles.card} aria-label="Предпросмотр">
          <div className={styles.row} style={{ marginBottom: 10 }}>
            <p className={styles.cardTitle} style={{ margin: 0 }}>Предпросмотр</p><div className={styles.spacer} />
            <button className={styles.ghost} style={{ minHeight: 40 }} onClick={() => setPreview(null)}>Скрыть</button>
          </div>
          <div className={styles.phone}><iframe title="Предпросмотр сайта" sandbox="" srcDoc={preview} /></div>
          {stage.artifactType !== "site" && <p className={styles.small}>Это черновик: здесь видны последние сохранённые версии этапов, даже не принятые.</p>}
        </section>
      )}

      {/* What is missing */}
      {detail.current && detail.issues.length > 0 && stage.artifactType !== "site" && (
        <section className={`${styles.notice} ${styles.warn}`} aria-label="Чего не хватает">
          <strong>Чего не хватает, чтобы принять этап:</strong>
          <ul className={styles.list}>{[...new Set(detail.issues.map((issue) => issue.message))].map((text) => <li key={text}>{text}</li>)}</ul>
        </section>
      )}

      {/* AI instruction panel */}
      {ai.level !== "none" && stage.artifactType !== "brief" && detail.current && stage.canEdit && (
        <section className={styles.card} aria-label="Инструкция для ИИ">
          <p className={styles.cardTitle}>✨ Попросить ИИ</p>
          {!ai.configured && <p className={styles.small} style={{ marginTop: 0 }}>ИИ пока не подключён к платформе — правьте вручную.</p>}
          {ai.configured && (
            <>
              <p className={styles.small} style={{ marginTop: 0 }}>{ai.whatItDoes} Защищённые места ИИ не тронет.</p>
              <textarea className={styles.textarea} value={instruction} maxLength={1000} aria-label="Инструкция для ИИ" placeholder="Напишите, что изменить" onChange={(event) => setInstruction(event.target.value)} />
              {ai.instructionExamples.length > 0 && (
                <div className={styles.chips} style={{ margin: "10px 0" }} aria-label="Примеры">
                  {ai.instructionExamples.map((example) => <button key={example} type="button" className={styles.exampleChip} onClick={() => setInstruction(example)}>{example}</button>)}
                </div>
              )}
              <fieldset style={{ border: 0, padding: 0, margin: "8px 0 12px" }}>
                <legend className={styles.label} style={{ marginBottom: 6 }}>Запомнить эту просьбу?</legend>
                {([["one_off", "Нет, только сейчас"], ["stage_rule", "Да, для этого этапа"], ...(specialist ? [] : [["project_rule", "Да, для всего проекта"]] as const)] as const).map(([value, label]) => (
                  <label key={value} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 36 }}>
                    <input type="radio" name="saveAs" checked={saveAs === value} onChange={() => setSaveAs(value)} /> {label}
                  </label>
                ))}
                <p className={styles.why}>Запомненные правила ИИ будет учитывать каждый раз, например «пиши без канцелярита».</p>
              </fieldset>
              <button className={`${styles.button} ${styles.block}`} disabled={Boolean(busy) || instruction.trim().length < 2}
                onClick={() => run("ai", async () => { await askAi({ instruction: instruction.trim(), saveAs }); setInstruction(""); setSaveAs("one_off"); })}>{busy === "ai" ? "ИИ работает…" : "Попросить ИИ"}</button>
              <p className={styles.small}>{ai.budget && ai.budget.limit !== null ? `Ваших запросов к ИИ: ${ai.budget.used} из ${ai.budget.limit}` : ai.month ? `Запросов к ИИ в этом месяце осталось: ${ai.month.left} из ${ai.month.limit}` : `Осталось запросов сегодня: ${ai.remainingToday}`}</p>
            </>
          )}
          {!ai.configured && ai.templateAvailable && stage.inputsReady && (
            <button className={styles.ghost} disabled={Boolean(busy)} onClick={() => run("ai", () => askAi({}))}>Обновить черновик по шаблону</button>
          )}
        </section>
      )}

      <SuggestionsPanel projectId={projectId} stageKey={stageKey} suggestions={detail.suggestions} canSuggest={stage.canSuggest} canResolve={stage.canEdit}
        aiReady={ai.configured && stage.inputsReady} targets={sectionTargets} onChanged={load} onError={setError} onMessage={setMessage} />

      {stage.canInvite && stage.status !== "locked" && (
        <SpecialistsPanel projectId={projectId} stageKey={stageKey} editable={!accepted} />
      )}

      {detail.rules.length > 0 && (
        <details className={`${styles.card} ${styles.details}`}>
          <summary>Правила для ИИ ({detail.rules.filter((rule) => rule.status === "active").length})</summary>
          <ul className={styles.versions}>
            {detail.rules.map((rule) => (
              <li key={rule.id}>
                <div>{rule.text}</div>
                <div className={styles.row}>
                  <span className={styles.small}>{rule.kind === "project_rule" ? "Для всего проекта" : "Для этого этапа"} · {rule.status === "active" ? "действует" : "выключено"}</span>
                  <div className={styles.spacer} />
                  {!specialist && <button className={styles.ghost} style={{ minHeight: 40 }} disabled={Boolean(busy)}
                    onClick={() => run("rule", async () => { await api(`/projects/${projectId}/rules/${rule.id}/status`, { method: "POST", body: JSON.stringify({ status: rule.status === "active" ? "disabled" : "active" }) }); await load(); })}>
                    {rule.status === "active" ? "Выключить" : "Включить"}</button>}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {stage.canImport && stage.importHint && (
        <details className={`${styles.card} ${styles.details}`} open={!detail.current && stage.artifactType !== "brief"}>
          <summary>У меня уже есть готовое</summary>
          <p className={styles.small}>{stage.importHint}</p>
          <textarea className={styles.textarea} style={{ minHeight: 140 }} value={importText} maxLength={20000} aria-label="Ваши материалы" onChange={(event) => setImportText(event.target.value)} />
          <button className={styles.secondary} style={{ marginTop: 10 }} disabled={Boolean(busy) || importText.trim().length < 2}
            onClick={() => run("import", async () => {
              const result = await api<{ status: string; issues: Array<{ message: string }> }>(`/projects/${projectId}/stages/${stageKey}/import`, { method: "POST", body: JSON.stringify({ text: importText }) });
              await load(); setImportText("");
              setMessage(result.status === "imported" ? "Материалы добавлены, этап засчитан. Следующие этапы открыты." : "Материалы добавлены как черновик. Проверьте его и дополните то, чего не хватает.");
            })}>Добавить мои материалы</button>
        </details>
      )}

      {detail.versions.length > 0 && (
        <details className={`${styles.card} ${styles.details}`}>
          <summary>История версий ({detail.versions.length})</summary>
          <p className={styles.small}>Каждое изменение сохраняется. К любой версии можно вернуться.</p>
          <ul className={styles.versions}>
            {detail.versions.map((version) => (
              <li key={version.id}>
                <div className={styles.row}>
                  <strong>Версия {version.versionNumber}</strong>
                  {version.accepted && <span className={`${styles.chip} ${styles.done}`} style={{ marginTop: 0 }}>принята</span>}
                  {detail.current?.id === version.id && <span className={`${styles.chip} ${styles.active}`} style={{ marginTop: 0 }}>текущая</span>}
                </div>
                <div className={styles.small}>{originLabels[version.origin] ?? version.origin} · {new Date(version.createdAt).toLocaleString("ru-RU")}</div>
                {version.provenance?.instruction && <div className={styles.small}>Просьба: «{version.provenance.instruction}»{version.provenance.targetKey ? " (один блок)" : ""}</div>}
                {version.provenance && version.provenance.rulesApplied > 0 && <div className={styles.small}>Учтено правил: {version.provenance.rulesApplied}</div>}
                {stage.canEdit && detail.current?.id !== version.id && stage.artifactType !== "site" && (
                  <button className={styles.ghost} style={{ minHeight: 40, marginTop: 6 }} disabled={Boolean(busy)}
                    onClick={() => run("restore", async () => { await api(`/projects/${projectId}/stages/${stageKey}/versions/${version.id}/restore`, { method: "POST" }); await load(); setMessage(`Вернули версию ${version.versionNumber} — она сохранена как новая.`); })}>Вернуть эту версию</button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {stage.acceptance.length > 0 && stage.status !== "locked" && (
        <details className={`${styles.card} ${styles.details}`}>
          <summary>Когда этап можно принимать</summary>
          <ul className={styles.list}>{stage.acceptance.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      )}

      {stage.status !== "locked" && (
        <div className={styles.bottomBar}><div className={styles.bottomInner}>
          {accepted ? (
            <>
              <span className={styles.bottomText}>Этап принят{detail.versions.find((version) => version.accepted) ? ` (версия ${detail.versions.find((version) => version.accepted)!.versionNumber})` : ""}.</span>
              {nextStageKey && <a className={styles.button} href={`/projects/${projectId}/stages/${nextStageKey}`}>Дальше →</a>}
              {stage.canReopen && <button className={styles.ghost} disabled={Boolean(busy)} onClick={reopen}>Изменить этап</button>}
            </>
          ) : dirty ? (
            <>
              <span className={styles.bottomText}>Есть несохранённые изменения.</span>
              <button className={styles.ghost} disabled={Boolean(busy)} onClick={() => void load()}>Отменить</button>
              <button className={styles.button} disabled={Boolean(busy)} onClick={() => run("save", async () => { await saveDraft(); })}>{busy === "save" ? "Сохраняем…" : "Сохранить"}</button>
            </>
          ) : stage.status === "in_review" && !stage.canRequestChanges ? (
            <span className={styles.bottomText}>На приёмке у владельца проекта.</span>
          ) : stage.status === "in_review" ? (
            <>
              <span className={styles.bottomText}>{failedRequired.length > 0 ? "Есть непройденные проверки." : "Примите результат специалиста или верните его с комментарием."}</span>
              <button className={styles.ghost} disabled={Boolean(busy)} onClick={requestChanges}>Вернуть на доработку</button>
              <button className={styles.button} disabled={Boolean(busy) || acceptBlocked} onClick={accept}>{busy === "accept" ? "Принимаем…" : "Принять этап"}</button>
            </>
          ) : specialist && assignment?.role === "consultant" ? (
            <span className={styles.bottomText}>Вы консультант: предлагайте правки выше. Принимает этап владелец.</span>
          ) : specialist || (stage.canSubmit && !stage.canAccept) ? (
            <>
              <span className={styles.bottomText}>{submitReason}</span>
              <button className={styles.button} disabled={Boolean(busy) || submitBlocked} onClick={submit}>{busy === "submit" ? "Отправляем…" : "Отправить на приёмку"}</button>
            </>
          ) : (
            <>
              <span className={styles.bottomText}>{acceptReason}</span>
              <button className={styles.button} disabled={Boolean(busy) || acceptBlocked} onClick={accept}>{busy === "accept" ? "Принимаем…" : stage.status === "stale" ? "Подтвердить" : "Принять этап"}</button>
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
      <header className={styles.top}><div className={styles.topInner}>
        <a className={styles.back} href={`/projects/${projectId}`}>← Этапы</a>
        <span className={styles.topTitle}>{title}</span>
      </div></header>
      <main className={styles.container}>{children}</main>
    </div>
  );
}
