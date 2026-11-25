"use client";

import Link from "next/link";
import { t } from "@/lib/i18n";
import styles from "../../../journey.module.css";

// «Подготовка к запуску» of a web application (builder-back src/journey/launch.ts): what the platform checked, and the
// owner's checklist — each item done, not needed with a reason, or not yet.

export type LaunchItemKey = "domain" | "legal" | "email" | "backups" | "monitoring" | "migration" | "analytics" | "audit";
export type LaunchItemStatus = "todo" | "done" | "not_needed";
export type LaunchChecklist = { items: Array<{ key: LaunchItemKey; status: LaunchItemStatus; note: string }> };
export type LaunchOptions = {
  facts: {
    readiness: { blocking: { total: number; passed: number }; scenarios: { total: number; works: number }; openRemarks: number } | null;
    deployment: { url: string; ok: boolean; database: string | null; checkedAt: string } | null;
  };
  items: Array<{ key: LaunchItemKey; title: string; why: string; required: boolean }>;
  markdown: string | null;
};

function Check({ ok, title, text, link }: { ok: boolean; title: string; text: string; link?: { href: string; label: string } }) {
  return (
    <li style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: 8, marginBottom: 10 }}>
      <span aria-hidden="true" style={{ color: ok ? "#1d7a46" : "#b3261e", fontWeight: 700 }}>{ok ? "✓" : "✕"}</span>
      <span><strong>{title}</strong><br /><span className={styles.small}>{text}</span>{link && !ok ? <><br /><Link href={link.href} style={{ color: "var(--brand, #2f55d4)", textDecoration: "underline" }}>{link.label}</Link></> : null}</span>
    </li>
  );
}

export function LaunchEditor({ projectId, value, onChange, options, disabled }: {
  projectId: string; value: LaunchChecklist; onChange: (next: LaunchChecklist) => void; options: LaunchOptions; disabled: boolean;
}) {
  const { readiness, deployment } = options.facts;
  const answer = (key: LaunchItemKey) => value.items?.find((item) => item.key === key) ?? { key, status: "todo" as const, note: "" };
  const set = (key: LaunchItemKey, patch: Partial<{ status: LaunchItemStatus; note: string }>) => {
    const items = options.items.map((item) => answer(item.key));
    onChange({ items: items.map((item) => (item.key === key ? { ...item, ...patch } : item)) });
  };
  const decided = options.items.filter((item) => answer(item.key).status !== "todo").length;
  const choice = (key: LaunchItemKey, status: LaunchItemStatus, label: string, allowed = true) => (
    <button type="button" className={answer(key).status === status ? styles.button : styles.secondary} aria-pressed={answer(key).status === status} disabled={disabled || !allowed} onClick={() => set(key, { status })}>{label}</button>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
      <section className={styles.card} aria-labelledby="platform-title">
        <p id="platform-title" className={styles.cardTitle}>{t("Что проверила платформа")}</p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {readiness ? (
            <>
              <Check ok={readiness.blocking.passed === readiness.blocking.total} title={t("Блокирующие кейсы пройдены")} text={t("{0} из {1}", [readiness.blocking.passed, readiness.blocking.total])} link={{ href: `/projects/${projectId}/stages/testplan`, label: t("Открыть план проверки") }} />
              <Check ok={readiness.scenarios.works === readiness.scenarios.total} title={t("Главные сценарии приняты вами")} text={t("{0} из {1}", [readiness.scenarios.works, readiness.scenarios.total])} link={{ href: `/projects/${projectId}/stages/testplan`, label: t("Открыть приёмку") }} />
              <Check ok={readiness.openRemarks === 0} title={t("Замечаний не осталось")} text={t("Открытых замечаний: {0}", [readiness.openRemarks])} link={{ href: `/projects/${projectId}/stages/roadmap`, label: t("Открыть ход работ") }} />
            </>
          ) : <Check ok={false} title={t("План проверки утверждён")} text={t("Без него непонятно, что считать «работает».")} link={{ href: `/projects/${projectId}/stages/testplan`, label: t("Открыть план проверки") }} />}
          <Check ok={Boolean(deployment?.ok)} title={t("Приложение отвечает")} text={deployment ? `${deployment.url} — ${deployment.ok ? t("отвечает") : t("не отвечает")}, ${t("проверено {0}", [new Date(deployment.checkedAt).toLocaleString()])}` : t("Адрес ещё не проверяли.")} link={{ href: `/projects/${projectId}/stages/handoff`, label: t("Проверить адрес") }} />
          {deployment?.ok && <Check ok={deployment.url.startsWith("https://")} title={t("Работает по HTTPS")} text={deployment.url.startsWith("https://") ? t("Соединение защищено.") : t("Пароли и данные пойдут открытым текстом.")} />}
          {deployment?.ok && <Check ok={deployment.database === "postgres"} title={t("Работает с базой данных")} text={deployment.database === "postgres" ? t("Данные сохраняются в PostgreSQL.") : t("Данные в памяти — пропадут при перезапуске.")} link={{ href: `/projects/${projectId}/stages/handoff`, label: t("Как подключить базу") }} />}
        </ul>
        <p className={styles.small} style={{ margin: "6px 0 0" }}>{t("Непройденная проверка не даёт принять этап. Если вы всё равно запускаете, объясните это письменно в замечаниях проверки ниже — объяснение сохранится в журнале.")}</p>
      </section>
      <section className={styles.card} aria-labelledby="items-title">
        <p id="items-title" className={styles.cardTitle}>{t("Ваш чек-лист")} <span className={styles.small} style={{ fontWeight: 400 }}>· {t("решено {0} из {1}", [decided, options.items.length])}</span></p>
        {options.items.map((item) => {
          const current = answer(item.key);
          return (
            <article key={item.key} className={styles.section}>
              <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{item.title}{item.required ? <span className={styles.small} style={{ color: "#7a4500", fontWeight: 400 }}> · {t("нужно для этого приложения")}</span> : null}</p>
              <p className={styles.small} style={{ margin: "0 0 8px" }}>{item.why}</p>
              <div className={styles.row} style={{ marginBottom: 8 }}>
                {choice(item.key, "done", t("Готово"))}
                {choice(item.key, "not_needed", t("Не нужно"), !item.required || current.status === "not_needed")}
                {choice(item.key, "todo", t("Ещё не сделано"))}
              </div>
              <label className={styles.field} style={{ marginBottom: 0 }}><span className={styles.label}>{current.status === "not_needed" ? t("Почему не нужно") : t("Заметка (где, кто, как)")}</span>
                <input className={styles.input} value={current.note} maxLength={400} disabled={disabled} aria-invalid={current.status === "not_needed" && !current.note}
                  onChange={(event) => set(item.key, { note: event.target.value })} /></label>
            </article>
          );
        })}
      </section>
    </div>
  );
}
