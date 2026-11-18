"use client";

import { t } from "@/lib/i18n";
import styles from "../projects/journey.module.css";

/**
 * Shown by the service worker when a page cannot load: no connection. A client page, so it is kept once and shown in the
 * language chosen on this phone.
 */
export default function Offline() {
  return (
    <div className={styles.shell}>
      <main className={styles.container}>
        <p className={styles.kicker}>BuildPath</p>
        <h1 className={styles.h1}>{t("Нет связи")}</h1>
        <p>{t("Страница не загрузилась: телефон сейчас без интернета или связь слабая. Проекты и ответы сохранены на сервере — ничего не потеряно.")}</p>
        <button type="button" className={styles.button} onClick={() => window.location.reload()}>{t("Попробовать ещё раз")}</button>
      </main>
    </div>
  );
}
