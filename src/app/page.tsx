const modes = [
  {
    number: '01',
    title: 'Создать с нуля',
    description: 'Опишите цель сайта и правила вашего бизнеса. BuildPath поможет уточнить требования и предложит понятный план.',
    tag: 'По вашей идее',
  },
  {
    number: '02',
    title: 'Продолжить существующий проект',
    description: 'Добавьте материалы или укажите сайт. Разберём текущее состояние и выберем этап, с которого удобнее продолжить.',
    tag: 'С сохранением прогресса',
  },
  {
    number: '03',
    title: 'Только анализ',
    description: 'Получите отчёт о сайте или проектных материалах. Анализ работает в режиме чтения и ничего не меняет.',
    tag: 'Без изменений исходника',
  },
];

const principles = [
  ['Понятно без технических знаний', 'Вопросы и варианты объясняются рядом с тем местом, где нужен ваш выбор.'],
  ['Технические решения — на нашей стороне', 'Вы задаёте требования и бизнес-логику. Технологии подбираются по задаче, а важные последствия выбора будут показаны заранее.'],
  ['Работа продолжается с телефона', 'Проект можно сохранить на любом этапе и вернуться к нему позже через веб или Telegram.'],
];

export default function HomePage() {
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/" aria-label="BuildPath, главная">
          <span className="brand-mark" aria-hidden="true">B</span>
          <span>buildpath</span>
        </a>
        <span className="top-note">Облачная мастерская сайтов</span>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="status-dot" /> ОТ ИДЕИ ДО ГОТОВОГО САЙТА</p>
          <h1>Расскажите, что вам нужно. <em>Остальное разложим по шагам.</em></h1>
          <p className="hero-text">BuildPath помогает спланировать, создать и проверить сайт прямо в браузере. Не нужны ноутбук, редактор кода или технические знания.</p>
          <div className="preview-state"><span className="state-icon" aria-hidden="true">✳</span><span><strong>Платформа собирается</strong><br />Сейчас подготовлена основа. Регистрация и создание проектов появятся по мере реализации следующих этапов.</span></div>
        </div>
        <aside className="journey-card" aria-label="Этапы работы над сайтом">
          <div className="card-heading"><span>ВАШ ПУТЬ</span><span className="pill">С телефона</span></div>
          <div className="journey">
            <div className="journey-line" aria-hidden="true" />
            <div className="journey-step active"><span className="step-node">1</span><div><strong>Идея и бизнес-логика</strong><small>Что сайт должен делать</small></div><span className="step-check">✓</span></div>
            <div className="journey-step"><span className="step-node">2</span><div><strong>План и понятные варианты</strong><small>Что выбрать и почему</small></div></div>
            <div className="journey-step"><span className="step-node">3</span><div><strong>Создание и предпросмотр</strong><small>Сайт можно проверить до публикации</small></div></div>
            <div className="journey-step"><span className="step-node">4</span><div><strong>Проверка и запуск</strong><small>Безопасность, скорость, SEO и доступность</small></div></div>
          </div>
          <div className="journey-footer"><span className="sparkle">✦</span> Можно остановиться и продолжить позже</div>
        </aside>
      </section>

      <section className="modes-section">
        <div className="section-heading"><div><p className="eyebrow">ТРИ СПОСОБА НАЧАТЬ</p><h2>Выберите, что подходит сейчас</h2></div><p>Можно начать с простого описания. Сервис сам задаст уточняющие вопросы.</p></div>
        <div className="mode-grid">{modes.map((mode) => <article className="mode-card" key={mode.number}><div className="mode-top"><span>{mode.number}</span><span className="mode-tag">{mode.tag}</span></div><h3>{mode.title}</h3><p>{mode.description}</p></article>)}</div>
      </section>

      <section style={{ padding: '0 0 32px' }} aria-labelledby="review-tool-title">
        <a href="/review" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '22px 24px', border: '1px solid #e4e0ed', borderRadius: 18, background: '#fff', color: 'inherit', textDecoration: 'none' }}>
          <span><span style={{ display: 'block', color: '#7055df', fontSize: 11, fontWeight: 800, letterSpacing: '.08em' }}>НОВЫЙ ИНСТРУМЕНТ</span><strong id="review-tool-title" style={{ display: 'block', marginTop: 6, fontSize: 19 }}>Сверить сайт с ТЗ, backend и макетом</strong><span style={{ display: 'block', marginTop: 5, color: '#71707b', fontSize: 13 }}>Сравнение страниц рядом, загрузка макетов и разбор отличий.</span></span>
          <span aria-hidden="true" style={{ flex: 'none', padding: '10px 13px', borderRadius: 10, background: '#7055df', color: '#fff', fontSize: 13, fontWeight: 750 }}>Открыть сверку →</span>
        </a>
      </section>

      <section className="principles-section">
        <div className="section-heading"><div><p className="eyebrow">РАБОТАЕМ ВМЕСТЕ</p><h2>Вы решаете, каким должен быть результат</h2></div><p>BuildPath объясняет важные развилки и ведёт работу по сохранённому плану.</p></div>
        <div className="principle-grid">{principles.map(([title, description], index) => <article className="principle" key={title}><span className="principle-number">0{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div></article>)}</div>
      </section>
      <footer><a className="brand footer-brand" href="/"><span className="brand-mark" aria-hidden="true">B</span><span>buildpath</span></a><span>От первой идеи — к понятному результату.</span></footer>
    </main>
  );
}
