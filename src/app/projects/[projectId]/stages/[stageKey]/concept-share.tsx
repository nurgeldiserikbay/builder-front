"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { explainError } from "@/lib/journey";
import styles from "../../../journey.module.css";

type Share = {
  enabled: boolean; url: string | null; configured: boolean; allowComments: boolean; hiddenSections: string[]; views: number;
  sections: Array<{ key: string; title: string }>;
  comments: Array<{ id: string; name: string; section: string | null; text: string; createdAt: string; resolvedAt: string | null }>;
};

/** «Показать другому человеку»: a read-only link to the saved concept, what it hides, and what readers said. */
export function ConceptShare({ projectId, saved, canManage }: { projectId: string; saved: boolean; canManage: boolean }) {
  const [share, setShare] = useState<Share | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const load = useCallback(() => api<Share>(`/projects/${projectId}/concept-share`).then(setShare).catch(() => setShare(null)), [projectId]);
  useEffect(() => { if (saved) void load(); }, [load, saved]);
  async function run(action: () => Promise<Share>) {
    setBusy(true); setError("");
    try { setShare(await action()); } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }
  const set = (body: Record<string, unknown>) => run(() => api<Share>(`/projects/${projectId}/concept-share`, { method: "PUT", body: JSON.stringify(body) }));
  const resolve = (id: string, done: boolean) => run(() => api<Share>(`/projects/${projectId}/concept-share/remarks/${id}/${done ? "resolve" : "reopen"}`, { method: "POST" }));
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }
  if (!saved || !share) return null;
  const title = (key: string | null) => share.sections.find((section) => section.key === key)?.title ?? null;
  const open = share.comments.filter((item) => !item.resolvedAt);
  return (
    <section className={styles.card} aria-labelledby="concept-share-title">
      <p id="concept-share-title" className={styles.cardTitle}>{t("Показать другому человеку")}</p>
      <p className={styles.small}>{t("Ссылка открывает концепцию без входа в BuildPath — для партнёра, инвестора или будущего разработчика. Читатель видит последнюю сохранённую версию и может оставить замечание; замечания видит только команда проекта.")}</p>
      {!share.configured && <p className={`${styles.notice} ${styles.info}`}>{t("На этом сервере не задан адрес приложения (PUBLIC_APP_URL) — ссылку сделать нельзя.")}</p>}
      {!share.enabled && canManage && share.configured && (
        <button type="button" className={styles.button} disabled={busy} onClick={() => void set({ enabled: true })}>{busy ? t("Создаём…") : t("Создать ссылку")}</button>
      )}
      {!share.enabled && !canManage && <p className={styles.small}>{t("Ссылка не создана: это может сделать владелец или менеджер.")}</p>}
      {share.enabled && share.url && (
        <>
          <div className={styles.row} style={{ gap: 8, alignItems: "stretch", margin: "8px 0" }}>
            <input className={styles.input} style={{ flex: 1, minWidth: 0 }} readOnly value={share.url} aria-label={t("Ссылка на концепцию")} onFocus={(event) => event.currentTarget.select()} />
            <button type="button" className={styles.secondary} onClick={() => void copy(share.url!)}>{copied ? t("Скопировано") : t("Копировать")}</button>
          </div>
          <p className={styles.small} style={{ margin: "0 0 8px" }}>{t("Открыли {0} раз. Кто открывал, не сохраняется.", [share.views])}</p>
          {canManage && (
            <>
              <fieldset style={{ border: 0, padding: 0, margin: "8px 0" }}>
                <legend className={styles.label}>{t("Что не показывать")}</legend>
                <p className={styles.small} style={{ margin: "2px 0 6px" }}>{t("«Деньги, цели и риски» скрыты сразу: это не для всех. Отметьте и другие разделы, если нужно.")}</p>
                {share.sections.map((section) => {
                  const hidden = share.hiddenSections.includes(section.key);
                  return (
                    <label key={section.key} className={styles.checkRow} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 40 }}>
                      <input type="checkbox" checked={hidden} disabled={busy}
                        onChange={() => void set({ hiddenSections: hidden ? share.hiddenSections.filter((key) => key !== section.key) : [...share.hiddenSections, section.key] })} />
                      <span>{section.title}</span>
                    </label>
                  );
                })}
              </fieldset>
              <label className={styles.checkRow} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 40 }}>
                <input type="checkbox" checked={share.allowComments} disabled={busy} onChange={() => void set({ allowComments: !share.allowComments })} />
                <span>{t("Читатели могут оставлять замечания")}</span>
              </label>
              <div className={styles.row} style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <button type="button" className={styles.secondary} disabled={busy} onClick={() => void set({ enabled: false })}>{t("Выключить ссылку")}</button>
                <button type="button" className={styles.ghost} disabled={busy} onClick={() => { if (window.confirm(t("Сделать новую ссылку? Старая сразу перестанет открываться."))) void set({ renew: true }); }}>{t("Новая ссылка (старая перестанет работать)")}</button>
              </div>
            </>
          )}
        </>
      )}
      {share.comments.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p className={styles.label}>{open.length ? t("Замечания читателей: не учтено {0}", [open.length]) : t("Замечания читателей: все учтены")}</p>
          <ul className={styles.list} style={{ listStyle: "none", padding: 0 }}>
            {share.comments.map((item) => (
              <li key={item.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line, #e3e6e4)", opacity: item.resolvedAt ? 0.6 : 1 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>{item.name}{title(item.section) ? ` · ${title(item.section)}` : ""}</p>
                <p style={{ margin: "2px 0", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{item.text}</p>
                <p className={styles.small} style={{ margin: 0 }}>
                  {new Date(item.createdAt).toLocaleString()}
                  {" · "}
                  <button type="button" className={styles.inlineLinkButton} disabled={busy} onClick={() => void resolve(item.id, !item.resolvedAt)}>{item.resolvedAt ? t("Вернуть") : t("Учтено")}</button>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    </section>
  );
}
