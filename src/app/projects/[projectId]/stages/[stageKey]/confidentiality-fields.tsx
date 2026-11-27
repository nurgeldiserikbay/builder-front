"use client";

import { t } from "@/lib/i18n";
import styles from "../../../journey.module.css";

export type ConfidentialityTerms = { text: string; hash: string; accepted: boolean; acceptedAt: string | null; changed: boolean };
export const CONFIDENTIALITY_MAX = 4000;
export const confidentialityValid = (value: string | null) => value === null || (value.trim().length >= 20 && value.trim().length <= CONFIDENTIALITY_MAX);

/** Owner's switch and text of the confidentiality terms; null — no terms. The template comes from the server. */
export default function ConfidentialityFields({ value, template, onChange, disabled }: { value: string | null; template: string; onChange: (next: string | null) => void; disabled?: boolean }) {
  return (
    <fieldset className={styles.accessBox} disabled={disabled}>
      <legend>{t("Конфиденциальность")}</legend>
      <label className={styles.checkRow}>
        <input type="checkbox" checked={value !== null} onChange={(event) => onChange(event.target.checked ? template : null)} />
        <span>{t("Специалист принимает условия конфиденциальности до входа в этап")}<br /><small className={styles.muted}>{t("Платформа запишет, кто, когда и какой текст принял. Если вы потом измените текст, этап закроется для специалиста, пока он не примет новый. Это не договор, составленный юристом: если нужен договор, приложите его к этапу и сошлитесь на него здесь.")}</small></span>
      </label>
      {value !== null && (
        <label className={styles.field} style={{ marginTop: 8 }}>
          <span className={styles.label}>{t("Текст условий")}</span>
          <textarea className={styles.textarea} style={{ minHeight: 140 }} maxLength={CONFIDENTIALITY_MAX} value={value} onChange={(event) => onChange(event.target.value)} />
          <span className={styles.why}>{!confidentialityValid(value) ? t("Нужно от 20 до 4000 знаков.") : value === template ? t("Это шаблон платформы — поправьте под свой проект, если нужно.") : t("{0} из {1} знаков.", [value.trim().length, CONFIDENTIALITY_MAX])}</span>
        </label>
      )}
    </fieldset>
  );
}

/** One line for the owner about the terms of an assignment. */
export function confidentialityStatus(terms: ConfidentialityTerms | null, status: string): string {
  if (!terms) return t("Без условий конфиденциальности");
  if (terms.accepted && terms.acceptedAt) return t("Условия конфиденциальности приняты {0}", [new Date(terms.acceptedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })]);
  if (status === "invited") return t("Условия конфиденциальности примет вместе с приглашением");
  return terms.changed ? t("Вы изменили условия — этап закрыт для специалиста, пока он их не примет") : t("Условия конфиденциальности ещё не приняты — этап закрыт для специалиста");
}
