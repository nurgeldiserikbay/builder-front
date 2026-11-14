"use client";

import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../journey.module.css";

export type QuickProduct = { key: string; name: string; price: number; unit: string | null; available: boolean };
export type Day = { from: string; to: string } | null;
export type QuickMaster = { key: string; name: string; week: Day[] };

const weekdays = [t("Пн"), t("Вт"), t("Ср"), t("Чт"), t("Пт"), t("Сб"), t("Вс")];
const money = (value: number) => `${value.toLocaleString("ru-RU")} ₸`;

/** Shared confirm-and-publish part: the list of changes, what happens, and the two buttons. */
function Confirm({ lines, note, busy, onYes, onNo }: { lines: string[]; note: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <div className={`${styles.notice} ${styles.info}`}>
      <ul className={styles.list} style={{ marginTop: 0 }}>{lines.map((line) => <li key={line}>{line}</li>)}</ul>
      <p className={styles.small}>{note}</p>
      <div className={styles.row}>
        <button className={styles.button} disabled={busy} onClick={onYes}>{busy ? t("Обновляем сайт…") : t("Да, обновить сайт")}</button>
        <button className={styles.ghost} disabled={busy} onClick={onNo}>{t("Отмена")}</button>
      </div>
    </div>
  );
}

/** Prices and «в наличии» of products already in the catalogue. */
export function ProductsForm<S>({ projectId, products, onDone }: { projectId: string; products: QuickProduct[]; onDone: (next: S) => void }) {
  const [draft, setDraft] = useState(products);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setDraft(products); }, [products]);
  const lines = draft.flatMap((item) => {
    const before = products.find((product) => product.key === item.key)!;
    return [
      ...(item.price !== before.price ? [t("{0}: {1} → {2}", [item.name, money(before.price), money(item.price)])] : []),
      ...(item.available !== before.available ? [t("{0}: {1}", [item.name, item.available ? t("снова в наличии") : t("нет в наличии")])] : []),
    ];
  });
  const invalid = draft.some((item) => !Number.isInteger(item.price) || item.price < 0 || item.price > 10_000_000);
  async function save() {
    setBusy(true); setError("");
    try { onDone(await api<S>(`/projects/${projectId}/quick-edit/products`, { method: "POST", body: JSON.stringify({ products: draft.map(({ key, price, available }) => ({ key, price, available })) }) })); setConfirm(false); }
    catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }
  return (
    <div>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "grid", gap: 10 }}>
        {draft.map((item, index) => (
          <li key={item.key} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
            <strong>{item.name}</strong>{item.unit ? <span className={styles.small}> · {item.unit}</span> : null}
            <div className={styles.row} style={{ marginTop: 6, alignItems: "center", flexWrap: "nowrap" }}>
              <label style={{ flex: 1, minWidth: 0 }}>
                <input className={styles.input} inputMode="numeric" aria-label={t("Цена «{0}», ₸", [item.name])} value={Number.isFinite(item.price) ? String(item.price) : ""}
                  onChange={(event) => { const digits = event.target.value.replace(/\D/g, ""); setDraft(draft.map((row, at) => (at === index ? { ...row, price: digits ? Number(digits) : NaN } : row))); setConfirm(false); }} />
              </label>
              <label className={styles.small} style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                <input type="checkbox" checked={item.available} onChange={(event) => { setDraft(draft.map((row, at) => (at === index ? { ...row, available: event.target.checked } : row))); setConfirm(false); }} />
                {t("в наличии")}
              </label>
            </div>
          </li>
        ))}
      </ul>
      {!confirm ? (
        <>
          <button className={styles.button} disabled={busy || invalid || lines.length === 0} onClick={() => setConfirm(true)}>{t("Сохранить")}</button>
          <p className={styles.small}>{t("Добавить, убрать или переименовать товар — на этапе «Каталог товаров»: это меняет состав магазина.")}</p>
        </>
      ) : (
        <Confirm lines={lines} busy={busy} onYes={() => void save()} onNo={() => setConfirm(false)}
          note={t("Цены и наличие записаны на этапе «Каталог товаров». Архитектура от них не зависит — ей мы отметим «без изменений». Сайт соберётся заново и обновится сразу; заказы, которые уже пришли, остаются со своими ценами.")} />
      )}
    </div>
  );
}

/** Working hours of masters already in the schedule. */
export function HoursForm<S>({ projectId, masters, onDone }: { projectId: string; masters: QuickMaster[]; onDone: (next: S) => void }) {
  const [draft, setDraft] = useState(masters);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setDraft(masters); }, [masters]);
  const show = (day: Day) => (day ? `${day.from}–${day.to}` : t("выходной"));
  const lines = draft.flatMap((master) => {
    const before = masters.find((item) => item.key === master.key)!;
    return master.week.flatMap((day, index) => (show(day) !== show(before.week[index] ?? null) ? [t("{0}, {1}: {2} → {3}", [master.name, weekdays[index], show(before.week[index] ?? null), show(day)])] : []));
  });
  const invalid = draft.some((master) => master.week.some((day) => day && !(day.from < day.to)));
  const setDay = (masterIndex: number, dayIndex: number, day: Day) => {
    setDraft(draft.map((master, at) => (at === masterIndex ? { ...master, week: master.week.map((value, index) => (index === dayIndex ? day : value)) } : master)));
    setConfirm(false);
  };
  async function save() {
    setBusy(true); setError("");
    try { onDone(await api<S>(`/projects/${projectId}/quick-edit/hours`, { method: "POST", body: JSON.stringify({ masters: draft.map(({ key, week }) => ({ key, week })) }) })); setConfirm(false); }
    catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }
  return (
    <div>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {draft.map((master, masterIndex) => (
        <fieldset key={master.key} style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
          <legend className={styles.label}>{master.name}</legend>
          {master.week.map((day, dayIndex) => (
            <div key={dayIndex} className={styles.row} style={{ alignItems: "center", flexWrap: "nowrap", gap: 6, marginBottom: 6 }}>
              <span style={{ width: 28, flexShrink: 0 }}>{weekdays[dayIndex]}</span>
              <label className={styles.small} style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                <input type="checkbox" checked={day !== null} aria-label={t("{0}: рабочий день", [weekdays[dayIndex]])} onChange={(event) => setDay(masterIndex, dayIndex, event.target.checked ? { from: "10:00", to: "19:00" } : null)} />
              </label>
              {day ? (
                <>
                  <input className={styles.input} type="time" step={900} style={{ minWidth: 0, flex: 1 }} aria-label={t("{0}: с", [weekdays[dayIndex]])} value={day.from} onChange={(event) => setDay(masterIndex, dayIndex, { ...day, from: event.target.value })} />
                  <span aria-hidden="true">–</span>
                  <input className={styles.input} type="time" step={900} style={{ minWidth: 0, flex: 1 }} aria-label={t("{0}: до", [weekdays[dayIndex]])} value={day.to} onChange={(event) => setDay(masterIndex, dayIndex, { ...day, to: event.target.value })} />
                </>
              ) : <span className={styles.small}>{t("выходной")}</span>}
            </div>
          ))}
        </fieldset>
      ))}
      {invalid && <p className={styles.small} role="alert">{t("Конец рабочего дня должен быть позже начала.")}</p>}
      {!confirm ? (
        <>
          <button className={styles.button} disabled={busy || invalid || lines.length === 0} onClick={() => setConfirm(true)}>{t("Сохранить")}</button>
          <p className={styles.small}>{t("Мастера, услуги и правила записи меняются на этапе «Расписание и запись».")}</p>
        </>
      ) : (
        <Confirm lines={lines} busy={busy} onYes={() => void save()} onNo={() => setConfirm(false)}
          note={t("Часы работы записаны на этапе «Расписание и запись». Архитектура от них не зависит — ей мы отметим «без изменений». Сайт соберётся заново и обновится сразу. Уже сделанные записи остаются; если запись попала на новый выходной, договоритесь с клиентом сами.")} />
      )}
    </div>
  );
}
