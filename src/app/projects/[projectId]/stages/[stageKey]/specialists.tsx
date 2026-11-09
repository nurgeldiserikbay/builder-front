"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError, type Suggestion } from "@/lib/journey";
import styles from "../../../journey.module.css";

type Assignment = { id: string; email: string; name: string | null; role: "lead" | "consultant"; status: string; aiBudget: number | null; aiUsed: number; inviteExpired: boolean; readUntil: string | null };
type Roles = { lead: { title: string; explanation: string; can: string[] }; consultant: { title: string; explanation: string; can: string[] }; cannot: string[]; afterAcceptance: string };

const statusText: Record<string, string> = { invited: "приглашение отправлено", active: "работает над этапом", completed: "этап принят", revoked: "доступ отозван" };

/** Owner view: who works on this stage and inviting someone new. */
export function SpecialistsPanel({ projectId, stageKey, editable }: { projectId: string; stageKey: string; editable: boolean }) {
  const [list, setList] = useState<Assignment[]>([]);
  const [roles, setRoles] = useState<Roles | null>(null);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"lead" | "consultant">("lead");
  const [email, setEmail] = useState("");
  const [budget, setBudget] = useState("20");
  const [link, setLink] = useState<{ url: string; emailSent: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api<{ assignments: Assignment[]; roles: Roles }>(`/projects/${projectId}/stages/${stageKey}/assignments`);
      setList(data.assignments); setRoles(data.roles);
    } catch (caught) { setError(explainError(caught)); }
  }, [projectId, stageKey]);
  useEffect(() => { void load(); }, [load]);

  async function invite() {
    setBusy(true); setError("");
    try {
      const result = await api<{ inviteUrl: string; emailSent: boolean }>(`/projects/${projectId}/stages/${stageKey}/assignments`, {
        method: "POST", body: JSON.stringify({ email: email.trim(), role, aiBudget: role === "lead" && budget.trim() ? Number(budget) : null }),
      });
      setLink({ url: result.inviteUrl, emailSent: result.emailSent }); setEmail(""); setOpen(false);
      await load();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  async function revoke(item: Assignment) {
    if (!window.confirm(`Отозвать доступ у ${item.name ?? item.email}? Сделанные версии останутся в истории.`)) return;
    try { await api(`/projects/${projectId}/assignments/${item.id}/revoke`, { method: "POST" }); await load(); } catch (caught) { setError(explainError(caught)); }
  }

  const visible = list.filter((item) => item.status !== "revoked");
  const hasLead = visible.some((item) => item.role === "lead" && (item.status === "invited" || item.status === "active"));
  return (
    <section className={styles.card} aria-label="Специалисты">
      <p className={styles.cardTitle}>Специалисты на этапе</p>
      <p className={styles.small} style={{ marginTop: 0 }}>Пригласите человека, который разбирается в этом этапе: он будет давать ИИ инструкции и доводить результат, а принимать будете вы.</p>
      {error && <p className={`${styles.notice} ${styles.error}`}>{error}</p>}
      {link && (
        <div className={`${styles.notice} ${styles.success}`}>
          {link.emailSent ? "Приглашение отправлено на почту. " : ""}Отправьте эту ссылку специалисту — например, в Telegram или WhatsApp. Она действует 7 дней и сработает только для указанной почты.
          <input className={styles.input} readOnly value={link.url} style={{ marginTop: 8 }} onFocus={(event) => event.target.select()} aria-label="Ссылка-приглашение" />
          <button className={styles.secondary} style={{ marginTop: 8 }} onClick={() => void navigator.clipboard?.writeText(link.url)}>Скопировать ссылку</button>
        </div>
      )}
      {visible.length > 0 && (
        <ul className={styles.versions} style={{ marginBottom: 12 }}>
          {visible.map((item) => (
            <li key={item.id}>
              <div className={styles.row}>
                <strong>{item.name ?? item.email}</strong>
                <span className={styles.small}>{item.role === "lead" ? "ведущий" : "консультант"}</span>
              </div>
              <div className={styles.small}>{item.inviteExpired ? "срок приглашения истёк" : statusText[item.status]}{item.role === "lead" ? ` · ИИ: ${item.aiUsed}${item.aiBudget === null ? "" : ` из ${item.aiBudget}`}` : ""}</div>
              {(item.status === "invited" || item.status === "active" || (item.status === "completed" && item.readUntil)) && (
                <button className={styles.danger} style={{ minHeight: 40, marginTop: 6 }} onClick={() => void revoke(item)}>Отозвать доступ</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && !open && <button className={styles.secondary} onClick={() => { setOpen(true); setLink(null); if (hasLead) setRole("consultant"); }}>+ Пригласить специалиста</button>}
      {editable && open && roles && (
        <div>
          <div className={styles.choices} role="group" aria-label="Роль">
            {(["lead", "consultant"] as const).map((value) => (
              <button key={value} type="button" className={styles.choice} aria-pressed={role === value} disabled={value === "lead" && hasLead} onClick={() => setRole(value)}>
                <strong>{roles[value].title}</strong>
                <span className={styles.small}>{value === "lead" && hasLead ? "На этапе уже есть ведущий." : roles[value].explanation}</span>
              </button>
            ))}
          </div>
          <label className={styles.field} style={{ marginTop: 14 }}>
            <span className={styles.label}>Почта специалиста</span>
            <input className={styles.input} type="email" inputMode="email" autoComplete="off" value={email} maxLength={254} placeholder="name@example.kz" onChange={(event) => setEmail(event.target.value)} />
          </label>
          {role === "lead" && (
            <label className={styles.field}>
              <span className={styles.label}>Сколько запросов к ИИ разрешить</span>
              <span className={styles.why}>Запросы оплачиваете вы. Оставьте пустым, чтобы ограничивал только дневной лимит проекта.</span>
              <input className={styles.input} inputMode="numeric" value={budget} maxLength={4} onChange={(event) => setBudget(event.target.value.replace(/\D/g, ""))} />
            </label>
          )}
          <div className={`${styles.notice} ${styles.info}`}>
            <strong>Специалист сможет:</strong>
            <ul className={styles.list}>{roles[role].can.map((item) => <li key={item}>{item}</li>)}</ul>
            <strong>Не сможет:</strong>
            <ul className={styles.list}>{roles.cannot.map((item) => <li key={item}>{item}</li>)}</ul>
            <p style={{ margin: "8px 0 0" }}>{roles.afterAcceptance}</p>
          </div>
          <div className={styles.row}>
            <button className={styles.ghost} onClick={() => setOpen(false)}>Отмена</button>
            <div className={styles.spacer} />
            <button className={styles.button} disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} onClick={invite}>{busy ? "Создаём…" : "Пригласить"}</button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Consultant suggestions: consultants propose, people who can edit apply them as AI instructions or dismiss. */
export function SuggestionsPanel({ projectId, stageKey, suggestions, canSuggest, canResolve, aiReady, targets, onChanged, onError, onMessage }: {
  projectId: string; stageKey: string; suggestions: Suggestion[]; canSuggest: boolean; canResolve: boolean; aiReady: boolean;
  targets: Array<{ key: string; label: string }>; onChanged: () => Promise<unknown>; onError: (text: string) => void; onMessage: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState("");
  const proposed = suggestions.filter((item) => item.status === "proposed");
  if (!canSuggest && proposed.length === 0) return null;

  async function act(label: string, action: () => Promise<void>) {
    setBusy(label);
    try { await action(); } catch (caught) { onError(explainError(caught)); } finally { setBusy(""); }
  }

  return (
    <section className={styles.card} aria-label="Предложения консультантов">
      <p className={styles.cardTitle}>{canSuggest ? "Предложить правку" : "Предложения консультантов"}</p>
      {canSuggest && (
        <>
          <p className={styles.small} style={{ marginTop: 0 }}>Опишите, что улучшить. Ведущий этапа или владелец решит, отправить ли это ИИ.</p>
          <textarea className={styles.textarea} value={text} maxLength={1000} aria-label="Ваше предложение" placeholder="Например: в первом экране упомяните бесплатное пробное занятие" onChange={(event) => setText(event.target.value)} />
          {targets.length > 0 && (
            <select className={styles.select} style={{ marginTop: 8 }} value={target} aria-label="К какому блоку" onChange={(event) => setTarget(event.target.value)}>
              <option value="">Ко всему этапу</option>
              {targets.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          )}
          <button className={`${styles.button} ${styles.block}`} style={{ marginTop: 10 }} disabled={Boolean(busy) || text.trim().length < 2}
            onClick={() => void act("suggest", async () => {
              await api(`/projects/${projectId}/stages/${stageKey}/suggestions`, { method: "POST", body: JSON.stringify({ text: text.trim(), ...(target ? { targetKey: target } : {}) }) });
              setText(""); setTarget(""); await onChanged(); onMessage("Предложение отправлено ведущему этапа.");
            })}>Отправить предложение</button>
        </>
      )}
      {proposed.length > 0 && (
        <ul className={styles.versions} style={{ marginTop: 12 }}>
          {proposed.map((item) => (
            <li key={item.id}>
              <div>{item.text}</div>
              <div className={styles.small}>{item.author ?? "Консультант"}{item.targetKey ? ` · блок «${targets.find((target) => target.key === item.targetKey)?.label ?? item.targetKey}»` : ""}</div>
              {canResolve && (
                <div className={styles.row} style={{ marginTop: 6 }}>
                  <button className={styles.secondary} style={{ minHeight: 40 }} disabled={Boolean(busy) || !aiReady}
                    onClick={() => void act(item.id, async () => { await api(`/projects/${projectId}/stages/${stageKey}/suggestions/${item.id}/apply`, { method: "POST" }); await onChanged(); onMessage("ИИ учёл предложение — проверьте новую версию."); })}>
                    {busy === item.id ? "ИИ работает…" : "✨ Отправить ИИ"}</button>
                  <button className={styles.ghost} style={{ minHeight: 40 }} disabled={Boolean(busy)}
                    onClick={() => void act(`d${item.id}`, async () => { await api(`/projects/${projectId}/stages/${stageKey}/suggestions/${item.id}/dismiss`, { method: "POST" }); await onChanged(); })}>Отклонить</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
