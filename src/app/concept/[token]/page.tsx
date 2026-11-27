"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { explainError } from "@/lib/journey";
import { ConceptDocumentView, type ConceptDocument } from "../../projects/[projectId]/stages/[stageKey]/concept-editor";
import styles from "../../projects/journey.module.css";

type Shared = { document: Omit<ConceptDocument, "markdown">; allowComments: boolean; locale: string };

/** The product concept for a reader without an account, from a link the project's team sent. */
export default function SharedConceptPage() {
  const { token } = useParams<{ token: string }>();
  const [shared, setShared] = useState<Shared | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [section, setSection] = useState("");
  const [text, setText] = useState("");
  const [trap, setTrap] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    api<Shared>(`/shared-concept/${encodeURIComponent(token)}`)
      .then(setShared)
      .catch((caught) => setError(caught instanceof ApiError && caught.status === 404 ? t("Ссылка не работает: её выключили или заменили новой. Попросите прислать актуальную.") : explainError(caught)));
  }, [token]);
  useEffect(() => { if (shared) window.document.title = shared.document.title; }, [shared]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setFormError("");
    try {
      await api(`/shared-concept/${encodeURIComponent(token)}/remarks`, { method: "POST", body: JSON.stringify({ name, text, section: section || null, website: trap }) });
      setSent(true); setText(""); setSection("");
    } catch (caught) { setFormError(explainError(caught)); } finally { setBusy(false); }
  }

  return (
    <div style={{ background: "var(--bg, #f6f7f5)", minHeight: "100vh" }}>
      <main style={{ maxWidth: 820, margin: "0 auto", padding: "16px" }}>
        <p className={styles.small} style={{ margin: "0 0 10px" }}>{t("Концепция продукта, которой с вами поделились. Это документ для чтения: изменить его может только команда проекта.")}</p>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!shared && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}
        {shared && (
          <>
            <div className={styles.card} style={{ fontSize: 16 }}>
              <ConceptDocumentView document={{ ...shared.document, markdown: "" } as ConceptDocument} />
            </div>
            {shared.allowComments && (
              <section className={styles.card} aria-labelledby="remark-title">
                <h2 id="remark-title" className={styles.h2}>{t("Оставить замечание")}</h2>
                <p className={styles.small}>{t("Что непонятно, что смущает, чего не хватает — команда проекта увидит ваше замечание. Его видит только команда, другим читателям оно не показывается.")}</p>
                {sent && <p className={`${styles.notice} ${styles.success}`} role="status">{t("Спасибо! Замечание отправлено. Можно написать ещё одно.")}</p>}
                <form onSubmit={send} style={{ display: "grid", gap: 10 }}>
                  <label className={styles.field}><span className={styles.label}>{t("Как вас зовут")}</span>
                    <input className={styles.input} value={name} maxLength={60} required autoComplete="name" onChange={(event) => setName(event.target.value)} /></label>
                  <label className={styles.field}><span className={styles.label}>{t("К какому разделу (необязательно)")}</span>
                    <select className={styles.input} value={section} onChange={(event) => setSection(event.target.value)}>
                      <option value="">{t("Ко всему документу")}</option>
                      {shared.document.sections.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}
                    </select></label>
                  <label className={styles.field}><span className={styles.label}>{t("Замечание")}</span>
                    <textarea className={styles.textarea} value={text} maxLength={1000} required minLength={3} onChange={(event) => setText(event.target.value)} /></label>
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={(event) => setTrap(event.target.value)} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
                  <button type="submit" className={styles.button} disabled={busy || name.trim().length < 1 || text.trim().length < 3}>{busy ? t("Отправляем…") : t("Отправить замечание")}</button>
                  {formError && <p className={`${styles.notice} ${styles.error}`} role="alert">{formError}</p>}
                </form>
              </section>
            )}
          </>
        )}
        <p className={styles.small} style={{ textAlign: "center", margin: "16px 0" }}>{t("Сделано в BuildPath")}</p>
      </main>
    </div>
  );
}
