"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import styles from "../../../journey.module.css";
import { DataDiagram } from "./diagrams";

// The design of an application's architecture (builder-back src/journey/architecture.ts): data schema, components from the
// catalog, decisions, threats, environments. The server rebuilds the plan, the data model and the API contract from it.

export type FieldType = "text" | "long_text" | "number" | "money" | "date" | "datetime" | "bool" | "status" | "email" | "phone" | "file" | "ref";
export type SchemaField = { key: string; name: string; type: FieldType; required: boolean; unique: boolean; ref: string | null; options: string[] };
export type SchemaEntity = { key: string; name: string; plain: string; fields: SchemaField[] };
export type SchemaRelation = { key: string; from: string; to: string; kind: "one_one" | "one_many" | "many_many"; label: string };
export type ComponentKind = keyof ReturnType<typeof catalog>;
export type DesignComponent = { key: string; kind: ComponentKind; name: string; note: string };
export type DesignDecision = { key: string; title: string; options: string[]; chosen: string; why: string; consequences: string; quality: string | null };
export type DesignThreat = { key: string; asset: "money" | "personal_data" | "access" | "availability" | "content"; actor: "dishonest_client" | "former_employee" | "outsider" | "staff_mistake"; how: string; mitigation: string };
export type ArchitectureDesign = {
  schema: { entities: SchemaEntity[]; relations: SchemaRelation[] }; components: DesignComponent[]; decisions: DesignDecision[]; threats: DesignThreat[];
  environments: Array<{ key: "test" | "prod"; where: string; notes: string }>;
};

const typeLabels = (): Record<FieldType, string> => ({
  text: t("текст"), long_text: t("длинный текст"), number: t("число"), money: t("деньги"), date: t("дата"), datetime: t("дата и время"), bool: t("да / нет"),
  status: t("статус из списка"), email: t("почта"), phone: t("телефон"), file: t("файл"), ref: t("ссылка на запись"),
});
const kindLabels = (): Record<SchemaRelation["kind"], string> => ({ one_one: t("один к одному"), one_many: t("один ко многим"), many_many: t("многие ко многим") });
const catalog = () => ({
  web_client: [t("Веб-приложение"), "core"], server_api: [t("Сервер приложения (API)"), "core"], database: [t("База данных"), "core"], auth: [t("Вход и роли"), "core"], admin_panel: [t("Панель управления"), "core"],
  file_storage: [t("Хранилище файлов"), "data"], search: [t("Поиск"), "data"], cache: [t("Кэш"), "data"], queue: [t("Очередь задач"), "background"], scheduler: [t("Задачи по расписанию"), "background"],
  email: [t("Почта"), "service"], sms: [t("SMS"), "service"], messenger: [t("Мессенджер или бот"), "service"], push: [t("Push-уведомления"), "service"], payments: [t("Оплата"), "service"],
  analytics: [t("Аналитика"), "service"], external_api: [t("Внешний сервис"), "service"],
} as const);
const groupLabels = (): Record<string, string> => ({ core: t("Основа"), data: t("Данные"), background: t("Фоновая работа"), service: t("Внешние сервисы") });
const assetLabels = (): Record<DesignThreat["asset"], string> => ({ money: t("деньги"), personal_data: t("личные данные"), access: t("доступ"), availability: t("работа сервиса"), content: t("содержимое") });
const actorLabels = (): Record<DesignThreat["actor"], string> => ({ dishonest_client: t("недобросовестный клиент"), former_employee: t("бывший сотрудник"), outsider: t("посторонний"), staff_mistake: t("ошибка сотрудника") });
const qualityLabels = (): Record<string, string> => ({ speed: t("Скорость"), users: t("Сколько пользователей"), languages: t("Языки"), devices: t("Устройства"), accessibility: t("Доступность"), dataLocation: t("Где хранятся данные"), backups: t("Резервные копии"), retention: t("Сколько хранить данные") });

function freeKey(prefix: string, used: string[]) {
  let index = used.length + 1;
  while (used.includes(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

/** The schema as the diagram draws it, with the link tables many-to-many needs — the same rule as on the server. */
function diagramEntities(design: ArchitectureDesign) {
  const types = typeLabels();
  const name = (key: string) => design.schema.entities.find((entity) => entity.key === key)?.name ?? key;
  const out = design.schema.entities.map((entity) => ({
    key: entity.key, name: entity.name || t("Без названия"),
    fields: entity.fields.map((field) => ({ name: `${field.name}${field.required ? " *" : ""}`, type: field.type === "ref" && field.ref ? `→ ${name(field.ref)}` : types[field.type] })),
    links: [] as Array<{ to: string; kind: "one" | "many"; label: string }>,
  }));
  for (const relation of design.schema.relations) {
    const from = out.find((entity) => entity.key === relation.from);
    const to = out.find((entity) => entity.key === relation.to);
    if (!from || !to) continue;
    if (relation.kind === "many_many") {
      out.push({ key: `${relation.from}_${relation.to}`, name: `${from.name} ↔ ${to.name}`, fields: [{ name: from.name, type: `→ ${from.name}` }, { name: to.name, type: `→ ${to.name}` }],
        links: [{ to: from.key, kind: "one", label: relation.label }, { to: to.key, kind: "one", label: relation.label }] });
    } else {
      // Once, from the «one» side: the diagram itself puts the link field on the side that keeps it.
      from.links.push({ to: to.key, kind: relation.kind === "one_many" ? "many" : "one", label: relation.label });
    }
  }
  return out;
}

type Tab = "schema" | "components" | "decisions" | "threats" | "environments" | "overview";

export function ArchitectureEditor({ value, onChange, disabled, overview, findings }: {
  value: ArchitectureDesign; onChange: (next: ArchitectureDesign) => void; disabled: boolean; overview: React.ReactNode; findings: Array<{ target: string | null; message: string }>;
}) {
  const [tab, setTab] = useState<Tab>("schema");
  const design = { ...value, decisions: value.decisions ?? [], threats: value.threats ?? [], environments: value.environments?.length ? value.environments : [{ key: "test" as const, where: "", notes: "" }, { key: "prod" as const, where: "", notes: "" }] };
  const count = (target: string) => findings.filter((finding) => finding.target === target).length;
  const tabs: Array<[Tab, string, string | null]> = [
    ["schema", t("Схема данных"), String(design.schema.entities.length)],
    ["components", t("Компоненты"), String(design.components.length)],
    ["decisions", t("Решения"), design.decisions.some((item) => !item.chosen) || count("decisions") ? "!" : String(design.decisions.length)],
    ["threats", t("Угрозы"), count("threats") || design.threats.some((item) => !item.mitigation) ? "!" : String(design.threats.length)],
    ["environments", t("Окружения"), null],
    ["overview", t("Обзор"), null],
  ];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div role="tablist" aria-label={t("Разделы архитектуры")} style={{ display: "flex", gap: 6, overflowX: "auto", position: "sticky", top: 52, zIndex: 3, background: "var(--bg, #f6f7f5)", padding: "6px 0" }}>
        {tabs.map(([key, label, badge]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? styles.button : styles.secondary} style={{ minHeight: 40, padding: "4px 12px", whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => setTab(key)}>
            {label}{badge ? <span style={{ marginLeft: 6, opacity: 0.8, color: badge === "!" && tab !== key ? "#b3261e" : undefined }}>{badge}</span> : null}
          </button>
        ))}
      </div>
      {tab === "schema" && <SchemaEditor design={design} onChange={onChange} disabled={disabled} />}
      {tab === "components" && <ComponentsEditor design={design} onChange={onChange} disabled={disabled} />}
      {tab === "decisions" && <DecisionsEditor design={design} onChange={onChange} disabled={disabled} />}
      {tab === "threats" && <ThreatsEditor design={design} onChange={onChange} disabled={disabled} />}
      {tab === "environments" && (
        <section className={styles.card} aria-labelledby="env-title">
          <p id="env-title" className={styles.cardTitle}>{t("Окружения")}</p>
          <p className={styles.small} style={{ marginTop: 0 }}>{t("Где работает тестовая версия, а где — та, которой пользуются клиенты. Данные клиентов в тестовую не копируют.")}</p>
          {design.environments.map((env, index) => (
            <article key={env.key} className={styles.section}>
              <p className={styles.cardTitle} style={{ margin: "0 0 6px" }}>{env.key === "test" ? t("Тестовое") : t("Рабочее")}</p>
              <label className={styles.field}><span className={styles.label}>{t("Где работает")}</span>
                <input className={styles.input} value={env.where} maxLength={200} disabled={disabled} placeholder={env.key === "test" ? t("Например: Render, бесплатный тариф") : t("Например: сервер в Казахстане")}
                  onChange={(event) => onChange({ ...design, environments: design.environments.map((item, position) => (position === index ? { ...item, where: event.target.value } : item)) })} /></label>
              <label className={styles.field}><span className={styles.label}>{t("Заметки")}</span>
                <input className={styles.input} value={env.notes} maxLength={400} disabled={disabled}
                  onChange={(event) => onChange({ ...design, environments: design.environments.map((item, position) => (position === index ? { ...item, notes: event.target.value } : item)) })} /></label>
            </article>
          ))}
        </section>
      )}
      {tab === "overview" && overview}
    </div>
  );
}

function SchemaEditor({ design, onChange, disabled }: { design: ArchitectureDesign; onChange: (next: ArchitectureDesign) => void; disabled: boolean }) {
  const entities = design.schema.entities;
  const types = typeLabels();
  const setSchema = (patch: Partial<ArchitectureDesign["schema"]>) => onChange({ ...design, schema: { ...design.schema, ...patch } });
  const setEntity = (index: number, patch: Partial<SchemaEntity>) => setSchema({ entities: entities.map((entity, position) => (position === index ? { ...entity, ...patch } : entity)) });
  const setField = (index: number, fieldIndex: number, patch: Partial<SchemaField>) => setEntity(index, { fields: entities[index]!.fields.map((field, position) => (position === fieldIndex ? { ...field, ...patch } : field)) });
  const removeEntity = (key: string) => setSchema({
    entities: entities.filter((entity) => entity.key !== key).map((entity) => ({ ...entity, fields: entity.fields.map((field) => (field.ref === key ? { ...field, type: "text" as const, ref: null } : field)) })),
    relations: design.schema.relations.filter((relation) => relation.from !== key && relation.to !== key),
  });
  const kinds = kindLabels();
  const diagram = diagramEntities(design);
  return (
    <>
      {diagram.length > 0 && (
        <section className={styles.card} aria-label={t("Схема")}>
          <p className={styles.cardTitle}>{t("Схема")}</p>
          <p className={styles.small} style={{ marginTop: 0 }}>{t("Строится из того, что ниже. «*» — обязательное поле. Для связи «многие ко многим» таблица-связка появляется сама.")}</p>
          <DataDiagram entities={diagram} />
        </section>
      )}
      {entities.map((entity, index) => (
        <section key={entity.key} className={styles.card} aria-label={entity.name || t("Новая запись")}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input className={styles.input} style={{ flex: 1, fontWeight: 700 }} value={entity.name} maxLength={60} disabled={disabled} aria-label={t("Название записи")} placeholder={t("Например: Запись")} onChange={(event) => setEntity(index, { name: event.target.value })} />
            {!disabled && entity.key !== "user" && <button type="button" className={styles.iconButton} aria-label={t("Убрать запись «{0}»", [entity.name])} onClick={() => removeEntity(entity.key)}>✕</button>}
          </div>
          {entity.fields.map((field, fieldIndex) => (
            <div key={field.key} style={{ display: "grid", gap: 6, padding: "10px 0", borderTop: "1px solid var(--line, #e3e6e3)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, alignItems: "center" }}>
                <input className={styles.input} value={field.name} maxLength={60} disabled={disabled} aria-label={t("Поле {0}", [fieldIndex + 1])} placeholder={t("Название поля")} onChange={(event) => setField(index, fieldIndex, { name: event.target.value })} />
                <select className={styles.input} value={field.type} disabled={disabled} aria-label={t("Тип поля «{0}»", [field.name])}
                  onChange={(event) => setField(index, fieldIndex, { type: event.target.value as FieldType, ref: event.target.value === "ref" ? (entities.find((other) => other.key !== entity.key)?.key ?? null) : null })}>
                  {(Object.keys(types) as FieldType[]).map((type) => <option key={type} value={type}>{types[type]}</option>)}
                </select>
                {!disabled && <button type="button" className={styles.iconButton} aria-label={t("Убрать поле «{0}»", [field.name])} onClick={() => setEntity(index, { fields: entity.fields.filter((_, position) => position !== fieldIndex) })}>✕</button>}
              </div>
              {field.type === "ref" && (
                <label className={styles.small}>{t("На какую запись")}
                  <select className={styles.input} value={field.ref ?? ""} disabled={disabled} onChange={(event) => setField(index, fieldIndex, { ref: event.target.value || null })}>
                    {entities.filter((other) => other.key !== entity.key).map((other) => <option key={other.key} value={other.key}>{other.name}</option>)}
                  </select></label>
              )}
              {field.type === "status" && (
                <label className={styles.small}>{t("Значения через запятую")}
                  <input className={styles.input} defaultValue={field.options.join(", ")} disabled={disabled} placeholder={t("новая, в работе, готово")}
                    onBlur={(event) => setField(index, fieldIndex, { options: event.target.value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12) })} /></label>
              )}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {(["required", "unique"] as const).map((flag) => (
                  <label key={flag} style={{ display: "flex", gap: 6, alignItems: "center", minHeight: 36 }}>
                    <input type="checkbox" checked={field[flag]} disabled={disabled} style={{ width: 20, height: 20 }} onChange={(event) => setField(index, fieldIndex, { [flag]: event.target.checked })} />
                    {flag === "required" ? t("обязательное") : t("не повторяется")}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {!disabled && entity.fields.length < 20 && (
            <button type="button" className={styles.secondary} onClick={() => setEntity(index, { fields: [...entity.fields, { key: freeKey("f", entity.fields.map((field) => field.key)), name: "", type: "text", required: false, unique: false, ref: null, options: [] }] })}>{t("+ Поле")}</button>
          )}
        </section>
      ))}
      {!disabled && entities.length < 16 && (
        <button type="button" className={`${styles.secondary} ${styles.block}`} onClick={() => setSchema({ entities: [...entities, { key: freeKey("e", entities.map((entity) => entity.key)), name: "", plain: "", fields: [{ key: "f1", name: t("Название"), type: "text", required: true, unique: false, ref: null, options: [] }] }] })}>{t("+ Добавить запись")}</button>
      )}
      <section className={styles.card} aria-labelledby="relations-title">
        <p id="relations-title" className={styles.cardTitle}>{t("Связи")}</p>
        <p className={styles.small} style={{ marginTop: 0 }}>{t("«Один ко многим»: у одного клиента много записей. «Многие ко многим»: мастер делает много услуг, и услугу делают много мастеров.")}</p>
        {design.schema.relations.map((relation, index) => (
          <div key={relation.key} style={{ display: "grid", gap: 6, padding: "8px 0", borderTop: "1px solid var(--line, #e3e6e3)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {(["from", "kind", "to"] as const).map((part) => part === "kind" ? (
                <select key={part} className={styles.input} value={relation.kind} disabled={disabled} aria-label={t("Вид связи")} onChange={(event) => setSchema({ relations: design.schema.relations.map((item, position) => (position === index ? { ...item, kind: event.target.value as SchemaRelation["kind"] } : item)) })}>
                  {(Object.keys(kinds) as SchemaRelation["kind"][]).map((kind) => <option key={kind} value={kind}>{kinds[kind]}</option>)}
                </select>
              ) : (
                <select key={part} className={styles.input} value={relation[part]} disabled={disabled} aria-label={part === "from" ? t("Откуда") : t("Куда")} onChange={(event) => setSchema({ relations: design.schema.relations.map((item, position) => (position === index ? { ...item, [part]: event.target.value } : item)) })}>
                  {entities.map((entity) => <option key={entity.key} value={entity.key}>{entity.name}</option>)}
                </select>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input className={styles.input} style={{ flex: 1 }} value={relation.label} maxLength={60} disabled={disabled} aria-label={t("Подпись связи")} placeholder={t("Например: делает")} onChange={(event) => setSchema({ relations: design.schema.relations.map((item, position) => (position === index ? { ...item, label: event.target.value } : item)) })} />
              {!disabled && <button type="button" className={styles.iconButton} aria-label={t("Убрать связь")} onClick={() => setSchema({ relations: design.schema.relations.filter((_, position) => position !== index) })}>✕</button>}
            </div>
          </div>
        ))}
        {!disabled && entities.length >= 2 && (
          <button type="button" className={styles.secondary} onClick={() => setSchema({ relations: [...design.schema.relations, { key: freeKey("r", design.schema.relations.map((item) => item.key)), from: entities[0]!.key, to: entities[1]!.key, kind: "one_many", label: "" }] })}>{t("+ Связь")}</button>
        )}
      </section>
    </>
  );
}

function ComponentsEditor({ design, onChange, disabled }: { design: ArchitectureDesign; onChange: (next: ArchitectureDesign) => void; disabled: boolean }) {
  const items = catalog();
  const groups = groupLabels();
  const set = (index: number, patch: Partial<DesignComponent>) => onChange({ ...design, components: design.components.map((item, position) => (position === index ? { ...item, ...patch } : item)) });
  return (
    <section className={styles.card} aria-labelledby="components-title">
      <p id="components-title" className={styles.cardTitle}>{t("Компоненты")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Из чего состоит приложение. Выбираются из каталога — придумать то, чего не бывает, нельзя. Название можно поменять: например, «Kaspi Pay» вместо «Оплата».")}</p>
      {design.components.map((component, index) => (
        <article key={component.key} className={styles.section}>
          <p className={styles.small} style={{ margin: "0 0 4px" }}>{items[component.kind]?.[0]}</p>
          <div style={{ display: "flex", gap: 6 }}>
            <input className={styles.input} style={{ flex: 1 }} value={component.name} maxLength={60} disabled={disabled} aria-label={t("Название компонента")} onChange={(event) => set(index, { name: event.target.value })} />
            {!disabled && <button type="button" className={styles.iconButton} aria-label={t("Убрать «{0}»", [component.name])} onClick={() => onChange({ ...design, components: design.components.filter((_, position) => position !== index) })}>✕</button>}
          </div>
          <input className={styles.input} style={{ marginTop: 6 }} value={component.note} maxLength={400} disabled={disabled} aria-label={t("Зачем «{0}»", [component.name])} placeholder={t("Зачем и что делает (необязательно)")} onChange={(event) => set(index, { note: event.target.value })} />
        </article>
      ))}
      {!disabled && design.components.length < 16 && (
        <details className={styles.details} style={{ marginTop: 10 }}>
          <summary>{t("+ Добавить из каталога")}</summary>
          {Object.entries(groups).map(([group, label]) => (
            <div key={group} style={{ marginTop: 8 }}>
              <p className={styles.small} style={{ margin: "0 0 4px", fontWeight: 600 }}>{label}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(Object.entries(items) as Array<[ComponentKind, readonly [string, string]]>).filter(([, [, category]]) => category === group).map(([kind, [title]]) => (
                  <button key={kind} type="button" className={styles.secondary} style={{ minHeight: 40, padding: "4px 12px" }}
                    onClick={() => onChange({ ...design, components: [...design.components, { key: freeKey("c", design.components.map((item) => item.key)), kind, name: title, note: "" }] })}>{title}</button>
                ))}
              </div>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

function DecisionsEditor({ design, onChange, disabled }: { design: ArchitectureDesign; onChange: (next: ArchitectureDesign) => void; disabled: boolean }) {
  const set = (index: number, patch: Partial<DesignDecision>) => onChange({ ...design, decisions: design.decisions.map((item, position) => (position === index ? { ...item, ...patch } : item)) });
  const quality = qualityLabels();
  return (
    <section className={styles.card} aria-labelledby="decisions-title">
      <p id="decisions-title" className={styles.cardTitle}>{t("Решения")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Что выбрали, из каких вариантов и почему. Через полгода это объяснит, почему сделано именно так.")}</p>
      {design.decisions.map((decision, index) => (
        <article key={decision.key} className={styles.section} style={decision.chosen ? undefined : { borderColor: "#d08a00" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <input className={styles.input} style={{ flex: 1, fontWeight: 700 }} value={decision.title} maxLength={120} disabled={disabled} aria-label={t("Решение {0}", [index + 1])} placeholder={t("Например: где хранить файлы")} onChange={(event) => set(index, { title: event.target.value })} />
            {!disabled && <button type="button" className={styles.iconButton} aria-label={t("Убрать решение")} onClick={() => onChange({ ...design, decisions: design.decisions.filter((_, position) => position !== index) })}>✕</button>}
          </div>
          <label className={styles.field}><span className={styles.label}>{t("Варианты — по одному в строке")}</span>
            <textarea className={styles.textarea} rows={2} defaultValue={decision.options.join("\n")} disabled={disabled} onBlur={(event) => set(index, { options: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 6) })} /></label>
          <label className={styles.field}><span className={styles.label}>{t("Выбрано")}</span>
            {decision.options.length ? (
              <select className={styles.input} value={decision.chosen} disabled={disabled} onChange={(event) => set(index, { chosen: event.target.value })}>
                <option value="">{t("— ещё не решено —")}</option>
                {decision.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : <input className={styles.input} value={decision.chosen} maxLength={200} disabled={disabled} onChange={(event) => set(index, { chosen: event.target.value })} />}
          </label>
          <label className={styles.field}><span className={styles.label}>{t("Почему")}</span>
            <input className={styles.input} value={decision.why} maxLength={400} disabled={disabled} onChange={(event) => set(index, { why: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.label}>{t("Что это меняет")}</span>
            <input className={styles.input} value={decision.consequences} maxLength={400} disabled={disabled} placeholder={t("Например: дороже на 2000 ₸ в месяц, зато копии каждый день")} onChange={(event) => set(index, { consequences: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.label}>{t("К какому требованию ТЗ")}</span>
            <select className={styles.input} value={decision.quality ?? ""} disabled={disabled} onChange={(event) => set(index, { quality: event.target.value || null })}>
              <option value="">{t("— не связано —")}</option>
              {Object.entries(quality).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
        </article>
      ))}
      {!disabled && design.decisions.length < 16 && (
        <button type="button" className={`${styles.secondary} ${styles.block}`} onClick={() => onChange({ ...design, decisions: [...design.decisions, { key: freeKey("d", design.decisions.map((item) => item.key)), title: "", options: [], chosen: "", why: "", consequences: "", quality: null }] })}>{t("+ Добавить решение")}</button>
      )}
    </section>
  );
}

function ThreatsEditor({ design, onChange, disabled }: { design: ArchitectureDesign; onChange: (next: ArchitectureDesign) => void; disabled: boolean }) {
  const set = (index: number, patch: Partial<DesignThreat>) => onChange({ ...design, threats: design.threats.map((item, position) => (position === index ? { ...item, ...patch } : item)) });
  const assets = assetLabels();
  const actors = actorLabels();
  return (
    <section className={styles.card} aria-labelledby="threats-title">
      <p id="threats-title" className={styles.cardTitle}>{t("Угрозы и меры")}</p>
      <p className={styles.small} style={{ marginTop: 0 }}>{t("Что в продукте ценно, кто может навредить и как, что этому мешает. Каждая угроза потом станет проверкой в плане тестов.")}</p>
      {design.threats.map((threat, index) => (
        <article key={threat.key} className={styles.section} style={threat.mitigation ? undefined : { borderColor: "#b3261e" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, alignItems: "center" }}>
            <select className={styles.input} value={threat.asset} disabled={disabled} aria-label={t("Что под угрозой")} onChange={(event) => set(index, { asset: event.target.value as DesignThreat["asset"] })}>
              {(Object.keys(assets) as DesignThreat["asset"][]).map((key) => <option key={key} value={key}>{assets[key]}</option>)}
            </select>
            <select className={styles.input} value={threat.actor} disabled={disabled} aria-label={t("Кто")} onChange={(event) => set(index, { actor: event.target.value as DesignThreat["actor"] })}>
              {(Object.keys(actors) as DesignThreat["actor"][]).map((key) => <option key={key} value={key}>{actors[key]}</option>)}
            </select>
            {!disabled && <button type="button" className={styles.iconButton} aria-label={t("Убрать угрозу")} onClick={() => onChange({ ...design, threats: design.threats.filter((_, position) => position !== index) })}>✕</button>}
          </div>
          <label className={styles.field}><span className={styles.label}>{t("Как навредит")}</span>
            <textarea className={styles.textarea} rows={2} value={threat.how} maxLength={400} disabled={disabled} onChange={(event) => set(index, { how: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.label}>{t("Что этому мешает")}</span>
            <textarea className={styles.textarea} rows={2} value={threat.mitigation} maxLength={400} disabled={disabled} placeholder={t("Например: сервер проверяет, что запись принадлежит тому, кто спрашивает")} onChange={(event) => set(index, { mitigation: event.target.value })} /></label>
          {!threat.mitigation && <p className={styles.small} style={{ color: "#b3261e", margin: 0 }}>{t("Без меры угроза останется открытой — запишите, что ей мешает.")}</p>}
        </article>
      ))}
      {!disabled && design.threats.length < 20 && (
        <button type="button" className={`${styles.secondary} ${styles.block}`} onClick={() => onChange({ ...design, threats: [...design.threats, { key: freeKey("t", design.threats.map((item) => item.key)), asset: "personal_data", actor: "outsider", how: "", mitigation: "" }] })}>{t("+ Добавить угрозу")}</button>
      )}
    </section>
  );
}
