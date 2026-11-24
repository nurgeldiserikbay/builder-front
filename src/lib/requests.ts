// «Заявки на этап»: shared wording for the board, the stage panel and «Моя работа».
import { t } from "@/lib/i18n";
import { formatTenge } from "@/lib/money";

export type ResponseTerms = { payKind: string; fixedAmount: number | null; hourlyRate: number | null; hourLimit: number | null; total: number | null };

export const termsLine = (terms: ResponseTerms) => terms.payKind === "fixed"
  ? t("{0} за этап", [formatTenge(terms.fixedAmount ?? 0)])
  : t("{0} в час, до {1} ч", [formatTenge(terms.hourlyRate ?? 0), terms.hourLimit ?? 0]);

export const payKindText = (kind: string) => kind === "fixed" ? t("фиксированная цена") : kind === "hourly" ? t("почасово") : t("цена или почасово");

export const responseStatusText = (status: string) => ({
  sent: t("Отправлен"), chosen: t("Вас выбрали"), declined: t("Не выбран"), withdrawn: t("Отозван"),
} as Record<string, string>)[status] ?? status;
