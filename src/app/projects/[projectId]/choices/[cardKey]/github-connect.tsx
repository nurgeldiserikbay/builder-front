"use client";

import { t } from "@/lib/i18n";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../../journey.module.css";

type Repo = { fullName: string; webUrl: string; isPrivate: boolean; pushedAt: string | null };
type Data = { configured: boolean; account: { login: string; connectedAt: string } | null; repos: Repo[]; reconnect?: boolean };

const errors: Record<string, string> = {
  GITHUB_OAUTH_NOT_CONFIGURED: t("Вход через GitHub не включён на этом сервере BuildPath — подключите по ключу доступа."),
  GITHUB_NOT_CONNECTED: t("Сначала войдите через GitHub."),
  REPO_NAME_TAKEN: t("Репозиторий с таким названием у вас уже есть. Выберите его из списка или придумайте другое название."),
  REPO_NAME_INVALID: t("Название: латинские буквы, цифры, точка, дефис и подчёркивание, без пробелов."),
  REPO_WRITE_NOT_ALLOWED: t("У вашего аккаунта нет права записи в этот репозиторий."),
  REPO_PROVIDER_UNAVAILABLE: t("GitHub не ответил. Попробуйте ещё раз через минуту."),
};
const returnText: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: t("GitHub подключён. Выберите репозиторий или создайте новый.") },
  denied: { ok: false, text: t("Вы не разрешили доступ на GitHub. Ничего не подключено.") },
  failed: { ok: false, text: t("Не получилось подключить GitHub. Попробуйте ещё раз.") },
};

/** Suggested name for a new repository from the project name: «Барбершоп Усы» → buildpath-site. Latin only. */
function suggestedName(projectName: string): string {
  const latin = projectName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (latin.length >= 3 ? latin : "my-site").slice(0, 60);
}

/**
 * «Войти через GitHub» → choose a repository you can write to, or create a new private one. The pasted-key form stays
 * available below as a fallback; when the server has no GitHub app configured, only that form is shown.
 */
export function GithubConnect({ projectId, projectName, onConnected, fallback }: {
  projectId: string; projectName: string; onConnected: (state: unknown) => void; fallback: ReactNode;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [name, setName] = useState(() => suggestedName(projectName));
  const [isPrivate, setIsPrivate] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try { setData(await api<Data>(`/projects/${projectId}/repository/github/repos`)); } catch (caught) { setError(explainError(caught)); }
  }, [projectId]);
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("github");
    if (result && returnText[result]) {
      setNotice(returnText[result]);
      window.history.replaceState(null, "", window.location.pathname);
    }
    void load();
  }, [load]);

  async function act(label: string, action: () => Promise<void>) {
    setBusy(label); setError("");
    try { await action(); } catch (caught) { setError((caught instanceof ApiError && errors[caught.message]) || explainError(caught)); } finally { setBusy(""); }
  }
  const signIn = () => act("signin", async () => {
    const { url } = await api<{ url: string }>(`/projects/${projectId}/repository/github/start`, { method: "POST" });
    window.location.assign(url);
  });
  const connect = (body: unknown, label: string) => act(label, async () => {
    onConnected(await api(`/projects/${projectId}/repository/github/connect`, { method: "POST", body: JSON.stringify(body) }));
  });

  if (!data) return error ? <p className={`${styles.notice} ${styles.error}`}>{error}</p> : <p className={styles.muted}>{t("Загружаем…")}</p>;
  if (!data.configured) return <>{fallback}</>;

  return (
    <div>
      {notice && <p className={`${styles.notice} ${notice.ok ? styles.success : styles.error}`} role="status">{notice.text}</p>}
      {data.reconnect && <p className={`${styles.notice} ${styles.warning}`}>{t("Доступ к GitHub закончился или был отозван. Войдите ещё раз.")}</p>}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {!data.account ? (
        <>
          <p style={{ margin: "4px 0 8px" }}>{t("Самый простой способ: войдите в GitHub — мы откроем страницу GitHub, где нужно нажать «Authorize». Ключ копировать не придётся.")}</p>
          <p className={styles.small} style={{ margin: "0 0 8px" }}>{t("BuildPath попросит право записи в репозитории (так GitHub называет доступ «repo»). Записывать мы будем только в тот репозиторий, который вы выберете, и только по вашей кнопке «Отправить».")}</p>
          <button className={styles.button} disabled={Boolean(busy)} onClick={() => void signIn()}>{busy === "signin" ? t("Открываем GitHub…") : t("Войти через GitHub")}</button>
          <p className={styles.small}>{t("Нет аккаунта? На странице GitHub можно зарегистрироваться — это бесплатно.")}</p>
        </>
      ) : (
        <>
          <p style={{ margin: "4px 0 8px" }}>{t("Вы вошли в GitHub как")}{" "}<strong>{data.account.login}</strong>.</p>
          <div className={styles.item} style={{ marginBottom: 12 }}>
            <p className={styles.cardTitle} style={{ marginTop: 0 }}>{t("Новый репозиторий")}</p>
            <p className={styles.small} style={{ marginTop: 0 }}>{t("Создадим пустой репозиторий в вашем аккаунте и подключим его. Рекомендуем закрытый: код увидите только вы.")}</p>
            <label className={styles.label} htmlFor="new-repo">{t("Название (латиницей)")}</label>
            <input id="new-repo" className={styles.input} value={name} maxLength={100} autoCapitalize="none" autoCorrect="off" spellCheck={false}
              onChange={(event) => setName(event.target.value.replace(/\s/g, "-"))} />
            <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0" }}>
              <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} style={{ width: 22, height: 22 }} />
              <span>{t("Закрытый репозиторий")}</span>
            </label>
            <button className={styles.button} disabled={Boolean(busy) || !/^[A-Za-z0-9_.-]{1,100}$/.test(name)}
              onClick={() => { if (window.confirm(t("Создать {0} репозиторий {1}/{2} в вашем GitHub?", [isPrivate ? t("закрытый") : t("открытый"), data.account!.login, name]))) void connect({ create: { name, isPrivate }, confirm: true }, "create"); }}>
              {busy === "create" ? t("Создаём…") : t("Создать и подключить")}</button>
          </div>
          {data.repos.length > 0 && (
            <>
              <p className={styles.cardTitle}>{t("Или выберите существующий")}</p>
              <ul className={styles.versions}>
                {data.repos.slice(0, 30).map((repo) => (
                  <li key={repo.fullName}>
                    <div className={styles.row}>
                      <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}><strong>{repo.fullName}</strong><br /><span className={styles.small}>{repo.isPrivate ? t("закрытый") : t("открытый — код видят все")}</span></span>
                      <button className={styles.secondary} style={{ minHeight: 40 }} disabled={Boolean(busy)} onClick={() => void connect({ repo: repo.fullName }, repo.fullName)}>{busy === repo.fullName ? "…" : t("Подключить")}</button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button className={styles.ghost} style={{ marginTop: 6 }} disabled={Boolean(busy)}
            onClick={() => { if (window.confirm(t("Выйти из GitHub в BuildPath? Уже подключённые репозитории продолжат работать, пока вы их не отключите."))) void act("forget", async () => { await api(`/me/git-accounts/github`, { method: "DELETE" }); await load(); }); }}>
            {t("Выйти из GitHub")}</button>
        </>
      )}
      <details style={{ marginTop: 12 }}>
        <summary className={styles.small}>{t("Подключить по ключу доступа вручную")}</summary>
        {fallback}
      </details>
    </div>
  );
}
