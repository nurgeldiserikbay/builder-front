"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import styles from "../../../journey.module.css";

// «Контракты» of a web application (builder-back src/journey/contracts.ts): modules and what they own, API operations with
// who may call them and their errors, events, outside services with what happens when they fail. The server checks them
// against the ТЗ and the architecture and turns them into openapi.yaml, schema.sql and contracts.md.

export type Method = "GET" | "POST" | "PATCH" | "DELETE";
export type Channel = "email" | "messenger" | "sms" | "push" | "in_app";
export type ContractAction = "view" | "create" | "edit" | "delete" | "other";
export type OperationError = { status: number; code: string; when: string };
export type ContractModule = { key: string; name: string; owns: string[]; features: string[] };
export type ContractOperation = { key: string; module: string; method: Method; path: string; summary: string; feature: string | null; roles: string[]; entity: string | null; action: ContractAction; errors: OperationError[] };
export type ContractEvent = { key: string; module: string; name: string; when: string; to: string; channel: Channel };
export type ContractIntegration = { key: string; service: string; call: string; onError: string };
export type Contracts = { modules: ContractModule[]; operations: ContractOperation[]; events: ContractEvent[]; integrations: ContractIntegration[] };
export type ContractsOptions = {
  template: Contracts | null; files: Array<{ name: string; mimeType: string; content: string }>;
  limits: { modules: number; operations: number; errors: number; events: number; integrations: number; text: number };
  methods: Method[]; channels: Channel[]; missing: "inputs" | "design" | null;
  roles: Array<{ key: string; name: string }>; features: Array<{ key: string; title: string; priority: string }>;
  entities: Array<{ key: string; name: string; junction: boolean }>; services: string[];
  access: Array<{ role: string; data: string; actions: string[]; scope: "own" | "all" }>;
};
type Finding = { target: string | null; message: string; severity?: string };

const actionLabels = (): Record<ContractAction, string> => ({ view: t("смотреть"), create: t("создавать"), edit: t("изменять"), delete: t("удалять"), other: t("другое") });
const channelLabels = (): Record<Channel, string> => ({ email: t("почта"), messenger: t("мессенджер"), sms: "SMS", push: "push", in_app: t("в приложении") });
const methodHint = (): Record<Method, string> => ({ GET: t("показать"), POST: t("создать"), PATCH: t("изменить"), DELETE: t("удалить") });
const PATH = /^\/api(\/([a-z0-9_-]{1,40}|\{id\}))+$/;

function freeKey(prefix: string, used: string[]) {
  let index = used.length + 1;
  while (used.includes(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

type Tab = "modules" | "operations" | "events" | "integrations" | "files";

export function ContractsEditor({ value, onChange, options, disabled, findings, onRebuild, dirty }: {
  value: Contracts; onChange: (next: Contracts) => void; options: ContractsOptions; disabled: boolean; findings: Finding[]; onRebuild: (() => void) | null; dirty: boolean;
}) {
  const [tab, setTab] = useState<Tab>("operations");
  const has = (targets: string[]) => findings.some((finding) => finding.target && targets.includes(finding.target));
  const tabs: Array<[Tab, string, string | null]> = [
    ["modules", t("Модули"), has(["modules"]) ? "!" : String(value.modules.length)],
    ["operations", t("Операции"), has(["operations", ...value.operations.map((item) => item.key)]) ? "!" : String(value.operations.length)],
    ["events", t("События"), String(value.events.length)],
    ["integrations", t("Интеграции"), has(["integrations", ...value.integrations.map((item) => item.key)]) ? "!" : String(value.integrations.length)],
    ["files", t("Файлы"), null],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
      <div role="tablist" aria-label={t("Разделы контрактов")} style={{ display: "flex", gap: 6, overflowX: "auto", position: "sticky", top: 52, zIndex: 3, background: "var(--bg, #f6f7f5)", padding: "6px 0" }}>
        {tabs.map(([key, label, badge]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? styles.button : styles.secondary} style={{ minHeight: 40, padding: "4px 12px", whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => setTab(key)}>
            {label}{badge ? <span style={{ marginLeft: 6, opacity: 0.8, color: badge === "!" && tab !== key ? "#b3261e" : undefined }}>{badge}</span> : null}
          </button>
        ))}
      </div>
      {tab === "modules" && <ModulesEditor value={value} onChange={onChange} options={options} disabled={disabled} />}
      {tab === "operations" && <OperationsEditor value={value} onChange={onChange} options={options} disabled={disabled} findings={findings} />}
      {tab === "events" && <EventsEditor value={value} onChange={onChange} options={options} disabled={disabled} />}
      {tab === "integrations" && <IntegrationsEditor value={value} onChange={onChange} options={options} disabled={disabled} findings={findings} />}
      {tab === "files" && <FilesView options={options} dirty={dirty} />}
      {onRebuild && options.template && (
        <section className={styles.card} aria-label={t("Собрать заново")}>
          <p className={styles.small} style={{ marginTop: 0 }}>{t("Если архитектура или ТЗ изменились, контракты можно собрать заново. Ваши правки заменятся черновиком платформы — до сохранения их можно вернуть, обновив страницу.")}</p>
          <button type="button" className={styles.secondary} disabled={disabled} onClick={onRebuild}>{t("Собрать заново из архитектуры и ТЗ")}</button>
        </section>
      )}
    </div>
  );
}

function ModulesEditor({ value, onChange, options, disabled }: { value: Contracts; onChange: (next: Contracts) => void; options: ContractsOptions; disabled: boolean }) {
  const set = (index: number, patch: Partial<ContractModule>) => onChange({ ...value, modules: value.modules.map((item, position) => (position === index ? { ...item, ...patch } : item)) });
  const owner = (entity: string) => value.modules.filter((module) => module.owns.includes(entity));
  const entityName = (key: string) => options.entities.find((entity) => entity.key === key)?.name ?? key;
  const remove = (key: string) => {
    const rest = value.modules.filter((module) => module.key !== key);
    const fallback = rest[0]?.key ?? "";
    onChange({ ...value, modules: rest, operations: value.operations.map((item) => (item.module === key ? { ...item, module: fallback } : item)), events: value.events.map((item) => (item.module === key ? { ...item, module: fallback } : item)) });
  };
  return (
    <section className={styles.card} aria-labelledby="modules-title">
      <p id="modules-title" className={styles.cardTitle}>{t("Модули")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Модуль — часть приложения со своими данными. Каждой записью владеет один модуль; другие работают с ней только через его операции — так модули можно писать одновременно.")}</p>
      {value.modules.map((module, index) => (
        <article key={module.key} className={styles.section}>
          <label className={styles.field}><span className={styles.label}>{t("Название модуля")}</span>
            <input className={styles.input} value={module.name} maxLength={60} disabled={disabled} onChange={(event) => set(index, { name: event.target.value })} /></label>
          <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
            <legend className={styles.label} style={{ marginBottom: 6 }}>{t("Владеет данными")}</legend>
            <div className={styles.row}>
              {options.entities.filter((entity) => !entity.junction).map((entity) => {
                const taken = owner(entity.key).some((other) => other.key !== module.key);
                return (
                  <label key={entity.key} className={styles.row} style={{ gap: 6, minHeight: 40 }}>
                    <input type="checkbox" checked={module.owns.includes(entity.key)} disabled={disabled}
                      onChange={(event) => set(index, { owns: event.target.checked ? [...module.owns, entity.key] : module.owns.filter((item) => item !== entity.key) })} />
                    <span>{entity.name}{taken && module.owns.includes(entity.key) ? <span style={{ color: "#b3261e" }}> · {t("два владельца")}</span> : null}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <p className={styles.small} style={{ margin: "0 0 8px" }}>
            {t("Операций: {0}", [value.operations.filter((operation) => operation.module === module.key).length])}
            {module.features.length ? ` · ${t("Функции")}: ${module.features.map((key) => options.features.find((feature) => feature.key === key)?.title ?? key).join(", ")}` : ""}
          </p>
          {!disabled && value.modules.length > 1 && <button type="button" className={styles.danger} onClick={() => remove(module.key)}>{t("Убрать модуль")}</button>}
        </article>
      ))}
      {options.entities.filter((entity) => !entity.junction && !owner(entity.key).length).length > 0 && (
        <p className={styles.small} style={{ color: "#7a4500" }}>{t("Без владельца: {0}", [options.entities.filter((entity) => !entity.junction && !owner(entity.key).length).map((entity) => entityName(entity.key)).join(", ")])}</p>
      )}
      {!disabled && value.modules.length < options.limits.modules && (
        <button type="button" className={styles.secondary} onClick={() => onChange({ ...value, modules: [...value.modules, { key: freeKey("m", value.modules.map((item) => item.key)), name: t("Новый модуль"), owns: [], features: [] }] })}>{t("Добавить модуль")}</button>
      )}
    </section>
  );
}

function OperationsEditor({ value, onChange, options, disabled, findings }: { value: Contracts; onChange: (next: Contracts) => void; options: ContractsOptions; disabled: boolean; findings: Finding[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const actions = actionLabels();
  const set = (key: string, patch: Partial<ContractOperation>) => onChange({ ...value, operations: value.operations.map((item) => (item.key === key ? { ...item, ...patch } : item)) });
  const roleName = (key: string) => options.roles.find((role) => role.key === key)?.name ?? key;
  /** What the ТЗ allows for the record of this operation, to show next to the roles. */
  const allowed = (operation: ContractOperation, role: string) => !operation.entity || operation.entity === "user" || operation.action === "other"
    || options.access.some((row) => row.role === role && row.data === operation.entity && row.actions.includes(operation.action));
  const add = (module: string) => {
    const key = freeKey("op", value.operations.map((item) => item.key));
    onChange({ ...value, operations: [...value.operations, { key, module, method: "GET", path: "/api/", summary: "", feature: null, roles: [], entity: null, action: "other", errors: [{ status: 401, code: "UNAUTHENTICATED", when: t("Пользователь не вошёл") }, { status: 403, code: "FORBIDDEN", when: t("Роли это не разрешено") }] }] });
    setOpen(key);
  };
  return (
    <>
      <p className={styles.small} style={{ margin: 0 }}>{t("Операция — одно действие сервера. Права не должны быть шире матрицы «кто что может» из ТЗ: сервер проверяет их при каждом запросе.")}</p>
      {value.modules.map((module) => {
        const own = value.operations.filter((operation) => operation.module === module.key);
        return (
          <section key={module.key} className={styles.card} aria-label={module.name}>
            <p className={styles.cardTitle}>{module.name}</p>
            {own.length === 0 && <p className={styles.small} style={{ marginTop: 0 }}>{t("Операций пока нет.")}</p>}
            {own.map((operation) => {
              const issues = findings.filter((finding) => finding.target === operation.key);
              const expanded = open === operation.key;
              const pathValid = PATH.test(operation.path);
              return (
                <article key={operation.key} className={styles.section} style={{ paddingTop: 10, paddingBottom: 10 }}>
                  <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : operation.key)}
                    style={{ all: "unset", cursor: "pointer", display: "grid", gap: 4, width: "100%", minHeight: 44 }}>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 15, overflowWrap: "anywhere" }}><strong>{operation.method}</strong> {operation.path}</span>
                    <span className={styles.small}>{operation.summary || "—"} · {operation.roles.length ? operation.roles.map(roleName).join(", ") : t("все, без входа")}</span>
                    {issues.length > 0 && <span className={styles.small} style={{ color: "#b3261e" }}>{issues.map((issue) => issue.message).join(" ")}</span>}
                  </button>
                  {expanded && (
                    <div style={{ marginTop: 12 }}>
                      <div className={styles.row} style={{ alignItems: "flex-end" }}>
                        <label className={styles.field} style={{ flex: "1 1 170px" }}><span className={styles.label}>{t("Метод")}</span>
                          <select className={styles.select} value={operation.method} disabled={disabled} onChange={(event) => set(operation.key, { method: event.target.value as Method })}>
                            {options.methods.map((method) => <option key={method} value={method}>{method} — {methodHint()[method]}</option>)}
                          </select></label>
                        <label className={styles.field} style={{ flex: "2 1 220px" }}><span className={styles.label}>{t("Адрес")}</span>
                          <input className={styles.input} value={operation.path} maxLength={120} disabled={disabled} spellCheck={false} aria-invalid={!pathValid}
                            onChange={(event) => set(operation.key, { path: event.target.value.toLowerCase().replace(/\{id\}/gi, "{id}") })} /></label>
                      </div>
                      {!pathValid && <p className={styles.small} style={{ color: "#b3261e", marginTop: -10 }}>{t("Адрес начинается с /api/, дальше латиница, цифры, «-», «_» и {id}.")}</p>}
                      <label className={styles.field}><span className={styles.label}>{t("Что делает")}</span>
                        <input className={styles.input} value={operation.summary} maxLength={120} disabled={disabled} onChange={(event) => set(operation.key, { summary: event.target.value })} /></label>
                      <div className={styles.row} style={{ alignItems: "flex-end" }}>
                        <label className={styles.field} style={{ flex: "1 1 160px" }}><span className={styles.label}>{t("Запись")}</span>
                          <select className={styles.select} value={operation.entity ?? ""} disabled={disabled} onChange={(event) => set(operation.key, { entity: event.target.value || null })}>
                            <option value="">{t("нет")}</option>
                            {options.entities.map((entity) => <option key={entity.key} value={entity.key}>{entity.name}</option>)}
                          </select></label>
                        <label className={styles.field} style={{ flex: "1 1 140px" }}><span className={styles.label}>{t("Действие")}</span>
                          <select className={styles.select} value={operation.action} disabled={disabled} onChange={(event) => set(operation.key, { action: event.target.value as ContractAction })}>
                            {(Object.keys(actions) as ContractAction[]).map((action) => <option key={action} value={action}>{actions[action]}</option>)}
                          </select></label>
                      </div>
                      <label className={styles.field}><span className={styles.label}>{t("Функция ТЗ")}</span>
                        <select className={styles.select} value={operation.feature ?? ""} disabled={disabled} onChange={(event) => set(operation.key, { feature: event.target.value || null })}>
                          <option value="">{t("служебная операция")}</option>
                          {options.features.map((feature) => <option key={feature.key} value={feature.key}>{feature.title}</option>)}
                        </select></label>
                      <fieldset style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
                        <legend className={styles.label} style={{ marginBottom: 6 }}>{t("Кто может вызвать")}</legend>
                        <div className={styles.row}>
                          {options.roles.map((role) => (
                            <label key={role.key} className={styles.row} style={{ gap: 6, minHeight: 40 }}>
                              <input type="checkbox" checked={operation.roles.includes(role.key)} disabled={disabled}
                                onChange={(event) => set(operation.key, { roles: event.target.checked ? [...operation.roles, role.key] : operation.roles.filter((item) => item !== role.key) })} />
                              <span>{role.name}{!allowed(operation, role.key) ? <span style={{ color: "#7a4500" }}> · {t("в ТЗ не разрешено")}</span> : null}</span>
                            </label>
                          ))}
                        </div>
                        {operation.roles.length === 0 && <p className={styles.small} style={{ margin: "6px 0 0" }}>{t("Без ролей операцию может вызвать кто угодно — так можно только для регистрации и входа.")}</p>}
                      </fieldset>
                      <ErrorsEditor errors={operation.errors} max={options.limits.errors} disabled={disabled} onChange={(errors) => set(operation.key, { errors })} />
                      {!disabled && <button type="button" className={styles.danger} onClick={() => { onChange({ ...value, operations: value.operations.filter((item) => item.key !== operation.key) }); setOpen(null); }}>{t("Убрать операцию")}</button>}
                    </div>
                  )}
                </article>
              );
            })}
            {!disabled && value.operations.length < options.limits.operations && <button type="button" className={styles.secondary} onClick={() => add(module.key)}>{t("Добавить операцию")}</button>}
          </section>
        );
      })}
      {findings.filter((finding) => finding.target === "operations").length > 0 && (
        <section className={styles.card} aria-label={t("Что не покрыто")}>
          <p className={styles.cardTitle}>{t("Что не покрыто")}</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>{findings.filter((finding) => finding.target === "operations").map((finding, index) => <li key={index}>{finding.message}</li>)}</ul>
        </section>
      )}
    </>
  );
}

function ErrorsEditor({ errors, max, disabled, onChange }: { errors: OperationError[]; max: number; disabled: boolean; onChange: (next: OperationError[]) => void }) {
  const set = (index: number, patch: Partial<OperationError>) => onChange(errors.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  return (
    <fieldset style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
      <legend className={styles.label} style={{ marginBottom: 6 }}>{t("Ошибки")}</legend>
      {errors.map((error, index) => (
        <div key={index} className={styles.row} style={{ alignItems: "flex-start", marginBottom: 8 }}>
          <input className={styles.input} style={{ width: 76 }} inputMode="numeric" aria-label={t("Код ответа")} value={error.status} disabled={disabled}
            onChange={(event) => set(index, { status: Number(event.target.value.replace(/\D/g, "").slice(0, 3)) || 400 })} />
          <input className={styles.input} style={{ flex: "1 1 140px", fontFamily: "ui-monospace, monospace" }} aria-label={t("Код ошибки")} value={error.code} maxLength={40} disabled={disabled} spellCheck={false}
            onChange={(event) => set(index, { code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })} />
          <input className={styles.input} style={{ flex: "2 1 200px" }} aria-label={t("Когда бывает")} placeholder={t("Когда бывает")} value={error.when} maxLength={300} disabled={disabled}
            onChange={(event) => set(index, { when: event.target.value })} />
          {!disabled && <button type="button" className={styles.ghost} aria-label={t("Убрать ошибку")} onClick={() => onChange(errors.filter((_, position) => position !== index))}>✕</button>}
        </div>
      ))}
      {!disabled && errors.length < max && <button type="button" className={styles.ghost} onClick={() => onChange([...errors, { status: 400, code: "VALIDATION", when: "" }])}>{t("Добавить ошибку")}</button>}
    </fieldset>
  );
}

function EventsEditor({ value, onChange, options, disabled }: { value: Contracts; onChange: (next: Contracts) => void; options: ContractsOptions; disabled: boolean }) {
  const channels = channelLabels();
  const set = (index: number, patch: Partial<ContractEvent>) => onChange({ ...value, events: value.events.map((item, position) => (position === index ? { ...item, ...patch } : item)) });
  return (
    <section className={styles.card} aria-labelledby="events-title">
      <p id="events-title" className={styles.cardTitle}>{t("События и уведомления")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Что приложение сообщает людям и когда. Черновик взят из шагов процесса, где кого-то уведомляют.")}</p>
      {value.events.length === 0 && <p className={styles.small}>{t("Событий пока нет.")}</p>}
      {value.events.map((event, index) => (
        <article key={event.key} className={styles.section}>
          <label className={styles.field}><span className={styles.label}>{t("Что происходит")}</span>
            <input className={styles.input} value={event.name} maxLength={80} disabled={disabled} onChange={(item) => set(index, { name: item.target.value })} /></label>
          <label className={styles.field}><span className={styles.label}>{t("Когда")}</span>
            <input className={styles.input} value={event.when} maxLength={300} disabled={disabled} onChange={(item) => set(index, { when: item.target.value })} /></label>
          <div className={styles.row} style={{ alignItems: "flex-end" }}>
            <label className={styles.field} style={{ flex: "1 1 160px" }}><span className={styles.label}>{t("Кому")}</span>
              <input className={styles.input} value={event.to} maxLength={80} disabled={disabled} onChange={(item) => set(index, { to: item.target.value })} /></label>
            <label className={styles.field} style={{ flex: "1 1 140px" }}><span className={styles.label}>{t("Канал")}</span>
              <select className={styles.select} value={event.channel} disabled={disabled} onChange={(item) => set(index, { channel: item.target.value as Channel })}>
                {options.channels.map((channel) => <option key={channel} value={channel}>{channels[channel]}</option>)}
              </select></label>
            <label className={styles.field} style={{ flex: "1 1 160px" }}><span className={styles.label}>{t("Модуль")}</span>
              <select className={styles.select} value={event.module} disabled={disabled} onChange={(item) => set(index, { module: item.target.value })}>
                {value.modules.map((module) => <option key={module.key} value={module.key}>{module.name}</option>)}
              </select></label>
          </div>
          {!disabled && <button type="button" className={styles.danger} onClick={() => onChange({ ...value, events: value.events.filter((_, position) => position !== index) })}>{t("Убрать событие")}</button>}
        </article>
      ))}
      {!disabled && value.events.length < options.limits.events && value.modules.length > 0 && (
        <button type="button" className={styles.secondary} onClick={() => onChange({ ...value, events: [...value.events, { key: freeKey("ev", value.events.map((item) => item.key)), module: value.modules[0]!.key, name: "", when: "", to: "", channel: options.channels[0] ?? "in_app" }] })}>{t("Добавить событие")}</button>
      )}
    </section>
  );
}

function IntegrationsEditor({ value, onChange, options, disabled, findings }: { value: Contracts; onChange: (next: Contracts) => void; options: ContractsOptions; disabled: boolean; findings: Finding[] }) {
  const set = (index: number, patch: Partial<ContractIntegration>) => onChange({ ...value, integrations: value.integrations.map((item, position) => (position === index ? { ...item, ...patch } : item)) });
  const missing = options.services.filter((service) => !value.integrations.some((item) => item.service === service));
  return (
    <section className={styles.card} aria-labelledby="integrations-title">
      <p id="integrations-title" className={styles.cardTitle}>{t("Интеграции")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Внешние сервисы иногда не отвечают. Для каждого запишите, что делает приложение и что видит пользователь — тогда сбой не превращается в потерянный заказ.")}</p>
      {value.integrations.length === 0 && <p className={styles.small}>{t("В ТЗ нет внешних сервисов.")}</p>}
      {value.integrations.map((item, index) => {
        const issues = findings.filter((finding) => finding.target === item.key);
        return (
          <article key={item.key} className={styles.section}>
            <label className={styles.field}><span className={styles.label}>{t("Сервис")}</span>
              <input className={styles.input} value={item.service} maxLength={80} disabled={disabled} onChange={(event) => set(index, { service: event.target.value })} /></label>
            <label className={styles.field}><span className={styles.label}>{t("Что вызываем")}</span>
              <input className={styles.input} value={item.call} maxLength={300} disabled={disabled} onChange={(event) => set(index, { call: event.target.value })} /></label>
            <label className={styles.field}><span className={styles.label}>{t("Если не отвечает")}</span>
              <textarea className={styles.textarea} rows={3} value={item.onError} maxLength={300} disabled={disabled} aria-invalid={!item.onError} onChange={(event) => set(index, { onError: event.target.value })} /></label>
            {issues.length > 0 && <p className={styles.small} style={{ color: "#b3261e", marginTop: -10 }}>{issues.map((issue) => issue.message).join(" ")}</p>}
            {!disabled && <button type="button" className={styles.danger} onClick={() => onChange({ ...value, integrations: value.integrations.filter((_, position) => position !== index) })}>{t("Убрать интеграцию")}</button>}
          </article>
        );
      })}
      {!disabled && missing.length > 0 && value.integrations.length < options.limits.integrations && (
        <div className={styles.row}>
          {missing.map((service) => (
            <button key={service} type="button" className={styles.secondary} onClick={() => onChange({ ...value, integrations: [...value.integrations, { key: freeKey("in", value.integrations.map((item) => item.key)), service, call: "", onError: "" }] })}>
              {t("Добавить «{0}»", [service])}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function FilesView({ options, dirty }: { options: ContractsOptions; dirty: boolean }) {
  const [shown, setShown] = useState<string>(options.files[0]?.name ?? "");
  const file = options.files.find((item) => item.name === shown) ?? null;
  const download = (item: { name: string; mimeType: string; content: string }) => {
    const url = URL.createObjectURL(new Blob([item.content], { type: `${item.mimeType};charset=utf-8` }));
    const link = document.createElement("a");
    link.href = url;
    link.download = item.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className={styles.card} aria-labelledby="contract-files-title">
      <p id="contract-files-title" className={styles.cardTitle}>{t("Файлы для разработки")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Из сохранённой версии платформа пишет контракт API, первую миграцию базы и описание модулей. Они же войдут в пакет для разработки.")}</p>
      {dirty && <p className={styles.small} style={{ color: "#7a4500" }}>{t("Есть несохранённые правки: файлы показаны по последней сохранённой версии.")}</p>}
      {options.files.length === 0 ? <p className={styles.small}>{t("Сохраните контракты — и здесь появятся файлы.")}</p> : (
        <>
          <div className={styles.row} style={{ marginBottom: 10 }}>
            {options.files.map((item) => (
              <button key={item.name} type="button" className={shown === item.name ? styles.button : styles.secondary} aria-pressed={shown === item.name} onClick={() => setShown(item.name)}>{item.name}</button>
            ))}
          </div>
          {file && (
            <>
              <pre style={{ maxWidth: "100%", maxHeight: 420, overflow: "auto", background: "var(--sunken, #f1f2f0)", padding: 12, borderRadius: 8, fontSize: 14, lineHeight: 1.45, whiteSpace: "pre", margin: "0 0 10px" }}>{file.content}</pre>
              <button type="button" className={styles.secondary} onClick={() => download(file)}>{t("Скачать {0}", [file.name])}</button>
            </>
          )}
        </>
      )}
    </section>
  );
}
