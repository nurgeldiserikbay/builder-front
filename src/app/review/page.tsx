"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import styles from "./review.module.css";

type Page = { path: string; label: string; designName: string; findings: number; status: "review" | "done" };
type Mode = "side" | "overlay" | "wipe";
type CheckTab = "requirements" | "backend" | "ai";

const initialPages: Page[] = [
  { path: "/", label: "Главная", designName: "Главная • frame 12", findings: 2, status: "review" },
  { path: "/services", label: "Услуги", designName: "Услуги • frame 18", findings: 1, status: "review" },
  { path: "/contacts", label: "Контакты", designName: "Контакты • frame 21", findings: 0, status: "done" },
];

export default function ReviewPage() {
  const [url, setUrl] = useState("https://preview.example.kz");
  const [pages, setPages] = useState(initialPages);
  const [selectedPath, setSelectedPath] = useState("/");
  const [mode, setMode] = useState<Mode>("side");
  const [tab, setTab] = useState<CheckTab>("requirements");
  const [viewport, setViewport] = useState("390 × 844");
  const [wipe, setWipe] = useState(52);
  const [notice, setNotice] = useState("Демо-данные показывают интерфейс. Анализ URL и загрузка в систему пока не подключены.");
  const selectedPage = pages.find((page) => page.path === selectedPath) ?? pages[0];

  const title = useMemo(() => `${selectedPage.label} · ${viewport}`, [selectedPage, viewport]);

  function startScan() {
    setNotice("Запуск анализа станет доступен после подключения безопасного браузерного сервиса.");
  }

  function addRoute() {
    const raw = window.prompt("Введите путь страницы, например /pricing");
    if (!raw) return;
    const path = raw.startsWith("/") ? raw : `/${raw}`;
    if (pages.some((page) => page.path === path)) {
      setNotice("Эта страница уже добавлена.");
      return;
    }
    const segments = path.split("/").filter(Boolean);
    const label = path === "/" ? "Главная" : segments[segments.length - 1] ?? "Страница";
    setPages((current) => [...current, { path, label: label[0].toUpperCase() + label.slice(1), designName: "Макет не назначен", findings: 0, status: "review" }]);
    setSelectedPath(path);
    setNotice("Страница добавлена. Назначение макета подключается вместе с загрузкой файлов.");
  }

  function onDesignUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPages((current) => current.map((page) => page.path === selectedPath ? { ...page, designName: file.name } : page));
    setNotice(`Файл «${file.name}» выбран для этой страницы. Он пока хранится только в состоянии демо-экрана.`);
  }

  const tabContent = {
    requirements: [
      ["✓", "Основной сценарий из ТЗ выполнен", "Требование BP-12 · форма успешно отправлена", "good"],
      ["!", "Заголовок отличается от макета", "Текст переносится на две строки вместо одной", "warn"],
      ["?", "Мобильное меню не проверено", "Снимок состояния закрытого меню отсутствует", "muted"],
    ],
    backend: [
      ["✓", "GET /api/pages отвечает 200", "Тестовый ответ получен · 84 мс", "good"],
      ["!", "Поле phone не отображается", "Ответ API содержит значение, интерфейс его не выводит", "warn"],
      ["?", "Авторизация API не проверена", "Подключите тестовую среду, чтобы проверить закрытые маршруты", "muted"],
    ],
    ai: [
      ["ИИ", "Возможное отличие отступа", "Блок действий сдвинут примерно на 12 px. Проверьте оригинал.", "warn"],
      ["ИИ", "Контраст текста может быть низким", "Нужна проверка по фактическим цветам и WCAG.", "muted"],
    ],
  } satisfies Record<CheckTab, string[][]>;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/" aria-label="BuildPath — главная"><span className={styles.logo}>B</span> BuildPath</a>
        <nav aria-label="Навигация"><a href="/">Проект</a><a className={styles.current} href="/review">Сверка</a><a href="/#workspace">Рабочее пространство</a></nav>
        <span className={styles.demoTag}>ДЕМО-РЕЖИМ</span>
      </header>

      <section className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>Проверка реализации</p>
          <h1>Сверьте сайт с ТЗ и макетом</h1>
          <p className={styles.subhead}>Смотрите страницу и дизайн рядом, находите отличия и проверяйте, что требования действительно работают.</p>
        </div>
        <div className={styles.progressCard}><span>Покрытие проверки</span><strong>4 из 5 требований</strong><div className={styles.progress}><i /></div><small>1 пункт пока не проверен</small></div>
      </section>

      <section className={styles.sourcebar} aria-label="Источники проверки">
        <label className={styles.urlField}><span>Ссылка на сайт</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} aria-label="Ссылка на сайт для анализа" /></label>
        <button className={styles.primary} onClick={startScan}>Проверить страницы</button>
        <label className={styles.uploadButton}>＋ Макет страницы<input type="file" accept="image/png,image/jpeg,.pdf" onChange={onDesignUpload} /></label>
        <button className={styles.secondary} onClick={() => setNotice("Подключение Figma будет добавлено после настройки разрешения только на чтение.")}>Figma</button>
      </section>

      <div className={styles.notice} role="status"><span>i</span>{notice}</div>

      <section className={styles.workspace}>
        <aside className={styles.sidebar}>
          <div className={styles.sideTitle}><strong>Страницы сайта</strong><span>{pages.length}</span></div>
          <p className={styles.sideHelp}>Выберите страницу и назначьте ей соответствующий макет.</p>
          <div className={styles.pageList}>
            {pages.map((page) => <button key={page.path} onClick={() => setSelectedPath(page.path)} className={page.path === selectedPath ? styles.pageSelected : styles.pageButton}>
              <span className={styles.pageIcon}>{page.status === "done" ? "✓" : "▤"}</span>
              <span className={styles.pageText}><strong>{page.label}</strong><small>{page.path}</small></span>
              {page.findings > 0 && <span className={styles.findingCount}>{page.findings}</span>}
            </button>)}
          </div>
          <button className={styles.addPage} onClick={addRoute}>＋ Добавить страницу</button>
          <div className={styles.mapping}><span className={styles.mappingIcon}>◫</span><div><strong>Макет для страницы</strong><small>{selectedPage.designName}</small></div><label className={styles.smallUpload}>Загрузить<input type="file" accept="image/png,image/jpeg,.pdf" onChange={onDesignUpload} /></label></div>
        </aside>

        <div className={styles.review}>
          <div className={styles.reviewHeader}>
            <div><h2>{title}</h2><p>Сравнение привязано к маршруту, версии макета и размеру экрана.</p></div>
            <label className={styles.viewport}>Размер экрана<select value={viewport} onChange={(event) => setViewport(event.target.value)}><option>390 × 844</option><option>768 × 1024</option><option>1440 × 900</option></select></label>
          </div>
          <div className={styles.controls}>
            <div className={styles.modeSwitch} aria-label="Режим сравнения">
              <button className={mode === "side" ? styles.modeActive : ""} onClick={() => setMode("side")}>Рядом</button>
              <button className={mode === "overlay" ? styles.modeActive : ""} onClick={() => setMode("overlay")}>Наложить</button>
              <button className={mode === "wipe" ? styles.modeActive : ""} onClick={() => setMode("wipe")}>Граница</button>
            </div>
            <button className={styles.secondary} onClick={() => setNotice("Добавление замечания будет связано с координатами снимка после подключения хранения.")}>＋ Замечание</button>
          </div>

          <div className={`${styles.compare} ${mode === "side" ? styles.sideMode : styles.layerMode}`}>
            <MockScreen label={`Макет · ${selectedPage.designName}`} variant="design" />
            <MockScreen label={`Рабочий сайт · ${selectedPage.path}`} variant="live" />
            {mode === "overlay" && <div className={styles.overlay} style={{ opacity: wipe / 100 }}><MockScreen label="" variant="design" /></div>}
            {mode === "wipe" && <div className={styles.wipeOverlay} style={{ clipPath: `inset(0 ${100 - wipe}% 0 0)` }}><MockScreen label="" variant="design" /></div>}
          </div>
          {mode !== "side" && <label className={styles.opacity}>Смешивание макета и сайта<input type="range" min="10" max="90" value={wipe} onChange={(event) => setWipe(Number(event.target.value))} /></label>}
          {mode === "side" && <div className={styles.frameLabels}><span>МАКЕТ · {selectedPage.designName}</span><span>САЙТ · {url}{selectedPage.path}</span></div>}
          <div className={styles.captureInfo}><span>Маршрут: {selectedPage.path}</span><span>Размер: {viewport}</span><span>Снимок: демо-версия</span><span>Источник API: тестовые данные</span></div>

          <div className={styles.checkHeader}><div><p className={styles.eyebrow}>Результаты</p><h3>Что нашли на странице</h3></div><button className={styles.export} onClick={() => setNotice("Экспорт появится после подключения генератора отчётов.")}>Скачать отчёт ↓</button></div>
          <div className={styles.tabs} role="tablist" aria-label="Тип проверки">
            <button role="tab" aria-selected={tab === "requirements"} className={tab === "requirements" ? styles.tabActive : ""} onClick={() => setTab("requirements")}>ТЗ <span>4/5</span></button>
            <button role="tab" aria-selected={tab === "backend"} className={tab === "backend" ? styles.tabActive : ""} onClick={() => setTab("backend")}>Backend <span>2</span></button>
            <button role="tab" aria-selected={tab === "ai"} className={tab === "ai" ? styles.tabActive : ""} onClick={() => setTab("ai")}>Анализ ИИ <span>2</span></button>
          </div>
          <div className={styles.findings} role="tabpanel">
            {tabContent[tab].map(([icon, titleText, detail, kind], index) => <article key={index} className={styles.finding}>
              <span className={kind === "good" ? styles.goodIcon : kind === "warn" ? styles.warnIcon : styles.unknownIcon}>{icon}</span>
              <div><strong>{titleText}</strong><p>{detail}</p></div>
              <button aria-label={`Открыть замечание: ${titleText}`}>↗</button>
            </article>)}
          </div>
          <p className={styles.disclaimer}>Выводы ИИ — подсказки для проверки. Отчёт указывает снимок, источник и непроверенные пункты; неизвестное не считается пройденным.</p>
        </div>
      </section>
    </main>
  );
}

function MockScreen({ label, variant }: { label: string; variant: "design" | "live" }) {
  return <div className={styles.frame}>
    {label && <span className={styles.frameTag}>{label}</span>}
    <div className={styles.mockPage}>
      <div className={styles.mockNav}><span className={styles.mockLogo}>Build</span><span>Услуги　О нас　Контакты</span><b>☰</b></div>
      <div className={variant === "design" ? styles.mockHero : styles.mockHeroLive}><small>СЕРВИС ДЛЯ ВАШЕГО ПРОЕКТА</small><strong>Создайте сайт<br />с понятным планом</strong><p>От идеи до результата, шаг за шагом.</p><button>Начать проект</button></div>
      <div className={styles.mockCards}><i /><i /><i /></div>
      <div className={styles.mockLines}><i /><i /><i /></div>
    </div>
  </div>;
}
