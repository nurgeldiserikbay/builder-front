"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { formatTenge } from "@/lib/money";
import styles from "../../../../journey.module.css";

type Receipt = {
  number: string; paidAt: string; payer: string | null; payerEmail: string | null; project: string; items: Array<{ title: string; amount: number }>; total: number; currency: string;
  refunds: Array<{ amount: number; at: string | null; reference: string | null }>; provider: string | null; providerPaymentId: string | null; test: boolean; seller: string;
};
const when = (value: string) => new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** A printable payment confirmation; «Сохранить PDF» uses the browser's print dialog. */
export default function ReceiptPage() {
  const { projectId, kind, receiptId } = useParams<{ projectId: string; kind: string; receiptId: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<Receipt>(`/projects/${projectId}/receipts/${kind}/${receiptId}`).then(setReceipt).catch((caught) => setError(explainError(caught))); }, [projectId, kind, receiptId]);

  return (
    <div className={styles.shell}>
      <header className={styles.top} data-print="hide"><div className={styles.topInner}><a className={styles.back} href={`/projects/${projectId}`}>← Проект</a></div></header>
      <main className={styles.container}>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!receipt && !error && <p className={styles.muted}>Загружаем…</p>}
        {receipt && (
          <article className={styles.card}>
            {receipt.test && <p className={`${styles.notice} ${styles.warn}`}>Тестовая оплата: настоящие деньги не списывались.</p>}
            <p className={styles.kicker}>Подтверждение оплаты</p>
            <h1 className={styles.h2} style={{ margin: "0 0 4px" }}>№ {receipt.number}</h1>
            <p className={styles.small} style={{ margin: "0 0 12px" }}>{when(receipt.paidAt)}</p>
            <p style={{ margin: "0 0 4px" }}>Получатель: {receipt.seller}</p>
            <p style={{ margin: "0 0 4px" }}>Плательщик: {receipt.payer}{receipt.payerEmail && receipt.payer !== receipt.payerEmail ? ` (${receipt.payerEmail})` : ""}</p>
            <p style={{ margin: "0 0 12px" }}>Проект: «{receipt.project}»</p>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {receipt.items.map((item) => (
                  <tr key={item.title} style={{ borderTop: "1px solid #e3e7e3" }}><td style={{ padding: "8px 8px 8px 0" }}>{item.title}</td><td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatTenge(item.amount)}</td></tr>
                ))}
                <tr style={{ borderTop: "2px solid #1c241f" }}><td style={{ padding: "8px 0", fontWeight: 800 }}>Итого оплачено</td><td style={{ textAlign: "right", fontWeight: 800, whiteSpace: "nowrap" }}>{formatTenge(receipt.total)}</td></tr>
                {receipt.refunds.map((refund, index) => (
                  <tr key={index}><td style={{ padding: "4px 0" }}>Возврат{refund.at ? ` ${new Date(refund.at).toLocaleDateString("ru-RU")}` : ""}{refund.reference ? ` · ${refund.reference}` : ""}</td><td style={{ textAlign: "right", whiteSpace: "nowrap" }}>−{formatTenge(refund.amount)}</td></tr>
                ))}
              </tbody>
            </table>
            {receipt.providerPaymentId && <p className={styles.small} style={{ marginTop: 12 }}>Номер платежа у платёжного сервиса: {receipt.providerPaymentId}</p>}
            <p className={styles.small}>Это подтверждение оплаты в BuildPath, а не фискальный чек. Фискальный чек выдаёт платёжный сервис или оператор фискальных данных после подключения настоящей оплаты.</p>
            <button className={styles.secondary} data-print="hide" onClick={() => window.print()}>Сохранить PDF или распечатать</button>
          </article>
        )}
      </main>
    </div>
  );
}
