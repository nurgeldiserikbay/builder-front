"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Registers the service worker once, in production, outside frames; keeps the browser's install offer for the button. */
export function PwaRegistration() {
  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); deferred = event as InstallPrompt; notify(); };
    const onInstalled = () => { deferred = null; notify(); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    try {
      const secure = window.location.protocol === "https:" || window.location.hostname === "localhost";
      if (process.env.NODE_ENV === "production" && secure && window.self === window.top && "serviceWorker" in navigator) {
        void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      }
    } catch { /* some webviews forbid service workers: the site works without one */ }
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  return null;
}

/** «Установить на телефон»: the browser's own install offer, an iPhone hint, or nothing when already installed. */
export function InstallApp({ className, buttonClassName }: { className?: string; buttonClassName?: string }) {
  const [, rerender] = useState(0);
  const [state, setState] = useState<"unknown" | "installed" | "ios" | "other">("unknown");
  useEffect(() => {
    const update = () => rerender((n) => n + 1);
    listeners.add(update);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setState(standalone ? "installed" : /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "other");
    return () => { listeners.delete(update); };
  }, []);
  if (state === "unknown" || state === "installed") return null;
  if (state === "ios") return <p className={className}>{t("Поставить BuildPath на экран iPhone: в Safari нажмите «Поделиться», затем «На экран «Домой»».")}</p>;
  if (!deferred) return null;
  const install = async () => { const offer = deferred; if (!offer) return; await offer.prompt(); await offer.userChoice.catch(() => undefined); deferred = null; notify(); };
  return (
    <div className={className}>
      <button type="button" className={buttonClassName} onClick={() => void install()}>{t("Установить BuildPath на телефон")}</button>
      <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.8 }}>{t("Откроется как приложение — с иконкой на экране и без строки браузера.")}</p>
    </div>
  );
}
