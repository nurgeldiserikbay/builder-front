"use client";

// «Готов ли бизнес принимать клиентов?»: before the site goes live, what is ready and what is worth doing — with a link
// to where each point is fixed. Only the build blocks publication; the rest is advice, the owner decides.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t, dateLocale } from "@/lib/i18n";
import { explainError } from "@/lib/journey";
import styles from "../journey.module.css";

type Check = { key: string; status: "ok" | "warn" | "todo"; title: string; text: string; fix: { stageKey: string } | { publication: "channels" | "test" } | null };
type Readiness = { checks: Check[]; ready: number; total: number; blocking: boolean; lastTestAt: string | null };

const mark = { ok: "✓", warn: "!", todo: "✕" } as const;
const tone = { ok: "done", warn: "attention", todo: "error" } as const;

export default function ReadinessCard({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [state, setState] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setState(await api<Readiness>(`/projects/${projectId}/publication/readiness`)); } catch (caught) { setError(explainError(caught)); }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);
  if (!state) return error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : null;

  async function sendTest() {
    setBusy(true); setError("");
    try { setState(await api<Readiness>(`/projects/${projectId}/publication/test-lead`, { method: "POST" })); }
    catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }
  const all = state.ready === state.total;

  return (
    <section className={styles.card} aria-labelledby="readiness-title">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <p id="readiness-title" className={styles.cardTitle} style={{ margin: 0 }}>{t("Готов ли бизнес принимать клиентов?")}</p>
        <span className={`${styles.chip} ${styles[all ? "done" : "active"]}`} style={{ marginTop: 0 }}>{t("Готово: {0} из {1}", [state.ready, state.total])}</span>
      </div>
      <p className={styles.small}>{all ? t("Всё готово к запуску.") : t("Проверьте перед запуском. Публикацию останавливает только непринятая или непроверенная сборка — остальное решаете вы.")}</p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 10 }}>
        {state.checks.map((check) => (
          <li key={check.key} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 8, alignItems: "start" }}>
            <span className={`${styles.chip} ${styles[tone[check.status]]}`} style={{ marginTop: 0, justifyContent: "center", padding: "2px 0", width: 28 }} aria-label={check.status === "ok" ? t("готово") : check.status === "warn" ? t("стоит сделать") : t("нужно сделать")}>{mark[check.status]}</span>
            <span>
              <strong style={{ display: "block" }}>{check.title}</strong>
              <span className={styles.small}>{check.text}</span>
              {check.fix && "stageKey" in check.fix && <>{" "}<a href={`/projects/${projectId}/stages/${check.fix.stageKey}`}>{t("Исправить →")}</a></>}
              {check.fix && "publication" in check.fix && check.fix.publication === "channels" && <>{" "}<a href="#lead-channels">{t("Настроить уведомления →")}</a></>}
            </span>
          </li>
        ))}
      </ul>
      {canManage && (
        <div style={{ marginTop: 14 }}>
          <button type="button" className={styles.secondary} disabled={busy} onClick={() => void sendTest()}>{busy ? t("Отправляем…") : t("Отправить себе тестовую заявку")}</button>
          <p className={styles.small} style={{ margin: "4px 0 0" }}>
            {state.lastTestAt ? t("Последняя тестовая отправлена {0}. Пришла ли она — видно в строке «Заявки доходят до вас».", [new Date(state.lastTestAt).toLocaleString(dateLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })]) : t("Придёт в Telegram и на почту — туда же, куда настоящие заявки.")}
          </p>
        </div>
      )}
    </section>
  );
}
