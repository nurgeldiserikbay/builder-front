"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { explainError, type StageDetail } from "@/lib/journey";
import { ConceptDocumentView, type ConceptDocument } from "../stages/[stageKey]/concept-editor";
import styles from "../../journey.module.css";

/** The product concept for printing: «Сохранить PDF» opens the browser's print dialog, diagrams included. */
export default function ConceptPrintPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [document, setDocument] = useState<ConceptDocument | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<StageDetail>(`/projects/${projectId}/stages/concept`)
      .then((detail) => {
        if (!detail.current) setError(t("Документа ещё нет: сначала сохраните этап «Концепция продукта»."));
        else setDocument((detail.options.concept as ConceptDocument | undefined) ?? null);
      })
      .catch((caught) => setError(explainError(caught)));
  }, [projectId]);
  useEffect(() => { if (document) window.document.title = document.title; }, [document]);

  return (
    <div style={{ background: "var(--bg, #f6f7f5)", minHeight: "100vh" }}>
      <header data-print="hide" style={{ position: "sticky", top: 0, zIndex: 2, background: "#fff", borderBottom: "1px solid var(--line, #e3e6e3)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "10px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <a className={styles.back} href={`/projects/${projectId}/stages/concept`}>{t("← К этапу")}</a>
          <div style={{ flex: 1 }} />
          {document && <button type="button" className={styles.button} onClick={() => window.print()}>{t("Сохранить PDF или распечатать")}</button>}
        </div>
      </header>
      <main style={{ maxWidth: 820, margin: "0 auto", padding: "16px" }}>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!document && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}
        {document && (
          <div className={styles.card} style={{ fontSize: 16 }}>
            <p className={styles.small} data-print="hide" style={{ margin: "0 0 12px" }}>{t("В окне печати выберите «Сохранить как PDF». Схемы печатаются вместе с текстом.")}</p>
            <ConceptDocumentView document={document} print />
          </div>
        )}
      </main>
      <style>{"@media print { .concept-figure svg { max-width: 100% !important; height: auto !important; } main { max-width: none !important; padding: 0 !important; } main > div { border: 0 !important; box-shadow: none !important; padding: 0 !important; } }"}</style>
    </div>
  );
}
