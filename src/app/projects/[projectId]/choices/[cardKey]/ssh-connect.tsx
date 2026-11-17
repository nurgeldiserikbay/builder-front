"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import styles from "../../../journey.module.css";

type SshKey = { publicKey: string; fingerprint: string; createdAt: string };
type KeyState = { key: SshKey | null; available: boolean };
type HostKeys = { host: string; port: number; url: string; keys: Array<{ type: string; fingerprint: string }> };

/** The project's deploy key: created on request, shown with a copy button; a new key replaces the old one. */
export function SshKeyStep({ projectId, canDecide, busy, run }: {
  projectId: string; canDecide: boolean; busy: string; run: (label: string, action: () => Promise<void>) => void;
}) {
  const [state, setState] = useState<KeyState | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { void api<KeyState>(`/projects/${projectId}/repository/ssh/key`).then(setState).catch(() => setState({ key: null, available: false })); }, [projectId]);
  if (!state) return null;
  if (!state.available) return <p className={`${styles.notice} ${styles.info}`}>{t("На этом сервере BuildPath нет git и SSH — подключить сервер по SSH пока нельзя. Можно выбрать другой вариант или скачать архив.")}</p>;
  if (!state.key) {
    return canDecide ? <button type="button" className={styles.secondary} style={{ marginTop: 4 }} disabled={Boolean(busy)}
      onClick={() => run("ssh-key", async () => { setState(await api<KeyState>(`/projects/${projectId}/repository/ssh/key`, { method: "POST", body: "{}" })); })}>{busy === "ssh-key" ? t("Создаём…") : t("Создать ключ")}</button> : null;
  }
  const key = state.key;
  return (
    <div style={{ marginTop: 6 }}>
      <label className={styles.label} htmlFor="ssh-public-key">{t("Открытый ключ — добавьте его на сервер с правом записи")}</label>
      <textarea id="ssh-public-key" className={styles.input} readOnly rows={3} value={key.publicKey} style={{ fontFamily: "monospace", fontSize: 13, wordBreak: "break-all", width: "100%", boxSizing: "border-box", resize: "none" }} onFocus={(event) => event.currentTarget.select()} />
      <div className={styles.row} style={{ gap: 8, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
        <button type="button" className={styles.secondary} onClick={() => { void navigator.clipboard?.writeText(key.publicKey).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}>{copied ? t("Скопировано") : t("Скопировать")}</button>
        {canDecide && <button type="button" className={styles.ghost} disabled={Boolean(busy)}
          onClick={() => { if (window.confirm(t("Создать новый ключ? Старый перестанет работать в BuildPath, а репозиторий по SSH отключится — новый ключ нужно будет добавить на сервер."))) run("ssh-key", async () => { setState(await api<KeyState>(`/projects/${projectId}/repository/ssh/key`, { method: "POST", body: JSON.stringify({ rotate: true }) })); }); }}>{t("Новый ключ")}</button>}
      </div>
      <span className={styles.small} style={{ display: "block", marginTop: 4, overflowWrap: "anywhere" }}>{t("Отпечаток: {0}", [key.fingerprint])}</span>
    </div>
  );
}

/** Address → the server's host key fingerprints → the owner confirms one → connect. */
export function SshConnectForm({ projectId, busy, run, onConnected }: {
  projectId: string; busy: string; run: (label: string, action: () => Promise<void>) => void; onConnected: (next: unknown) => void;
}) {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [hosts, setHosts] = useState<HostKeys | null>(null);
  const [picked, setPicked] = useState("");
  return (
    <div style={{ marginTop: 6 }}>
      <form onSubmit={(event) => { event.preventDefault(); run("ssh-scan", async () => { const found = await api<HostKeys>(`/projects/${projectId}/repository/ssh/host-keys`, { method: "POST", body: JSON.stringify({ repoUrl }) }); setHosts(found); setPicked(""); }); }}>
        <label className={styles.label} htmlFor="ssh-url">{t("Адрес репозитория")}</label>
        <input id="ssh-url" className={styles.input} required maxLength={500} autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="git@git.example.kz:team/site.git" value={repoUrl}
          onChange={(event) => { setRepoUrl(event.target.value); setHosts(null); }} />
        <label className={styles.label} htmlFor="ssh-branch">{t("Ветка (необязательно)")}</label>
        <input id="ssh-branch" className={styles.input} maxLength={100} autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder={t("Пусто — основная ветка репозитория")} value={branch} onChange={(event) => setBranch(event.target.value)} />
        {!hosts && <button className={styles.button} style={{ marginTop: 8 }} disabled={Boolean(busy)}>{busy === "ssh-scan" ? t("Проверяем…") : t("Проверить сервер")}</button>}
      </form>
      {hosts && (
        <div className={`${styles.notice} ${styles.info}`} style={{ marginTop: 8 }}>
          <p style={{ margin: "0 0 6px" }}>{t("Сервер {0} показал такие ключи. Отметьте тот, что совпадает с отпечатком вашего сервера:", [hosts.port === 22 ? hosts.host : `${hosts.host}:${hosts.port}`])}</p>
          {hosts.keys.map((item) => (
            <label key={item.fingerprint} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
              <input type="radio" name="host-key" checked={picked === item.fingerprint} onChange={() => setPicked(item.fingerprint)} style={{ width: 20, height: 20, flex: "none" }} />
              <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{item.type}<br /><code style={{ overflowWrap: "anywhere" }}>{item.fingerprint}</code></span>
            </label>
          ))}
          <p className={styles.small} style={{ margin: "0 0 8px" }}>{t("Где взять отпечаток: GitHub, GitLab и Bitbucket публикуют свои в документации; на своём сервере — команда ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub. Если не совпадает — не подключайте.")}</p>
          <div className={styles.row} style={{ gap: 8, flexWrap: "wrap" }}>
            <button type="button" className={styles.button} disabled={!picked || Boolean(busy)}
              onClick={() => run("connect", async () => { onConnected(await api(`/projects/${projectId}/repository`, { method: "POST", body: JSON.stringify({ provider: "ssh", repoUrl, branch: branch.trim() || null, hostFingerprint: picked }) })); })}>{busy === "connect" ? t("Подключаем…") : t("Отпечаток совпадает, подключить")}</button>
            <button type="button" className={styles.ghost} onClick={() => setHosts(null)}>{t("Отмена")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
