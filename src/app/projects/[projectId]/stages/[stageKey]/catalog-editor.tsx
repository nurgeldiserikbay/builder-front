"use client";

import { t } from "@/lib/i18n";
import type { Catalog, CatalogOptions, DeliveryOption, Product } from "@/lib/journey";
import { formatTenge } from "@/lib/money";
import styles from "../../../journey.module.css";
import { PhotoControl, usePhotoLibrary } from "./editors";

/** Whole tenge from what the owner typed: «2 500», «2500 ₸». Empty stays 0 so the field can be cleared. */
const toPrice = (value: string, max: number) => Math.min(Number(value.replace(/[^\d]/g, "") || "0"), max);

export function CatalogEditor({ projectId, value, onChange, options, disabled, issues }: {
  projectId: string; value: Catalog; onChange: (next: Catalog) => void; options: CatalogOptions; disabled: boolean; issues: string[];
}) {
  const library = usePhotoLibrary(projectId);
  const setProduct = (index: number, patch: Partial<Product>) => onChange({ ...value, products: value.products.map((item, position) => (position === index ? { ...item, ...patch } : item)) });
  const setDelivery = (index: number, patch: Partial<DeliveryOption>) => onChange({ ...value, delivery: value.delivery.map((item, position) => (position === index ? { ...item, ...patch } : item)) });
  const newKey = (prefix: string, used: string[]) => { let number = used.length + 1; while (used.includes(`${prefix}${number}`)) number += 1; return `${prefix}${number}`; };
  const move = (index: number, delta: number) => {
    const products = [...value.products];
    const [item] = products.splice(index, 1);
    products.splice(index + delta, 0, item!);
    onChange({ ...value, products });
  };
  const inStock = value.products.filter((item) => item.available && item.price > 0).length;
  return (
    <div>
      {issues.length > 0 && <div className={`${styles.notice} ${styles.warn}`}><ul className={styles.list}>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
      <section className={styles.card} aria-label={t("Товары")}>
        <p className={styles.cardTitle}>{t("Товары")}</p>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("На витрине: {0} из {1}. Товары не в наличии показываются отдельной строкой, купить их нельзя.", [inStock, value.products.length])}</p>
        {value.products.map((product, index) => (
          <article key={product.key} className={styles.section} aria-label={product.name || t("Товар {0}", [index + 1])} style={{ opacity: product.available ? 1 : 0.7 }}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionType}>{t("Товар {0}", [index + 1])}</span>
              <div className={styles.spacer} />
              <button type="button" className={styles.iconButton} disabled={disabled || index === 0} aria-label={t("Выше")} onClick={() => move(index, -1)}>↑</button>
              <button type="button" className={styles.iconButton} disabled={disabled || index === value.products.length - 1} aria-label={t("Ниже")} onClick={() => move(index, 1)}>↓</button>
              <button type="button" className={styles.iconButton} disabled={disabled} aria-label={t("Убрать товар")}
                onClick={() => { if (window.confirm(t("Убрать «{0}» из каталога? Его можно вернуть из истории версий.", [product.name || index + 1]))) onChange({ ...value, products: value.products.filter((_, position) => position !== index) }); }}>✕</button>
            </div>
            <label className={styles.field}><span className={styles.label}>{t("Название")}</span>
              <input className={styles.input} value={product.name} maxLength={80} disabled={disabled} placeholder={t("Например: Мыло с лавандой")} onChange={(event) => setProduct(index, { name: event.target.value })} /></label>
            <div className={styles.row} style={{ alignItems: "flex-end" }}>
              <label className={styles.field} style={{ flex: "2 1 140px" }}><span className={styles.label}>{t("Цена, ₸")}</span>
                <input className={styles.input} inputMode="numeric" value={product.price ? String(product.price) : ""} disabled={disabled} placeholder="2500" onChange={(event) => setProduct(index, { price: toPrice(event.target.value, options.limits.maxPrice) })} /></label>
              <label className={styles.field} style={{ flex: "1 1 90px" }}><span className={styles.label}>{t("За что")}</span>
                <input className={styles.input} value={product.unit ?? ""} maxLength={12} disabled={disabled} placeholder={t("шт, кг")} onChange={(event) => setProduct(index, { unit: event.target.value || null })} /></label>
            </div>
            <label className={styles.field}><span className={styles.label}>{t("Описание (необязательно)")}</span>
              <textarea className={styles.textarea} style={{ minHeight: 64 }} value={product.description} maxLength={300} disabled={disabled} onChange={(event) => setProduct(index, { description: event.target.value })} /></label>
            <label className={styles.field} style={{ flexDirection: "row", display: "flex", gap: 10, alignItems: "center" }}>
              <input type="checkbox" checked={product.available} disabled={disabled} style={{ width: 22, height: 22 }} onChange={(event) => setProduct(index, { available: event.target.checked })} />
              <span>{t("В наличии — можно заказать")}</span>
            </label>
            <PhotoControl projectId={projectId} library={library} imageId={product.imageId} disabled={disabled} sectionLabel={product.name || t("Товар {0}", [index + 1])} onSelect={(id) => setProduct(index, { imageId: id })} />
          </article>
        ))}
        {!disabled && value.products.length < options.limits.products && (
          <button type="button" className={`${styles.secondary} ${styles.block}`} onClick={() => onChange({ ...value, products: [...value.products, { key: newKey("p", value.products.map((item) => item.key)), name: "", description: "", price: 0, unit: null, available: true, imageId: null }] })}>{t("+ Добавить товар")}</button>
        )}
      </section>

      <section className={styles.card} aria-label={t("Как получить заказ")}>
        <p className={styles.cardTitle}>{t("Как получить заказ")}</p>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("Клиент выберет один способ в корзине. Цена доставки добавится к сумме заказа.")}</p>
        {value.delivery.map((option, index) => (
          <article key={option.key} className={styles.section} aria-label={option.title || t("Способ {0}", [index + 1])}>
            <div className={styles.row} style={{ alignItems: "flex-end" }}>
              <label className={styles.field} style={{ flex: "2 1 160px" }}><span className={styles.label}>{t("Название")}</span>
                <input className={styles.input} value={option.title} maxLength={60} disabled={disabled} placeholder={t("Например: Самовывоз")} onChange={(event) => setDelivery(index, { title: event.target.value })} /></label>
              <label className={styles.field} style={{ flex: "1 1 100px" }}><span className={styles.label}>{t("Цена, ₸")}</span>
                <input className={styles.input} inputMode="numeric" value={option.price ? String(option.price) : ""} placeholder="0" disabled={disabled} onChange={(event) => setDelivery(index, { price: toPrice(event.target.value, options.limits.maxPrice) })} /></label>
            </div>
            <label className={styles.field}><span className={styles.label}>{t("Пояснение для клиента")}</span>
              <input className={styles.input} value={option.note} maxLength={160} disabled={disabled} placeholder={t("Например: в течение дня после подтверждения")} onChange={(event) => setDelivery(index, { note: event.target.value })} /></label>
            <div className={styles.row}>
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="checkbox" checked={option.needsAddress} disabled={disabled} style={{ width: 22, height: 22 }} onChange={(event) => setDelivery(index, { needsAddress: event.target.checked })} />
                <span>{t("Нужен адрес клиента")}</span>
              </label>
              <div className={styles.spacer} />
              <button type="button" className={styles.danger} style={{ minHeight: 40 }} disabled={disabled || value.delivery.length <= 1} onClick={() => onChange({ ...value, delivery: value.delivery.filter((_, position) => position !== index) })}>{t("Убрать")}</button>
            </div>
          </article>
        ))}
        {!disabled && value.delivery.length < options.limits.delivery && (
          <button type="button" className={styles.secondary} onClick={() => onChange({ ...value, delivery: [...value.delivery, { key: newKey("d", value.delivery.map((item) => item.key)), title: "", price: 0, needsAddress: true, note: "" }] })}>{t("+ Способ получения")}</button>
        )}
      </section>

      <section className={styles.card} aria-label={t("Оплата")}>
        <p className={styles.cardTitle}>{t("Как клиент платит")}</p>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("Онлайн-оплаты на сайте пока нет: клиент платит при получении или переводом после того, как вы подтвердите заказ.")}</p>
        <label style={{ display: "flex", gap: 10, alignItems: "center", margin: "8px 0" }}>
          <input type="checkbox" checked={value.payment.onDelivery} disabled={disabled} style={{ width: 22, height: 22 }} onChange={(event) => onChange({ ...value, payment: { ...value.payment, onDelivery: event.target.checked } })} />
          <span>{t("При получении — наличными или картой")}</span>
        </label>
        <label style={{ display: "flex", gap: 10, alignItems: "center", margin: "8px 0" }}>
          <input type="checkbox" checked={value.payment.transfer} disabled={disabled} style={{ width: 22, height: 22 }} onChange={(event) => onChange({ ...value, payment: { ...value.payment, transfer: event.target.checked } })} />
          <span>{t("Переводом после подтверждения")}</span>
        </label>
        {value.payment.transfer && (
          <label className={styles.field}><span className={styles.label}>{t("Как перевести")}</span>
            <span className={styles.why}>{t("Клиент увидит это на странице заказа. Номер карты лучше не писать — отправьте реквизиты сами после звонка.")}</span>
            <input className={styles.input} value={value.payment.transferNote} maxLength={200} disabled={disabled} placeholder={t("Например: Kaspi по номеру телефона после подтверждения")} onChange={(event) => onChange({ ...value, payment: { ...value.payment, transferNote: event.target.value } })} /></label>
        )}
        <label className={styles.field}><span className={styles.label}>{t("Минимальный заказ, ₸ (необязательно)")}</span>
          <input className={styles.input} inputMode="numeric" value={value.minOrder ? String(value.minOrder) : ""} disabled={disabled} placeholder={t("Без минимума")} onChange={(event) => onChange({ ...value, minOrder: toPrice(event.target.value, options.limits.maxPrice) || null })} /></label>
        {value.minOrder ? <p className={styles.small}>{t("Оформить заказ можно будет от {0}.", [formatTenge(value.minOrder)])}</p> : null}
      </section>
    </div>
  );
}
