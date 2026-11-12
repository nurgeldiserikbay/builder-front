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
    { href: "/projects", label: t("Мои проекты"), active: path.startsWith("/projects"), icon: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /> },
    { href: "/specialists", label: t("Специалисты"), active: path.startsWith("/specialists"), icon: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1-3.5 3.6-5.5 6.5-5.5s5.5 2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14.6c2.4.2 4.2 1.9 5 5.4" /></> },
    { href: "/review", label: t("Сверка сайта"), active: path.startsWith("/review"), icon: <><rect x="3" y="4" width="8" height="16" rx="1.5" /><rect x="13" y="4" width="8" height="16" rx="1.5" /></> },
    { href: "/account", label: t("Аккаунт"), active: path.startsWith("/account"), icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></> },
  ];
  return (
    <header className={styles.top}>
      <div className={styles.topInner}>
        <a className={styles.brand} href={minimal ? "/" : "/projects"}><span aria-hidden="true">B</span>BuildPath</a>
        {!minimal && (
          <nav className={styles.nav} aria-label={t("Навигация")}>
            {nav.map((item) => (
              <a key={item.href} href={item.href} className={styles.navLink} aria-current={item.active ? "page" : undefined}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{item.icon}</svg>
                <span>{item.label}</span>
              </a>
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
