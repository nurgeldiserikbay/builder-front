"use client";

import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";

type WebApp = { initData: string; ready: () => void; expand: () => void };
declare global { interface Window { Telegram?: { WebApp?: WebApp } } }

const SCRIPT_SRC = "https://telegram.org/js/telegram-web-app.js";

/**
 * Telegram Mini App support. Active only when the app is opened from the BuildPath bot (links carry ?tg=1):
 * loads Telegram's WebApp script and signs the user in with verified initData when Telegram is linked.
 */
export default function TelegramBridge() {
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let inTelegram = new URLSearchParams(window.location.search).get("tg") === "1";
    try {
      if (inTelegram) window.sessionStorage.setItem("bp_tg", "1");
      else inTelegram = window.sessionStorage.getItem("bp_tg") === "1";
    } catch { /* storage can be unavailable in some webviews */ }
    if (!inTelegram) return;
    // Pages redirect to /login while the session is missing; remember where the Mini App was opened.
    const target = `${window.location.pathname}${window.location.search}`;

    const start = async () => {
      const webApp = window.Telegram?.WebApp;
      if (!webApp) return;
      webApp.ready();
      webApp.expand();
      if (!webApp.initData) return;
      try {
        await api("/me");
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) return;
        try {
          await api("/auth/telegram-webapp", { method: "POST", body: JSON.stringify({ initData: webApp.initData }) });
          window.location.replace(target.startsWith("/login") ? "/projects" : target);
        } catch (loginError) {
          setNotice(loginError instanceof ApiError && loginError.message === "TELEGRAM_NOT_LINKED"
            ? t("Этот Telegram ещё не подключён к BuildPath. Войдите по почте и паролю — подключить Telegram можно на странице проекта.")
            : t("Не получилось войти через Telegram. Войдите по почте и паролю."));
        }
      }
    };

    if (window.Telegram?.WebApp) { void start(); return; }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => void start();
    document.head.appendChild(script);
  }, []);

  if (!notice) return null;
  return (
    <div role="status" style={{ position: "sticky", top: 0, zIndex: 20, background: "#fff6e0", color: "#5c4400", padding: "10px 16px", fontSize: 14, borderBottom: "1px solid #f1dfaa" }}>
      {notice}
    </div>
  );
}
