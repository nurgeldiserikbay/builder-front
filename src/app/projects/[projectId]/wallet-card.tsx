"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { formatTenge } from "@/lib/money";
import styles from "../journey.module.css";

type Wallet = {
  mode: "off" | "prepaid"; provider: "freedompay" | "mock" | null; balance: number; paid: number; spent: number;
  minTopUp: number; maxTopUp: number; typicalRequest: number; requestsLeft: number | null;
  refunded: number; pendingRefund: number;
  topUps: Array<{
    id: string; amount: number; status: "created" | "paid" | "failed" | "expired"; createdAt: string; paidAt: string | null; provider: string;
    refunded: number; refundable: number; refundStatus: "requested" | "refunded" | "rejected" | null; refundRequested: number | null; refundNote: string | null;
  }>;
};
const statusText: Record<Wallet["topUps"][number]["status"], string> = { created: "ждёт оплаты", paid: "оплачено", failed: "не оплачено", expired: "истекло" };

/**
 * Prepaid balance of the project: what is left, roughly how many AI requests it covers, and «Пополнить» through the
 * payment provider. Shown only when prepaid billing is on; the provider's confirmation, not the return page, credits money.
 */
export default function WalletCard({ projectId }: { projectId: string }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const load = useCallback(async () => {
    try { setWallet(await api<Wallet>(`/projects/${projectId}/wallet`)); } catch (caught) { if (!(caught instanceof ApiError && (caught.status === 403 || caught.status === 404))) setError(explainError(caught)); }
  }, [projectId]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (payment) {
      setNotice(payment === "success"
        ? { ok: true, text: "Спасибо! Деньги зачислятся, как только платёжный сервис подтвердит оплату — обычно сразу." }
        : { ok: false, text: "Оплата не прошла. Деньги не списаны — можно попробовать ещё раз." });
      window.history.replaceState(null, "", window.location.pathname);
    }
    void load();
    // The provider's confirmation can arrive a few seconds after the return.
    if (payment === "success") { const timer = window.setTimeout(() => void load(), 4000); return () => window.clearTimeout(timer); }
  }, [load]);

  // Shown in prepaid mode, and also afterwards while there is paid money that could be returned.
  if (!wallet || (wallet.mode !== "prepaid" && !wallet.topUps.some((item) => item.status === "paid"))) return error ? <p className={`${styles.notice} ${styles.error}`}>{error}</p> : null;
  const value = Number(amount);
  const valid = Number.isInteger(value) && value >= wallet.minTopUp && value <= wallet.maxTopUp;
  const pending = wallet.topUps.some((item) => item.status === "created");

  async function topUp(sum: number) {
    setBusy(true); setError("");
    try {
      const { redirectUrl } = await api<{ redirectUrl: string }>(`/projects/${projectId}/wallet/top-ups`, { method: "POST", body: JSON.stringify({ amount: sum }) });
      window.location.assign(redirectUrl);
    } catch (caught) { setError(explainError(caught)); setBusy(false); }
  }

  async function requestRefund(id: string) {
    setBusy(true); setError("");
    try {
      setWallet(await api<Wallet>(`/projects/${projectId}/wallet/top-ups/${id}/refund`, { method: "POST", body: JSON.stringify({ amount: Number(refundAmount), reason: refundReason }) }));
      setRefundFor(null); setNotice({ ok: true, text: "Заявка на возврат отправлена. Эта сумма отложена и не тратится на ИИ, пока мы её не рассмотрим." });
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  async function cancelRefund(id: string) {
    setBusy(true); setError("");
    try { setWallet(await api<Wallet>(`/projects/${projectId}/wallet/top-ups/${id}/refund`, { method: "DELETE" })); } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  const refundState = (item: Wallet["topUps"][number]) => {
    if (item.refundStatus === "requested") return `возврат ${formatTenge(item.refundRequested ?? 0)} на рассмотрении`;
    if (item.refundStatus === "rejected") return `в возврате отказано${item.refundNote ? `: ${item.refundNote}` : ""}`;
    if (item.refunded > 0) return `возвращено ${formatTenge(item.refunded)}`;
    return null;
  };

  return (
    <section className={styles.card} aria-labelledby="wallet-title">
      <p className={styles.kicker}>Баланс проекта</p>
      <h2 id="wallet-title" className={styles.h2}>{formatTenge(wallet.balance)}</h2>
      <p style={{ margin: "0 0 8px" }}>
        Из баланса оплачиваются запросы к ИИ в этом проекте.{wallet.requestsLeft !== null ? ` Хватит примерно на ${wallet.requestsLeft} запросов (один обычный запрос ≈ ${formatTenge(wallet.typicalRequest)}).` : ""}
        {wallet.balance < wallet.typicalRequest ? " Когда денег не хватает, ИИ не отвечает — работать вручную можно и дальше." : ""}
      </p>
      {notice && <p className={`${styles.notice} ${notice.ok ? styles.success : styles.error}`} role="status">{notice.text}</p>}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {wallet.mode !== "prepaid" ? <p className={styles.small}>Оплата ИИ с баланса сейчас выключена. Оставшиеся деньги можно вернуть ниже.</p> : wallet.provider ? (
        <>
          <div className={styles.chips} role="group" aria-label="Сумма пополнения">
            {[wallet.minTopUp, wallet.minTopUp * 3, wallet.minTopUp * 5].filter((sum) => sum <= wallet.maxTopUp).map((sum) => (
              <button key={sum} type="button" className={styles.chip} disabled={busy} onClick={() => void topUp(sum)}>Пополнить на {formatTenge(sum)}</button>
            ))}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); if (valid) void topUp(value); }} style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input className={styles.input} inputMode="numeric" aria-label="Другая сумма, ₸" placeholder="Своя сумма, ₸" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, "").slice(0, 6))} />
            <button className={styles.secondary} disabled={busy || !valid}>{busy ? "…" : "Оплатить"}</button>
          </form>
          <p className={styles.small}>От {formatTenge(wallet.minTopUp)} до {formatTenge(wallet.maxTopUp)}. {wallet.provider === "mock" ? "Тестовый режим: настоящие деньги не списываются." : "Оплата картой на странице Freedom Pay. BuildPath не видит данные карты."}</p>
        </>
      ) : <p className={`${styles.notice} ${styles.info}`}>Оплата пока не подключена на этом сервере BuildPath.</p>}
      {pending && <p className={styles.small}>Есть платёж, который ждёт подтверждения. Если вы оплатили, он зачислится автоматически.</p>}
      {wallet.topUps.length > 0 && (
        <details open={Boolean(refundFor)}><summary className={styles.small}>История пополнений и возвраты</summary>
          {wallet.topUps.map((item) => (
            <div key={item.id} style={{ borderTop: "1px solid #e3e7e3", padding: "8px 0" }}>
              <div>{new Date(item.createdAt).toLocaleDateString("ru-RU")}: <strong>{formatTenge(item.amount)}</strong> — {statusText[item.status]}{refundState(item) ? `, ${refundState(item)}` : ""}</div>
              {item.status === "paid" && (
                <div className={styles.row} style={{ flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  <a className={styles.ghost} href={`/projects/${projectId}/receipts/top-up/${item.id}`}>Квитанция</a>
                  {item.refundStatus === "requested" && <button className={styles.ghost} disabled={busy} onClick={() => void cancelRefund(item.id)}>Отменить заявку</button>}
                  {item.refundable > 0 && refundFor !== item.id && <button className={styles.ghost} disabled={busy} onClick={() => { setRefundFor(item.id); setRefundAmount(String(Math.floor(item.refundable))); setRefundReason(""); }}>Вернуть деньги</button>}
                </div>
              )}
              {refundFor === item.id && (
                <form onSubmit={(event) => { event.preventDefault(); void requestRefund(item.id); }} style={{ marginTop: 8 }}>
                  <p className={styles.small} style={{ margin: "0 0 6px" }}>Вернуть можно то, что ещё не потрачено на ИИ: до {formatTenge(item.refundable)}. Деньги придут на карту, с которой вы платили, после проверки — обычно за несколько рабочих дней.{item.provider === "mock" ? " Тестовый режим: настоящие деньги не двигаются." : ""}</p>
                  <label className={styles.label} htmlFor={`refund-${item.id}`}>Сумма, ₸</label>
                  <input id={`refund-${item.id}`} className={styles.input} inputMode="numeric" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value.replace(/\D/g, "").slice(0, 6))} />
                  <label className={styles.label} htmlFor={`refund-reason-${item.id}`}>Причина (необязательно)</label>
                  <input id={`refund-reason-${item.id}`} className={styles.input} maxLength={300} value={refundReason} onChange={(event) => setRefundReason(event.target.value)} />
                  <div className={styles.row} style={{ marginTop: 8 }}>
                    <button className={styles.button} disabled={busy || !(Number(refundAmount) >= 1 && Number(refundAmount) <= item.refundable)}>Отправить заявку</button>
                    <button type="button" className={styles.ghost} onClick={() => setRefundFor(null)}>Отмена</button>
                  </div>
                </form>
              )}
            </div>
          ))}
          <p className={styles.small}>Всего пополнено {formatTenge(wallet.paid)}, потрачено на ИИ {formatTenge(wallet.spent)}{wallet.refunded > 0 ? `, возвращено ${formatTenge(wallet.refunded)}` : ""}{wallet.pendingRefund > 0 ? `, ждёт возврата ${formatTenge(wallet.pendingRefund)}` : ""}.</p>
        </details>
      )}
    </section>
  );
}
