"use client";

import { useState } from "react";
import type { Content, Design, FieldDefinition, Offer, Preset, Section, SectionType } from "@/lib/journey";
import styles from "../../../journey.module.css";

type LockProps = { lockedKeys: string[]; onToggleLock: (key: string, locked: boolean) => void; canLock: boolean };

function LockBadge({ lockKey, lockedKeys, onToggleLock, canLock }: LockProps & { lockKey: string }) {
  const locked = lockedKeys.includes(lockKey);
  // Only the protected state is shown: it tells the owner why AI keeps this part as is.
  if (!canLock || !locked) return null;
  return (
    <button type="button" className={`${styles.lockBadge} ${locked ? "" : styles.unlocked}`} onClick={() => onToggleLock(lockKey, !locked)}
      title="Вы правили это вручную — ИИ не будет переписывать без вашей просьбы. Нажмите, чтобы разрешить ИИ менять это место." >
      🔒 Защищено от ИИ · снять
    </button>
  );
}

export function FieldsForm({ fields, value, onChange, issueKeys, disabled, ...lock }: LockProps & {
  fields: FieldDefinition[]; value: Record<string, unknown>; onChange: (next: Record<string, unknown>) => void; issueKeys: string[]; disabled: boolean;
}) {
  const set = (key: string, next: unknown) => onChange({ ...value, [key]: next === "" ? null : next });
  return (
    <div>
      {fields.map((field) => {
        const id = `field-${field.key}`;
        const hasIssue = issueKeys.includes(field.key);
        return (
          <div key={field.key} className={styles.field}>
            <div className={styles.row}>
              <label htmlFor={id} className={styles.label}>{field.label}{field.required ? "" : " (необязательно)"}</label>
              <div className={styles.spacer} />
              {value[field.key] ? <LockBadge lockKey={field.key} {...lock} /> : null}
            </div>
            <p className={styles.why}>{field.why} <span>Например: {field.example}</span></p>
            {field.kind === "text" && (
              <input id={id} className={styles.input} value={(value[field.key] as string | null) ?? ""} maxLength={field.maxLength} disabled={disabled}
                aria-invalid={hasIssue} onChange={(event) => set(field.key, event.target.value)} />
            )}
            {field.kind === "textarea" && (
              <textarea id={id} className={styles.textarea} value={(value[field.key] as string | null) ?? ""} maxLength={field.maxLength} disabled={disabled}
                aria-invalid={hasIssue} onChange={(event) => set(field.key, event.target.value)} />
            )}
            {field.kind === "choice" && (
              <div className={styles.choices} role="group" aria-labelledby={id}>
                <span id={id} className={styles.srOnly}>{field.label}</span>
                {field.options?.map((option) => (
                  <button key={option.value} type="button" className={styles.choice} aria-pressed={value[field.key] === option.value} disabled={disabled}
                    onClick={() => set(field.key, option.value)}>
                    <strong>{option.label}</strong><span className={styles.small}>{option.hint}</span>
                  </button>
                ))}
              </div>
            )}
            {field.kind === "list" && (
              <ListField field={field} items={(value[field.key] as Offer["services"] | undefined) ?? []} disabled={disabled} onChange={(items) => set(field.key, items)} />
            )}
            {hasIssue && <p className={styles.why} style={{ color: "#8a1f1f" }}>Это поле нужно заполнить.</p>}
          </div>
        );
      })}
    </div>
  );
}

function ListField({ field, items, onChange, disabled }: { field: FieldDefinition; items: Array<Record<string, string | null>>; onChange: (items: Array<Record<string, string | null>>) => void; disabled: boolean }) {
  const itemFields = field.itemFields ?? [];
  const update = (index: number, key: string, next: string) => onChange(items.map((item, current) => (current === index ? { ...item, [key]: next || null } : item)));
  return (
    <div>
      {items.map((item, index) => (
        <div key={index} className={styles.item}>
          {itemFields.map((itemField) => (
            <input key={itemField.key} className={styles.input} aria-label={`${itemField.label} ${index + 1}`} placeholder={`${itemField.label}: ${itemField.placeholder}`}
              maxLength={itemField.maxLength} disabled={disabled} value={item[itemField.key] ?? ""} onChange={(event) => update(index, itemField.key, event.target.value)} />
          ))}
          <button type="button" className={styles.danger} style={{ minHeight: 40 }} disabled={disabled} onClick={() => onChange(items.filter((_, current) => current !== index))}>Убрать</button>
        </div>
      ))}
      {items.length < (field.maxItems ?? 12) && (
        <button type="button" className={styles.secondary} disabled={disabled}
          onClick={() => onChange([...items, Object.fromEntries(itemFields.map((itemField) => [itemField.key, null]))])}>+ Добавить</button>
      )}
    </div>
  );
}

const buttonTypes: SectionType[] = ["hero", "contacts", "cta"];
const itemTypes: SectionType[] = ["services", "benefits", "steps", "faq"];

export function ContentEditor({ content, onChange, sectionTypes, disabled, aiAvailable, onAskAi, issueKeys, ...lock }: LockProps & {
  content: Content; onChange: (next: Content) => void; sectionTypes: Record<SectionType, string>; disabled: boolean; aiAvailable: boolean;
  onAskAi: (targetKey: string, instruction: string) => Promise<void>; issueKeys: string[];
}) {
  const [newType, setNewType] = useState<SectionType>("faq");
  const updateSection = (key: string, patch: Partial<Section>) => onChange({ ...content, sections: content.sections.map((section) => (section.key === key ? { ...section, ...patch } : section)) });
  const move = (index: number, delta: number) => {
    const sections = [...content.sections];
    const [section] = sections.splice(index, 1);
    sections.splice(index + delta, 0, section);
    onChange({ ...content, sections });
  };
  const addSection = () => {
    let key: string = newType;
    for (let number = 2; content.sections.some((section) => section.key === key); number += 1) key = `${newType}-${number}`;
    const section: Section = { key, type: newType, title: sectionTypes[newType], text: "", items: [], buttonLabel: null };
    const contactsIndex = content.sections.findIndex((item) => item.type === "contacts");
    const sections = [...content.sections];
    sections.splice(contactsIndex >= 0 ? contactsIndex : sections.length, 0, section);
    onChange({ ...content, sections });
  };
  return (
    <div>
      {content.sections.map((section, index) => (
        <article key={section.key} className={styles.section} aria-label={sectionTypes[section.type]}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionType}>{sectionTypes[section.type]}</span>
            <LockBadge lockKey={section.key} {...lock} />
            <div className={styles.spacer} />
            <button type="button" className={styles.iconButton} disabled={disabled || index === 0} aria-label="Поднять блок выше" onClick={() => move(index, -1)}>↑</button>
            <button type="button" className={styles.iconButton} disabled={disabled || index === content.sections.length - 1} aria-label="Опустить блок ниже" onClick={() => move(index, 1)}>↓</button>
            <button type="button" className={styles.iconButton} disabled={disabled || content.sections.length <= 1} aria-label="Удалить блок"
              onClick={() => { if (window.confirm(`Удалить блок «${section.title || sectionTypes[section.type]}»? Его можно вернуть из истории версий.`)) onChange({ ...content, sections: content.sections.filter((item) => item.key !== section.key) }); }}>✕</button>
          </div>
          {issueKeys.includes(section.key) && <p className={`${styles.notice} ${styles.warn}`}>Замените места в [квадратных скобках] своими данными.</p>}
          <label className={styles.field}><span className={styles.label}>Заголовок</span>
            <input className={styles.input} value={section.title} maxLength={120} disabled={disabled} onChange={(event) => updateSection(section.key, { title: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.label}>Текст</span>
            <textarea className={styles.textarea} value={section.text} maxLength={1200} disabled={disabled} onChange={(event) => updateSection(section.key, { text: event.target.value })} /></label>
          {(itemTypes.includes(section.type) || section.items.length > 0) && (
            <div className={styles.field}>
              <span className={styles.label}>{section.type === "faq" ? "Вопросы и ответы" : "Пункты"}</span>
              {section.items.map((item, itemIndex) => (
                <div key={itemIndex} className={styles.item}>
                  <input className={styles.input} aria-label={`Заголовок пункта ${itemIndex + 1}`} value={item.title} maxLength={100} disabled={disabled}
                    onChange={(event) => updateSection(section.key, { items: section.items.map((current, position) => (position === itemIndex ? { ...current, title: event.target.value } : current)) })} />
                  <textarea className={styles.textarea} style={{ minHeight: 64 }} aria-label={`Текст пункта ${itemIndex + 1}`} value={item.text} maxLength={400} disabled={disabled}
                    onChange={(event) => updateSection(section.key, { items: section.items.map((current, position) => (position === itemIndex ? { ...current, text: event.target.value } : current)) })} />
                  <button type="button" className={styles.danger} style={{ minHeight: 40 }} disabled={disabled}
                    onClick={() => updateSection(section.key, { items: section.items.filter((_, position) => position !== itemIndex) })}>Убрать пункт</button>
                </div>
              ))}
              {section.items.length < 12 && <button type="button" className={styles.secondary} disabled={disabled} onClick={() => updateSection(section.key, { items: [...section.items, { title: "", text: "" }] })}>+ Добавить пункт</button>}
            </div>
          )}
          {buttonTypes.includes(section.type) && (
            <label className={styles.field}><span className={styles.label}>Текст на кнопке</span>
              <span className={styles.why}>Кнопка ведёт к главному действию из паспорта проекта.</span>
              <input className={styles.input} value={section.buttonLabel ?? ""} maxLength={40} disabled={disabled} onChange={(event) => updateSection(section.key, { buttonLabel: event.target.value || null })} /></label>
          )}
          {aiAvailable && !disabled && <AskAiInline onAsk={(instruction) => onAskAi(section.key, instruction)} />}
        </article>
      ))}
      {!disabled && content.sections.length < 12 && (
        <div className={styles.card}>
          <p className={styles.cardTitle}>Добавить блок</p>
          <div className={styles.row}>
            <select className={styles.select} style={{ flex: "1 1 200px" }} value={newType} aria-label="Тип блока" onChange={(event) => setNewType(event.target.value as SectionType)}>
              {(Object.keys(sectionTypes) as SectionType[]).filter((type) => type !== "hero").map((type) => <option key={type} value={type}>{sectionTypes[type]}</option>)}
            </select>
            <button type="button" className={styles.secondary} onClick={addSection}>Добавить</button>
          </div>
        </div>
      )}
      <article className={styles.section} aria-label="Для поисковиков">
        <div className={styles.sectionHead}><span className={styles.sectionType}>Для поисковиков</span><LockBadge lockKey="seo" {...lock} /></div>
        <p className={styles.why} style={{ marginBottom: 10 }}>Так сайт будет выглядеть в результатах Google и Яндекса. Посетители на странице это не видят.</p>
        <label className={styles.field}><span className={styles.label}>Заголовок ({content.seo.title.length}/70)</span>
          <input className={styles.input} value={content.seo.title} maxLength={70} disabled={disabled} onChange={(event) => onChange({ ...content, seo: { ...content.seo, title: event.target.value } })} /></label>
        <label className={styles.field}><span className={styles.label}>Описание ({content.seo.description.length}/160)</span>
          <textarea className={styles.textarea} value={content.seo.description} maxLength={160} disabled={disabled} onChange={(event) => onChange({ ...content, seo: { ...content.seo, description: event.target.value } })} /></label>
      </article>
    </div>
  );
}

function AskAiInline({ onAsk }: { onAsk: (instruction: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return <button type="button" className={styles.ghost} onClick={() => setOpen(true)}>✨ Изменить этот блок с ИИ</button>;
  return (
    <div className={styles.field} style={{ margin: 0 }}>
      <label className={styles.label}>Что изменить в этом блоке?
        <input className={styles.input} value={text} maxLength={1000} placeholder="Например: короче и теплее" autoFocus onChange={(event) => setText(event.target.value)} /></label>
      <div className={styles.row}>
        <button type="button" className={styles.button} disabled={busy || text.trim().length < 2}
          onClick={async () => { setBusy(true); try { await onAsk(text.trim()); setText(""); setOpen(false); } finally { setBusy(false); } }}>{busy ? "ИИ работает…" : "Попросить ИИ"}</button>
        <button type="button" className={styles.ghost} onClick={() => setOpen(false)}>Отмена</button>
      </div>
      <p className={styles.why}>ИИ изменит только этот блок. Остальные останутся как есть.</p>
    </div>
  );
}

export function DesignPicker({ design, onChange, options, disabled }: {
  design: Design; onChange: (next: Design) => void; disabled: boolean;
  options: { palettes: Preset[]; fonts: Preset[]; corners: Preset[]; heroLayouts: Preset[] };
}) {
  const group = (title: string, why: string, presets: Preset[], key: keyof Design, colors = false) => (
    <div className={styles.field} role="group" aria-label={title}>
      <span className={styles.label}>{title}</span>
      <p className={styles.why}>{why}</p>
      <div className={styles.swatches}>
        {presets.map((preset) => (
          <button key={preset.id} type="button" className={styles.swatch} aria-pressed={design[key] === preset.id} disabled={disabled}
            onClick={() => onChange({ ...design, [key]: preset.id } as Design)} style={preset.stack ? { fontFamily: preset.stack } : undefined}>
            {colors && <span className={styles.swatchColors} aria-hidden="true"><i style={{ background: preset.background }} /><i style={{ background: preset.accent }} /><i style={{ background: preset.text }} /></span>}
            <strong>{preset.label}</strong><br /><span className={styles.small}>{preset.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div>
      {group("Цвета", "Все палитры проверены: текст хорошо читается на телефоне.", options.palettes, "palette", true)}
      {group("Шрифт", "Шрифты встроены в устройство посетителя — сайт загружается быстро.", options.fonts, "font")}
      {group("Форма кнопок и карточек", "Влияет на общее настроение.", options.corners, "corners")}
      {group("Первый экран", "Как расположить заголовок и кнопку.", options.heroLayouts, "heroLayout")}
    </div>
  );
}
