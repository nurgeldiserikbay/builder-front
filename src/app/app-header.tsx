"use client";

import { t } from "@/lib/i18n";
import { usePathname } from "next/navigation";
import styles from "./projects/journey.module.css";

/**
 * Top bar of the app: brand and the main sections, then (optionally) a line with the way back and the page title.
 * `minimal` hides the sections for pages opened by people without an account (invitations).
 */
export default function AppHeader({ back, title, minimal = false, extra }: {
  back?: { href: string; label: string };
  title?: string;
  minimal?: boolean;
  extra?: React.ReactNode;
}) {
  const path = usePathname() ?? "";
  const nav = [
    { href: "/projects", label: t("Мои проекты"), active: path.startsWith("/projects") },
    { href: "/account", label: t("Аккаунт"), active: path.startsWith("/account") },
    { href: "/review", label: t("Сверка сайта"), active: path.startsWith("/review") },
  ];
  return (
    <header className={styles.top}>
      <div className={styles.topInner}>
        <a className={styles.brand} href={minimal ? "/" : "/projects"}><span aria-hidden="true">B</span>BuildPath</a>
        {!minimal && (
          <nav className={styles.nav} aria-label={t("Навигация")}>
            {nav.map((item) => (
              <a key={item.href} href={item.href} className={styles.navLink} aria-current={item.active ? "page" : undefined}>{item.label}</a>
            ))}
          </nav>
        )}
        <div className={styles.spacer} />
        {extra}
      </div>
      {(back || title) && (
        <div className={styles.crumbs}>
          <div className={styles.crumbsInner}>
            {back && <a className={styles.back} href={back.href}>{back.label}</a>}
            {back && title && <span className={styles.crumbSep} aria-hidden="true">/</span>}
            {title && <span className={styles.topTitle}>{title}</span>}
          </div>
        </div>
      )}
    </header>
  );
}
