"use client";

import { t } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatTenge } from "@/lib/money";
import { isPlanMessage, explainError, type Suggestion } from "@/lib/journey";
import styles from "../../../journey.module.css";

type Assignment = {
  id: string; email: string; name: string | null; profileId: string | null; role: "lead" | "consultant"; status: string; aiBudget: number | null; aiUsed: number; inviteExpired: boolean; readUntil: string | null; termsText: string;
  review: { rating: number; text: string | null; reply: string | null } | null; canReview: boolean;
};
type Roles = { lead: { title: string; explanation: string; can: string[] }; consultant: { title: string; explanation: string; can: string[] }; cannot: string[]; afterAcceptance: string };

const statusText: Record<string, string> = { invited: t("приглашение отправлено"), active: t("работает над этапом"), completed: t("этап принят"), revoked: t("доступ отозван") };

/** Owner view: who works on this stage and inviting someone new. */
export function SpecialistsPanel({ projectId, stageKey, editable }: { projectId: string; stageKey: string; editable: boolean }) {
  const [list, setList] = useState<Assignment[]>([]);
  const [roles, setRoles] = useState<Roles | null>(null);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"lead" | "consultant">("lead");
  const [email, setEmail] = useState("");
  // Picked in the catalog: invited by profile, the address stays on the server.
  const [invitee, setInvitee] = useState<{ id: string; name: string } | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [budget, setBudget] = useState("20");
  const [pay, setPay] = useState<"none" | "fixed" | "hourly">("hourly");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [limit, setLimit] = useState("10");
  const [weekly, setWeekly] = useState("");
  const [revisions, setRevisions] = useState("2");
  const [onlyResult, setOnlyResult] = useState(true);
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
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const id = query.get("inviteProfile");
    if (id && /^[0-9a-f-]{36}$/i.test(id) && editable) { setInvitee({ id, name: (query.get("inviteName") ?? "").slice(0, 80) || t("специалист из каталога") }); setOpen(true); }
  }, [editable]);
  const catalogUrl = `/specialists?invite=1&project=${projectId}&stage=${stageKey}`;

  async function sendReview(item: Assignment) {
    setBusy(true); setError("");
    try {
      await api(`/projects/${projectId}/assignments/${item.id}/review`, { method: "POST", body: JSON.stringify({ rating, text: reviewText.trim() || null }) });
      setReviewing(null); await load();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  async function invite() {
    setBusy(true); setError("");
    try {
      const result = await api<{ inviteUrl: string; emailSent: boolean }>(`/projects/${projectId}/stages/${stageKey}/assignments`, {
        method: "POST", body: JSON.stringify({ ...(invitee ? { profileId: invitee.id } : { email: email.trim() }), role, aiBudget: role === "lead" && budget.trim() ? Number(budget) : null, ...termsBody() }),
      });
      setLink({ url: result.inviteUrl, emailSent: result.emailSent }); setEmail(""); setInvitee(null); setOpen(false);
      window.history.replaceState(null, "", window.location.pathname);
      await load();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  function termsBody() {
    if (pay === "fixed") return { payKind: pay, fixedAmount: Number(amount), ...(revisions ? { revisionsIncluded: Number(revisions) } : {}) };
    if (pay === "hourly") return { payKind: pay, hourlyRate: Number(rate), hourLimit: Number(limit), ...(weekly ? { weeklyHourLimit: Number(weekly) } : {}), onlyResultTime: onlyResult };
    return { payKind: pay };
  }
  const termsValid = pay === "none" || (pay === "fixed" ? Number(amount) >= 1000 : Number(rate) >= 500 && Number(limit) >= 1 && Number(limit) <= 1000 && (!weekly || (Number(weekly) >= 1 && Number(weekly) <= 80)));
  const digits = (set: (value: string) => void, max: number) => (event: { target: { value: string } }) => set(event.target.value.replace(/\D/g, "").slice(0, max));

  async function revoke(item: Assignment) {
    if (!window.confirm(t("Отозвать доступ у {0}? Сделанные версии останутся в истории.", [item.name ?? item.email]))) return;
    try { await api(`/projects/${projectId}/assignments/${item.id}/revoke`, { method: "POST" }); await load(); } catch (caught) { setError(explainError(caught)); }
  }

  const visible = list.filter((item) => item.status !== "revoked");
  const hasLead = visible.some((item) => item.role === "lead" && (item.status === "invited" || item.status === "active"));
  useEffect(() => { if (open && hasLead && role === "lead") setRole("consultant"); }, [open, hasLead, role]);
  return (
    <section className={styles.card} aria-label={t("Специалисты")}>
      <p className={styles.cardTitle}>{t("Специалисты на этапе")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Пригласите человека, который разбирается в этом этапе: он будет давать ИИ инструкции и доводить результат, а принимать будете вы.")}</p>
      {error && <p className={`${styles.notice} ${styles.error}`}>{error}{isPlanMessage(error) && <> <a href="/account/plan" style={{ color: "inherit", fontWeight: 700 }}>{t("Открыть тариф →")}</a></>}</p>}
      {link && (
        <div className={`${styles.notice} ${styles.success}`}>
          {link.emailSent ? t("Приглашение отправлено на почту. ") : ""}{t("Отправьте эту ссылку специалисту — например, в Telegram или WhatsApp. Она действует 7 дней и сработает только для указанной почты.")}
          <input className={styles.input} readOnly value={link.url} style={{ marginTop: 8 }} onFocus={(event) => event.target.select()} aria-label={t("Ссылка-приглашение")} />
          <button className={styles.secondary} style={{ marginTop: 8 }} onClick={() => void navigator.clipboard?.writeText(link.url)}>{t("Скопировать ссылку")}</button>
        </div>
      )}
      {visible.length > 0 && (
        <ul className={styles.versions} style={{ marginBottom: 12 }}>
          {visible.map((item) => (
            <li key={item.id}>
              <div className={styles.row}>
                {item.profileId ? <a href={`/specialists/${item.profileId}`}><strong>{item.name ?? item.email}</strong></a> : <strong>{item.name ?? item.email}</strong>}
                <span className={styles.small}>{item.role === "lead" ? t("ведущий") : t("консультант")}</span>
              </div>
              <div className={styles.small}>{item.inviteExpired ? t("срок приглашения истёк") : statusText[item.status]}{item.role === "lead" ? t(" · ИИ: {0}{1}", [item.aiUsed, item.aiBudget === null ? "" : t(" из {0}", [item.aiBudget])]) : ""}</div>
              <div className={styles.small}>{item.termsText}</div>
              {item.review && reviewing !== item.id && (
                <p className={styles.small} style={{ margin: "6px 0 0" }}>
                  {t("Ваш отзыв:")}{" "}<span style={{ color: "#c98a00" }}>{"★".repeat(item.review.rating)}</span>{item.review.text ? ` — ${item.review.text}` : ""}
                  {item.review.reply ? <><br />{t("Ответ:")}{" "}{item.review.reply}</> : null}
                </p>
              )}
              {item.canReview && reviewing !== item.id && (
                <button className={styles.secondary} style={{ minHeight: 40, marginTop: 6, marginRight: 8 }} onClick={() => { setReviewing(item.id); setRating(item.review?.rating ?? 0); setReviewText(item.review?.text ?? ""); }}>
                  {item.review ? t("Изменить отзыв") : t("Оставить отзыв")}
                </button>
              )}
              {reviewing === item.id && (
                <div style={{ marginTop: 8 }}>
                  <div className={styles.row} role="radiogroup" aria-label={t("Оценка")}>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={t("{0} из 5", [value])} className={styles.ghost}
                        style={{ minWidth: 44, fontSize: 24, color: value <= rating ? "#c98a00" : "var(--line)", padding: 0 }} onClick={() => setRating(value)}>★</button>
                    ))}
                  </div>
                  <textarea className={styles.textarea} style={{ minHeight: 80, marginTop: 8 }} maxLength={1000} value={reviewText} onChange={(event) => setReviewText(event.target.value)} aria-label={t("Что понравилось или что можно улучшить")} placeholder={t("Что понравилось или что можно улучшить")} />
                  <p className={styles.why}>{t("Отзыв увидят в каталоге без вашего имени и названия проекта. Изменить его можно 14 дней. При оценке 1–2 напишите, что пошло не так.")}</p>
                  <div className={styles.row}>
                    <button className={styles.button} disabled={busy || rating === 0 || (rating <= 2 && reviewText.trim().length === 0)} onClick={() => void sendReview(item)}>{busy ? t("Сохраняем…") : t("Сохранить отзыв")}</button>
                    <button className={styles.ghost} onClick={() => setReviewing(null)}>{t("Отмена")}</button>
                  </div>
                </div>
              )}
              {(item.status === "invited" || item.status === "active" || (item.status === "completed" && item.readUntil)) && (
                <button className={styles.danger} style={{ minHeight: 40, marginTop: 6 }} onClick={() => void revoke(item)}>{t("Отозвать доступ")}</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && !open && (
        <div className={styles.row}>
          <button className={styles.secondary} onClick={() => { setOpen(true); setLink(null); if (hasLead) setRole("consultant"); }}>{t("+ Пригласить специалиста")}</button>
          <a className={styles.ghost} href={catalogUrl}>{t("Найти в каталоге")}</a>
        </div>
      )}
      {editable && open && roles && (
        <div>
          <div className={styles.choices} role="group" aria-label={t("Роль")}>
            {(["lead", "consultant"] as const).map((value) => (
              <button key={value} type="button" className={styles.choice} aria-pressed={role === value} disabled={value === "lead" && hasLead} onClick={() => setRole(value)}>
                <strong>{roles[value].title}</strong>
                <span className={styles.small}>{value === "lead" && hasLead ? t("На этапе уже есть ведущий.") : roles[value].explanation}</span>
              </button>
            ))}
          </div>
          {invitee ? (
            <div className={`${styles.notice} ${styles.info}`} style={{ marginTop: 14 }}>
              {t("Приглашаете из каталога:")}{" "}<strong>{invitee.name}</strong>{t(". Приглашение придёт на почту из его аккаунта.")}
              <div><button type="button" className={styles.ghost} onClick={() => { setInvitee(null); window.history.replaceState(null, "", window.location.pathname); }}>{t("Указать почту вместо этого")}</button></div>
            </div>
          ) : (
            <label className={styles.field} style={{ marginTop: 14 }}>
              <span className={styles.label}>{t("Почта специалиста")}</span>
              <input className={styles.input} type="email" inputMode="email" autoComplete="off" value={email} maxLength={254} placeholder="name@example.kz" onChange={(event) => setEmail(event.target.value)} />
              <span className={styles.why}>{t("Нет знакомого специалиста?")}{" "}<a href={catalogUrl}>{t("Найти в каталоге →")}</a></span>
            </label>
          )}
          {role === "lead" && (
            <label className={styles.field}>
              <span className={styles.label}>{t("Сколько запросов к ИИ разрешить")}</span>
              <span className={styles.why}>{t("Запросы оплачиваете вы. Оставьте пустым, чтобы ограничивал только дневной лимит проекта.")}</span>
              <input className={styles.input} inputMode="numeric" value={budget} maxLength={4} onChange={(event) => setBudget(event.target.value.replace(/\D/g, ""))} />
            </label>
          )}
          <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: "14px 0 0" }}>
            <legend className={styles.label}>{t("Как вы платите специалисту")}</legend>
            <span className={styles.why}>{t("Заранее ничего не платится. Платформа считает время, а сумма начисляется, когда вы примете результат этапа.")}</span>
            <div className={styles.choices} role="group" aria-label={t("Оплата")}>
              {([["hourly", t("Почасово"), t("Ставка за час и лимит часов. Вы видите, когда он работал и были ли действия.")], ["fixed", t("Цена за этап"), t("Одна сумма за принятый результат, сколько бы времени ни ушло.")], ["none", t("Договоримся сами"), t("Платформа только покажет время, деньги — не через неё.")]] as const).map(([value, title, text]) => (
                <button key={value} type="button" className={styles.choice} aria-pressed={pay === value} onClick={() => setPay(value)}>
                  <strong>{title}</strong><span className={styles.small}>{text}</span>
                </button>
              ))}
            </div>
          </fieldset>
          {pay === "hourly" && (
            <>
              <div className={styles.row}>
                <label className={styles.field} style={{ flex: 1 }}><span className={styles.label}>{t("Ставка, ₸ в час")}</span>
                  <input className={styles.input} inputMode="numeric" value={rate} placeholder="5000" onChange={digits(setRate, 7)} /></label>
                <label className={styles.field} style={{ flex: 1 }}><span className={styles.label}>{t("Лимит, часов")}</span>
                  <input className={styles.input} inputMode="numeric" value={limit} onChange={digits(setLimit, 4)} /></label>
              </div>
              <label className={styles.field}><span className={styles.label}>{t("Не больше часов в неделю")}</span>
                <span className={styles.why}>{t("Необязательно. Когда лимит закончится, учёт остановится.")}</span>
                <input className={styles.input} inputMode="numeric" value={weekly} placeholder={t("без ограничения")} onChange={digits(setWeekly, 2)} /></label>
              <label className={styles.row} style={{ alignItems: "flex-start", gap: 10, margin: "4px 0 12px" }}>
                <input type="checkbox" checked={onlyResult} onChange={(event) => setOnlyResult(event.target.checked)} style={{ width: 22, height: 22 }} />
                <span><strong>{t("Платить только за время с результатом")}</strong><br /><span className={styles.small}>{t("Отрезки, когда страница была открыта, но на этапе ничего не делалось, не оплачиваются.")}</span></span>
              </label>
              {Number(rate) >= 500 && Number(limit) >= 1 && <p className={styles.small}>{t("Максимум за этап:")}{" "}{formatTenge(Number(rate) * Number(limit))}</p>}
            </>
          )}
          {pay === "fixed" && (
            <div className={styles.row}>
              <label className={styles.field} style={{ flex: 2 }}><span className={styles.label}>{t("Сумма за этап, ₸")}</span>
                <input className={styles.input} inputMode="numeric" value={amount} placeholder="150000" onChange={digits(setAmount, 9)} /></label>
              <label className={styles.field} style={{ flex: 1 }}><span className={styles.label}>{t("Правок входит")}</span>
                <input className={styles.input} inputMode="numeric" value={revisions} onChange={digits(setRevisions, 2)} /></label>
            </div>
          )}
          <div className={`${styles.notice} ${styles.info}`}>
            <strong>{t("Специалист сможет:")}</strong>
            <ul className={styles.list}>{roles[role].can.map((item) => <li key={item}>{item}</li>)}</ul>
            <strong>{t("Не сможет:")}</strong>
            <ul className={styles.list}>{roles.cannot.map((item) => <li key={item}>{item}</li>)}</ul>
            <p style={{ margin: "8px 0 0" }}>{roles.afterAcceptance}</p>
          </div>
          <div className={styles.row}>
            <button className={styles.ghost} onClick={() => setOpen(false)}>{t("Отмена")}</button>
            <div className={styles.spacer} />
            <button className={styles.button} disabled={busy || !termsValid || (!invitee && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))} onClick={invite}>{busy ? t("Создаём…") : t("Пригласить")}</button>
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
    <section className={styles.card} aria-label={t("Предложения консультантов")}>
      <p className={styles.cardTitle}>{canSuggest ? t("Предложить правку") : t("Предложения консультантов")}</p>
      {canSuggest && (
        <>
          <p className={styles.small} style={{ marginTop: 0 }}>{t("Опишите, что улучшить. Ведущий этапа или владелец решит, отправить ли это ИИ.")}</p>
          <textarea className={styles.textarea} value={text} maxLength={1000} aria-label={t("Ваше предложение")} placeholder={t("Например: в первом экране упомяните бесплатное пробное занятие")} onChange={(event) => setText(event.target.value)} />
          {targets.length > 0 && (
            <select className={styles.select} style={{ marginTop: 8 }} value={target} aria-label={t("К какому блоку")} onChange={(event) => setTarget(event.target.value)}>
              <option value="">{t("Ко всему этапу")}</option>
              {targets.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          )}
          <button className={`${styles.button} ${styles.block}`} style={{ marginTop: 10 }} disabled={Boolean(busy) || text.trim().length < 2}
            onClick={() => void act("suggest", async () => {
              await api(`/projects/${projectId}/stages/${stageKey}/suggestions`, { method: "POST", body: JSON.stringify({ text: text.trim(), ...(target ? { targetKey: target } : {}) }) });
              setText(""); setTarget(""); await onChanged(); onMessage(t("Предложение отправлено ведущему этапа."));
            })}>{t("Отправить предложение")}</button>
        </>
      )}
      {proposed.length > 0 && (
        <ul className={styles.versions} style={{ marginTop: 12 }}>
          {proposed.map((item) => (
            <li key={item.id}>
              <div>{item.text}</div>
              <div className={styles.small}>{item.author ?? t("Консультант")}{item.targetKey ? t(" · блок «{0}»", [targets.find((target) => target.key === item.targetKey)?.label ?? item.targetKey]) : ""}</div>
              {canResolve && (
                <div className={styles.row} style={{ marginTop: 6 }}>
                  <button className={styles.secondary} style={{ minHeight: 40 }} disabled={Boolean(busy) || !aiReady}
                    onClick={() => void act(item.id, async () => { await api(`/projects/${projectId}/stages/${stageKey}/suggestions/${item.id}/apply`, { method: "POST" }); await onChanged(); onMessage(t("ИИ учёл предложение — проверьте новую версию.")); })}>
                    {busy === item.id ? t("ИИ работает…") : t("✨ Отправить ИИ")}</button>
                  <button className={styles.ghost} style={{ minHeight: 40 }} disabled={Boolean(busy)}
                    onClick={() => void act(`d${item.id}`, async () => { await api(`/projects/${projectId}/stages/${stageKey}/suggestions/${item.id}/dismiss`, { method: "POST" }); await onChanged(); })}>{t("Отклонить")}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
