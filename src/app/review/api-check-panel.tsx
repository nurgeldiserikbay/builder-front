"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import styles from "./review.module.css";

type ApiCheckResult = {
  passed: boolean;
  endpoint: string;
  method: "GET" | "HEAD";
  expectedStatus: number;
  actualStatus: number | null;
  durationMs: number;
  checkedAt: string;
  message: string;
  responsePreview: string;
  responseTruncated: boolean;
  jsonPath: string;
  jsonMatches: boolean | null;
  safeErrorCode: "REQUEST_FAILED" | "REQUEST_TIMEOUT" | null;
};

type SavedApiCheck = { id: string; method: "GET" | "HEAD"; endpoint: string; expectedStatus: number; actualStatus: number | null; durationMs: number; passed: boolean; checkedAt: string; createdAt: string };

async function readPreview(response: Response, limit = 64 * 1024): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) return { text: "", truncated: false };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = limit - total;
      if (remaining <= 0) {
        truncated = true;
        await reader.cancel();
        break;
      }
      const part = value.subarray(0, remaining);
      total += part.byteLength;
      text += decoder.decode(part, { stream: true });
      if (part.byteLength < value.byteLength || total >= limit) {
        truncated = true;
        await reader.cancel();
        break;
      }
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return { text, truncated };
}

function readJsonPath(value: unknown, path: string): unknown {
  return path.split(".").filter(Boolean).reduce<unknown>((current, key) => {
    if (Array.isArray(current) && /^\d+$/.test(key)) return current[Number(key)];
    if (current && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, key)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
}

export default function ApiCheckPanel({ reviewId, pageId }: { reviewId: string; pageId: string }) {
  const [endpoint, setEndpoint] = useState("");
  const [method, setMethod] = useState<"GET" | "HEAD">("GET");
  const [expectedStatus, setExpectedStatus] = useState("200");
  const [jsonPath, setJsonPath] = useState("");
  const [expectedValue, setExpectedValue] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiCheckResult | null>(null);
  const [error, setError] = useState("");

  async function runCheck(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

    let target: URL;
    try {
      target = new URL(endpoint.trim());
    } catch {
      setError("Введите полный URL API.");
      return;
    }
    if ((target.protocol !== "https:" && !(target.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)))
      || target.username || target.password) {
      setError("Используйте HTTPS и не добавляйте логин или пароль в URL. HTTP разрешён только для localhost.");
      return;
    }
    const expected = Number(expectedStatus);
    if (!Number.isInteger(expected) || expected < 100 || expected > 599) {
      setError("Ожидаемый HTTP-статус должен быть числом от 100 до 599.");
      return;
    }
    if (jsonPath.trim() && !expectedValue.trim()) {
      setError("Укажите ожидаемое значение для JSON-пути.");
      return;
    }

    const safeEndpoint = target.origin + target.pathname;
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    setBusy(true);
    try {
      const response = await fetch(target.toString(), {
        method,
        headers: bearerToken.trim() ? { Authorization: `Bearer ${bearerToken.trim()}` } : undefined,
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      const preview = method === "HEAD" ? { text: "", truncated: false } : await readPreview(response);
      let jsonMatches: boolean | null = null;
      let message = response.status === expected
        ? `HTTP ${response.status} совпал с ожидаемым статусом.`
        : `Ожидался HTTP ${expected}, получен ${response.status}.`;

      if (jsonPath.trim()) {
        if (preview.truncated) {
          jsonMatches = false;
          message += " Ответ превышает лимит чтения, JSON-проверка не выполнена.";
        } else {
          try {
            const actual = readJsonPath(JSON.parse(preview.text) as unknown, jsonPath.trim());
            jsonMatches = actual !== undefined && String(actual) === expectedValue.trim();
            message += jsonMatches ? " JSON-поле совпало." : " JSON-поле не совпало.";
          } catch {
            jsonMatches = false;
            message += " Ответ не удалось разобрать как JSON.";
          }
        }
      }

      setResult({
        passed: response.status === expected && (jsonMatches ?? true),
        endpoint: safeEndpoint,
        method,
        expectedStatus: expected,
        actualStatus: response.status,
        durationMs: Math.round(performance.now() - startedAt),
        checkedAt: new Date().toISOString(),
        message,
        responsePreview: preview.text,
        responseTruncated: preview.truncated,
        jsonPath: jsonPath.trim(),
        jsonMatches,
      });
    } catch (cause) {
      const timedOut = cause instanceof DOMException && cause.name === "AbortError";
      setError(timedOut
        ? "Запрос превысил лимит 12 секунд."
        : "Браузер не получил доступ к API. Проверьте адрес и CORS-разрешение для этого сайта.");
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  function downloadResult() {
    if (!result) return;
    const report = {
      schemaVersion: 1,
      checkedAt: result.checkedAt,
      endpoint: result.endpoint,
      method: result.method,
      expectedStatus: result.expectedStatus,
      actualStatus: result.actualStatus,
      durationMs: result.durationMs,
      passed: result.passed,
      jsonPath: result.jsonPath || null,
      jsonMatches: result.jsonMatches,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "buildpath-api-check.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return <section className={styles.apiCheck}>
    <div className={styles.apiCheckHeading}>
      <div><h3>Проверка Backend / API</h3><p>Без ИИ · только GET/HEAD · запрос выполняется в вашем браузере</p></div>
      <span>БЕЗОПАСНЫЙ ПРОБНИК</span>
    </div>
    <form className={styles.apiCheckForm} onSubmit={(event) => void runCheck(event)}>
      <label className={styles.apiCheckEndpoint}>URL API<input type="url" required maxLength={2048} value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://api.example.com/v1/health" autoComplete="url" /></label>
      <label>Метод<select value={method} onChange={(event) => setMethod(event.target.value as "GET" | "HEAD")}><option>GET</option><option>HEAD</option></select></label>
      <label>Ожидаемый статус<input type="number" min="100" max="599" step="1" value={expectedStatus} onChange={(event) => setExpectedStatus(event.target.value)} /></label>
      <label>JSON-путь <small>необязательно</small><input value={jsonPath} onChange={(event) => setJsonPath(event.target.value)} maxLength={160} placeholder="data.status" /></label>
      <label>Ожидаемое значение<input value={expectedValue} onChange={(event) => setExpectedValue(event.target.value)} maxLength={300} placeholder="ok" /></label>
      <label className={styles.apiCheckToken}>Bearer-токен <small>не сохраняется</small><input type="password" value={bearerToken} onChange={(event) => setBearerToken(event.target.value)} maxLength={4096} autoComplete="off" /></label>
      <button type="submit" disabled={busy}>{busy ? "Проверяем…" : "Запустить проверку"}</button>
    </form>
    <p className={styles.apiCheckPrivacy}>Токен, ответ и URL с параметрами не сохраняются и не передаются BuildPath. Для чтения ответа API должен разрешить CORS для адреса этого сайта. Ответ ограничен 64 КБ.</p>
    {error && <p className={styles.apiCheckError} role="alert">{error}</p>}
    {result && <div className={result.passed ? styles.apiCheckPassed : styles.apiCheckFailed} aria-live="polite">
      <div className={styles.apiCheckResultHeading}>
        <div><strong>{result.passed ? "Проверка пройдена" : "Проверка не пройдена"}</strong><small>{result.method} {result.endpoint} · HTTP {result.actualStatus ?? "—"} · {result.durationMs} мс</small><p>{result.message}</p></div>
        <button type="button" onClick={downloadResult}>Скачать JSON</button>
      </div>
      {result.responsePreview && <details><summary>Фрагмент ответа {result.responseTruncated ? "(обрезан)" : ""}</summary><pre>{result.responsePreview}</pre></details>}
    </div>}
  </section>;
}
