"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { explainError, stageFiles, type StageFiles } from "@/lib/journey";
import styles from "../../../journey.module.css";

const kindLabels: Record<string, string> = { pdf: "PDF", image: t("Фото"), text: t("Текст"), docx: "Word", xlsx: "Excel", pptx: "PowerPoint", zip: "ZIP" };

export function fileSize(bytes: number): string {
  if (bytes < 1024) return t("{0} Б", [bytes]);
  if (bytes < 1024 * 1024) return t("{0} КБ", [Math.round(bytes / 1024)]);
  return t("{0} МБ", [(bytes / 1024 / 1024).toLocaleString(dateLocale(), { maximumFractionDigits: 1 })]);
}

/**
 * Files on the stage for people: the old brief, a price list, an archive of the current site. They are not read by AI
 * and do not change the result; a ZIP archive can be analysed read-only on the «Разбор кода» page.
 */
export default function StageFilesPanel({ projectId, stageKey }: { projectId: string; stageKey: string }) {
  const [state, setState] = useState<StageFiles | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => { try { setState(await stageFiles.list(projectId, stageKey)); } catch (caught) { setError(explainError(caught)); } }, [projectId, stageKey]);
  useEffect(() => { void load(); }, [load]);

  async function upload(file: File | undefined) {
    if (!file || !state) return;
    setError(""); setDone("");
    if (file.size > state.limits.fileBytes) { setError(t("Файл больше 15 МБ. Сожмите его или разделите на части.")); return; }
    setBusy(true);
    try {
      setState(await stageFiles.upload(projectId, stageKey, file, note.trim()));
      setNote(""); setDone(t("Файл «{0}» добавлен.", [file.name]));
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  async function remove(id: string, name: string) {
    if (!window.confirm(t("Удалить файл «{0}»? Это нельзя отменить.", [name]))) return;
    setBusy(true); setError(""); setDone("");
    try { setState(await stageFiles.remove(projectId, stageKey, id)); } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  if (!state) return error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : null;
  if (!state.canUpload && state.files.length === 0) return null;
  return (
    <details className={`${styles.card} ${styles.details}`} open={state.files.length > 0}>
      <summary>{t("Файлы этапа")}{state.files.length ? ` · ${state.files.length}` : ""}</summary>
      <p className={styles.small} style={{ marginTop: 8 }}>{t("Для людей: прошлое ТЗ, прайс, фото эскиза, архив текущего сайта. ИИ эти файлы не читает, и результат этапа от них не меняется. Видят все, кто видит этап.")}</p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {done && <p className={`${styles.notice} ${styles.success}`} role="status">{done}</p>}
      {state.files.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0", display: "grid", gap: 10 }}>
          {state.files.map((file) => (
            <li key={file.id} style={{ borderLeft: "3px solid var(--line)", paddingLeft: 10 }}>
              <p style={{ margin: 0, overflowWrap: "anywhere" }}><strong>{file.name}</strong></p>
              <p className={styles.small} style={{ margin: "2px 0" }}>{kindLabels[file.kind] ?? file.kind} · {fileSize(file.sizeBytes)} · {file.author} · {new Date(file.createdAt).toLocaleDateString(dateLocale())}</p>
              {file.note && <p className={styles.small} style={{ margin: "2px 0", whiteSpace: "pre-wrap" }}>{file.note}</p>}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                <button type="button" className={styles.ghost} onClick={() => void stageFiles.download(projectId, stageKey, file).catch((caught) => setError(explainError(caught)))}>{t("Скачать")}</button>
                {file.canAnalyze && <a className={styles.ghost} href={`/projects/${projectId}/analysis?file=${file.id}`}>{t("Разобрать")}</a>}
                {file.canDelete && <button type="button" className={styles.ghost} disabled={busy} onClick={() => void remove(file.id, file.name)}>{t("Удалить")}</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {state.canUpload && (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <input className={styles.input} placeholder={t("Пояснение к файлу (необязательно)")} aria-label={t("Пояснение к файлу")} value={note} maxLength={state.limits.note} onChange={(event) => setNote(event.target.value)} />
          <label className={styles.secondary} style={{ cursor: busy ? "not-allowed" : "pointer" }}>
            {busy ? t("Загружаем и проверяем…") : t("Добавить файл")}
            <input ref={input} type="file" hidden disabled={busy} accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.json,.docx,.xlsx,.pptx,.zip" onChange={(event) => void upload(event.target.files?.[0])} />
          </label>
          <p className={styles.small} style={{ margin: 0 }}>{t("PDF, фото, текст, Word, Excel, PowerPoint или ZIP — до 15 МБ, до {0} файлов на этапе. Каждый файл проверяется на вирусы.", [state.limits.perStage])}</p>
        </div>
      )}
    </details>
  );
}
