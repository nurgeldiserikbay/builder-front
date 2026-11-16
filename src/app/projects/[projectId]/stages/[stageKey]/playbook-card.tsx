"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { explainError } from "@/lib/journey";
import styles from "../../../journey.module.css";
import type { Playbook, PlaybookIssue } from "../../../../account/playbooks/page";

type Attached = { id: string; title: string; version: number; instructions: string[]; checklist: string[]; author: string | null; mine: boolean; active: boolean; newerVersion: number | null };
type State = { attached: Attached | null; canAttach: boolean; canDetach: boolean; mine: Array<Playbook & { issuesHere: PlaybookIssue[] }> };

/** The stage lead's personal playbook: what is attached (everyone on the stage sees it whole), attach or change it, detach. */
export default function PlaybookCard({ projectId, stageKey }: { projectId: string; stageKey: string }) {
  const [state, setState] = useState<State | null>(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setState(await api<State>(`/projects/${projectId}/stages/${stageKey}/playbook`)); } catch { setState(null); }
  }, [projectId, stageKey]);
  useEffect(() => { void load(); }, [load]);
  async function act(action: () => Promise<State>) {
    setBusy(true); setError("");
    try { setState(await action()); } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }
  if (!state || (!state.attached && !state.canAttach)) return null;
  const selected = state.mine.find((item) => item.id === choice) ?? null;
  return (
    <section className={styles.card} aria-labelledby="playbook-title">
      <p id="playbook-title" className={styles.cardTitle}>{t("Плейбук ведущего")}</p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {state.attached ? <>
        <p style={{ margin: "0 0 6px" }}><strong>{state.attached.title}</strong>{" "}<span className={styles.small}>{t("версия {0}", [state.attached.version])}{state.attached.author ? ` · ${state.attached.author}` : ""}</span></p>
        <p className={styles.small} style={{ marginTop: 0 }}>{state.attached.active
          ? t("ИИ этапа учитывает эти советы ниже правил проекта и принятых требований.")
          : t("Не применяется: специалист, который его подключил, больше не ведёт этап.")}
          {state.attached.newerVersion ? " " + t("У автора есть версия {0} — подключите её заново, чтобы обновить.", [state.attached.newerVersion]) : ""}</p>
        {state.attached.instructions.length > 0 && <ul className={styles.list}>{state.attached.instructions.map((line) => <li key={line}>{line}</li>)}</ul>}
        {state.attached.checklist.length > 0 && <><p className={styles.label}>{t("Чек-лист")}</p><ul className={styles.list}>{state.attached.checklist.map((line) => <li key={line}>{line}</li>)}</ul></>}
        {state.canDetach && <button className={styles.ghost} disabled={busy} onClick={() => void act(() => api<State>(`/projects/${projectId}/stages/${stageKey}/playbook/detach`, { method: "POST" }))}>{t("Отключить")}</button>}
      </> : <p className={styles.small} style={{ marginTop: 0 }}>{t("Подключите свой плейбук — ИИ будет учитывать ваши приёмы на этом этапе. Владелец увидит его целиком.")}</p>}
      {state.canAttach && (state.mine.length ? (
        <div style={{ marginTop: 12 }}>
          <div className={styles.row} style={{ gap: 8, flexWrap: "nowrap" }}>
            <select className={styles.select} value={choice} onChange={(event) => setChoice(event.target.value)} aria-label={t("Плейбук")}>
              <option value="">{t("Выберите плейбук…")}</option>
              {state.mine.map((item) => <option key={item.id} value={item.id}>{item.title}{t(" (версия {0})", [item.version])}{item.issuesHere.length ? t(" — не подходит") : ""}</option>)}
            </select>
            <button className={styles.secondary} style={{ flexShrink: 0 }} disabled={busy || !selected || selected.issuesHere.length > 0} onClick={() => void act(() => api<State>(`/projects/${projectId}/stages/${stageKey}/playbook`, { method: "PUT", body: JSON.stringify({ playbookId: choice }) }))}>{state.attached ? t("Заменить") : t("Подключить")}</button>
          </div>
          {selected && selected.issuesHere.length > 0 && <div className={`${styles.notice} ${styles.error}`} style={{ marginTop: 10 }}>{selected.issuesHere.map((issue, index) => <p key={index} style={{ margin: "0 0 6px" }}>«{issue.item}» — {t(issue.text)}</p>)}</div>}
        </div>
      ) : <p className={styles.small}><a href="/account/playbooks">{t("Создайте плейбук для этого этапа →")}</a></p>)}
    </section>
  );
}
