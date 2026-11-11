"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../journey.module.css";

type Master = { key: string; name: string; access: { id: string; email: string; status: "invited" | "active"; expired: boolean; acceptedAt: string | null } | null };

/** Owner invites masters so each sees only their own bookings. */
export function MastersPanel({ projectId }: { projectId: string }) {
  const [masters, setMasters] = useState<Master[] | null>(null);
  const [form, setForm] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<{ key: string; url: string; emailSent: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setMasters((await api<{ masters: Master[] }>(`/projects/${projectId}/masters`)).masters); } catch (caught) { setError(explainError(caught)); }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  async function invite(master: Master) {
    setBusy(true); setError("");
    try {
      const result = await api<{ inviteUrl: string; emailSent: boolean }>(`/projects/${projectId}/masters/${master.key}/invite`, { method: "POST", body: JSON.stringify({ email }) });
      setLink({ key: master.key, url: result.inviteUrl, emailSent: result.emailSent }); setForm(null); setEmail(""); await load();
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  async function revoke(master: Master) {
    if (!master.access || !window.confirm(`Закрыть доступ мастеру «${master.name}»? Он перестанет видеть записи и получать уведомления.`)) return;
    setBusy(true); setError("");
    try { setMasters((await api<{ masters: Master[] }>(`/projects/${projectId}/masters/access/${master.access.id}`, { method: "DELETE" })).masters); setLink(null); }
    catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  if (!masters || masters.length === 0) return error ? <p className={`${styles.notice} ${styles.error}`}>{error}</p> : null;
  return (
    <section className={styles.card} style={{ marginTop: 22 }} aria-labelledby="masters-title">
      <h2 id="masters-title" className={styles.cardTitle}>Мастера</h2>
      <p className={styles.small} style={{ margin: "0 0 10px" }}>Пригласите мастера — он будет видеть только записи к себе, получать новые в Telegram или на почту и отмечать, пришёл ли клиент. Отменять записи и видеть остальное может только владелец.</p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {masters.map((master) => (
        <div key={master.key} style={{ borderTop: "1px solid #e3e7e3", padding: "10px 0" }}>
          <div className={styles.row}>
            <strong>{master.name}</strong>
            <div className={styles.spacer} />
            <span className={styles.small}>{!master.access ? "не подключён" : master.access.status === "active" ? `подключён · ${master.access.email}` : master.access.expired ? "приглашение истекло" : `приглашён · ${master.access.email}`}</span>
          </div>
          {link?.key === master.key && (
            <div className={`${styles.notice} ${styles.success}`} style={{ marginTop: 8 }}>
              {link.emailSent ? "Приглашение отправлено на почту. " : "Почта не настроена — отправьте ссылку мастеру сами. "}
              Ссылка работает 7 дней и только для этой почты:
              <div style={{ wordBreak: "break-all", marginTop: 4 }}><code>{link.url}</code></div>
              <button className={styles.ghost} style={{ marginTop: 6 }} onClick={() => void navigator.clipboard?.writeText(link.url)}>Копировать ссылку</button>
            </div>
          )}
          {form === master.key ? (
            <form style={{ marginTop: 8 }} onSubmit={(event) => { event.preventDefault(); void invite(master); }}>
              <label className={styles.label} htmlFor={`master-email-${master.key}`}>Почта мастера</label>
              <input id={`master-email-${master.key}`} className={styles.input} type="email" required maxLength={254} autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="master@mail.kz" />
              <div className={styles.row} style={{ marginTop: 8 }}>
                <button className={styles.button} disabled={busy}>{busy ? "Отправляем…" : "Пригласить"}</button>
                <button type="button" className={styles.ghost} onClick={() => setForm(null)}>Отмена</button>
              </div>
            </form>
          ) : (
            <div className={styles.row} style={{ marginTop: 8, flexWrap: "wrap" }}>
              {(!master.access || master.access.status === "invited") && <button className={styles.secondary} disabled={busy} onClick={() => { setForm(master.key); setLink(null); }}>{master.access ? "Пригласить заново" : "Пригласить"}</button>}
              {master.access && <button className={styles.ghost} disabled={busy} onClick={() => void revoke(master)}>{master.access.status === "active" ? "Закрыть доступ" : "Отозвать приглашение"}</button>}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
