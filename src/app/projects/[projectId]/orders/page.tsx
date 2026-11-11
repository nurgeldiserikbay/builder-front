"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { formatTenge } from "@/lib/money";
import styles from "../../journey.module.css";

type Status = "new" | "confirmed" | "done" | "cancelled_by_owner" | "cancelled_by_client";
type Order = {
  id: string; number: number; items: Array<{ key: string; name: string; price: number; quantity: number }>; itemsTiyn: number; deliveryTitle: string; deliveryTiyn: number; totalTiyn: number;
  paymentMethod: "on_delivery" | "transfer"; clientName: string; clientPhone: string; address: string | null; comment: string | null; status: Status; telegramStatus: string; createdAt: string;
};
type Data = { orders: Order[]; live: boolean; siteUrl: string | null; siteName: string };

const statusText = (status: Status) => ({ new: t("новый"), confirmed: t("подтверждён"), done: t("выполнен"), cancelled_by_owner: t("вы отменили"), cancelled_by_client: t("отменил клиент") })[status];
const phoneHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

export default function OrdersPage() {
  const router = useRouter();
  const { projectId } = useParams<{ projectId: string }>();
  const [scope, setScope] = useState<"open" | "closed">("open");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try { setData(await api<Data>(`/projects/${projectId}/orders?scope=${scope}`)); }
    catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
      setError(explainError(caught));
    }
  }, [projectId, scope, router]);
  useEffect(() => { setData(null); void load(); }, [load]);

  async function mark(order: Order, status: "confirmed" | "done" | "cancelled_by_owner") {
    if (status === "cancelled_by_owner" && !window.confirm(t("Отменить заказ №{0}? Клиент увидит отмену на странице заказа, но сообщение не получит — позвоните по номеру {1}.", [order.number, order.clientPhone]))) return;
    setBusy(order.id); setError("");
    try { await api(`/projects/${projectId}/orders/${order.id}/status`, { method: "POST", body: JSON.stringify({ status }) }); await load(); }
    catch (caught) { setError(explainError(caught)); await load(); } finally { setBusy(""); }
  }

  return (
    <div className={styles.shell}>
      <header className={styles.top}><div className={styles.topInner}>
        <a className={styles.back} href={`/projects/${projectId}`}>{t("← Проект")}</a>
        <span className={styles.topTitle}>{t("Заказы")}</span>
      </div></header>
      <main className={styles.container}>
        <p className={styles.kicker}>{t("Магазин")}</p>
        <h1 className={styles.h1}>{t("Заказы")}</h1>
        <p className={styles.small} style={{ margin: "0 0 12px" }}>
          {t("Новые заказы и отмены приходят вам в Telegram или на почту. Позвоните клиенту, подтвердите заказ, а когда передадите его — отметьте выполненным. Клиент видит статус на странице своего заказа; сообщений ему платформа не отправляет.")}
          {data?.siteUrl && <> <a href={data.siteUrl} target="_blank" rel="noopener">{t("Открыть магазин →")}</a></>}
        </p>
        <div className={styles.viewToggle} role="group" aria-label={t("Какие заказы")}>
          <button type="button" aria-pressed={scope === "open"} onClick={() => setScope("open")}>{t("В работе")}</button>
          <button type="button" aria-pressed={scope === "closed"} onClick={() => setScope("closed")}>{t("Завершённые")}</button>
        </div>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!data && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}
        {data && !data.live && <div className={`${styles.notice} ${styles.info}`}>{t("Магазин не опубликован, поэтому новых заказов не будет. Опубликуйте его на странице проекта.")}</div>}
        {data && data.orders.length === 0 && <div className={`${styles.notice} ${styles.info}`}>{scope === "open" ? t("Заказов в работе нет.") : t("Завершённых заказов нет.")}</div>}
        {data?.orders.map((order) => {
          const cancelled = order.status.startsWith("cancelled");
          return (
            <article key={order.id} className={styles.card} style={{ opacity: cancelled ? 0.6 : 1 }} aria-label={t("Заказ №{0}", [order.number])}>
              <div className={styles.row}>
                <strong style={{ fontSize: 18 }}>{t("№{0}", [order.number])} · {formatTenge(order.totalTiyn / 100)}</strong>
                <div className={styles.spacer} />
                <span className={styles.small} style={order.status === "new" ? { fontWeight: 800, color: "#9a3412" } : undefined}>{statusText(order.status)}</span>
              </div>
              <p className={styles.small} style={{ margin: "2px 0 8px" }}>{new Date(order.createdAt).toLocaleString(dateLocale(), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
              <ul className={styles.list} style={{ margin: "0 0 6px" }}>
                {order.items.map((item) => <li key={item.key}>{item.name} × {item.quantity} — {formatTenge(item.price * item.quantity)}</li>)}
              </ul>
              <p style={{ margin: "4px 0" }}>{order.deliveryTitle}{order.deliveryTiyn ? ` · ${formatTenge(order.deliveryTiyn / 100)}` : ""} · {order.paymentMethod === "transfer" ? t("переводом") : t("при получении")}</p>
              {order.address && <p style={{ margin: "4px 0" }}>{t("Адрес:")}{" "}{order.address}</p>}
              <p style={{ margin: "6px 0" }}>{order.clientName} · <a href={phoneHref(order.clientPhone)} style={{ color: "#255b42", fontWeight: 800 }}>{order.clientPhone}</a></p>
              {order.comment && <p className={styles.small} style={{ margin: "0 0 6px", whiteSpace: "pre-wrap" }}>«{order.comment}»</p>}
              <div className={styles.row} style={{ flexWrap: "wrap" }}>
                <a className={styles.secondary} href={phoneHref(order.clientPhone)}>{t("Позвонить")}</a>
                {order.status === "new" && <button className={styles.button} disabled={Boolean(busy)} onClick={() => void mark(order, "confirmed")}>{t("Подтвердить")}</button>}
                {(order.status === "new" || order.status === "confirmed") && <button className={styles.ghost} disabled={Boolean(busy)} onClick={() => void mark(order, "done")}>{t("Выполнен")}</button>}
                {(order.status === "new" || order.status === "confirmed") && <button className={styles.danger} disabled={Boolean(busy)} onClick={() => void mark(order, "cancelled_by_owner")}>{t("Отменить")}</button>}
              </div>
            </article>
          );
        })}
      </main>
    </div>
  );
}
