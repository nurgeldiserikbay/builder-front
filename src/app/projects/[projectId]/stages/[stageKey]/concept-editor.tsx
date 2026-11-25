"use client";

import { Fragment, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { t } from "@/lib/i18n";
import type { ConceptDocumentData } from "@/lib/journey";
import styles from "../../../journey.module.css";
import { fileName } from "./canvas";
import { DataDiagram, SwimlaneDiagram } from "./diagrams";
import type { BusinessProcess } from "./process-editor";

// «Концепция продукта»: the document the platform assembles from accepted stages (builder-back src/journey/concept.ts),
// shown as the reader will get it, and the owner's parts: in a nutshell, glossary, open questions, notes.

export type Concept = { pitch: string; glossary: Array<{ key: string; term: string; meaning: string }>; questions: Array<{ key: string; text: string }>; notes: string };
export type ConceptDocument = Omit<ConceptDocumentData, "inputs"> & { inputs: { process: BusinessProcess | null } };

export const blankConcept = (): Concept => ({ pitch: "", glossary: [], questions: [], notes: "" });
const LIMITS = { glossary: 20, questions: 12 };

/** **bold** and _italic_ of the platform's Markdown; everything else is plain text (React escapes it). */
function inline(text: string) {
  const parts: React.ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|(?<![\p{L}\d])_([^_]+)_(?![\p{L}\d])/gu;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > last) parts.push(text.slice(last, match.index));
    parts.push(match[1] !== undefined ? <strong key={match.index}>{match[1]}</strong> : <em key={match.index}>{match[2]}</em>);
    last = match.index! + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** The few shapes the document uses: paragraphs, bullet and numbered lists. Lines starting «Схема N.» are captions. */
function Markdown({ text, onCaption }: { text: string; onCaption?: (line: string) => React.ReactNode }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((item, index) => <li key={index}>{inline(item)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length} style={{ margin: "4px 0 10px", paddingLeft: 22 }}>{items}</ol> : <ul key={blocks.length} style={{ margin: "4px 0 10px", paddingLeft: 22 }}>{items}</ul>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
      continue;
    }
    flush();
    if (!line) continue;
    const caption = onCaption && /^(Схема|Diagram) \d+\./.test(line) ? onCaption(line) : null;
    blocks.push(caption ?? <p key={blocks.length} style={{ margin: "0 0 8px" }}>{inline(line)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

/** The document as the reader gets it, with the diagrams drawn from the same accepted process. */
export function ConceptDocumentView({ document, print = false }: { document: ConceptDocument; print?: boolean }) {
  const process = document.inputs.process;
  const figure = (key: "process" | "data", line: string) => (
    <figure key={key} style={{ margin: "8px 0 14px" }}>
      <div style={{ overflowX: print ? "visible" : "auto", border: "1.5px solid var(--line, #d9ddd9)", borderRadius: 12, padding: 8, background: "#fff" }} className="concept-figure">
        {key === "process"
          ? process?.scenarios.map((scenario) => (
            <div key={scenario.key} style={{ marginBottom: 8, breakInside: "avoid" }}>
              <p className={styles.small} style={{ margin: "0 0 4px", fontWeight: 600 }}>{scenario.title}</p>
              <SwimlaneDiagram actors={process.actors} scenario={scenario} />
            </div>
          ))
          : process && <DataDiagram entities={process.data} />}
      </div>
      <figcaption className={styles.small} style={{ marginTop: 6, fontWeight: 600 }}>{line}</figcaption>
    </figure>
  );
  return (
    <article aria-label={document.title}>
      <h1 className={styles.h2} style={{ margin: "0 0 12px" }}>{document.title}</h1>
      {!print && (
        <nav aria-label={t("Оглавление")} className={styles.small} style={{ margin: "0 0 14px" }}>
          {document.sections.map((section, index) => (
            <Fragment key={section.key}>{index > 0 && " · "}<a href={`#concept-${section.key}`} className={styles.back}>{section.title}</a></Fragment>
          ))}
        </nav>
      )}
      {document.sections.map((section) => (
        <section key={section.key} id={`concept-${section.key}`} style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 19, margin: "0 0 6px", breakAfter: "avoid" }}>{section.title}</h2>
          {section.empty
            ? <p style={{ margin: "0 0 6px", color: "var(--muted)", fontStyle: "italic" }}>{section.empty}</p>
            : <Markdown text={section.markdown} onCaption={(line) => figure(section.key === "data" ? "data" : "process", line)} />}
          {section.source && <p className={styles.small} style={{ margin: 0 }}>{t("Источник: этап «{0}»", [section.source])}</p>}
        </section>
      ))}
    </article>
  );
}

async function downloadFile(projectId: string, format: "md" | "docx", title: string) {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/stages/concept/document?format=${format}`, { credentials: "include" });
  if (!response.ok) throw new Error(String(response.status));
  const link = window.document.createElement("a");
  link.href = URL.createObjectURL(await response.blob());
  link.download = `${fileName(title).replace(/^diagram$/, "concept")}.${format}`;
  window.document.body.appendChild(link); link.click(); link.remove();
}

/** Word, Markdown and the print page for PDF. Files are of the saved version: unsaved edits are not in them. */
export function ConceptDownloads({ projectId, saved, dirty, title }: { projectId: string; saved: boolean; dirty: boolean; title: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const get = async (format: "md" | "docx") => {
    setBusy(format); setError("");
    try { await downloadFile(projectId, format, title); } catch { setError(t("Не удалось скачать файл. Попробуйте ещё раз.")); } finally { setBusy(null); }
  };
  if (!saved) return null;
  return (
    <section className={styles.card} aria-label={t("Скачать документ")}>
      <p className={styles.cardTitle}>{t("Скачать документ")}</p>
      {dirty && <p className={`${styles.notice} ${styles.info}`}>{t("Файлы — из сохранённой версии. Сохраните изменения, чтобы они попали в документ.")}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a className={styles.secondary} href={`/projects/${projectId}/concept`} target="_blank" rel="noopener">{t("PDF со схемами")}</a>
        <button type="button" className={styles.secondary} disabled={Boolean(busy)} onClick={() => void get("docx")}>{busy === "docx" ? t("Готовим…") : t("Word")}</button>
        <button type="button" className={styles.secondary} disabled={Boolean(busy)} onClick={() => void get("md")}>{busy === "md" ? t("Готовим…") : t("Markdown")}</button>
      </div>
      <p className={styles.small}>{t("В Word — текст документа; схемы — в PDF.")}</p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    </section>
  );
}

/** The owner's parts as they are being typed, so the document reads as it will after saving. */
export function withOwnerParts(document: ConceptDocument, concept: Concept): ConceptDocument {
  const lines: Record<string, string> = {
    pitch: concept.pitch.trim(),
    glossary: concept.glossary.filter((item) => item.term.trim()).map((item) => `- **${item.term.trim()}** — ${item.meaning.trim()}`).join("\n"),
    questions: concept.questions.filter((item) => item.text.trim()).map((item) => `- ${item.text.trim()}`).join("\n"),
    notes: concept.notes.trim(),
  };
  const sections = document.sections.filter((section) => section.key !== "notes").map((section) => (section.key in lines
    ? { ...section, markdown: lines[section.key]!, empty: lines[section.key] ? null : section.empty ?? t("Не заполнено.") }
    : section));
  if (lines.notes) sections.splice(sections.findIndex((section) => section.key === "glossary"), 0, { key: "notes", title: t("Что ещё важно"), source: null, markdown: lines.notes, empty: null });
  return { ...document, sections };
}

function nextKey(items: Array<{ key: string }>, prefix: string) {
  let number = items.length + 1;
  while (items.some((item) => item.key === `${prefix}${number}`)) number += 1;
  return `${prefix}${number}`;
}

export function ConceptEditor({ value: raw, onChange, disabled, issues }: { value: Concept; onChange: (next: Concept) => void; disabled: boolean; issues: string[] }) {
  const value = { ...blankConcept(), ...raw };
  const set = (patch: Partial<Concept>) => onChange({ ...value, ...patch });
  return (
    <section className={styles.card} aria-label={t("Ваши части документа")}>
      <p className={styles.cardTitle}>{t("Ваши части документа")}</p>
      <p className={styles.small}>{t("Остальное платформа собирает из принятых этапов — чтобы поменять те разделы, поправьте сам этап.")}</p>
      {issues.length > 0 && <div className={`${styles.notice} ${styles.warn}`}><ul className={styles.list}>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
      <label className={styles.field}><span className={styles.label}>{t("В двух словах")}</span>
        <span className={styles.why}>{t("Две-три фразы: что за продукт, для кого и какую проблему решает. С этого начнут читать.")}</span>
        <textarea className={styles.textarea} style={{ minHeight: 90 }} value={value.pitch} maxLength={600} disabled={disabled} onChange={(event) => set({ pitch: event.target.value })} /></label>

      <div className={styles.field}><span className={styles.label}>{t("Словарь")}</span>
        <span className={styles.why}>{t("Слова, которые не поймёт посторонний, — с простым объяснением.")}</span>
        {value.glossary.map((item, index) => (
          <div key={item.key} style={{ display: "grid", gap: 6, padding: "8px 0", borderTop: index ? "1px solid var(--line, #e3e6e3)" : undefined }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input className={styles.input} style={{ flex: 1 }} value={item.term} maxLength={40} disabled={disabled} aria-label={t("Термин {0}", [index + 1])} placeholder={t("Термин")}
                onChange={(event) => set({ glossary: value.glossary.map((entry, position) => position === index ? { ...entry, term: event.target.value } : entry) })} />
              {!disabled && <button type="button" className={styles.iconButton} aria-label={t("Убрать термин")} onClick={() => set({ glossary: value.glossary.filter((_, position) => position !== index) })}>✕</button>}
            </div>
            <input className={styles.input} value={item.meaning} maxLength={240} disabled={disabled} aria-label={t("Что значит «{0}»", [item.term])} placeholder={t("Что это значит, одной фразой")}
              onChange={(event) => set({ glossary: value.glossary.map((entry, position) => position === index ? { ...entry, meaning: event.target.value } : entry) })} />
          </div>
        ))}
        {!disabled && value.glossary.length < LIMITS.glossary && (
          <button type="button" className={`${styles.secondary} ${styles.block}`} onClick={() => set({ glossary: [...value.glossary, { key: nextKey(value.glossary, "g"), term: "", meaning: "" }] })}>{t("+ Добавить термин")}</button>
        )}
      </div>

      <div className={styles.field}><span className={styles.label}>{t("Открытые вопросы")}</span>
        <span className={styles.why}>{t("Что ещё не решено. Лучше записать, чем молча отложить.")}</span>
        {value.questions.map((item, index) => (
          <div key={item.key} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <input className={styles.input} style={{ flex: 1 }} value={item.text} maxLength={240} disabled={disabled} aria-label={t("Вопрос {0}", [index + 1])}
              onChange={(event) => set({ questions: value.questions.map((entry, position) => position === index ? { ...entry, text: event.target.value } : entry) })} />
            {!disabled && <button type="button" className={styles.iconButton} aria-label={t("Убрать вопрос")} onClick={() => set({ questions: value.questions.filter((_, position) => position !== index) })}>✕</button>}
          </div>
        ))}
        {!disabled && value.questions.length < LIMITS.questions && (
          <button type="button" className={`${styles.secondary} ${styles.block}`} onClick={() => set({ questions: [...value.questions, { key: nextKey(value.questions, "q"), text: "" }] })}>{t("+ Добавить вопрос")}</button>
        )}
      </div>

      <label className={styles.field}><span className={styles.label}>{t("Что ещё важно")}</span>
        <span className={styles.why}>{t("Необязательно: то, чего нет в этапах, но что должен знать читатель.")}</span>
        <textarea className={styles.textarea} style={{ minHeight: 64 }} value={value.notes} maxLength={1200} disabled={disabled} onChange={(event) => set({ notes: event.target.value })} /></label>
    </section>
  );
}
