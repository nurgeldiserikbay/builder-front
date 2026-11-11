"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError, type Publication } from "@/lib/journey";
import styles from "../../../journey.module.css";

const dnsError: Record<string, string> = {
  DNS_RECORD_NOT_FOUND: "Запись пока не видна. Если вы только что её добавили, подождите 5–60 минут и проверьте снова.",
  DNS_POINTS_ELSEWHERE: "Домен смотрит на другой адрес. Проверьте, что запись совпадает с указанной ниже, и удалите старые записи A или CNAME для этого имени.",
};
const date = (value: string) => new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Domain form inside the «Адрес сайта» card: save, show the DNS record, check, disconnect. */
export function DomainConnect({ projectId, canDecide, onChange }: { projectId: string; canDecide: boolean; onChange: () => void }) {
  const [state, setState] = useState<Publication | null>(null);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try { setState(await api<Publication>(`/projects/${projectId}/publication`)); } catch (caught) { setError(explainError(caught)); }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  async function run(label: string, action: () => Promise<Publication>, after?: (next: Publication) => string) {
    setBusy(label); setError(""); setNote("");
    try { const next = await action(); setState(next); if (after) setNote(after(next)); onChange(); } catch (caught) { setError(explainError(caught)); } finally { setBusy(""); }
  }

  if (!state) return error ? <p className={`${styles.notice} ${styles.error}`}>{error}</p> : null;
  if (!state.domainsAvailable) return <p className={`${styles.notice} ${styles.info}`}>Свои домены пока не подключаются на этом сервере BuildPath. Сайт работает по адресу BuildPath.</p>;
  if (!state.publication) return <p className={`${styles.notice} ${styles.info}`}>Сначала опубликуйте сайт на BuildPath — домен подключается к опубликованному сайту. <a href={`/projects/${projectId}#publish-title`}>Открыть публикацию →</a></p>;
  const current = state.publication.domain;

  return (
    <div style={{ marginTop: 6 }}>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {note && <p className={`${styles.notice} ${styles.success}`} role="status">{note}</p>}

      {!current && canDecide && (
        <form onSubmit={(event) => { event.preventDefault(); void run("set", () => api<Publication>(`/projects/${projectId}/publication/domain`, { method: "POST", body: JSON.stringify({ domain }) })); }}>
          <label className={styles.label} htmlFor="own-domain">Ваш домен</label>
          <input id="own-domain" className={styles.input} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} required maxLength={253}
            placeholder="www.barber-usy.com" value={domain} onChange={(event) => setDomain(event.target.value)} />
          <span className={styles.small} style={{ display: "block" }}>Проще всего подключить адрес с www. Адрес без www у регистратора можно перенаправить на него.</span>
          <button className={styles.button} style={{ marginTop: 8 }} disabled={Boolean(busy)}>{busy === "set" ? "Сохраняем…" : "Дальше"}</button>
        </form>
      )}

      {current && (
        <div className={`${styles.notice} ${current.status === "active" ? styles.success : styles.info}`}>
          <p style={{ margin: "0 0 6px" }}><strong>{current.display}</strong> — {current.status === "active" ? "подключён" : current.status === "failed" ? "перестал смотреть на BuildPath" : "ждёт настройки DNS"}</p>
          {current.status === "active" && current.url && <p style={{ margin: "0 0 6px" }}>Сайт открывается по адресу <a href={current.url} target="_blank" rel="noopener">{current.url.replace(/^https:\/\//, "")}</a>. Защищённое соединение (HTTPS) включится при первом открытии — это занимает до минуты. Адрес BuildPath тоже продолжает работать.</p>}
          {current.status !== "active" && (
            <>
              <p style={{ margin: "0 0 6px" }}>Откройте личный кабинет регистратора → раздел «DNS» или «Управление зоной» → «Добавить запись» и впишите:</p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 14, marginBottom: 6 }}>
                  <thead><tr><th style={{ textAlign: "left", paddingRight: 12 }}>Тип</th><th style={{ textAlign: "left", paddingRight: 12 }}>Имя</th><th style={{ textAlign: "left" }}>Значение</th></tr></thead>
                  <tbody>{current.records.map((record) => (
                    <tr key={`${record.type}${record.value}`}>
                      <td style={{ paddingRight: 12 }}>{record.type}</td><td style={{ paddingRight: 12 }}><code>{record.name}</code></td>
                      <td><code style={{ wordBreak: "break-all" }}>{record.value}</code> <button type="button" className={styles.ghost} style={{ minHeight: 32, padding: "2px 8px" }} onClick={() => { void navigator.clipboard?.writeText(record.value); setNote("Скопировано."); }}>Копировать</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {current.apex && <p className={styles.small} style={{ margin: "0 0 6px" }}>«@» означает сам домен без www. Если для «@» уже есть другие записи A — удалите их, иначе часть посетителей попадёт не туда.</p>}
              {current.error && <p style={{ margin: "0 0 6px" }}>{dnsError[current.error]}</p>}
              {state.domainCheck && !state.domainCheck.ok && state.domainCheck.found.length > 0 && <p className={styles.small} style={{ margin: "0 0 6px" }}>Сейчас домен смотрит на: {state.domainCheck.found.join(", ")}</p>}
            </>
          )}
          {current.checkedAt && <p className={styles.small} style={{ margin: "0 0 6px" }}>Проверено {date(current.checkedAt)}.</p>}
          {canDecide && (
            <div className={styles.row} style={{ gap: 8, flexWrap: "wrap" }}>
              <button className={current.status === "active" ? styles.secondary : styles.button} disabled={Boolean(busy)}
                onClick={() => void run("check", () => api<Publication>(`/projects/${projectId}/publication/domain/check`, { method: "POST" }), (next) => next.publication?.domain?.status === "active" ? "Готово: домен смотрит на BuildPath, сайт открывается по нему." : "")}>
                {busy === "check" ? "Проверяем…" : "Проверить"}
              </button>
              <button className={styles.ghost} disabled={Boolean(busy)} onClick={() => {
                if (!window.confirm(`Отключить ${current.display}? Сайт перестанет открываться по этому домену, но продолжит работать по адресу BuildPath. Сам домен останется вашим.`)) return;
                void run("remove", () => api<Publication>(`/projects/${projectId}/publication/domain`, { method: "DELETE" }), () => "Домен отключён.");
              }}>Отключить</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
