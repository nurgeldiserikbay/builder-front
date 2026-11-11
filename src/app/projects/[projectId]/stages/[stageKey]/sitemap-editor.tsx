"use client";

import { t } from "@/lib/i18n";
import type { SectionType, Sitemap, SitemapOptions, SitemapPage } from "@/lib/journey";
import styles from "../../../journey.module.css";

/** A start with only the home page; the owner adds the rest. */
export const blankSitemap = (): Sitemap => ({ pages: [{ key: "home", path: "/", title: t("Главная"), purpose: "", sections: ["hero", "contacts"] }] });

/** «/uslugi» from a menu name — the server makes the same address when the field is left empty. */
function pathFor(title: string): string {
  const map: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", қ: "k", ғ: "g", ү: "u", ұ: "u", ң: "n", ө: "o", һ: "h", і: "i", ә: "a" };
  const slug = title.toLowerCase().split("").map((char) => map[char] ?? char).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
  return `/${slug || "page"}`;
}

/** Home page on top, the other pages below it — what the visitor sees in the menu, with the blocks of each page. */
export function SitemapDiagram({ value, sectionTypes }: { value: Sitemap; sectionTypes: Record<SectionType, string> }) {
  const [home, ...rest] = value.pages;
  if (!home) return null;
  const card = (page: SitemapPage, main: boolean) => (
    <div key={page.key} style={{ border: `1.5px solid ${main ? "#255b42" : "#2d6da3"}`, background: main ? "#e8f2ec" : "#fff", borderRadius: 12, padding: "8px 10px", minWidth: 0 }}>
      <div style={{ fontWeight: 800, fontSize: 14, overflowWrap: "anywhere" }}>{page.title || t("Без названия")}</div>
      <div style={{ fontSize: 12, color: "#4f5f57", fontFamily: "ui-monospace, monospace" }}>{page.path || pathFor(page.title)}</div>
      {page.sections.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {page.sections.map((type) => <span key={type} style={{ fontSize: 11, background: "#f1f3f1", borderRadius: 6, padding: "1px 6px" }}>{sectionTypes[type]}</span>)}
        </div>
      )}
    </div>
  );
  return (
    <div role="img" aria-label={t("Схема сайта: главная и {0} страниц под ней", [rest.length])} style={{ margin: "8px 0 4px" }}>
      <div style={{ maxWidth: 260, margin: "0 auto" }}>{card(home, true)}</div>
      {rest.length > 0 && (
        <>
          <div aria-hidden="true" style={{ width: 2, height: 14, background: "#7a827d", margin: "0 auto" }} />
          <div aria-hidden="true" style={{ borderTop: "2px solid #7a827d", margin: `0 ${rest.length > 1 ? "22%" : "50%"}` }} />
          <div style={{ display: "grid", gridTemplateColumns: rest.length > 1 ? "repeat(2, minmax(0, 1fr))" : "1fr", gap: 10, marginTop: 10 }}>
            {rest.map((page) => card(page, false))}
          </div>
        </>
      )}
      <p className={styles.small} style={{ marginBottom: 0 }}>{t("Все страницы будут в меню в этом порядке. Синие — страницы под главной, у каждой свой адрес.")}</p>
    </div>
  );
}

export function SitemapEditor({ value, onChange, options, sectionTypes, disabled, issues }: {
  value: Sitemap; onChange: (next: Sitemap) => void; options: SitemapOptions; sectionTypes: Record<SectionType, string>; disabled: boolean; issues: string[];
}) {
  const pages = value.pages;
  const set = (index: number, patch: Partial<SitemapPage>) => onChange({ pages: pages.map((page, position) => (position === index ? { ...page, ...patch } : page)) });
  const move = (index: number, delta: number) => {
    const next = [...pages];
    const [page] = next.splice(index, 1);
    next.splice(index + delta, 0, page!);
    onChange({ pages: next });
  };
  const add = () => {
    let number = pages.length + 1;
    while (pages.some((page) => page.key === `page-${number}`)) number += 1;
    onChange({ pages: [...pages, { key: `page-${number}`, path: "", title: "", purpose: "", sections: ["about"] }] });
  };
  const reserved = (path: string) => options.reservedPaths.includes(path.replace(/^\//, ""));
  return (
    <div>
      <section className={styles.card} aria-label={t("Схема сайта")}>
        <p className={styles.cardTitle}>{t("Схема сайта")}</p>
        <SitemapDiagram value={value} sectionTypes={sectionTypes} />
      </section>
      {issues.length > 0 && (
        <div className={`${styles.notice} ${styles.warn}`}><ul className={styles.list}>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>
      )}
      {pages.map((page, index) => {
        const home = index === 0;
        const path = home ? "/" : page.path || pathFor(page.title);
        return (
          <article key={page.key} className={styles.section} aria-label={t("Страница {0}", [index + 1])}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionType}>{home ? t("Главная страница") : t("Страница {0}", [index + 1])}</span>
              <div className={styles.spacer} />
              {!home && (
                <>
                  <button type="button" className={styles.iconButton} disabled={disabled || index === 1} aria-label={t("Выше в меню")} onClick={() => move(index, -1)}>↑</button>
                  <button type="button" className={styles.iconButton} disabled={disabled || index === pages.length - 1} aria-label={t("Ниже в меню")} onClick={() => move(index, 1)}>↓</button>
                  <button type="button" className={styles.iconButton} disabled={disabled} aria-label={t("Убрать страницу")}
                    onClick={() => { if (window.confirm(t("Убрать страницу «{0}»? Её можно вернуть из истории версий.", [page.title || index + 1]))) onChange({ pages: pages.filter((_, position) => position !== index) }); }}>✕</button>
                </>
              )}
            </div>
            <label className={styles.field}><span className={styles.label}>{t("Название в меню")}</span>
              <span className={styles.why}>{t("Одно-два слова: так страница будет называться в меню сайта.")}</span>
              <input className={styles.input} value={page.title} maxLength={30} disabled={disabled} placeholder={t("Например: Услуги")} onChange={(event) => set(index, { title: event.target.value })} /></label>
            <label className={styles.field}><span className={styles.label}>{t("Адрес")}</span>
              <span className={styles.why}>{home ? t("Главная всегда открывается по адресу сайта.") : t("Латинские буквы, цифры и дефис. Оставьте пустым — сделаем из названия.")}</span>
              <input className={styles.input} value={home ? "/" : page.path} placeholder={path} maxLength={31} disabled={disabled || home} inputMode="url" autoCapitalize="none"
                onChange={(event) => set(index, { path: event.target.value.toLowerCase().replace(/[^a-z0-9/-]/g, "") })} /></label>
            {!home && reserved(path) && <p className={`${styles.notice} ${styles.warn}`}>{t("Адрес {0} занят платформой — выберите другой.", [path])}</p>}
            <label className={styles.field}><span className={styles.label}>{t("Зачем эта страница посетителю")}</span>
              <textarea className={styles.textarea} style={{ minHeight: 64 }} value={page.purpose} maxLength={200} disabled={disabled} placeholder={t("Например: узнать цены и выбрать услугу")} onChange={(event) => set(index, { purpose: event.target.value })} /></label>
            <div className={styles.field}>
              <span className={styles.label}>{t("Блоки на странице")}</span>
              <span className={styles.why}>{t("Тексты для этих блоков напишем на этапе «Структура и тексты».")}</span>
              <div className={styles.chips} role="group" aria-label={t("Блоки на странице {0}", [page.title || index + 1])}>
                {(Object.keys(sectionTypes) as SectionType[]).map((type) => {
                  const on = page.sections.includes(type);
                  return (
                    <button key={type} type="button" className={on ? styles.button : styles.ghost} style={{ minHeight: 40, padding: "4px 10px" }} aria-pressed={on} disabled={disabled || (!on && page.sections.length >= options.limits.sections)}
                      onClick={() => set(index, { sections: on ? page.sections.filter((item) => item !== type) : [...page.sections, type] })}>{sectionTypes[type]}</button>
                  );
                })}
              </div>
            </div>
          </article>
        );
      })}
      {!disabled && pages.length < options.limits.pages && <button type="button" className={`${styles.secondary} ${styles.block}`} style={{ marginBottom: 14 }} onClick={add}>{t("+ Добавить страницу")}</button>}
      {pages.length >= options.limits.pages && <p className={styles.small}>{t("Это максимум: {0} страниц. Больше страниц сделает разработчик (решение «Технологии»).", [options.limits.pages])}</p>}
    </div>
  );
}
