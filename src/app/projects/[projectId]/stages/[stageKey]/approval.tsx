"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useState } from "react";
import { api } from "@/lib/api";
import { explainError, type Approval, type StageDetail } from "@/lib/journey";
import styles from "../../../journey.module.css";

type Mode = "one" | "all" | "quorum";

/** «Кто принимает этап»: the owner alone, or reviewers by a rule; who approved this version and who is still awaited. */
export default function ApprovalPanel({ projectId, stageKey, approval, onChange }: { projectId: string; stageKey: string; approval: Approval; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<Mode>(approval.policy?.mode ?? "one");
  const [reviewers, setReviewers] = useState<string[]>(approval.policy?.reviewers ?? []);
  const [quorum, setQuorum] = useState(approval.policy?.quorum ?? 2);
  const [authorMayApprove, setAuthorMayApprove] = useState(approval.policy?.authorMayApprove ?? false);
  const [order, setOrder] = useState<"parallel" | "sequential">(approval.policy?.order ?? "parallel");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(policy: unknown) {
    setBusy(true); setError("");
    try {
      await api<StageDetail>(`/projects/${projectId}/stages/${stageKey}/approval-policy`, { method: "PUT", body: JSON.stringify({ policy }) });
      onChange();
      setEditing(false);
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  const toggle = (id: string) => setReviewers((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));

  return (
    <section className={styles.card} aria-labelledby="approval-title">
      <p id="approval-title" className={styles.cardTitle}>{t("Кто принимает этап")}</p>
      {!approval.policy ? (
        <p style={{ margin: "0 0 8px" }}>{t("Владелец или администратор проекта — одним нажатием «Принять этап».")}</p>
      ) : (
        <>
          <p style={{ margin: "0 0 8px" }}>{approval.policyText}</p>
          {approval.broken && <p className={`${styles.notice} ${styles.warn}`}>{t("Правило нельзя выполнить: кого-то из проверяющих нет в команде, или все оставшиеся — авторы версии. Измените правило.")}</p>}
          {approval.reviewers && (
            <ul className={styles.list} style={{ listStyle: "none", padding: 0 }}>
              {approval.reviewers.map((item) => (
                <li key={item.userId}>{item.approved ? "✅" : item.active ? "⏳" : "⛔"} {item.name}{item.author && !approval.policy?.authorMayApprove ? ` · ${t("автор версии")}` : ""}{!item.active ? ` · ${t("не в команде")}` : ""}</li>
              ))}
            </ul>
          )}
          {typeof approval.required === "number" && <p className={styles.small} style={{ margin: "4px 0 0" }}>{t("Одобрено {0} из {1} нужных.", [approval.approved ?? 0, approval.required])}{approval.next ? ` ${t("Сейчас очередь: {0}.", [approval.next])}` : ""}</p>}
          {approval.approvals && approval.approvals.filter((item) => item.comment).map((item) => (
            <p key={`${item.name}-${item.createdAt}`} className={styles.small} style={{ margin: "6px 0 0" }}>«{item.comment}» — {item.name}, {new Date(item.createdAt).toLocaleDateString(dateLocale())}</p>
          ))}
          <p className={styles.small} style={{ margin: "8px 0 0" }}>{t("Одобрение относится к конкретной версии. Новая версия или просьба доработать начинают проверку заново.")}</p>
        </>
      )}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {approval.canEditPolicy && !editing && (
        <button type="button" className={styles.ghost} style={{ marginTop: 8 }} onClick={() => setEditing(true)}>{approval.policy ? t("Изменить правило") : t("Назначить проверяющих")}</button>
      )}
      {editing && (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {approval.candidates.length < 2 && <p className={styles.small} style={{ margin: 0 }}>{t("Проверяющими могут быть участники команды проекта. Пригласите их на вкладке «Команда».")}</p>}
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className={styles.small}>{t("Проверяющие")}</legend>
            {approval.candidates.map((person) => (
              <label key={person.userId} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 36 }}>
                <input type="checkbox" checked={reviewers.includes(person.userId)} onChange={() => toggle(person.userId)} style={{ width: 20, height: 20 }} />
                <span>{person.name}</span>
              </label>
            ))}
          </fieldset>
          <label className={styles.small}>{t("Сколько одобрений нужно")}
            <select className={styles.input} value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
              <option value="one">{t("Любой один из проверяющих")}</option>
              <option value="all">{t("Все проверяющие")}</option>
              <option value="quorum">{t("Заданное число")}</option>
            </select>
          </label>
          {mode === "quorum" && (
            <label className={styles.small}>{t("Число одобрений")}
              <input className={styles.input} type="number" min={1} max={Math.max(1, reviewers.length)} value={quorum} onChange={(event) => setQuorum(Number(event.target.value))} />
            </label>
          )}
          <label className={styles.small}>{t("Порядок")}
            <select className={styles.input} value={order} onChange={(event) => setOrder(event.target.value as "parallel" | "sequential")}>
              <option value="parallel">{t("Все проверяют одновременно")}</option>
              <option value="sequential">{t("По очереди, в порядке выбора")}</option>
            </select>
          </label>
          {order === "sequential" && reviewers.length > 1 && <p className={styles.small} style={{ margin: 0 }}>{t("Порядок: {0}", [reviewers.map((id) => approval.candidates.find((person) => person.userId === id)?.name ?? "").join(" → ")])}</p>}
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input type="checkbox" checked={authorMayApprove} onChange={(event) => setAuthorMayApprove(event.target.checked)} style={{ width: 20, height: 20, flex: "none" }} />
            <span className={styles.small}>{t("Автор версии может одобрить свою версию (по умолчанию — нет: свою работу проверяет другой человек)")}</span>
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className={styles.button} disabled={busy || reviewers.length === 0} onClick={() => void save({ mode, reviewers, quorum: mode === "quorum" ? quorum : null, authorMayApprove, order })}>{busy ? t("Сохраняем…") : t("Сохранить правило")}</button>
            {approval.policy && <button type="button" className={styles.ghost} disabled={busy} onClick={() => void save(null)}>{t("Принимаю сам")}</button>}
            <button type="button" className={styles.ghost} disabled={busy} onClick={() => setEditing(false)}>{t("Отмена")}</button>
          </div>
        </div>
      )}
    </section>
  );
}
