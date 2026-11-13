"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError, saveFromApi } from "@/lib/journey";
import { formatTenge } from "@/lib/money";
import styles from "../../../journey.module.css";

type Message = { id: string; side: "owner" | "specialist" | "staff"; mine: boolean; text: string; createdAt: string; file: { name: string; mime: string; bytes: number } | null };
type Dispute = {
  id: string; kind: string; openedBySide: "owner" | "specialist"; mine: boolean; claim: string; claimAmount: number | null; status: "open" | "resolved" | "withdrawn";
  outcome: string | null; resolutionNote: string | null; resolvedAt: string | null; createdAt: string; paymentCreated: boolean; messages: Message[]; canWrite: boolean; canWithdraw: boolean;
};
type Data = { side: "owner" | "specialist"; disputes: Dispute[]; canOpen: boolean; kinds: string[]; stageTitle: string };

const kindLabels: Record<string, { title: string; hint: string }> = {
  payment: { title: t("Не заплатили за работу"), hint: t("Например, этап закрыли без приёмки или начислили меньше условий.") },
  refund: { title: t("Хочу вернуть деньги"), hint: t("Оплатили через BuildPath, но работа не соответствует условиям.") },
  quality: { title: t("Работа не по условиям"), hint: t("Результат сильно расходится с тем, о чём договаривались.") },
  other: { title: t("Другое"), hint: t("Любое разногласие по этому этапу.") },
};
const outcomeLabels: Record<string, string> = {
  specialist: t("в пользу специалиста"), owner: t("в пользу владельца"), split: t("поровну между сторонами"), no_change: t("без изменений"),
};
const statusLabels: Record<string, string> = { open: t("на рассмотрении"), resolved: t("решён"), withdrawn: t("отозван") };

/**
 * Disputes about one specialist's work on the stage. Both sides see the same thread; BuildPath support decides from the
 * stage history. While a dispute is open, BuildPath does not transfer the stage money to the specialist.
 */
export function DisputesBlock({ assignmentId }: { assignmentId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState(false);
  const [kind, setKind] = useState("");
  const [amount, setAmount] = useState("");
  const [claim, setClaim] = useState("");
  const [reply, setReply] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => api<Data>(`/assignments/${assignmentId}/disputes`).then(setData).catch(() => undefined), [assignmentId]);
  useEffect(() => { void load(); }, [load]);

  async function act(work: () => Promise<Data>) {
    setBusy(true); setError("");
    try { setData(await work()); } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }
  const open = () => act(async () => {
    const next = await api<Data>(`/assignments/${assignmentId}/disputes`, { method: "POST", body: JSON.stringify({ kind, claim: claim.trim(), amount: amount ? Number(amount) : null }) });
    setForm(false); setClaim(""); setAmount(""); setKind("");
    return next;
  });
  const send = (id: string) => act(async () => {
    const next = await api<Data>(`/disputes/${id}/messages`, { method: "POST", body: JSON.stringify({ text: (reply[id] ?? "").trim() }) });
    setReply((current) => ({ ...current, [id]: "" }));
    return next;
  });
  const attach = (id: string, file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError(t("Файл больше 5 МБ. Сожмите скриншот или PDF.")); return; }
    void act(async () => {
      const form = new FormData();
      form.append("file", file, file.name);
      if ((reply[id] ?? "").trim().length >= 2) form.append("text", (reply[id] ?? "").trim());
      const next = await api<Data>(`/disputes/${id}/attachments`, { method: "POST", body: form });
      setReply((current) => ({ ...current, [id]: "" }));
      return next;
    });
  };
  const withdraw = (id: string) => { if (window.confirm(t("Отозвать спор? Его можно будет открыть заново."))) void act(() => api<Data>(`/disputes/${id}/withdraw`, { method: "POST" })); };

  if (!data) return null;
  const who = (message: Message) => message.mine ? t("Вы") : message.side === "staff" ? t("Поддержка BuildPath") : message.side === "owner" ? t("Владелец") : t("Специалист");
  const needsAmount = kind === "payment" || kind === "refund";
  const valid = kind && claim.trim().length >= 20 && (!needsAmount || Number(amount) >= 1);

  return (
    <div style={{ marginTop: 10 }}>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {data.disputes.map((dispute) => (
        <div key={dispute.id} className={`${styles.notice} ${dispute.status === "open" ? styles.warn : styles.info}`} style={{ marginBottom: 10 }}>
          <strong>{t("Спор:")} {kindLabels[dispute.kind]?.title ?? dispute.kind}</strong>{" · "}{statusLabels[dispute.status]}
          <div className={styles.small}>{dispute.mine ? t("Открыли вы") : dispute.openedBySide === "owner" ? t("Открыл владелец") : t("Открыл специалист")} · {new Date(dispute.createdAt).toLocaleDateString(dateLocale())}{dispute.claimAmount !== null ? ` · ${formatTenge(dispute.claimAmount)}` : ""}</div>
          <p style={{ margin: "6px 0", whiteSpace: "pre-line" }}>{dispute.claim}</p>
          {dispute.status === "open" && <p className={styles.small} style={{ margin: "0 0 6px" }}>{t("Поддержка разберёт спор по истории этапа: версии, табель, сообщения. Пока спор открыт, деньги за этот этап специалисту не переводятся.")}</p>}
          {dispute.messages.length > 0 && (
            <ul className={styles.versions} style={{ margin: "6px 0" }}>
              {dispute.messages.map((message) => (
                <li key={message.id}><strong>{who(message)}:</strong> <span style={{ whiteSpace: "pre-line" }}>{message.text}</span> <span className={styles.small}>{new Date(message.createdAt).toLocaleDateString(dateLocale())}</span>
                  {message.file && <> <button type="button" className={styles.ghost} style={{ minHeight: 36, padding: "0 8px" }} onClick={() => void saveFromApi(`/disputes/${dispute.id}/files/${message.id}`, message.file!.name).catch((caught) => setError(explainError(caught)))}>📎 {message.file.name}</button></>}
                </li>
              ))}
            </ul>
          )}
          {dispute.status === "resolved" && (
            <p style={{ margin: "6px 0 0" }}>
              <strong>{t("Решение поддержки:")}</strong>{" "}{outcomeLabels[dispute.outcome ?? ""] ?? ""}. {dispute.resolutionNote}
              {dispute.paymentCreated ? <span className={styles.small} style={{ display: "block" }}>{t("По решению начислена оплата специалисту — она в списке начислений выше.")}</span> : null}
            </p>
          )}
          {dispute.canWrite && (
            <div style={{ marginTop: 6 }}>
              <textarea className={styles.textarea} style={{ minHeight: 70 }} maxLength={2000} value={reply[dispute.id] ?? ""} aria-label={t("Ваше объяснение")} placeholder={t("Ваше объяснение: что произошло, где это видно в истории этапа")}
                onChange={(event) => setReply((current) => ({ ...current, [dispute.id]: event.target.value }))} />
              <div className={styles.row}>
                <button className={styles.secondary} disabled={busy || (reply[dispute.id] ?? "").trim().length < 2} onClick={() => void send(dispute.id)}>{t("Отправить")}</button>
                <label className={styles.ghost} style={{ cursor: busy ? "not-allowed" : "pointer" }}>
                  📎 {t("Скриншот или PDF")}
                  <input type="file" hidden disabled={busy} accept=".png,.jpg,.jpeg,.webp,.pdf" onChange={(event) => { attach(dispute.id, event.target.files?.[0]); event.target.value = ""; }} />
                </label>
                {dispute.canWithdraw && <button className={styles.ghost} disabled={busy} onClick={() => withdraw(dispute.id)}>{t("Отозвать спор")}</button>}
              </div>
            </div>
          )}
        </div>
      ))}
      {data.canOpen && !form && (
        <button className={styles.ghost} onClick={() => setForm(true)}>{data.side === "owner" ? t("Не согласны с работой или оплатой? Открыть спор") : t("Не согласны с оплатой? Открыть спор")}</button>
      )}
      {form && (
        <div className={styles.card} style={{ marginTop: 8 }}>
          <p className={styles.cardTitle}>{t("Открыть спор")}</p>
          <p className={styles.small} style={{ marginTop: 0 }}>{t("Сначала попробуйте договориться напрямую. Если не получается — опишите, что произошло. Вторая сторона увидит ваше описание и сможет ответить, а поддержка BuildPath примет решение по истории этапа.")}</p>
          <div className={styles.choices} role="radiogroup" aria-label={t("Что случилось")}>
            {data.kinds.map((value) => (
              <button key={value} type="button" role="radio" aria-checked={kind === value} className={styles.choice} aria-pressed={kind === value} onClick={() => setKind(value)}>
                <strong>{kindLabels[value]?.title ?? value}</strong><span className={styles.small}>{kindLabels[value]?.hint}</span>
              </button>
            ))}
          </div>
          {needsAmount && (
            <label className={styles.field} style={{ marginTop: 12 }}>
              <span className={styles.label}>{kind === "payment" ? t("Сколько, по-вашему, должны заплатить, ₸") : t("Сколько хотите вернуть, ₸")}</span>
              <input className={styles.input} inputMode="numeric" value={amount} maxLength={9} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} />
            </label>
          )}
          <label className={styles.field} style={{ marginTop: needsAmount ? 0 : 12 }}>
            <span className={styles.label}>{t("Что произошло")}</span>
            <span className={styles.why}>{t("Коротко и по фактам: о чём договаривались, что сделано, с чем вы не согласны. Не меньше 20 символов.")}</span>
            <textarea className={styles.textarea} maxLength={2000} value={claim} onChange={(event) => setClaim(event.target.value)} />
          </label>
          <div className={styles.row}>
            <button className={styles.button} disabled={busy || !valid} onClick={() => void open()}>{busy ? t("Отправляем…") : t("Открыть спор")}</button>
            <button className={styles.ghost} disabled={busy} onClick={() => setForm(false)}>{t("Отмена")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
