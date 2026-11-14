"use client";

// Quality review of the stage result: what the checks found, how serious it is and how to fix it. The person decides:
// let the AI fix chosen findings, add their own remark, or — for a blocking finding — explain in writing why the stage
// goes on anyway. The explanation stays in the stage history.
import { useEffect, useState } from "react";
import { t, dateLocale } from "@/lib/i18n";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../../journey.module.css";

export type ReviewFinding = {
  id: string; code: string; severity: "blocking" | "important" | "minor"; category: "logic" | "security" | "clarity";
  target: string | null; where: string; message: string; fix: string; overridden: boolean;
};
export type StageReview = {
  rulesVersion: string; score: number; blocking: number; findings: ReviewFinding[]; uncoveredBlocking: string[];
  overrides: Array<{ id: string; findingIds: string[]; reason: string; author: string; createdAt: string }>;
};

const severityText = () => ({ blocking: t("Блокирует переход"), important: t("Важно"), minor: t("Мелочь") });
const severityTone = { blocking: "attention", important: "active", minor: "closed" } as const;
const categoryText = () => ({ logic: t("логика"), security: t("безопасность"), clarity: t("понятность") });

export default function ReviewPanel({ projectId, stageKey, versionId, review, canFix, aiConfigured, canOverride, onChanged }: {
  projectId: string; stageKey: string; versionId: string; review: StageReview;
  canFix: boolean; aiConfigured: boolean; canOverride: boolean; onChanged: (message: string) => Promise<void> | void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  // A new version is a new review: forget what was ticked for the old one.
  useEffect(() => { setChosen([]); setReason(""); setError(""); }, [versionId]);

  const severity = severityText();
  const category = categoryText();
  const open = review.findings.filter((finding) => !finding.overridden);
  const uncovered = review.findings.filter((finding) => review.uncoveredBlocking.includes(finding.id));
  // Ticking findings only makes sense when the AI can take them.
  const pickable = canFix && aiConfigured;
  const toggle = (id: string) => setChosen((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));

  async function act(label: string, work: () => Promise<void>) {
    setBusy(label); setError("");
    try { await work(); } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }

  const fix = () => act("fix", async () => {
    const result = await api<{ versionNumber: number }>(`/projects/${projectId}/stages/${stageKey}/review/fix`, { method: "POST", body: JSON.stringify({ findingIds: chosen }) });
    await onChanged(t("ИИ исправил выбранные замечания — версия {0}. Проверка запущена заново.", [result.versionNumber]));
  });
  const override = () => act("override", async () => {
    await api(`/projects/${projectId}/stages/${stageKey}/review/override`, { method: "POST", body: JSON.stringify({ versionId, findingIds: uncovered.map((finding) => finding.id), reason: reason.trim() }) });
    await onChanged(t("Объяснение сохранено. Теперь этап можно принять."));
  });
  const ownRemark = () => {
    const field = document.getElementById("new-comment") as HTMLTextAreaElement | null;
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
    field?.focus();
  };

  return (
    <section className={styles.card} aria-labelledby="review-title">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <p id="review-title" className={styles.cardTitle} style={{ margin: 0 }}>{t("Проверка качества")}</p>
        <span className={`${styles.chip} ${styles[review.score >= 80 ? "done" : review.score >= 50 ? "active" : "attention"]}`} style={{ marginTop: 0 }}>{t("Оценка {0} из 100", [review.score])}</span>
      </div>
      <p className={styles.small}>{t("Программа проверила результат по правилам этапа: всё ли сходится и нет ли слабых мест для следующего этапа. Решаете вы: отдать ИИ доделать, исправить самому или пропустить с объяснением.")}</p>

      {review.findings.length === 0 && <p className={`${styles.notice} ${styles.success}`}>{t("Замечаний нет — результат готов для следующего этапа.")}</p>}
      {uncovered.length > 0 && <p className={`${styles.notice} ${styles.warn}`} role="status">{t("Блокирующих замечаний: {0}. Пока их не исправят или не объяснят, этап не принять.", [uncovered.length])}</p>}

      {review.findings.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 10 }} aria-label={t("Замечания проверки")}>
          {review.findings.map((finding) => (
            <li key={finding.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px" }}>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: pickable && !finding.overridden ? "pointer" : "default" }}>
                {pickable && !finding.overridden && (
                  <input type="checkbox" checked={chosen.includes(finding.id)} onChange={() => toggle(finding.id)} style={{ width: 22, height: 22, marginTop: 2, flex: "none" }}
                    aria-label={t("Выбрать замечание «{0}»", [finding.message])} />
                )}
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span className={`${styles.chip} ${styles[severityTone[finding.severity]]}`} style={{ marginTop: 0, fontSize: 13 }}>{severity[finding.severity]}</span>
                    {finding.overridden && <span className={`${styles.chip} ${styles.closed}`} style={{ marginTop: 0, fontSize: 13 }}>{t("Пропущено с объяснением")}</span>}
                    <span className={styles.small} style={{ margin: 0 }}>{category[finding.category]} · {finding.where}</span>
                  </span>
                  <span style={{ display: "block", marginTop: 6 }}>{finding.message}</span>
                  <span className={styles.small} style={{ display: "block", margin: "4px 0 0" }}><b>{t("Что сделать.")}</b> {finding.fix}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {open.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
          {canFix && aiConfigured && (
            <button className={`${styles.button} ${styles.block}`} disabled={Boolean(busy) || chosen.length === 0} onClick={fix}>
              {busy === "fix" ? t("ИИ исправляет…") : chosen.length ? t("Отдать ИИ доделать ({0})", [chosen.length]) : t("Отметьте замечания для ИИ")}
            </button>
          )}
          {canFix && !aiConfigured && <p className={styles.small} style={{ margin: 0 }}>{t("ИИ пока не подключён — исправьте по подсказкам вручную, проверка обновится после сохранения.")}</p>}
          <button className={`${styles.ghost} ${styles.block}`} type="button" onClick={ownRemark}>{t("Добавить своё замечание")}</button>
        </div>
      )}

      {canOverride && uncovered.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, minHeight: 44, display: "flex", alignItems: "center" }}>{t("Пропустить блокирующие замечания с объяснением")}</summary>
          <p className={styles.small}>{t("Объясните, почему этап можно принять без исправления: например, это делается вне сайта. Объяснение увидят участники проекта, оно останется в истории этапа. Новая версия проверяется заново.")}</p>
          <textarea id="review-reason" className={styles.textarea} value={reason} maxLength={1000} aria-label={t("Почему можно пропустить")}
            placeholder={t("Например: согласие клиентов берём в WhatsApp, на сайте контакты не храним")} onChange={(event) => setReason(event.target.value)} />
          {reason.trim().length > 0 && reason.trim().length < 10 && <p className={styles.small} style={{ color: "var(--danger, #b3261e)" }}>{t("Напишите хотя бы одно понятное предложение.")}</p>}
          <button className={`${styles.secondary} ${styles.block}`} style={{ marginTop: 8 }} disabled={Boolean(busy) || reason.trim().length < 10} onClick={override}>
            {busy === "override" ? t("Сохраняем…") : t("Сохранить объяснение")}
          </button>
        </details>
      )}

      {review.overrides.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p className={styles.label} style={{ marginBottom: 4 }}>{t("Объяснения к этой версии")}</p>
          <ul className={styles.list}>
            {review.overrides.map((item) => <li key={item.id}>{item.reason} <span className={styles.small}>— {item.author}, {new Date(item.createdAt).toLocaleDateString(dateLocale())}</span></li>)}
          </ul>
        </div>
      )}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      <p className={styles.small} style={{ marginBottom: 0 }}>{t("Правила проверки, версия {0}. Автоматическая проверка не заменяет ваш взгляд — посмотрите результат сами.", [review.rulesVersion])}</p>
    </section>
  );
}
