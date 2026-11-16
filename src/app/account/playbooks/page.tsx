"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../projects/journey.module.css";
import AppHeader from "../../app-header";

export type PlaybookIssue = { code: string; item: string; text: string };
export type Playbook = { id: string; stageKey: string; stageTitle: string; title: string; instructions: string[]; checklist: string[]; version: number; issues: PlaybookIssue[]; updatedAt: string };
type Draft = { id: string | null; title: string; stageKey: string; instructions: string; checklist: string };

const lines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);

/** A specialist's own playbooks: know-how for a kind of stage that they attach to stages they lead, in any project. */
export default function PlaybooksPage() {
  const router = useRouter();
  const [list, setList] = useState<Playbook[] | null>(null);
  const [stages, setStages] = useState<Array<{ key: string; title: string }>>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api<{ playbooks: Playbook[]; stages: Array<{ key: string; title: string }> }>("/me/playbooks");
      setList(data.playbooks); setStages(data.stages);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent("/account/playbooks")}`); return; }
      setError(explainError(caught));
    }
  }, [router]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true); setError("");
    try {
      const body = JSON.stringify({ title: draft.title, stageKey: draft.stageKey, instructions: lines(draft.instructions), checklist: lines(draft.checklist) });
      await api(draft.id ? `/me/playbooks/${draft.id}` : "/me/playbooks", { method: draft.id ? "PUT" : "POST", body });
      setDraft(null);
      await load();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  async function remove(item: Playbook) {
    if (!window.confirm(t("Удалить плейбук «{0}»? На этапах, где он уже подключён, останется копия — владельцы её видели.", [item.title]))) return;
    setBusy(true);
    try { await api(`/me/playbooks/${item.id}/delete`, { method: "POST" }); await load(); } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  return (
    <div className={styles.shell}>
      <AppHeader back={{ href: "/account", label: t("← Аккаунт") }} title={t("Мои плейбуки")} />
      <main className={styles.container}>
        <p className={styles.kicker}>{t("Аккаунт")}</p>
        <h1 className={styles.h1}>{t("Мои плейбуки")}</h1>
        <p className={styles.muted} style={{ marginTop: 0 }}>{t("Ваши приёмы работы для типа этапа: советы ИИ и чек-лист результата. Подключайте плейбук к этапам, которые ведёте, в любом проекте. Владелец видит подключённый плейбук целиком.")}</p>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!list && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}
        {list && !draft && <button className={styles.button} style={{ marginBottom: 18 }} onClick={() => setDraft({ id: null, title: "", stageKey: stages[0]?.key ?? "content", instructions: "", checklist: "" })}>{t("+ Новый плейбук")}</button>}
        {draft && (
          <form className={styles.card} onSubmit={save}>
            <p className={styles.cardTitle}>{draft.id ? t("Изменить плейбук") : t("Новый плейбук")}</p>
            <label className={styles.field}><span className={styles.label}>{t("Название")}</span>
              <input className={styles.input} required minLength={3} maxLength={80} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={t("Например: Тексты для сайтов услуг")} /></label>
            <label className={styles.field}><span className={styles.label}>{t("Для какого этапа")}</span>
              <select className={styles.select} value={draft.stageKey} onChange={(event) => setDraft({ ...draft, stageKey: event.target.value })}>
                {stages.map((item) => <option key={item.key} value={item.key}>{t(item.title)}</option>)}
              </select></label>
            <label className={styles.field}><span className={styles.label}>{t("Советы для ИИ — по одному в строке")}</span>
              <textarea className={styles.textarea} rows={5} value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} placeholder={t("Пиши короткими абзацами\nВ заголовках — выгода для клиента, а не название услуги")} /></label>
            <label className={styles.field}><span className={styles.label}>{t("Чек-лист результата — по одному в строке")}</span>
              <textarea className={styles.textarea} rows={4} value={draft.checklist} onChange={(event) => setDraft({ ...draft, checklist: event.target.value })} placeholder={t("На первом экране одно главное действие")} /></label>
            <p className={styles.small}>{t("Без названий, контактов и ссылок конкретных клиентов: плейбук — ваш, он не должен уносить данные проектов. Попытки изменить правила платформы для ИИ не пройдут проверку.")}</p>
            <div className={styles.row} style={{ gap: 8 }}>
              <button className={styles.button} disabled={busy}>{busy ? t("Сохраняем…") : t("Сохранить")}</button>
              <button type="button" className={styles.ghost} onClick={() => setDraft(null)}>{t("Отмена")}</button>
            </div>
          </form>
        )}
        {list && list.length === 0 && !draft && <section className={styles.card}><p style={{ margin: 0 }}>{t("Плейбуков пока нет. Соберите то, что вы обычно объясняете ИИ на каждом проекте, — и подключайте одним нажатием.")}</p></section>}
        {list?.map((item) => (
          <section key={item.id} className={styles.card}>
            <div className={styles.row} style={{ justifyContent: "space-between" }}>
              <strong style={{ fontSize: 18 }}>{item.title}</strong>
              <span className={`${styles.chip} ${item.issues.length ? styles.attention : styles.done}`} style={{ marginTop: 0 }}>{item.issues.length ? t("не прошёл проверку") : t("проверен")}</span>
            </div>
            <p className={styles.small} style={{ margin: "4px 0 10px" }}>{t("Этап «{0}» · версия {1} · {2}", [t(item.stageTitle), item.version, new Date(item.updatedAt).toLocaleDateString(dateLocale())])}</p>
            {item.instructions.length > 0 && <><p className={styles.label}>{t("Советы для ИИ")}</p><ul className={styles.list}>{item.instructions.map((line) => <li key={line}>{line}</li>)}</ul></>}
            {item.checklist.length > 0 && <><p className={styles.label}>{t("Чек-лист")}</p><ul className={styles.list}>{item.checklist.map((line) => <li key={line}>{line}</li>)}</ul></>}
            {item.issues.length > 0 && <div className={`${styles.notice} ${styles.error}`}>{item.issues.map((issue, index) => <p key={index} style={{ margin: "0 0 6px" }}>«{issue.item}» — {t(issue.text)}</p>)}</div>}
            <div className={styles.row} style={{ gap: 8 }}>
              <button className={styles.secondary} disabled={busy} onClick={() => setDraft({ id: item.id, title: item.title, stageKey: item.stageKey, instructions: item.instructions.join("\n"), checklist: item.checklist.join("\n") })}>{t("Изменить")}</button>
              <button className={styles.ghost} disabled={busy} onClick={() => void remove(item)}>{t("Удалить")}</button>
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
