"use client";

import { t } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function FigmaCallbackPage() {
  const router = useRouter();
  const started = useRef(false);
  const [message, setMessage] = useState(t("Завершаем подключение Figma…"));

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const query = new URLSearchParams(window.location.search);
    const providerError = query.get("error");
    const code = query.get("code");
    const state = query.get("state");
    if (providerError) {
      setMessage(t("Подключение Figma отменено или не удалось."));
      return;
    }
    if (!code || !state) {
      setMessage(t("В ответе Figma не хватает кода авторизации. Вернитесь на страницу проверки и повторите подключение."));
      return;
    }
    api<{ connected: boolean }>("/integrations/figma/callback", {
      method: "POST",
      body: JSON.stringify({ code, state }),
    }).then(() => {
      router.replace("/review?figma=connected");
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : t("Не удалось завершить подключение Figma."));
    });
  }, [router]);

  return <main style={{ maxWidth: 640, margin: "12vh auto", padding: 24, color: "#26372b", fontFamily: "sans-serif" }}>
    <h1 style={{ fontSize: 22 }}>{t("Подключение Figma")}</h1>
    <p role="status">{message}</p>
    {message !== t("Завершаем подключение Figma…") && <a href="/review">{t("Вернуться к проверке")}</a>}
  </main>;
}
