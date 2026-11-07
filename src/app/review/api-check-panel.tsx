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

type SavedApiCheck = { id: string; requirementId: string | null; method: "GET" | "HEAD"; endpoint: string; expectedStatus: number; actualStatus: number | null; durationMs: number; passed: boolean; checkedAt: string; createdAt: string };
type BackendRequirement = { id: string; category: string; title: string; status: string };

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
  const [history, setHistory] = useState<SavedApiCheck[]>([]);
  const [requirements, setRequirements] = useState<BackendRequirement[]>([]);
  const [requirementId, setRequirementId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    let active = true;
    setHistory([]);
    setRequirements([]);
    setRequirementId("");
    setHistoryError("");
    if (!reviewId || !pageId) return;
    Promise.all([
      api<SavedApiCheck[]>("/reviews/" + reviewId + "/pages/" + pageId + "/api-checks"),
      api<BackendRequirement[]>("/reviews/" + reviewId + "/pages/" + pageId + "/requirements"),
    ])
      .then(([items, allRequirements]) => {
        if (!active) return;
        setHistory(items);
        setRequirements(allRequirements.filter((item) => item.category === "backend"));
      })
      .catch(() => { if (active) setHistoryError("Не удалось загрузить историю проверок или backend-требования."); });
    return () => { active = false; };
  }, [reviewId, pageId]);

  async function saveResult() {
    if (!result || !reviewId || !pageId || saving || saved) return;
    setSaving(true);
    setError("");
    try {
      const item = await api<SavedApiCheck>("/reviews/" + reviewId + "/pages/" + pageId + "/api-checks", {
        method: "POST",
        body: JSON.stringify({
          method: result.method, endpoint: result.endpoint, expectedStatus: result.expectedStatus,
          actualStatus: result.actualStatus, durationMs: result.durationMs, jsonPath: result.jsonPath || null,
          jsonMatches: result.jsonMatches, safeErrorCode: result.safeErrorCode, checkedAt: result.checkedAt,
          requirementId: requirementId || null,
        }),
      });
      setHistory((current) => [item, ...current].slice(0, 50));
      setSaved(true);
    } catch {
      setError("Не удалось сохранить безопасные метаданные проверки.");
    } finally { setSaving(false); }
  }

  async function runCheck(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setSaved(false);

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
        safeErrorCode: null,
      });
    } catch (cause) {
      const timedOut = cause instanceof DOMException && cause.name === "AbortError";
      const checkedAt = new Date().toISOString();
      const durationMs = Math.min(12_000, Math.round(performance.now() - startedAt));
      setError(timedOut
        ? "Запрос превысил лимит 12 секунд."
        : "Браузер не получил доступ к API. Проверьте адрес и CORS-разрешение для этого сайта.");
      setResult({
        passed: false, endpoint: safeEndpoint, method, expectedStatus: expected, actualStatus: null,
        durationMs, checkedAt, message: timedOut ? "Запрос превысил лимит 12 секунд." : "Браузер не получил доступ к API.",
        responsePreview: "", responseTruncated: false, jsonPath: jsonPath.trim(), jsonMatches: null,
        safeErrorCode: timedOut ? "REQUEST_TIMEOUT" : "REQUEST_FAILED",
      });
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
      safeErrorCode: result.safeErrorCode,
      requirementId: requirementId || null,
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
      {requirements.length > 0 && <label className={styles.apiCheckEndpoint}>Пункт backend-ТЗ
        <select value={requirementId} onChange={(event) => setRequirementId(event.target.value)}>
          <option value="">Не привязывать к пункту</option>
          {requirements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>}
      <label>Метод<select value={method} onChange={(event) => setMethod(event.target.value as "GET" | "HEAD")}><option>GET</option><option>HEAD</option></select></label>
      <label>Ожидаемый статус<input type="number" min="100" max="599" step="1" value={expectedStatus} onChange={(event) => setExpectedStatus(event.target.value)} /></label>
      <label>JSON-путь <small>необязательно</small><input value={jsonPath} onChange={(event) => setJsonPath(event.target.value)} maxLength={160} placeholder="data.status" /></label>
      <label>Ожидаемое значение<input value={expectedValue} onChange={(event) => setExpectedValue(event.target.value)} maxLength={300} placeholder="ok" /></label>
      <label className={styles.apiCheckToken}>Bearer-токен <small>не сохраняется</small><input type="password" value={bearerToken} onChange={(event) => setBearerToken(event.target.value)} maxLength={4096} autoComplete="off" /></label>
      <button type="submit" disabled={busy}>{busy ? "Проверяем…" : "Запустить проверку"}</button>
    </form>
    <p className={styles.apiCheckPrivacy}>Токен, ответ и URL с параметрами не сохраняются и не передаются BuildPath. Для чтения ответа API должен разрешить CORS для адреса этого сайта. Ответ ограничен 64 КБ.</p>
    {error && <p className={styles.apiCheckError} role="alert">{error}</p>}
    {historyError && <p className={styles.apiCheckError}>{historyError}</p>}
    {history.length > 0 && <details className={styles.apiCheckHistory} open>
      <summary>История этой страницы ({history.length} последних)</summary>
      <ul>{history.map((item) => <li key={item.id} data-passed={item.passed}>
        <strong>{item.passed ? "Пройдено" : "Не пройдено"}</strong>
        <span>{item.method} {item.endpoint}</span>
        <small>{item.requirementId ? "Пункт: " + (requirements.find((req) => req.id === item.requirementId)?.title ?? "backend-ТЗ") + " · " : ""}HTTP {item.actualStatus ?? "—"} / ожидался {item.expectedStatus} · {item.durationMs} мс · {new Date(item.checkedAt).toLocaleString()}</small>
      </li>)}</ul>
    </details>}
    {result && <div className={result.passed ? styles.apiCheckPassed : styles.apiCheckFailed} aria-live="polite">
      <div className={styles.apiCheckResultHeading}>
        <div><strong>{result.passed ? "Проверка пройдена" : "Проверка не пройдена"}</strong><small>{result.method} {result.endpoint} · HTTP {result.actualStatus ?? "—"} · {result.durationMs} мс</small><p>{result.message}</p></div>
        <div className={styles.apiCheckActions}>
          <button type="button" onClick={downloadResult}>Скачать JSON</button>
          <button type="button" onClick={() => void saveResult()} disabled={saving || saved || !reviewId}>{saved ? "Сохранено в отчёт" : saving ? "Сохраняем…" : "Сохранить в отчёт"}</button>
        </div>
      </div>
      {result.responsePreview && <details><summary>Фрагмент ответа {result.responseTruncated ? "(обрезан)" : ""}</summary><pre>{result.responsePreview}</pre></details>}
    </div>}
  </section>;
}
