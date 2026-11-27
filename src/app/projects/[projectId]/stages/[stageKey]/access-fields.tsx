"use client";

import { t } from "@/lib/i18n";
import styles from "../../../journey.module.css";

export type EditMode = "both" | "ai_only" | "manual_only";
export type Access = { extraReadStages: string[]; hiddenParts: string[]; allowDownload: boolean; watermark?: boolean; readDays: number; editMode?: EditMode };
export type AccessOptions = {
  inputs: Array<{ key: string; title: string }>;
  extraStages: Array<{ key: string; title: string }>;
  hideable: Array<{ key: string; title: string; stageKey: string }>;
  readDaysMax: number;
  editModes?: EditMode[];
};

/** How the lead changes the stage; the server checks it on every change (access-scope.ts editAllowed). */
export const editModeText: Record<EditMode, { title: string; text: string }> = {
  both: { title: t("Вручную и через ИИ"), text: t("Специалист правит этап сам и даёт задания ИИ.") },
  ai_only: { title: t("Только через ИИ"), text: t("Специалист даёт задания ИИ и принимает его предложения, но не правит текст и схемы сам.") },
  manual_only: { title: t("Только вручную"), text: t("Специалист правит этап сам, ИИ на этапе для него выключен — расходы на ИИ не растут.") },
};

const READ_DAYS = [0, 3, 7, 14, 30];

/** What the specialist will see, in the same words the server uses (access-scope.ts scopeLines). */
export function accessLines(access: Access, options: AccessOptions) {
  const title = (key: string) => [...options.inputs, ...options.extraStages].find((item) => item.key === key)?.title ?? key;
  const can: string[] = [];
  const cannot: string[] = [];
  if (access.extraReadStages.length) can.push(t("Читать принятые результаты: {0}", [access.extraReadStages.map((key) => `«${t(title(key))}»`).join(", ")]));
  for (const part of access.hiddenParts) {
    const item = options.hideable.find((option) => option.key === part);
    if (item) cannot.push(t("Видеть: {0} — вместо них «{1}»", [t(item.title).toLowerCase(), t("скрыто владельцем")]));
  }
  (access.allowDownload ? can : cannot).push(t("Скачивать файлы этапа, загруженные другими"));
  if (access.watermark) cannot.push(t("Скачивать фото, PDF и тексты без водяного знака: на них и на экране этапа — ваша почта и дата"));
  if (access.editMode === "ai_only") { can.push(t("Менять этап через ИИ: давать задания и принимать предложения")); cannot.push(t("Править этап вручную")); }
  if (access.editMode === "manual_only") { can.push(t("Править этап вручную")); cannot.push(t("Запускать ИИ на этапе")); }
  const after = access.readDays === 0 ? t("Когда этап примут, доступ закроется сразу.") : t("Когда этап примут, менять его будет нельзя; смотреть можно ещё {0} дн.", [access.readDays]);
  return { can, cannot, after };
}

/** Owner's controls: open more accepted results, hide parts, allow downloads, how long reading lasts after acceptance. */
export default function AccessFields({ value, options, onChange, disabled }: { value: Access; options: AccessOptions; onChange: (next: Access) => void; disabled?: boolean }) {
  const visible = new Set([...options.inputs.map((item) => item.key), ...value.extraReadStages]);
  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((item) => item !== key) : [...list, key]);
  const setExtra = (key: string) => {
    const extraReadStages = toggle(value.extraReadStages, key);
    const open = new Set([...options.inputs.map((item) => item.key), ...extraReadStages]);
    // Hiding a part of a stage that is no longer visible means nothing.
    onChange({ ...value, extraReadStages, hiddenParts: value.hiddenParts.filter((part) => open.has(options.hideable.find((item) => item.key === part)?.stageKey ?? "")) });
  };
  const hideable = options.hideable.filter((item) => visible.has(item.stageKey));
  return (
    <fieldset className={styles.accessBox} disabled={disabled}>
      <legend>{t("Доступ")}</legend>
      <p className={styles.small} style={{ marginTop: 0 }}>
        {options.inputs.length ? t("Принятые результаты, на которых построен этап, видны всегда: {0}.", [options.inputs.map((item) => `«${t(item.title)}»`).join(", ")]) : t("У этого этапа нет входов из других этапов.")}
      </p>
      {options.extraStages.length > 0 && <>
        <p className={styles.label}>{t("Открыть ещё на чтение")}</p>
        <div className={styles.filterRow} style={{ flexWrap: "wrap", margin: "0 0 12px", padding: 0, overflow: "visible" }}>
          {options.extraStages.map((item) => (
            <button key={item.key} type="button" className={styles.filterChip} aria-pressed={value.extraReadStages.includes(item.key)} onClick={() => setExtra(item.key)}>{t(item.title)}</button>
          ))}
        </div>
        <p className={styles.small} style={{ marginTop: -6 }}>{t("Специалист увидит только принятую версию — без черновиков и обсуждений.")}</p>
      </>}
      {hideable.length > 0 && <>
        <p className={styles.label}>{t("Скрыть от специалиста и его ИИ")}</p>
        {hideable.map((item) => (
          <label key={item.key} className={styles.checkRow}>
            <input type="checkbox" checked={value.hiddenParts.includes(item.key)} onChange={() => onChange({ ...value, hiddenParts: toggle(value.hiddenParts, item.key) })} />
            <span>{t(item.title)}</span>
          </label>
        ))}
      </>}
      {options.editModes && options.editModes.length > 1 && <>
        <p className={styles.label}>{t("Как специалист меняет этап")}</p>
        {options.editModes.map((mode) => (
          <label key={mode} className={styles.checkRow}>
            <input type="radio" name="edit-mode" checked={(value.editMode ?? "both") === mode} onChange={() => onChange({ ...value, editMode: mode })} />
            <span><b>{editModeText[mode].title}</b><br /><small className={styles.muted}>{editModeText[mode].text}</small></span>
          </label>
        ))}
        <p className={styles.small} style={{ marginTop: 4 }}>{t("Комментарии и предложения изменений доступны в любом режиме. Для консультанта не важно — он этап не меняет.")}</p>
      </>}
      <p className={styles.label}>{t("Файлы этапа")}</p>
      <label className={styles.checkRow}>
        <input type="checkbox" checked={value.allowDownload} onChange={(event) => onChange({ ...value, allowDownload: event.target.checked })} />
        <span>{t("Разрешить скачивать файлы этапа, которые загрузили другие")}</span>
      </label>
      <label className={styles.checkRow}>
        <input type="checkbox" checked={Boolean(value.watermark)} onChange={(event) => onChange({ ...value, watermark: event.target.checked })} />
        <span>{t("Водяной знак с почтой специалиста")}<br /><small className={styles.muted}>{t("На скачанных фото и PDF — повторяющаяся надпись с его почтой и временем, в текстах .md и .txt — первая строка, на экране этапа — бледная надпись. Word, Excel и архивы так пометить нельзя: они выдаются как есть, но каждое скачивание видно в «Истории». Знак не спасает от того, кто захочет его срезать, — он показывает, откуда утёк файл.")}</small></span>
      </label>
      <label className={styles.field} style={{ marginTop: 10 }}>
        <span className={styles.label}>{t("После приёмки этапа смотреть можно")}</span>
        <select className={styles.select} value={value.readDays} onChange={(event) => onChange({ ...value, readDays: Number(event.target.value) })}>
          {READ_DAYS.filter((days) => days <= options.readDaysMax).map((days) => <option key={days} value={days}>{days === 0 ? t("нельзя — доступ закроется сразу") : t("ещё {0} дн.", [days])}</option>)}
        </select>
      </label>
    </fieldset>
  );
}
