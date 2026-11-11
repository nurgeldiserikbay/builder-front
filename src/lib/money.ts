import { t, dateLocale } from "@/lib/i18n";
/** «≈ 15 ₸», «1 250 ₸», «0,40 ₸» — small amounts keep tiyn so a single request does not look free. */
export function formatTenge(value: number): string {
  const digits = value > 0 && value < 10 ? 2 : 0;
  return `${value.toLocaleString(dateLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })} ₸`;
}
