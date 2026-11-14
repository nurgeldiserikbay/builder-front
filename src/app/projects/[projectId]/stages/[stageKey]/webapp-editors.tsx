"use client";

import { t } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { makeZip } from "@/lib/zip";
import styles from "../../../journey.module.css";
import { FeatureRoleMap, ModuleMap, ScreenFlowDiagram } from "./diagrams";

export type AppRole = { key: string; name: string; description: string };
export type AppFeature = { key: string; title: string; description: string; roles: string[]; priority: "must" | "should" | "later"; acceptance: string[]; data?: string[] };
/** Records the features can work with: the accepted process data and user accounts. */
export type DataOption = { key: string; name: string };
export type AppFeatures = { roles: AppRole[]; features: AppFeature[]; sensitivity: "normal" | "personal" | "payments" | "health"; integrations: string[] };
export type ScreenBlock = { kind: "list" | "table" | "form" | "details" | "text" | "actions" | "stats" | "search"; title: string; fields: string[] };
export type AppScreen = { key: string; title: string; role: string; purpose: string; features: string[]; blocks: ScreenBlock[]; links: string[] };
export type AppScreens = { screens: AppScreen[] };

const priorities: Array<[AppFeature["priority"], string]> = [["must", t("Обязательно в первой версии")], ["should", t("Желательно")], ["later", t("Позже")]];
const sensitivities: Array<[AppFeatures["sensitivity"], string]> = [["normal", t("Обычные данные")], ["personal", t("Персональные данные клиентов")], ["payments", t("Платежи и деньги")], ["health", t("Здоровье или другие особо чувствительные данные")]];
const blockKinds: Array<[ScreenBlock["kind"], string]> = [["list", t("Список")], ["table", t("Таблица")], ["form", t("Форма")], ["details", t("Карточка с данными")], ["text", t("Текст")], ["actions", t("Кнопки действий")], ["stats", t("Показатели")], ["search", t("Поиск и фильтры")]];

export const blankFeatures = (): AppFeatures => ({ roles: [{ key: "user", name: t("Пользователь"), description: "" }], features: [], sensitivity: "personal", integrations: [] });
export const blankScreens = (): AppScreens => ({ screens: [] });

/** A free latin key: the server keeps keys stable, so links between roles, functions and screens survive renames. */
function freeKey(prefix: string, used: string[]): string {
  let index = used.length + 1;
  while (used.includes(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}
const lines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);
const commas = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

export function FeaturesEditor({ value, onChange, disabled, issues, dataOptions = [] }: { value: AppFeatures; onChange: (next: AppFeatures) => void; disabled: boolean; issues: string[]; dataOptions?: DataOption[] }) {
  const setRole = (key: string, patch: Partial<AppRole>) => onChange({ ...value, roles: value.roles.map((role) => (role.key === key ? { ...role, ...patch } : role)) });
  const setFeature = (key: string, patch: Partial<AppFeature>) => onChange({ ...value, features: value.features.map((feature) => (feature.key === key ? { ...feature, ...patch } : feature)) });
  const removeRole = (key: string) => onChange({ ...value, roles: value.roles.filter((role) => role.key !== key), features: value.features.map((feature) => ({ ...feature, roles: feature.roles.filter((item) => item !== key) })) });
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {issues.length > 0 && <div className={`${styles.notice} ${styles.warn}`}><strong>{t("Чего не хватает")}</strong><ul className={styles.list}>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
      <section className={styles.card} aria-labelledby="roles-title">
        <p id="roles-title" className={styles.cardTitle}>{t("Роли")}</p>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("Кто входит в приложение: клиенты, сотрудники, вы как администратор.")}</p>
        {value.roles.map((role) => (
          <div key={role.key} style={{ display: "grid", gap: 6, borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
            <label className={styles.small}>{t("Название роли")}<input className={styles.input} value={role.name} maxLength={40} disabled={disabled} onChange={(event) => setRole(role.key, { name: event.target.value })} /></label>
            <label className={styles.small}>{t("Что делает")}<input className={styles.input} value={role.description} maxLength={200} disabled={disabled} onChange={(event) => setRole(role.key, { description: event.target.value })} /></label>
            {!disabled && value.roles.length > 1 && <button type="button" className={styles.ghost} onClick={() => removeRole(role.key)}>{t("Убрать роль")}</button>}
          </div>
        ))}
        {!disabled && value.roles.length < 6 && <button type="button" className={styles.secondary} style={{ marginTop: 10 }} onClick={() => onChange({ ...value, roles: [...value.roles, { key: freeKey("role", value.roles.map((role) => role.key)), name: "", description: "" }] })}>{t("+ Добавить роль")}</button>}
      </section>

      <section className={styles.card} aria-labelledby="features-title">
        <p id="features-title" className={styles.cardTitle}>{t("Функции")}</p>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("Что можно сделать в приложении. Критерии приёмки — по одному в строке: по ним проверят, что функция готова.")}</p>
        {value.features.map((feature) => (
          <article key={feature.key} style={{ display: "grid", gap: 6, borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
            <label className={styles.small}>{t("Название")}<input className={styles.input} value={feature.title} maxLength={80} disabled={disabled} onChange={(event) => setFeature(feature.key, { title: event.target.value })} /></label>
            <label className={styles.small}>{t("Описание")}<textarea className={styles.input} value={feature.description} maxLength={400} disabled={disabled} onChange={(event) => setFeature(feature.key, { description: event.target.value })} /></label>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className={styles.small}>{t("Кто пользуется")}</legend>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {value.roles.map((role) => (
                  <label key={role.key} style={{ display: "flex", gap: 6, alignItems: "center", minHeight: 36 }}>
                    <input type="checkbox" disabled={disabled} checked={feature.roles.includes(role.key)} style={{ width: 20, height: 20 }}
                      onChange={(event) => setFeature(feature.key, { roles: event.target.checked ? [...feature.roles, role.key] : feature.roles.filter((item) => item !== role.key) })} />
                    {role.name || t("Без названия")}
                  </label>
                ))}
              </div>
            </fieldset>
            {dataOptions.length > 0 && (
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className={styles.small}>{t("С какими данными работает")}</legend>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {dataOptions.map((option) => (
                    <label key={option.key} style={{ display: "flex", gap: 6, alignItems: "center", minHeight: 36 }}>
                      <input type="checkbox" disabled={disabled} checked={(feature.data ?? []).includes(option.key)} style={{ width: 20, height: 20 }}
                        onChange={(event) => setFeature(feature.key, { data: event.target.checked ? [...(feature.data ?? []), option.key].slice(0, 8) : (feature.data ?? []).filter((item) => item !== option.key) })} />
                      {option.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <label className={styles.small}>{t("Когда нужна")}
              <select className={styles.input} value={feature.priority} disabled={disabled} onChange={(event) => setFeature(feature.key, { priority: event.target.value as AppFeature["priority"] })}>
                {priorities.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className={styles.small}>{t("Критерии приёмки")}<textarea className={styles.input} value={feature.acceptance.join("\n")} disabled={disabled} placeholder={t("Например: клиент видит статус заявки сразу после отправки")}
              onChange={(event) => setFeature(feature.key, { acceptance: event.target.value.split("\n").slice(0, 6) })} onBlur={(event) => setFeature(feature.key, { acceptance: lines(event.target.value) })} /></label>
            {!disabled && <button type="button" className={styles.ghost} onClick={() => onChange({ ...value, features: value.features.filter((item) => item.key !== feature.key) })}>{t("Убрать функцию")}</button>}
          </article>
        ))}
        {!disabled && value.features.length < 30 && (
          <button type="button" className={styles.secondary} style={{ marginTop: 10 }}
            onClick={() => onChange({ ...value, features: [...value.features, { key: freeKey("f", value.features.map((feature) => feature.key)), title: "", description: "", roles: value.roles.slice(0, 1).map((role) => role.key), priority: "must", acceptance: [], data: [] }] })}>{t("+ Добавить функцию")}</button>
        )}
      </section>

      {value.roles.length > 0 && value.features.length > 0 && (
        <section className={styles.card} aria-labelledby="feature-map-title">
          <p id="feature-map-title" className={styles.cardTitle}>{t("Карта функций по ролям")}</p>
          <p className={styles.small} style={{ marginTop: 0 }}>{t("Кто что делает в приложении. Роль без единой галочки отмечена «!» — ей нечего делать. Таблица широкая — листайте вбок.")}</p>
          <FeatureRoleMap roles={value.roles} features={value.features} />
        </section>
      )}
      {value.features.some((feature) => (feature.data ?? []).length > 0) && dataOptions.length > 0 && (
        <section className={styles.card} aria-labelledby="module-map-title">
          <p id="module-map-title" className={styles.cardTitle}>{t("Карта модулей")}</p>
          <p className={styles.small} style={{ marginTop: 0 }}>{t("Кто → что делает → с какими данными. Нажмите на роль, функцию или данные, чтобы подсветить связи. Красным — функции без данных и данные, с которыми никто не работает.")}</p>
          <ModuleMap roles={value.roles} features={value.features} data={dataOptions} />
        </section>
      )}

      <section className={styles.card} aria-labelledby="data-title">
        <p id="data-title" className={styles.cardTitle}>{t("Данные и интеграции")}</p>
        <label className={styles.small}>{t("Какие данные хранит приложение")}
          <select className={styles.input} value={value.sensitivity} disabled={disabled} onChange={(event) => onChange({ ...value, sensitivity: event.target.value as AppFeatures["sensitivity"] })}>
            {sensitivities.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <p className={styles.small}>{t("От этого зависят требования к защите в пакете: платежи и медицинские данные требуют отдельной проверки.")}</p>
        <label className={styles.small}>{t("С какими сервисами связать (через запятую)")}<input className={styles.input} value={value.integrations.join(", ")} disabled={disabled} placeholder={t("Например: Kaspi, 1С, Google Календарь")}
          onChange={(event) => onChange({ ...value, integrations: commas(event.target.value).slice(0, 8) })} /></label>
      </section>
    </div>
  );
}

export function ScreensEditor({ value, onChange, features, disabled, issues }: { value: AppScreens; onChange: (next: AppScreens) => void; features: AppFeatures | null; disabled: boolean; issues: string[] }) {
  const roles = features?.roles ?? [];
  const setScreen = (key: string, patch: Partial<AppScreen>) => onChange({ screens: value.screens.map((screen) => (screen.key === key ? { ...screen, ...patch } : screen)) });
  const setBlock = (screen: AppScreen, index: number, patch: Partial<ScreenBlock>) => setScreen(screen.key, { blocks: screen.blocks.map((block, at) => (at === index ? { ...block, ...patch } : block)) });
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {issues.length > 0 && <div className={`${styles.notice} ${styles.warn}`}><strong>{t("Чего не хватает")}</strong><ul className={styles.list}>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
      {value.screens.length > 0 && (
        <section className={styles.card} aria-labelledby="screen-flow-title">
          <p id="screen-flow-title" className={styles.cardTitle}>{t("Схема переходов")}</p>
          <p className={styles.small} style={{ marginTop: 0 }}>{t("Сверху — стартовый экран роли, ниже — экраны, куда можно перейти, по числу нажатий. «↩ ещё N» — переходы назад или вбок. Красным — экраны, куда нельзя попасть, и переходы на экраны другой роли или на несуществующий экран.")}</p>
          <ScreenFlowDiagram screens={value.screens} roles={roles} />
        </section>
      )}
      {roles.map((role) => {
        const own = value.screens.filter((screen) => screen.role === role.key);
        return (
          <section key={role.key} className={styles.card} aria-label={t("Экраны роли «{0}»", [role.name])}>
            <p className={styles.cardTitle}>{role.name}</p>
            {own.length === 0 && <p className={styles.small}>{t("У этой роли пока нет экранов.")}</p>}
            {own.map((screen) => (
              <article key={screen.key} style={{ display: "grid", gap: 6, borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
                <label className={styles.small}>{t("Экран")}<input className={styles.input} value={screen.title} maxLength={60} disabled={disabled} onChange={(event) => setScreen(screen.key, { title: event.target.value })} /></label>
                <label className={styles.small}>{t("Зачем он")}<input className={styles.input} value={screen.purpose} maxLength={300} disabled={disabled} onChange={(event) => setScreen(screen.key, { purpose: event.target.value })} /></label>
                <details>
                  <summary className={styles.small}>{t("Функции на экране ({0})", [screen.features.length])}</summary>
                  {(features?.features ?? []).map((feature) => (
                    <label key={feature.key} style={{ display: "flex", gap: 6, alignItems: "center", minHeight: 34 }}>
                      <input type="checkbox" disabled={disabled} checked={screen.features.includes(feature.key)} style={{ width: 20, height: 20 }}
                        onChange={(event) => setScreen(screen.key, { features: event.target.checked ? [...screen.features, feature.key] : screen.features.filter((item) => item !== feature.key) })} />
                      {feature.title}
                    </label>
                  ))}
                </details>
                <p className={styles.small} style={{ margin: "6px 0 0" }}>{t("Блоки")}</p>
                {screen.blocks.map((block, index) => (
                  <div key={index} style={{ display: "grid", gap: 4, gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)", alignItems: "end" }}>
                    <select className={styles.input} aria-label={t("Вид блока")} value={block.kind} disabled={disabled} onChange={(event) => setBlock(screen, index, { kind: event.target.value as ScreenBlock["kind"] })}>
                      {blockKinds.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                    <input className={styles.input} aria-label={t("Заголовок блока")} placeholder={t("Заголовок")} value={block.title} maxLength={80} disabled={disabled} onChange={(event) => setBlock(screen, index, { title: event.target.value })} />
                    <input className={styles.input} style={{ gridColumn: "1 / -1" }} aria-label={t("Поля блока")} placeholder={t("Поля через запятую: Имя, Телефон, Статус")} value={block.fields.join(", ")} disabled={disabled}
                      onChange={(event) => setBlock(screen, index, { fields: commas(event.target.value).slice(0, 12) })} />
                    {!disabled && <button type="button" className={styles.ghost} style={{ gridColumn: "1 / -1", justifySelf: "start" }} onClick={() => setScreen(screen.key, { blocks: screen.blocks.filter((_, at) => at !== index) })}>{t("Убрать блок")}</button>}
                  </div>
                ))}
                {!disabled && screen.blocks.length < 8 && <button type="button" className={styles.secondary} onClick={() => setScreen(screen.key, { blocks: [...screen.blocks, { kind: "list", title: "", fields: [] }] })}>{t("+ Блок")}</button>}
                <details>
                  <summary className={styles.small}>{t("Куда можно перейти ({0})", [screen.links.length])}</summary>
                  {value.screens.filter((other) => other.key !== screen.key).map((other) => (
                    <label key={other.key} style={{ display: "flex", gap: 6, alignItems: "center", minHeight: 34 }}>
                      <input type="checkbox" disabled={disabled} checked={screen.links.includes(other.key)} style={{ width: 20, height: 20 }}
                        onChange={(event) => setScreen(screen.key, { links: event.target.checked ? [...screen.links, other.key].slice(0, 8) : screen.links.filter((item) => item !== other.key) })} />
                      {other.title || t("Без названия")}
                    </label>
                  ))}
                </details>
                {!disabled && <button type="button" className={styles.ghost} onClick={() => onChange({ screens: value.screens.filter((item) => item.key !== screen.key).map((item) => ({ ...item, links: item.links.filter((link) => link !== screen.key) })) })}>{t("Убрать экран")}</button>}
              </article>
            ))}
            {!disabled && value.screens.length < 20 && (
              <button type="button" className={styles.secondary} style={{ marginTop: 10 }}
                onClick={() => onChange({ screens: [...value.screens, { key: freeKey("s", value.screens.map((screen) => screen.key)), title: "", role: role.key, purpose: "", features: [], blocks: [{ kind: "list", title: "", fields: [] }], links: [] }] })}>{t("+ Экран для роли «{0}»", [role.name])}</button>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** The prototype of the saved draft in a frame without scripts; screens switch by the buttons and by the links inside. */
export function PrototypeView({ projectId, version }: { projectId: string; version: number | null }) {
  const [state, setState] = useState<{ html: string; screen: string | null; screens: Array<{ key: string; title: string }> } | null>(null);
  const [error, setError] = useState("");
  const open = useCallback(async (screen: string | null) => {
    setError("");
    try { setState(await api(`/projects/${projectId}/prototype${screen ? `?screen=${encodeURIComponent(screen)}` : ""}`)); } catch (caught) { setError(explainError(caught)); }
  }, [projectId]);
  useEffect(() => { if (version !== null) void open(null); }, [open, version]);
  if (version === null) return null;
  return (
    <section className={styles.card} aria-label={t("Прототип")}>
      <p className={styles.cardTitle}>{t("Прототип")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Сохранённая версия {0}. Пройдите экраны так, как будет ходить каждая роль.", [version])}</p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {state && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }} role="tablist" aria-label={t("Экраны")}>
            {state.screens.map((screen) => <button key={screen.key} type="button" role="tab" aria-selected={screen.key === state.screen} className={screen.key === state.screen ? styles.button : styles.secondary} onClick={() => void open(screen.key)}>{screen.title}</button>)}
          </div>
          {/* Links inside the frame point at other screen files, which the frame cannot load; the buttons above switch screens. */}
          <iframe title={t("Прототип экрана")} sandbox="" srcDoc={state.html} style={{ width: "100%", height: 560, border: "1px solid var(--line)", borderRadius: 12, background: "#fff" }} />
        </>
      )}
    </section>
  );
}

type HandoffContent = { checks: Array<{ id: string; status: "passed" | "warning" | "failed"; title: string; details: string; required: boolean }>; files: Array<{ name: string; bytes: number }>; compiledAt: string; packageVersion: string };

/** The package: completeness checks, what is inside, and the download of all files as one archive. */
export function HandoffView({ projectId, content, canBuild, inputsReady, onBuilt }: { projectId: string; content: HandoffContent | null; canBuild: boolean; inputsReady: boolean; onBuilt: () => Promise<void> }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function build() {
    setBusy("build"); setError("");
    try { await api(`/projects/${projectId}/handoff`, { method: "POST" }); await onBuilt(); } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }
  async function downloadAll() {
    setBusy("zip"); setError("");
    try {
      const result = await api<{ files: Array<{ name: string; content: string }> }>(`/projects/${projectId}/handoff`);
      const blob = makeZip(result.files);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "package.zip";
      document.body.appendChild(link); link.click(); link.remove();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }
  return (
    <section className={styles.card} aria-label={t("Пакет для разработки")}>
      <p className={styles.cardTitle}>{t("Пакет для разработки")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Платформа соберёт ТЗ, права по ролям, схему данных, контракт API и прототип из принятых этапов. Код приложения BuildPath не пишет — пакет для разработчика.")}</p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {canBuild && <button className={`${styles.button} ${styles.block}`} disabled={Boolean(busy) || !inputsReady} onClick={build}>{busy === "build" ? t("Собираем…") : content ? t("Собрать заново") : t("Собрать пакет")}</button>}
      {!inputsReady && <p className={styles.small}>{t("Сначала примите функции, экраны и архитектуру.")}</p>}
      {content && (
        <>
          <p className={styles.cardTitle} style={{ marginTop: 16 }}>{t("Проверки")}</p>
          <ul className={styles.checks}>
            {content.checks.map((check) => (
              <li key={check.id}>
                <span className={`${styles.checkIcon} ${styles[check.status]}`} aria-hidden="true">{check.status === "passed" ? "✓" : check.status === "warning" ? "!" : "✕"}</span>
                <span><strong>{check.title}</strong>{check.required ? "" : t(" (рекомендация)")}<br /><span className={styles.small}>{check.details}</span></span>
              </li>
            ))}
          </ul>
          <p className={styles.cardTitle} style={{ marginTop: 12 }}>{t("Что внутри")}</p>
          <ul className={styles.list}>{content.files.filter((file) => !file.name.startsWith("prototype/")).map((file) => <li key={file.name}><code>{file.name}</code> · {Math.max(1, Math.round(file.bytes / 1024))} {t("КБ")}</li>)}
            <li><code>prototype/</code> · {t("экранов: {0}", [content.files.filter((file) => file.name.startsWith("prototype/")).length])}</li></ul>
          <button className={styles.secondary} disabled={Boolean(busy)} onClick={downloadAll}>{busy === "zip" ? t("Готовим архив…") : t("⬇ Скачать пакет (.zip)")}</button>
          <p className={styles.small} style={{ marginTop: 10 }}>{t("Это пакет для разработки, а не готовое приложение: API — черновик контракта, код не создавался и не проверялся.")}</p>
        </>
      )}
    </section>
  );
}
