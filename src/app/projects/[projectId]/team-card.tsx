"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError, isPlanMessage } from "@/lib/journey";
import styles from "../journey.module.css";

type Role = { key: string; title: string; explanation: string; invitable: boolean };
type Member = { id: string; userId: string; role: string; roleTitle: string; you: boolean; name: string; email: string | null; since: string; canChange: boolean; stageKeys: string[] };
type Invitation = { id: string; email: string; role: string; roleTitle: string; expiresAt: string; expired: boolean };
type Team = { viewerRole: string; canManage: boolean; limit: number; roles: Role[]; members: Member[]; invitations: Invitation[]; affectedStages?: string[]; stages: Array<{ key: string; title: string }> };

/** The project team: who is in it with which role; the owner and managers invite, change roles and remove. */
export default function TeamCard({ projectId }: { projectId: string }) {
  const [team, setTeam] = useState<Team | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("contributor");
  const [stageKeys, setStageKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ url: string; emailSent: boolean } | null>(null);
  const [warning, setWarning] = useState("");

  const load = useCallback(async () => {
    try { setTeam(await api<Team>(`/projects/${projectId}/team`)); } catch (caught) { setError(explainError(caught)); }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setSent(null);
    try {
      const result = await api<{ inviteUrl: string; emailSent: boolean }>(`/projects/${projectId}/team/invitations`, { method: "POST", body: JSON.stringify({ email, role, ...(role === "contributor" ? { stageKeys } : {}) }) });
      setSent({ url: result.inviteUrl, emailSent: result.emailSent });
      setEmail("");
      await load();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  async function act(path: string, body?: unknown, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setError(""); setWarning("");
    try {
      const next = await api<Team>(`/projects/${projectId}/team/${path}`, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) });
      setTeam(next);
      if (next.affectedStages?.length) setWarning(t("Этот человек был проверяющим на этапах: {0}. Измените правило согласования этих этапов — иначе их нельзя будет принять.", [next.affectedStages.join(", ")]));
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  if (!team) return error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : <p className={styles.muted}>{t("Загружаем команду…")}</p>;
  const invitable = team.roles.filter((item) => item.invitable);
  const chosen = team.roles.find((item) => item.key === role);

  return (
    <div className={styles.panels}>
      <section className={styles.card} aria-labelledby="team-title">
        <p className={styles.kicker}>{t("Команда")}</p>
        <h2 id="team-title" className={styles.h2}>{t("Кто работает над проектом")}</h2>
        <p className={styles.small} style={{ margin: "0 0 12px" }}>{t("Участники команды видят весь проект в пределах своей роли. Специалисты, приглашённые на один этап, сюда не входят — они видны на своём этапе.")}</p>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}{isPlanMessage(error) && <> <a href="/account/plan" style={{ color: "inherit", fontWeight: 700 }}>{t("Открыть тариф →")}</a></>}</p>}
        {warning && <p className={`${styles.notice} ${styles.warn}`} role="status">{warning}</p>}
        <ul className={styles.list} style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
          {team.members.map((member) => (
            <li key={member.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line, #e5e7eb)", paddingBottom: 8 }}>
              <span>
                <strong>{member.name}</strong>{member.you && <> {t("(вы)")}</>}
                {member.email && member.email !== member.name && <><br /><span className={styles.small}>{member.email}</span></>}
                {member.role === "contributor" && <><br /><span className={styles.small}>{member.stageKeys.length ? t("Этапы: {0}", [member.stageKeys.map((key) => team.stages.find((stage) => stage.key === key)?.title ?? key).join(", ")]) : t("Все этапы")}</span></>}
              </span>
              {member.canChange ? (
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <select className={styles.input} style={{ width: "auto", minHeight: 36, padding: "4px 8px" }} aria-label={t("Роль: {0}", [member.name])} value={member.role} disabled={busy}
                    onChange={(event) => void act(`members/${member.id}/role`, { role: event.target.value })}>
                    {team.roles.filter((item) => item.invitable || item.key === member.role).map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}
                  </select>
                  <button type="button" className={styles.ghost} disabled={busy} onClick={() => void act(`members/${member.id}/remove`, undefined, t("Убрать {0} из команды? Доступ закроется сразу, история действий останется.", [member.name]))}>{t("Убрать")}</button>
                </span>
              ) : <span className={styles.small}>{member.roleTitle}</span>}
              {member.canChange && member.role === "contributor" && (
                <details style={{ flexBasis: "100%" }}>
                  <summary className={styles.small}>{t("На каких этапах работает")}</summary>
                  <StagePicker stages={team.stages} value={member.stageKeys} disabled={busy} onChange={(next) => void act(`members/${member.id}/stages`, { stageKeys: next })} />
                </details>
              )}
            </li>
          ))}
        </ul>
        {team.invitations.length > 0 && (
          <>
            <p className={styles.cardTitle} style={{ marginTop: 14 }}>{t("Приглашения")}</p>
            <ul className={styles.list} style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
              {team.invitations.map((item) => (
                <li key={item.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                  <span>{item.email} · {item.roleTitle}<br /><span className={styles.small}>{item.expired ? t("Срок истёк") : t("Действует до {0}", [new Date(item.expiresAt).toLocaleDateString(dateLocale())])}</span></span>
                  <button type="button" className={styles.ghost} disabled={busy} onClick={() => void act(`invitations/${item.id}/revoke`)}>{t("Отменить")}</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {team.canManage && invitable.length > 0 && (
        <section className={styles.card} aria-labelledby="team-invite-title">
          <h2 id="team-invite-title" className={styles.h2}>{t("Пригласить в команду")}</h2>
          <form onSubmit={invite} style={{ display: "grid", gap: 10 }}>
            <label className={styles.small}>{t("Почта")}
              <input className={styles.input} type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
            </label>
            <label className={styles.small}>{t("Роль")}
              <select className={styles.input} value={role} onChange={(event) => setRole(event.target.value)}>
                {invitable.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}
              </select>
            </label>
            {chosen && <p className={styles.small} style={{ margin: 0 }}>{chosen.explanation}</p>}
            {role === "contributor" && (
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className={styles.small}>{t("Этапы (ничего не отмечено — все этапы)")}</legend>
                <StagePicker stages={team.stages} value={stageKeys} disabled={busy} onChange={setStageKeys} />
              </fieldset>
            )}
            <button className={`${styles.button} ${styles.block}`} disabled={busy || !email}>{busy ? t("Отправляем…") : t("Отправить приглашение")}</button>
          </form>
          {sent && (
            <div className={`${styles.notice} ${styles.info}`} style={{ marginTop: 10 }}>
              <p style={{ margin: "0 0 6px" }}>{sent.emailSent ? t("Письмо отправлено. Ссылку можно передать и самому:") : t("Письмо не отправлено — передайте ссылку сами:")}</p>
              <input className={styles.input} readOnly value={sent.url} onFocus={(event) => event.target.select()} aria-label={t("Ссылка-приглашение")} />
              <p className={styles.small} style={{ margin: "6px 0 0" }}>{t("Ссылка работает 7 дней и только для той почты, на которую отправлено приглашение.")}</p>
            </div>
          )}
          <p className={styles.small} style={{ marginTop: 10 }}>{t("Кто проверяет и принимает этап, настраивается на странице этапа: «Кто принимает этап».")}</p>
        </section>
      )}

      <section className={styles.card} aria-labelledby="team-roles-title">
        <h2 id="team-roles-title" className={styles.h2}>{t("Что может каждая роль")}</h2>
        <ul className={styles.list}>{team.roles.map((item) => <li key={item.key}><strong>{item.title}</strong> — {item.explanation}</li>)}</ul>
      </section>
    </div>
  );
}

/** Stages a contributor works on; none ticked means every stage. */
function StagePicker({ stages, value, onChange, disabled }: { stages: Array<{ key: string; title: string }>; value: string[]; onChange: (next: string[]) => void; disabled: boolean }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
      {stages.map((stage) => (
        <label key={stage.key} style={{ display: "flex", gap: 6, alignItems: "center", minHeight: 36 }}>
          <input type="checkbox" disabled={disabled} checked={value.includes(stage.key)} style={{ width: 20, height: 20 }}
            onChange={(event) => onChange(event.target.checked ? [...value, stage.key] : value.filter((key) => key !== stage.key))} />
          {stage.title}
        </label>
      ))}
    </div>
  );
}
