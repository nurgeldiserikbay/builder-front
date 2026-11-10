"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { formatTenge } from "@/lib/money";
import styles from "../journey.module.css";

type Wallet = {
  mode: "off" | "prepaid"; provider: "freedompay" | "mock" | null; balance: number; paid: number; spent: number;
  minTopUp: number; maxTopUp: number; typicalRequest: number; requestsLeft: number | null;
  topUps: Array<{ id: string; amount: number; status: "created" | "paid" | "failed" | "expired"; createdAt: string; paidAt: string | null }>;
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

  if (!wallet || wallet.mode !== "prepaid") return error ? <p className={`${styles.notice} ${styles.error}`}>{error}</p> : null;
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
      {wallet.provider ? (
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
        <details><summary className={styles.small}>История пополнений</summary>
          <ul className={styles.list}>{wallet.topUps.map((item) => <li key={item.id}>{new Date(item.createdAt).toLocaleDateString("ru-RU")}: {formatTenge(item.amount)} — {statusText[item.status]}</li>)}</ul>
          <p className={styles.small}>Всего пополнено {formatTenge(wallet.paid)}, потрачено на ИИ {formatTenge(wallet.spent)}.</p>
        </details>
      )}
    </section>
  );
}
