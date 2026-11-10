"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { formatTenge } from "@/lib/money";
import styles from "../../journey.module.css";

type Person = { id: string; name: string; kind: "you" | "owner" | "member" | "specialist" | "former" };
type Item = {
  id: string; createdAt: string; stage: { key: string; title: string }; author: Person; text: string | null; savedAs: string | null;
  targetKey: string | null; rulesApplied: number; kind: "ai" | "template"; model: string | null; source: "app" | "telegram";
  tokens: { input: number | null; output: number | null } | null; cost?: number | null; durationMs: number; result: { versionNumber: number } | null;
  outcome: "accepted" | "current" | "replaced" | "failed"; errorCode: string | null;
};
type Total = { requests: number; failed: number; tokens: number };
type History = {
  items: Item[]; nextBefore: string | null;
  summary: { byAuthor: Array<Total & { author: Person }>; byStage: Array<Total & { stage: { key: string; title: string } }>; tokensReported: boolean };
  filters: { stages: Array<{ key: string; title: string }>; authors: Person[] };
};

const outcomes: Record<Item["outcome"], { label: string; tone: string; hint: string }> = {
  accepted: { label: "Принят", tone: "done", hint: "Эту версию приняли" },
  current: { label: "Текущий черновик", tone: "active", hint: "Версия сейчас на этапе, ещё не принята" },
  replaced: { label: "Заменён", tone: "closed", hint: "Потом сделали другую версию" },
  failed: { label: "Ошибка", tone: "attention", hint: "Результат не получился" },
};
const errors: Record<string, string> = {
  AI_OUTPUT_REJECTED: "ИИ вернул ответ не по форме этапа, мы его не сохранили",
  AI_PROVIDER_UNAVAILABLE: "сервис ИИ не ответил",
  AI_PROVIDER_FAILED: "сервис ИИ вернул ошибку",
  AI_INVALID_RESPONSE: "ответ ИИ не удалось прочитать",
};
const when = (value: string) => new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const number = (value: number) => value.toLocaleString("ru-RU");

export default function HistoryPage() {
  const router = useRouter();
  const { projectId } = useParams<{ projectId: string }>();
  const [stage, setStage] = useState("");
  const [author, setAuthor] = useState("");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [history, setHistory] = useState<History | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const params = useCallback((before?: string) => {
    const search = new URLSearchParams();
    if (stage) search.set("stageKey", stage);
    if (author) search.set("authorId", author);
    if (applied) search.set("q", applied);
    if (before) search.set("before", before);
    return search.toString();
  }, [stage, author, applied]);

  useEffect(() => {
    setBusy(true);
    setError("");
    api<History>(`/projects/${projectId}/ai-history?${params()}`)
      .then((value) => { setHistory(value); setItems(value.items); })
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
        setError(explainError(caught));
      })
      .finally(() => setBusy(false));
  }, [projectId, params, router]);

  async function more() {
    if (!history?.nextBefore) return;
    setBusy(true);
    try {
      const next = await api<History>(`/projects/${projectId}/ai-history?${params(history.nextBefore)}`);
      setHistory(next);
      setItems((current) => [...current, ...next.items]);
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  const select = { width: "100%", minHeight: 44, borderRadius: 10, border: "1px solid #d5ddd3", padding: "0 10px", background: "#fff", font: "inherit" } as const;

  return (
    <div className={styles.shell}>
      <header className={styles.top}><div className={styles.topInner}>
        <a className={styles.back} href={`/projects/${projectId}`}>← Проект</a>
        <span className={styles.topTitle}>История запросов</span>
      </div></header>
      <main className={styles.container}>
        <p className={styles.kicker}>Запросы к ИИ</p>
        <h1 className={styles.h1}>Кто, что и когда просил</h1>
        <p className={styles.small} style={{ marginTop: 0 }}>Каждый запрос к ИИ сохраняется вместе с результатом: можно посмотреть, что получилось и что из этого приняли.</p>

        {history && (
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", margin: "0 0 10px" }}>
            <label className={styles.small}>Этап
              <select style={select} value={stage} onChange={(event) => setStage(event.target.value)}>
                <option value="">Все этапы</option>
                {history.filters.stages.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}
              </select>
            </label>
            <label className={styles.small}>Кто
              <select style={select} value={author} onChange={(event) => setAuthor(event.target.value)}>
                <option value="">Все участники</option>
                {history.filters.authors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>
        )}
        <form onSubmit={(event) => { event.preventDefault(); setApplied(query.trim()); }} style={{ display: "flex", gap: 8, margin: "0 0 14px" }}>
          <input className={styles.input} style={{ flex: 1, margin: 0 }} type="search" placeholder="Поиск по тексту запроса" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className={styles.secondary} disabled={busy}>Найти</button>
        </form>

        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}

        {history && history.summary.byAuthor.length > 0 && (
          <section className={styles.card}>
            <p className={styles.cardTitle}>Итого{stage || author ? " по фильтру" : ""}</p>
            <ul className={styles.list} style={{ margin: 0 }}>
              {history.summary.byAuthor.map((row) => (
                <li key={row.author.id}>
                  <strong>{row.author.name}</strong>: запросов {row.requests}{row.failed ? `, с ошибкой ${row.failed}` : ""}
                  {history.summary.tokensReported && row.tokens > 0 ? `, токенов ${number(row.tokens)}` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!history && !error && <p className={styles.muted}>Загружаем…</p>}
        {history && items.length === 0 && <p className={styles.muted}>Запросов пока нет{applied || stage || author ? " по этому фильтру" : ""}.</p>}

        <ol className={styles.stageList} aria-label="Запросы">
          {items.map((item) => {
            const outcome = outcomes[item.outcome];
            return (
              <li key={item.id}>
                <div className={`${styles.mapNode} ${styles[outcome.tone]}`}>
                  <span className={styles.mapWho}>{when(item.createdAt)} · {item.author.name} · {item.stage.title}{item.source === "telegram" ? " · из Telegram" : ""}</span>
                  <strong className={styles.mapTitle} style={{ fontWeight: 600 }}>
                    {item.text ? `«${item.text}»` : item.kind === "template" ? "Черновик по шаблону (без ИИ)" : "Черновик этапа без указаний"}
                  </strong>
                  {(item.savedAs === "stage_rule" || item.savedAs === "project_rule" || item.targetKey || item.rulesApplied > 0) && (
                    <span className={styles.mapWho}>
                      {[item.savedAs === "stage_rule" ? "сохранено как правило этапа" : item.savedAs === "project_rule" ? "сохранено как правило проекта" : null,
                        item.targetKey ? "только один блок" : null,
                        item.rulesApplied > 0 ? `учтено правил: ${item.rulesApplied}` : null].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  <span className={`${styles.chip} ${styles[outcome.tone]}`} title={outcome.hint}>
                    {outcome.label}{item.result ? ` · версия ${item.result.versionNumber}` : ""}
                  </span>
                  <span className={styles.mapWho}>
                    {item.outcome === "failed" && item.errorCode ? `${errors[item.errorCode] ?? "не получилось"}. ` : ""}
                    {item.tokens ? `Токенов: ${number((item.tokens.input ?? 0) + (item.tokens.output ?? 0))}${typeof item.cost === "number" ? `, ${formatTenge(item.cost)}` : ""}. ` : ""}
                    {item.result && <a href={`/projects/${projectId}/stages/${item.stage.key}`}>Открыть этап →</a>}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
        {history?.nextBefore && <button className={`${styles.secondary} ${styles.block}`} disabled={busy} onClick={more}>{busy ? "Загружаем…" : "Показать ещё"}</button>}
      </main>
    </div>
  );
}
