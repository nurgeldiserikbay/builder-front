"use client";

import { t } from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { explainError, images, shrinkPhoto, type Content, type Design, type FieldDefinition, type Offer, type Preset, type ProjectImage, type Section, type SectionType } from "@/lib/journey";
import styles from "../../../journey.module.css";

type LockProps = { lockedKeys: string[]; onToggleLock: (key: string, locked: boolean) => void; canLock: boolean };

function LockBadge({ lockKey, lockedKeys, onToggleLock, canLock }: LockProps & { lockKey: string }) {
  const locked = lockedKeys.includes(lockKey);
  // Only the protected state is shown: it tells the owner why AI keeps this part as is.
  if (!canLock || !locked) return null;
  return (
    <button type="button" className={`${styles.lockBadge} ${locked ? "" : styles.unlocked}`} onClick={() => onToggleLock(lockKey, !locked)}
      title={t("Вы правили это вручную — ИИ не будет переписывать без вашей просьбы. Нажмите, чтобы разрешить ИИ менять это место.")} >
      {t("🔒 Защищено от ИИ · снять")}
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
              <label htmlFor={id} className={styles.label}>{field.label}{field.required ? "" : t(" (необязательно)")}</label>
              <div className={styles.spacer} />
              {value[field.key] ? <LockBadge lockKey={field.key} {...lock} /> : null}
            </div>
            <p className={styles.why}>{field.why} <span>{t("Например:")}{" "}{field.example}</span></p>
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
            {hasIssue && <p className={styles.why} style={{ color: "#8a1f1f" }}>{t("Это поле нужно заполнить.")}</p>}
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
          <button type="button" className={styles.danger} style={{ minHeight: 40 }} disabled={disabled} onClick={() => onChange(items.filter((_, current) => current !== index))}>{t("Убрать")}</button>
        </div>
      ))}
      {items.length < (field.maxItems ?? 12) && (
        <button type="button" className={styles.secondary} disabled={disabled}
          onClick={() => onChange([...items, Object.fromEntries(itemFields.map((itemField) => [itemField.key, null]))])}>{t("+ Добавить")}</button>
      )}
    </div>
  );
}

const buttonTypes: SectionType[] = ["hero", "contacts", "cta"];
const itemTypes: SectionType[] = ["services", "benefits", "steps", "faq"];

const photoTypes: SectionType[] = ["hero", "about", "services", "benefits", "cta"];

/** Loads processed photos with the session cookie and keeps object URLs for thumbnails. */
function usePhotoLibrary(projectId: string) {
  const [items, setItems] = useState<ProjectImage[] | null>(null);
  const [limit, setLimit] = useState(30);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  const apply = useCallback((library: { items: ProjectImage[]; limit: number }) => {
    setItems(library.items);
    setLimit(library.limit);
    for (const item of library.items) {
      if (urlsRef.current[item.id]) continue;
      images.objectUrl(projectId, item.id).then((url) => setUrls((current) => ({ ...current, [item.id]: url }))).catch(() => undefined);
    }
  }, [projectId]);
  const reload = useCallback(() => images.list(projectId).then(apply), [projectId, apply]);
  useEffect(() => { reload().catch(() => setItems([])); }, [reload]);
  useEffect(() => () => { for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url); }, []);
  return { items, limit, urls, apply, reload };
}
type PhotoLibrary = ReturnType<typeof usePhotoLibrary>;

function PhotoControl({ projectId, library, imageId, onSelect, disabled, sectionLabel }: {
  projectId: string; library: PhotoLibrary; imageId: string | null; onSelect: (id: string | null) => void; disabled: boolean; sectionLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ blob: Blob; url: string } | null>(null);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = imageId ? library.items?.find((item) => item.id === imageId) ?? null : null;
  const [altDraft, setAltDraft] = useState(current?.alt ?? "");
  useEffect(() => { setAltDraft(current?.alt ?? ""); }, [current?.alt]);
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url); }, [pending]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const blob = await shrinkPhoto(file);
    setPending({ blob, url: URL.createObjectURL(blob) });
    setAlt("");
  };
  const upload = async () => {
    if (!pending || !alt.trim()) return;
    setBusy(true); setError(null);
    try {
      const image = await images.upload(projectId, pending.blob, alt.trim());
      await library.reload();
      onSelect(image.id);
      setPending(null); setOpen(false);
    } catch (problem) { setError(explainError(problem)); } finally { setBusy(false); }
  };
  const saveAlt = async () => {
    if (!current || altDraft.trim() === current.alt) return;
    try { library.apply(await images.setAlt(projectId, current.id, altDraft.trim())); } catch (problem) { setError(explainError(problem)); }
  };
  const remove = async (id: string) => {
    if (!window.confirm(t("Удалить фото из проекта? Вернуть его будет нельзя — только загрузить заново."))) return;
    try { library.apply(await images.remove(projectId, id)); } catch (problem) { setError(explainError(problem)); }
  };

  if (imageId && !open) {
    return (
      <div className={styles.field}>
        <span className={styles.label}>{t("Фото")}</span>
        {current ? (
          <div className={styles.photoCurrent}>
            {library.urls[current.id] ? <img src={library.urls[current.id]} alt={current.alt} className={styles.photoThumb} /> : <div className={styles.photoThumb} />}
            <label className={styles.field} style={{ marginBottom: 0 }}><span className={styles.why}>{t("Что на фото? Это описание слышат незрячие посетители и видят поисковики.")}</span>
              <input className={styles.input} value={altDraft} maxLength={200} disabled={disabled} placeholder={t("Например: торт с ягодами на день рождения")}
                onChange={(event) => setAltDraft(event.target.value)} onBlur={saveAlt} /></label>
          </div>
        ) : <p className={`${styles.notice} ${styles.warn}`}>{t("Это фото удалено из проекта. Уберите его или выберите другое.")}</p>}
        {error && <p className={`${styles.notice} ${styles.warn}`} role="alert">{error}</p>}
        {!disabled && (
          <div className={styles.row}>
            <button type="button" className={styles.secondary} onClick={() => setOpen(true)}>{t("Заменить")}</button>
            <button type="button" className={styles.danger} onClick={() => onSelect(null)}>{t("Убрать фото из блока")}</button>
          </div>
        )}
      </div>
    );
  }
  if (disabled) return null;
  if (!open) return <button type="button" className={styles.secondary} onClick={() => setOpen(true)}>{t("+ Добавить фото")}</button>;
  const others = (library.items ?? []).filter((item) => item.id !== imageId);
  return (
    <div className={styles.photoPanel} aria-label={t("Фото для блока «{0}»", [sectionLabel])}>
      <p className={styles.why}>{t("Лучше всего — ваши настоящие фото: работы, товар, место, команда. Фото подстроится под ширину экрана, а скрытые данные (например, место съёмки) удалятся.")}</p>
      {pending ? (
        <div>
          <img src={pending.url} alt="" className={styles.photoThumb} />
          <label className={styles.field}><span className={styles.label}>{t("Что на фото?")}</span>
            <span className={styles.why}>{t("Коротко, 3–8 слов. Нужно для незрячих посетителей и поисковиков.")}</span>
            <input className={styles.input} value={alt} maxLength={200} autoFocus placeholder={t("Например: мастер укладывает плитку в ванной")} onChange={(event) => setAlt(event.target.value)} /></label>
          <div className={styles.row}>
            <button type="button" className={styles.button} disabled={busy || !alt.trim()} onClick={upload}>{busy ? t("Загружаем…") : t("Добавить фото")}</button>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => setPending(null)}>{t("Другое фото")}</button>
          </div>
        </div>
      ) : (
        <>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" hidden onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ""; }} />
          <div className={styles.row}>
            <button type="button" className={styles.button} disabled={others.length >= library.limit} onClick={() => fileRef.current?.click()}>{t("Загрузить с телефона")}</button>
            <button type="button" className={styles.secondary} onClick={() => setOpen(false)}>{t("Отмена")}</button>
          </div>
          {others.length >= library.limit && <p className={styles.why}>{t("В проекте уже")}{" "}{library.limit}{" "}{t("фото — удалите ненужные ниже.")}</p>}
          {others.length > 0 && (
            <>
              <p className={styles.label} style={{ marginTop: 12 }}>{t("Или выберите из загруженных")}</p>
              <div className={styles.photoGrid}>
                {others.map((item) => (
                  <div key={item.id} className={styles.photoCell}>
                    <button type="button" className={styles.photoPick} onClick={() => { onSelect(item.id); setOpen(false); }} aria-label={t("Выбрать фото: {0}", [item.alt || t("без описания")])}>
                      {library.urls[item.id] ? <img src={library.urls[item.id]} alt="" /> : null}
                    </button>
                    {!item.inUse && <button type="button" className={styles.photoDelete} onClick={() => remove(item.id)} aria-label={t("Удалить фото: {0}", [item.alt || t("без описания")])}>{t("Удалить")}</button>}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {error && <p className={`${styles.notice} ${styles.warn}`} role="alert">{error}</p>}
    </div>
  );
}

export function ContentEditor({ projectId, content, onChange, sectionTypes, disabled, aiAvailable, onAskAi, issueKeys, ...lock }: LockProps & {
  projectId: string; content: Content; onChange: (next: Content) => void; sectionTypes: Record<SectionType, string>; disabled: boolean; aiAvailable: boolean;
  onAskAi: (targetKey: string, instruction: string) => Promise<void>; issueKeys: string[];
}) {
  const [newType, setNewType] = useState<SectionType>("faq");
  const library = usePhotoLibrary(projectId);
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
    const section: Section = { key, type: newType, title: sectionTypes[newType], text: "", items: [], buttonLabel: null, imageId: null };
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
            <button type="button" className={styles.iconButton} disabled={disabled || index === 0} aria-label={t("Поднять блок выше")} onClick={() => move(index, -1)}>↑</button>
            <button type="button" className={styles.iconButton} disabled={disabled || index === content.sections.length - 1} aria-label={t("Опустить блок ниже")} onClick={() => move(index, 1)}>↓</button>
            <button type="button" className={styles.iconButton} disabled={disabled || content.sections.length <= 1} aria-label={t("Удалить блок")}
              onClick={() => { if (window.confirm(t("Удалить блок «{0}»? Его можно вернуть из истории версий.", [section.title || sectionTypes[section.type]]))) onChange({ ...content, sections: content.sections.filter((item) => item.key !== section.key) }); }}>✕</button>
          </div>
          {issueKeys.includes(section.key) && <p className={`${styles.notice} ${styles.warn}`}>{t("Замените места в [квадратных скобках] своими данными.")}</p>}
          <label className={styles.field}><span className={styles.label}>{t("Заголовок")}</span>
            <input className={styles.input} value={section.title} maxLength={120} disabled={disabled} onChange={(event) => updateSection(section.key, { title: event.target.value })} /></label>
          <label className={styles.field}><span className={styles.label}>{t("Текст")}</span>
            <textarea className={styles.textarea} value={section.text} maxLength={1200} disabled={disabled} onChange={(event) => updateSection(section.key, { text: event.target.value })} /></label>
          {(itemTypes.includes(section.type) || section.items.length > 0) && (
            <div className={styles.field}>
              <span className={styles.label}>{section.type === "faq" ? t("Вопросы и ответы") : t("Пункты")}</span>
              {section.items.map((item, itemIndex) => (
                <div key={itemIndex} className={styles.item}>
                  <input className={styles.input} aria-label={t("Заголовок пункта {0}", [itemIndex + 1])} value={item.title} maxLength={100} disabled={disabled}
                    onChange={(event) => updateSection(section.key, { items: section.items.map((current, position) => (position === itemIndex ? { ...current, title: event.target.value } : current)) })} />
                  <textarea className={styles.textarea} style={{ minHeight: 64 }} aria-label={t("Текст пункта {0}", [itemIndex + 1])} value={item.text} maxLength={400} disabled={disabled}
                    onChange={(event) => updateSection(section.key, { items: section.items.map((current, position) => (position === itemIndex ? { ...current, text: event.target.value } : current)) })} />
                  <button type="button" className={styles.danger} style={{ minHeight: 40 }} disabled={disabled}
                    onClick={() => updateSection(section.key, { items: section.items.filter((_, position) => position !== itemIndex) })}>{t("Убрать пункт")}</button>
                </div>
              ))}
              {section.items.length < 12 && <button type="button" className={styles.secondary} disabled={disabled} onClick={() => updateSection(section.key, { items: [...section.items, { title: "", text: "" }] })}>{t("+ Добавить пункт")}</button>}
            </div>
          )}
          {buttonTypes.includes(section.type) && (
            <label className={styles.field}><span className={styles.label}>{t("Текст на кнопке")}</span>
              <span className={styles.why}>{t("Кнопка ведёт к главному действию из паспорта проекта.")}</span>
              <input className={styles.input} value={section.buttonLabel ?? ""} maxLength={40} disabled={disabled} onChange={(event) => updateSection(section.key, { buttonLabel: event.target.value || null })} /></label>
          )}
          {(photoTypes.includes(section.type) || section.imageId) && (
            <PhotoControl projectId={projectId} library={library} imageId={section.imageId ?? null} disabled={disabled} sectionLabel={sectionTypes[section.type]}
              onSelect={(id) => updateSection(section.key, { imageId: id })} />
          )}
          {aiAvailable && !disabled && <AskAiInline onAsk={(instruction) => onAskAi(section.key, instruction)} />}
        </article>
      ))}
      {!disabled && content.sections.length < 12 && (
        <div className={styles.card}>
          <p className={styles.cardTitle}>{t("Добавить блок")}</p>
          <div className={styles.row}>
            <select className={styles.select} style={{ flex: "1 1 200px" }} value={newType} aria-label={t("Тип блока")} onChange={(event) => setNewType(event.target.value as SectionType)}>
              {(Object.keys(sectionTypes) as SectionType[]).filter((type) => type !== "hero").map((type) => <option key={type} value={type}>{sectionTypes[type]}</option>)}
            </select>
            <button type="button" className={styles.secondary} onClick={addSection}>{t("Добавить")}</button>
          </div>
        </div>
      )}
      <article className={styles.section} aria-label={t("Для поисковиков")}>
        <div className={styles.sectionHead}><span className={styles.sectionType}>{t("Для поисковиков")}</span><LockBadge lockKey="seo" {...lock} /></div>
        <p className={styles.why} style={{ marginBottom: 10 }}>{t("Так сайт будет выглядеть в результатах Google и Яндекса. Посетители на странице это не видят.")}</p>
        <label className={styles.field}><span className={styles.label}>{t("Заголовок (")}{content.seo.title.length}/70)</span>
          <input className={styles.input} value={content.seo.title} maxLength={70} disabled={disabled} onChange={(event) => onChange({ ...content, seo: { ...content.seo, title: event.target.value } })} /></label>
        <label className={styles.field}><span className={styles.label}>{t("Описание (")}{content.seo.description.length}/160)</span>
          <textarea className={styles.textarea} value={content.seo.description} maxLength={160} disabled={disabled} onChange={(event) => onChange({ ...content, seo: { ...content.seo, description: event.target.value } })} /></label>
      </article>
    </div>
  );
}

function AskAiInline({ onAsk }: { onAsk: (instruction: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return <button type="button" className={styles.ghost} onClick={() => setOpen(true)}>{t("✨ Изменить этот блок с ИИ")}</button>;
  return (
    <div className={styles.field} style={{ margin: 0 }}>
      <label className={styles.label}>{t("Что изменить в этом блоке?")}
        <input className={styles.input} value={text} maxLength={1000} placeholder={t("Например: короче и теплее")} autoFocus onChange={(event) => setText(event.target.value)} /></label>
      <div className={styles.row}>
        <button type="button" className={styles.button} disabled={busy || text.trim().length < 2}
          onClick={async () => { setBusy(true); try { await onAsk(text.trim()); setText(""); setOpen(false); } finally { setBusy(false); } }}>{busy ? t("ИИ работает…") : t("Попросить ИИ")}</button>
        <button type="button" className={styles.ghost} onClick={() => setOpen(false)}>{t("Отмена")}</button>
      </div>
      <p className={styles.why}>{t("ИИ изменит только этот блок. Остальные останутся как есть.")}</p>
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
      {group(t("Цвета"), t("Все палитры проверены: текст хорошо читается на телефоне."), options.palettes, "palette", true)}
      {group(t("Шрифт"), t("Шрифты встроены в устройство посетителя — сайт загружается быстро."), options.fonts, "font")}
      {group(t("Форма кнопок и карточек"), t("Влияет на общее настроение."), options.corners, "corners")}
      {group(t("Первый экран"), t("Как расположить заголовок и кнопку."), options.heroLayouts, "heroLayout")}
    </div>
  );
}
