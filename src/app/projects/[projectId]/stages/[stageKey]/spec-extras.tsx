"use client";

import { t } from "@/lib/i18n";
import styles from "../../../journey.module.css";
import type { BusinessProcess } from "./process-editor";

// The checkable parts of the ТЗ (builder-back src/journey/spec-extras.ts): stories and «Дано / Когда / Тогда» checks of a
// feature, where it comes from, who may do what with which data, non-functional requirements, services, process coverage.

export type FeatureCase = { key: string; given: string; when: string; then: string };
export type AccessAction = "view" | "create" | "edit" | "delete";
export type AccessRule = { key: string; role: string; data: string; actions: AccessAction[]; scope: "own" | "all" };
export type ServiceAccess = "owner" | "platform" | "developer";
export type SpecService = { key: string; name: string; purpose: string; accessBy: ServiceAccess };
export const QUALITY_KEYS = ["speed", "users", "languages", "devices", "accessibility", "dataLocation", "backups", "retention"] as const;
export type QualityKey = (typeof QUALITY_KEYS)[number];
export type SpecQuality = Partial<Record<QualityKey, string>>;

const ACTIONS: AccessAction[] = ["view", "create", "edit", "delete"];
const actionLabel = (): Record<AccessAction, string> => ({ view: t("смотреть"), create: t("создавать"), edit: t("менять"), delete: t("удалять") });
const qualityText = (): Record<QualityKey, [string, string]> => ({
  speed: [t("Скорость"), t("Например: страница открывается за 3 секунды на мобильном интернете")],
  users: [t("Сколько пользователей"), t("Например: до 50 человек одновременно, 2000 записей в месяц")],
  languages: [t("Языки"), t("Например: русский и казахский")],
  devices: [t("Устройства"), t("Например: телефон и компьютер")],
  accessibility: [t("Доступность"), t("Например: крупный текст, контраст, работа с клавиатуры")],
  dataLocation: [t("Где хранятся данные"), t("Например: на серверах в Казахстане")],
  backups: [t("Резервные копии"), t("Например: каждый день, хранить 30 дней")],
  retention: [t("Сколько хранить данные"), t("Например: записи клиентов — 3 года, потом удалять")],
});
const accessByLabel = (): Record<ServiceAccess, string> => ({ owner: t("Владелец даёт свой аккаунт"), platform: t("Подключает платформа"), developer: t("Подключает разработчик") });

/** The steps the product takes itself — the ones a feature must cover. Steps done by hand outside it are not counted. */
export function productSteps(process: BusinessProcess | null) {
  return (process?.scenarios ?? []).flatMap((scenario) => scenario.steps
    .filter((step) => step.capability !== "offline" && step.capability !== "other")
    .map((step) => ({ ref: `step:${scenario.key}.${step.key}`, scenario: scenario.title, action: step.action })));
}

function freeKey(prefix: string, used: string[]) {
  let index = used.length + 1;
  while (used.includes(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

/** Inside a feature: the story, its checks and the process steps it covers. Folded, so the list of features stays short. */
export function FeatureChecks({ story, cases, sources, steps, disabled, onChange }: {
  story: string; cases: FeatureCase[]; sources: string[]; steps: ReturnType<typeof productSteps>; disabled: boolean;
  onChange: (patch: { story?: string; cases?: FeatureCase[]; sources?: string[] }) => void;
}) {
  const setCase = (index: number, patch: Partial<FeatureCase>) => onChange({ cases: cases.map((item, position) => (position === index ? { ...item, ...patch } : item)) });
  const covered = steps.filter((step) => sources.includes(step.ref)).length;
  const others = sources.filter((source) => !source.startsWith("step:"));
  return (
    <details style={{ border: "1.5px solid var(--line, #e3e6e3)", borderRadius: 12, padding: "8px 12px" }}>
      <summary style={{ cursor: "pointer", minHeight: 36, display: "flex", alignItems: "center", fontWeight: 600 }}>
        {t("История и проверки")} · {t("проверок: {0}", [cases.length])}{steps.length ? ` · ${t("шагов процесса: {0}", [covered])}` : ""}
      </summary>
      <label className={styles.small} style={{ display: "block", marginTop: 8 }}>{t("История")}
        <input className={styles.input} value={story} maxLength={240} disabled={disabled} placeholder={t("Как клиент, я хочу записаться вечером, чтобы не звонить днём")} onChange={(event) => onChange({ story: event.target.value })} /></label>
      <p className={styles.small} style={{ margin: "10px 0 4px", fontWeight: 600 }}>{t("Проверки «Дано / Когда / Тогда»")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Обычный путь и случай, когда что-то идёт не так. Из них получится план тестов.")}</p>
      {cases.map((item, index) => (
        <div key={item.key} style={{ display: "grid", gap: 6, padding: "8px 0", borderTop: "1px solid var(--line, #e3e6e3)" }}>
          {(["given", "when", "then"] as const).map((field) => (
            <label key={field} className={styles.small} style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 8, alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>{field === "given" ? t("Дано") : field === "when" ? t("Когда") : t("Тогда")}</span>
              <input className={styles.input} value={item[field]} maxLength={240} disabled={disabled} onChange={(event) => setCase(index, { [field]: event.target.value })} />
            </label>
          ))}
          {!disabled && <button type="button" className={styles.ghost} style={{ justifySelf: "start" }} onClick={() => onChange({ cases: cases.filter((_, position) => position !== index) })}>{t("Убрать проверку")}</button>}
        </div>
      ))}
      {!disabled && cases.length < 5 && (
        <button type="button" className={styles.secondary} onClick={() => onChange({ cases: [...cases, { key: freeKey("c", cases.map((item) => item.key)), given: "", when: "", then: "" }] })}>{t("+ Добавить проверку")}</button>
      )}
      {steps.length > 0 && (
        <fieldset style={{ border: 0, padding: 0, margin: "12px 0 0" }}>
          <legend className={styles.small} style={{ fontWeight: 600 }}>{t("Какие шаги процесса делает эта функция")}</legend>
          <div style={{ display: "grid", gap: 4 }}>
            {steps.map((step) => (
              <label key={step.ref} style={{ display: "flex", gap: 8, alignItems: "flex-start", minHeight: 36 }}>
                <input type="checkbox" disabled={disabled} checked={sources.includes(step.ref)} style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0 }}
                  onChange={(event) => onChange({ sources: event.target.checked ? [...sources, step.ref].slice(0, 8) : sources.filter((item) => item !== step.ref) })} />
                <span><span className={styles.small}>{step.scenario}:</span> {step.action}</span>
              </label>
            ))}
          </div>
          {others.length > 0 && <p className={styles.small}>{t("Ещё: {0}", [others.map((source) => source === "owner" ? t("решение владельца") : source.startsWith("suggestion:") ? t("выбрано в «Предложениях функций»") : source === "rule:privacy" ? t("правило о персональных данных") : source === "rule:signin" ? t("вход в аккаунт") : source).join(", ")])}</p>}
        </fieldset>
      )}
    </details>
  );
}

/** Role × data: what each role may do, only its own records or all. One card per role: readable on a phone. */
export function AccessEditor({ roles, data, value, disabled, onChange, personal, clients }: {
  roles: Array<{ key: string; name: string }>; data: Array<{ key: string; name: string }>; value: AccessRule[]; disabled: boolean;
  onChange: (next: AccessRule[]) => void; personal: boolean; clients: Set<string>;
}) {
  const row = (role: string, entity: string) => value.find((item) => item.role === role && item.data === entity);
  const set = (role: string, entity: string, patch: Partial<AccessRule>) => {
    const current = row(role, entity);
    if (current) onChange(value.map((item) => (item === current ? { ...item, ...patch } : item)).filter((item) => item.actions.length > 0));
    else onChange([...value, { key: freeKey("a", value.map((item) => item.key)), role, data: entity, actions: [], scope: (clients.has(role) ? "own" : "all") as AccessRule["scope"], ...patch }].filter((item) => item.actions.length > 0));
  };
  const labels = actionLabel();
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {roles.map((role) => (
        <article key={role.key} className={styles.section} aria-label={t("Права роли «{0}»", [role.name])}>
          <p className={styles.cardTitle} style={{ margin: "0 0 8px" }}>{role.name || t("Без названия")}</p>
          {data.map((entity) => {
            const current = row(role.key, entity.key);
            const actions = current?.actions ?? [];
            const risky = personal && clients.has(role.key) && current?.scope === "all" && actions.includes("view");
            return (
              <div key={entity.key} style={{ padding: "8px 0", borderTop: "1px solid var(--line, #e3e6e3)" }}>
                <p style={{ margin: "0 0 6px", fontWeight: 600 }}>{entity.name}</p>
                <div role="group" aria-label={t("{0}: {1}", [role.name, entity.name])} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {ACTIONS.map((action) => (
                    <button key={action} type="button" disabled={disabled} aria-pressed={actions.includes(action)} className={actions.includes(action) ? styles.button : styles.secondary}
                      style={{ minHeight: 40, padding: "4px 12px", fontSize: 15 }}
                      onClick={() => set(role.key, entity.key, { actions: actions.includes(action) ? actions.filter((item) => item !== action) : ACTIONS.filter((item) => item === action || actions.includes(item)) })}>{labels[action]}</button>
                  ))}
                  {actions.length > 0 && (
                    <button type="button" disabled={disabled} className={styles.ghost} style={{ minHeight: 40 }} aria-label={t("Чьи записи")}
                      onClick={() => set(role.key, entity.key, { scope: current?.scope === "own" ? "all" : "own" })}>{current?.scope === "own" ? t("· только свои") : t("· все записи")}</button>
                  )}
                </div>
                {risky && <p className={`${styles.notice} ${styles.warn}`} style={{ marginTop: 6 }}>{t("Клиент увидит чужие записи с личными данными. Обычно ставят «только свои».")}</p>}
              </div>
            );
          })}
        </article>
      ))}
    </div>
  );
}

export function QualityEditor({ value, disabled, onChange }: { value: SpecQuality; disabled: boolean; onChange: (next: SpecQuality) => void }) {
  const text = qualityText();
  const filled = QUALITY_KEYS.filter((key) => value[key]).length;
  return (
    <div>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Простыми словами — то, что не видно в функциях, но влияет на цену и работу. Пустое поле значит «ещё не решили». Заполнено {0} из {1}.", [filled, QUALITY_KEYS.length])}</p>
      {QUALITY_KEYS.map((key) => (
        <label key={key} className={styles.field}><span className={styles.label}>{text[key][0]}</span>
          <input className={styles.input} value={value[key] ?? ""} maxLength={200} disabled={disabled} placeholder={text[key][1]} onChange={(event) => onChange({ ...value, [key]: event.target.value })} /></label>
      ))}
    </div>
  );
}

export function ServicesEditor({ value, disabled, onChange }: { value: SpecService[]; disabled: boolean; onChange: (next: SpecService[]) => void }) {
  const set = (index: number, patch: Partial<SpecService>) => onChange(value.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  const labels = accessByLabel();
  return (
    <div>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Оплата, почта, мессенджеры, учётные системы. Для каждой — зачем и кто даёт доступ: без этого работу нельзя оценить.")}</p>
      {value.length === 0 && <p className={styles.small}>{t("Интеграций нет.")}</p>}
      {value.map((service, index) => (
        <article key={service.key} className={styles.section} aria-label={service.name || t("Новая интеграция")}>
          <label className={styles.field}><span className={styles.label}>{t("Сервис")}</span>
            <input className={styles.input} value={service.name} maxLength={80} disabled={disabled} placeholder={t("Например: Kaspi Pay")} onChange={(event) => set(index, { name: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.label}>{t("Зачем")}</span>
            <input className={styles.input} value={service.purpose} maxLength={200} disabled={disabled} placeholder={t("Например: оплата записи картой")} onChange={(event) => set(index, { purpose: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.label}>{t("Кто даёт доступ")}</span>
            <select className={styles.input} value={service.accessBy} disabled={disabled} onChange={(event) => set(index, { accessBy: event.target.value as ServiceAccess })}>
              {(Object.keys(labels) as ServiceAccess[]).map((key) => <option key={key} value={key}>{labels[key]}</option>)}
            </select></label>
          {!disabled && <button type="button" className={styles.ghost} onClick={() => onChange(value.filter((_, position) => position !== index))}>{t("Убрать")}</button>}
        </article>
      ))}
      {!disabled && value.length < 8 && (
        <button type="button" className={`${styles.secondary} ${styles.block}`} onClick={() => onChange([...value, { key: freeKey("svc", value.map((item) => item.key)), name: "", purpose: "", accessBy: "owner" }])}>{t("+ Добавить интеграцию")}</button>
      )}
    </div>
  );
}

/** Every step the product takes and the features that do it; a step nobody covers is shown in red. */
export function CoverageView({ steps, features }: { steps: ReturnType<typeof productSteps>; features: Array<{ title: string; sources?: string[] }> }) {
  if (!steps.length) return <p className={styles.small}>{t("Процесс ещё не принят или в нём нет шагов, которые делает продукт.")}</p>;
  const rows = steps.map((step) => ({ ...step, by: features.filter((feature) => (feature.sources ?? []).includes(step.ref)).map((feature) => feature.title || t("Без названия")) }));
  const missing = rows.filter((row) => !row.by.length).length;
  return (
    <div>
      <p className={missing ? `${styles.notice} ${styles.warn}` : `${styles.notice} ${styles.success}`}>
        {missing ? t("Не покрыто шагов: {0} из {1}. Отметьте их у функций на вкладке «Функции» или добавьте функцию.", [missing, rows.length]) : t("Все {0} шагов процесса, которые делает продукт, описаны функциями.", [rows.length])}
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        {rows.map((row) => (
          <li key={row.ref} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 6, alignItems: "start", padding: "6px 0", borderTop: "1px solid var(--line, #e3e6e3)" }}>
            <span aria-hidden="true" style={{ fontWeight: 700, color: row.by.length ? "#1f6f43" : "#b3261e" }}>{row.by.length ? "✓" : "✕"}</span>
            <span>
              <span className={styles.small}>{row.scenario}:</span> {row.action}
              <br /><span className={styles.small} style={row.by.length ? undefined : { color: "#b3261e" }}>{row.by.length ? `→ ${row.by.join(", ")}` : t("не покрыто функцией")}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
