import { tl, type Locale } from "@/lib/i18n";
import { requestLocale } from "@/lib/request-locale";
import LanguageSwitch from "./language-switch";
const modesOf = (locale: Locale) => [
  {
    number: '01',
    title: tl(locale, "Создать с нуля"),
    description: tl(locale, "Опишите цель сайта и правила вашего бизнеса. BuildPath поможет уточнить требования и предложит понятный план."),
    tag: tl(locale, "По вашей идее"),
  },
  {
    number: '02',
    title: tl(locale, "Продолжить существующий проект"),
    description: tl(locale, "Добавьте материалы или укажите сайт. Разберём текущее состояние и выберем этап, с которого удобнее продолжить."),
    tag: tl(locale, "С сохранением прогресса"),
  },
  {
    number: '03',
    title: tl(locale, "Только анализ"),
    description: tl(locale, "Получите отчёт о сайте или проектных материалах. Анализ работает в режиме чтения и ничего не меняет."),
    tag: tl(locale, "Без изменений исходника"),
  },
];

const principlesOf = (locale: Locale) => [
  [tl(locale, "Понятно без технических знаний"), tl(locale, "Вопросы и варианты объясняются рядом с тем местом, где нужен ваш выбор.")],
  [tl(locale, "Технические решения — на нашей стороне"), tl(locale, "Вы задаёте требования и бизнес-логику. Технологии подбираются по задаче, а важные последствия выбора будут показаны заранее.")],
  [tl(locale, "Работа продолжается с телефона"), tl(locale, "Проект можно сохранить на любом этапе и вернуться к нему позже через веб или Telegram.")],
];

export default async function HomePage() {
  const locale = await requestLocale();
  const modes = modesOf(locale);
  const principles = principlesOf(locale);
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/" aria-label={tl(locale, "BuildPath, главная")}>
          <span className="brand-mark" aria-hidden="true">B</span>
          <span>BuildPath</span>
        </a>
        <LanguageSwitch /><a className="top-cta" href="/projects">{tl(locale, "Мои проекты")}</a>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="status-dot" />{" "}{tl(locale, "ОТ ИДЕИ ДО ГОТОВОГО САЙТА")}</p>
          <h1>{tl(locale, "Расскажите, что вам нужно.")}{" "}<em>{tl(locale, "Остальное разложим по шагам.")}</em></h1>
          <p className="hero-text">{tl(locale, "BuildPath помогает спланировать, создать и проверить сайт прямо в браузере. Не нужны ноутбук, редактор кода или технические знания.")}</p>
          <a className="hero-cta" href="/projects">{tl(locale, "Создать сайт по шагам →")}</a>
          <div className="preview-state"><span className="state-icon" aria-hidden="true">✳</span><span><strong>{tl(locale, "Что уже работает")}</strong><br />{tl(locale, "Одностраничный сайт, сайт компании и онлайн-запись к мастеру: от цели и текстов с ИИ до публикации, своего домена и специалистов на этапах.")}</span></div>
        </div>
        <aside className="journey-card" aria-label={tl(locale, "Этапы работы над сайтом")}>
          <div className="card-heading"><span>{tl(locale, "ВАШ ПУТЬ")}</span><span className="pill">{tl(locale, "С телефона")}</span></div>
          <div className="journey">
            <div className="journey-line" aria-hidden="true" />
            <div className="journey-step active"><span className="step-node">1</span><div><strong>{tl(locale, "Идея и бизнес-логика")}</strong><small>{tl(locale, "Что сайт должен делать")}</small></div><span className="step-check">✓</span></div>
            <div className="journey-step"><span className="step-node">2</span><div><strong>{tl(locale, "План и понятные варианты")}</strong><small>{tl(locale, "Что выбрать и почему")}</small></div></div>
            <div className="journey-step"><span className="step-node">3</span><div><strong>{tl(locale, "Создание и предпросмотр")}</strong><small>{tl(locale, "Сайт можно проверить до публикации")}</small></div></div>
            <div className="journey-step"><span className="step-node">4</span><div><strong>{tl(locale, "Проверка и запуск")}</strong><small>{tl(locale, "Безопасность, скорость, SEO и доступность")}</small></div></div>
          </div>
          <div className="journey-footer"><span className="sparkle">✦</span>{" "}{tl(locale, "Можно остановиться и продолжить позже")}</div>
        </aside>
      </section>

      <section className="modes-section">
        <div className="section-heading"><div><p className="eyebrow">{tl(locale, "ТРИ СПОСОБА НАЧАТЬ")}</p><h2>{tl(locale, "Выберите, что подходит сейчас")}</h2></div><p>{tl(locale, "Можно начать с простого описания. Сервис сам задаст уточняющие вопросы.")}</p></div>
        <div className="mode-grid">{modes.map((mode) => <article className="mode-card" key={mode.number}><div className="mode-top"><span>{mode.number}</span><span className="mode-tag">{mode.tag}</span></div><h3>{mode.title}</h3><p>{mode.description}</p></article>)}</div>
      </section>

      <section className="tool-section" aria-labelledby="review-tool-title">
        <a href="/review" className="tool-link">
          <span><span className="tool-tag">{tl(locale, "НОВЫЙ ИНСТРУМЕНТ")}</span><strong id="review-tool-title">{tl(locale, "Сверить сайт с ТЗ, backend и макетом")}</strong><span className="tool-text">{tl(locale, "Сравнение страниц рядом, загрузка макетов и разбор отличий.")}</span></span>
          <span aria-hidden="true" className="tool-cta">{tl(locale, "Открыть сверку →")}</span>
        </a>
      </section>

      <section className="principles-section">
        <div className="section-heading"><div><p className="eyebrow">{tl(locale, "РАБОТАЕМ ВМЕСТЕ")}</p><h2>{tl(locale, "Вы решаете, каким должен быть результат")}</h2></div><p>{tl(locale, "BuildPath объясняет важные развилки и ведёт работу по сохранённому плану.")}</p></div>
        <div className="principle-grid">{principles.map(([title, description], index) => <article className="principle" key={title}><span className="principle-number">0{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div></article>)}</div>
      </section>
      <footer><a className="brand footer-brand" href="/"><span className="brand-mark" aria-hidden="true">B</span><span>BuildPath</span></a><span>{tl(locale, "От первой идеи — к понятному результату.")}</span><span><a href="/legal/terms">{tl(locale, "Оферта")}</a> · <a href="/legal/privacy">{tl(locale, "Конфиденциальность")}</a></span></footer>
    </main>
  );
}
