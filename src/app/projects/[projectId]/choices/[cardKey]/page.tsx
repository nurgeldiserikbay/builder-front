"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { makeZip } from "@/lib/zip";
import { GithubConnect } from "./github-connect";
import { DomainConnect } from "./domain-connect";
import styles from "../../../journey.module.css";

type Step = { key: string; title: string; text: string[]; kind: "manual" | "connect" | "download" | "publish" | "push" | "package" | "verify" | "domain"; link?: { label: string; url: string } };
type Option = { key: string; requires?: { card: string; option: string; explanation: string }; title: string; summary: string; pros: string[]; limits: string[]; cost: string; upkeep: string; leaving: string; steps: Step[] };
type Repository = { provider: string; connectedVia?: string; repoPath: string; webUrl: string; defaultBranch: string; isPrivate: boolean; tokenHint: string; verifiedAt: string; lastPushAt: string | null; lastCommitUrl: string | null; lastError: string | null };
type CardState = {
  card: { key: string; title: string; question: string; why: string; checkedAt: string; options: Option[] };
  recommendation: { optionKey: string; reason: string };
  choice: { optionKey: string; reason: string | null; stepsDone: string[]; chosenAt: string; verification: Verification | null } | null;
  repository: Repository | null; canDecide: boolean; connectAvailable: boolean;
  available?: Record<string, boolean>;
  context?: { siteAccepted?: boolean; domainsAvailable?: boolean; publication: { status: string; slug: string; upToDate: boolean; domain?: string | null; domainStatus?: string | null } | null; repository?: { provider: string; repoPath: string; pushedAt: string | null } | null } | null;
};
type Verification = { url: string | null; status: "matches" | "outdated" | "different" | "unreachable" | "not_allowed" | "not_published"; checkedAt: string; httpStatus: number | null };
const verificationText: Record<Verification["status"], string> = {
  matches: "Сайт открывается, и это последняя принятая версия.",
  outdated: "Сайт открывается, но это старая версия. Отправьте или загрузите последнюю и проверьте ещё раз.",
  different: "По этому адресу открывается другая страница. Проверьте адрес и что загружен файл index.html из BuildPath.",
  unreachable: "Сайт не открылся. Если вы только что всё настроили, подождите несколько минут и проверьте снова.",
  not_allowed: "Этот адрес проверить нельзя: нужен обычный адрес сайта в интернете, начинающийся с https://.",
  not_published: "Сайт ещё не опубликован на BuildPath.",
};
type Preview = { branch: string; files: Array<{ path: string; bytes: number }>; siteIncluded: boolean; complete: boolean };

const errors: Record<string, string> = {
  REPO_TOKEN_INVALID: "Ключ не подошёл: проверьте, что скопировали его целиком и срок не истёк.",
  REPO_ACCESS_DENIED: "Ключу не хватает прав. Проверьте, что выбран нужный репозиторий и разрешена запись.",
  REPO_NOT_FOUND: "Репозиторий не найден. Проверьте адрес и что ключ выдан именно для него.",
  REPO_WRITE_NOT_ALLOWED: "Ключ видит репозиторий, но не может в него записывать. Дайте ключу право записи (Contents: Read and write или роль Developer).",
  REPO_URL_INVALID: "Не похоже на адрес репозитория. Скопируйте адрес из браузера, например https://github.com/имя/my-site.",
  REPO_URL_NOT_GITHUB: "Это не адрес GitHub. Для GitLab выберите вариант «GitLab».",
  REPO_HOST_NOT_ALLOWED: "Этот сервер недоступен из интернета, подключить его нельзя.",
  REPO_PROVIDER_UNAVAILABLE: "Сервис не ответил. Попробуйте ещё раз через минуту.",
  REPO_PROVIDER_FAILED: "Сервис вернул ошибку. Попробуйте ещё раз позже.",
  REPO_CONNECT_NOT_CONFIGURED: "Подключение репозиториев пока не включено на этом сервере BuildPath. Можно скачать архив.",
  REPO_RECONNECT_REQUIRED: "Сохранённый ключ больше не читается. Подключите репозиторий заново.",
  CHOICE_FORBIDDEN: "Решение принимает владелец проекта.",
  CHOICE_REQUIREMENT_NOT_MET: "Для этого варианта сначала нужно другое решение — смотрите подсказку у варианта.",
  SITE_NOT_ACCEPTED: "Сначала примите этап «Сборка и проверка»: проверять и выкладывать можно только принятую версию сайта.",
  SITE_URL_REQUIRED: "Вставьте адрес сайта.",
};
const message = (caught: unknown) => (caught instanceof ApiError && errors[caught.message]) || explainError(caught);
const date = (value: string) => new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default function ChoicePage() {
  const router = useRouter();
  const { projectId, cardKey } = useParams<{ projectId: string; cardKey: string }>();
  const [state, setState] = useState<CardState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [picking, setPicking] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState("");
  const [siteUrl, setSiteUrl] = useState("");

  const load = useCallback(async () => {
    try { setState(await api<CardState>(`/projects/${projectId}/choices/${cardKey}`)); } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
      setError(message(caught));
    }
  }, [projectId, cardKey, router]);
  useEffect(() => { void load(); }, [load]);

  async function run(label: string, action: () => Promise<CardState | void>) {
    setBusy(label); setError(""); setDone("");
    try { const next = await action(); if (next) setState(next); } catch (caught) { setError(message(caught)); } finally { setBusy(""); }
  }

  if (!state) return <Shell projectId={projectId}>{error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : <p className={styles.muted}>Загружаем…</p>}</Shell>;
  const { card, recommendation, choice, repository } = state;
  const chosen = choice ? card.options.find((option) => option.key === choice.optionKey) ?? null : null;
  const showOptions = !chosen || picking;
  const tokenForm = chosen ? (

                        <form onSubmit={(event) => { event.preventDefault(); void run("connect", async () => { const next = await api<CardState>(`/projects/${projectId}/repository`, { method: "POST", body: JSON.stringify({ provider: chosen.key, repoUrl, token }) }); setToken(""); setDone("Готово: BuildPath может записывать в репозиторий. Ничего не отправлено — отправка только по вашей кнопке."); return next; }); }}>
                          <label className={styles.label} htmlFor="repo-url">Адрес репозитория</label>
                          <input id="repo-url" className={styles.input} inputMode="url" required maxLength={500} placeholder={chosen.key === "github" ? "https://github.com/имя/my-site" : "https://gitlab.com/имя/my-site"} value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} />
                          <label className={styles.label} htmlFor="repo-token">Ключ доступа</label>
                          <input id="repo-token" className={styles.input} type="password" autoComplete="off" required maxLength={400} value={token} onChange={(event) => setToken(event.target.value)} />
                          <button className={styles.button} style={{ marginTop: 8 }} disabled={Boolean(busy)}>{busy === "connect" ? "Проверяем…" : "Проверить и подключить"}</button>
                        </form>
  ) : null;

  return (
    <Shell projectId={projectId}>
      <p className={styles.kicker}>Решение по проекту</p>
      <h1 className={styles.h1}>{card.title}</h1>
      <p style={{ marginTop: 0 }}>{card.why}</p>
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {done && <p className={`${styles.notice} ${styles.success}`} role="status">{done}</p>}

      {showOptions && (
        <>
          <h2 className={styles.h2}>{card.question}</h2>
          {card.options.map((option) => {
            const recommended = option.key === recommendation.optionKey;
            return (
              <section key={option.key} className={styles.card} style={recommended ? { boxShadow: "0 0 0 2px #255b42" } : undefined} aria-label={option.title}>
                {recommended && <span className={styles.mapBadge}>Рекомендуем</span>}
                <p className={styles.cardTitle} style={{ marginTop: recommended ? 8 : 0 }}>{option.title}</p>
                <p style={{ margin: "0 0 8px" }}>{option.summary}</p>
                {recommended && <p className={styles.small} style={{ margin: "0 0 8px" }}><strong>Почему:</strong> {recommendation.reason}</p>}
                <p className={styles.small} style={{ margin: "0 0 4px" }}><strong>Плюсы</strong></p>
                <ul className={styles.list} style={{ marginTop: 0 }}>{option.pros.map((item) => <li key={item}>{item}</li>)}</ul>
                <p className={styles.small} style={{ margin: "0 0 4px" }}><strong>Ограничения</strong></p>
                <ul className={styles.list} style={{ marginTop: 0 }}>{option.limits.map((item) => <li key={item}>{item}</li>)}</ul>
                <p className={styles.small} style={{ margin: "0 0 4px" }}><strong>Цена:</strong> {option.cost}. <strong>Что делать потом:</strong> {option.upkeep}. <strong>Если захотите уйти:</strong> {option.leaving}.</p>
                {option.requires && state.available?.[option.key] === false && <p className={`${styles.notice} ${styles.info}`}>{option.requires.explanation} <a href={`/projects/${projectId}/choices/${option.requires.card}`}>Открыть →</a></p>}
                {state.canDecide && <button className={recommended ? styles.button : styles.secondary} disabled={Boolean(busy) || state.available?.[option.key] === false}
                  onClick={() => run(option.key, async () => { const next = await api<CardState>(`/projects/${projectId}/choices/${cardKey}`, { method: "POST", body: JSON.stringify({ optionKey: option.key }) }); setPicking(false); return next; })}>
                  {busy === option.key ? "Сохраняем…" : choice?.optionKey === option.key ? "Оставить этот вариант" : "Выбрать"}
                </button>}
              </section>
            );
          })}
          <p className={styles.small}>Сведения о сервисах проверены {new Date(card.checkedAt).toLocaleDateString("ru-RU", { dateStyle: "long" })}.</p>
        </>
      )}

      {chosen && !picking && (
        <>
          <section className={styles.card}>
            <p className={styles.kicker}>Ваш выбор</p>
            <p className={styles.cardTitle} style={{ marginTop: 0 }}>{chosen.title}</p>
            <p className={styles.small} style={{ margin: 0 }}>Выбрано {date(choice!.chosenAt)}.{chosen.key !== recommendation.optionKey ? " Это не рекомендованный вариант — так тоже можно." : ""}</p>
            {state.canDecide && <button className={styles.ghost} style={{ marginTop: 8 }} onClick={() => setPicking(true)}>Выбрать другой вариант</button>}
          </section>

          <h2 className={styles.h2}>Что нужно от вас</h2>
          <ol className={styles.stageList}>
            {chosen.steps.map((step, index) => {
              const stepDone = choice!.stepsDone.includes(step.key) || (step.kind === "domain" && state.context?.publication?.domainStatus === "active");
              return (
                <li key={step.key}>
                  <div className={`${styles.mapNode} ${stepDone ? styles.done : styles.active}`}>
                    <strong className={styles.mapTitle}>{stepDone ? "✓ " : `${index + 1}. `}{step.title}</strong>
                    {step.text.map((line) => <span key={line} className={styles.small} style={{ display: "block" }}>{line}</span>)}
                    {step.link && <a href={step.link.url} target="_blank" rel="noreferrer">{step.link.label} →</a>}
                    {step.kind === "download" && <a href={`/projects/${projectId}#result-title`}>Перейти к файлам →</a>}
                    {step.kind === "publish" && <span className={styles.small}>{state.context?.publication?.status === "live" ? `Сайт опубликован${state.context.publication.upToDate ? "" : ", но это не последняя принятая версия — обновите публикацию"}.` : "Сайт ещё не опубликован."} <a href={`/projects/${projectId}#publish-title`}>Открыть публикацию →</a></span>}
                    {step.kind === "push" && <span className={styles.small}>{state.context?.repository?.pushedAt ? `Последняя отправка в ${state.context.repository.repoPath}: ${date(state.context.repository.pushedAt)}.` : "Ещё не отправляли."} <a href={`/projects/${projectId}/choices/code_hosting`}>Открыть «Где хранить код» →</a></span>}
                    {step.kind === "domain" && <DomainConnect projectId={projectId} canDecide={state.canDecide} onChange={() => void load()} />}
                    {step.kind === "package" && state.canDecide && (
                      <button className={styles.secondary} style={{ marginTop: 4 }} disabled={Boolean(busy)} onClick={() => run("package", async () => {
                        const pack = await api<{ folder: string; files: Array<{ name: string; content: string }> }>(`/projects/${projectId}/deployment/package`);
                        const blob = makeZip(pack.files.map((file) => ({ name: `${pack.folder}/${file.name}`, content: file.content })));
                        const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${pack.folder}.zip`; document.body.appendChild(link); link.click(); link.remove();
                        await api(`/projects/${projectId}/choices/${cardKey}/steps`, { method: "POST", body: JSON.stringify({ stepKey: step.key, done: true }) });
                        return api<CardState>(`/projects/${projectId}/choices/${cardKey}`);
                      })}>{busy === "package" ? "Готовим…" : "Скачать пакет (zip)"}</button>
                    )}
                    {step.kind === "verify" && state.canDecide && (
                      <form onSubmit={(event) => { event.preventDefault(); void run("verify", () => api<CardState>(`/projects/${projectId}/deployment/verify`, { method: "POST", body: JSON.stringify({ url: chosen.key === "buildpath" ? null : siteUrl }) })); }}>
                        {chosen.key !== "buildpath" && <input className={styles.input} inputMode="url" required maxLength={500} placeholder={chosen.key === "github_pages" ? "https://имя.github.io/my-site/" : "https://ваш-домен.kz"} value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} />}
                        <button className={styles.button} style={{ marginTop: 6 }} disabled={Boolean(busy)}>{busy === "verify" ? "Проверяем…" : "Проверить"}</button>
                        {choice?.verification && <p className={`${styles.notice} ${choice.verification.status === "matches" ? styles.success : styles.warn}`} style={{ marginTop: 8 }}>
                          {verificationText[choice.verification.status]}{choice.verification.httpStatus && choice.verification.status === "unreachable" ? ` (ответ сервера: ${choice.verification.httpStatus})` : ""}
                          <br /><span className={styles.small}>{choice.verification.url ? `${choice.verification.url} · ` : ""}проверено {date(choice.verification.checkedAt)}</span>
                        </p>}
                      </form>
                    )}
                    {(step.kind === "manual" || step.kind === "download") && state.canDecide && (
                      <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                        <input type="checkbox" checked={stepDone} disabled={Boolean(busy)} style={{ width: 20, height: 20 }}
                          onChange={(event) => run(step.key, () => api<CardState>(`/projects/${projectId}/choices/${cardKey}/steps`, { method: "POST", body: JSON.stringify({ stepKey: step.key, done: event.target.checked }) }))} />
                        <span className={styles.small}>Готово</span>
                      </label>
                    )}
                    {step.kind === "connect" && !repository && state.canDecide && (
                      state.connectAvailable ? (
                        chosen.key === "github" ? (
                          <GithubConnect projectId={projectId} projectName={state.context?.publication?.slug ?? ""} fallback={tokenForm}
                            onConnected={(next) => { setState(next as CardState); setDone("Готово: репозиторий подключён. Ничего не отправлено — отправка только по вашей кнопке."); }} />
                        ) : tokenForm
                      ) : <p className={`${styles.notice} ${styles.info}`}>{errors.REPO_CONNECT_NOT_CONFIGURED}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {repository && (
            <section className={styles.card} aria-label="Репозиторий">
              <p className={styles.kicker}>Подключено</p>
              <p className={styles.cardTitle} style={{ marginTop: 0 }}><a href={repository.webUrl} target="_blank" rel="noreferrer">{repository.repoPath}</a></p>
              <p className={styles.small} style={{ margin: "0 0 8px" }}>
                {repository.isPrivate ? "Закрытый репозиторий" : "Открытый репозиторий — код видят все"} · ветка {repository.defaultBranch} · {repository.connectedVia === "oauth" ? "через ваш аккаунт GitHub" : `ключ ${repository.tokenHint}`} · проверено {date(repository.verifiedAt)}
                {repository.lastPushAt && <><br />Последняя отправка: {date(repository.lastPushAt)}{repository.lastCommitUrl && <> · <a href={repository.lastCommitUrl} target="_blank" rel="noreferrer">посмотреть</a></>}</>}
                {repository.lastError && <><br />Последняя попытка не удалась: {errors[repository.lastError] ?? repository.lastError}</>}
              </p>
              {state.canDecide && !preview && <button className={styles.button} disabled={Boolean(busy)} onClick={() => run("preview", async () => { setPreview(await api<Preview>(`/projects/${projectId}/repository/push`)); })}>Отправить в репозиторий…</button>}
              {preview && (
                <div className={`${styles.notice} ${styles.info}`}>
                  <p style={{ margin: "0 0 6px" }}>В ветку <strong>{preview.branch}</strong> одним изменением уйдут только принятые результаты:</p>
                  <ul className={styles.list} style={{ margin: "0 0 6px" }}>{preview.files.map((file) => <li key={file.path}>{file.path} ({Math.max(1, Math.round(file.bytes / 1024))} КБ)</li>)}</ul>
                  {!preview.siteIncluded && <p style={{ margin: "0 0 6px" }}>Сайт ещё не собран и не принят — уйдёт только описание проекта.</p>}
                  <p style={{ margin: "0 0 8px" }}>Эти файлы в репозитории будут заменены. Остальные файлы не тронем.</p>
                  <div className={styles.row} style={{ gap: 8, flexWrap: "wrap" }}>
                    <button className={styles.button} disabled={Boolean(busy)} onClick={() => run("push", async () => { const next = await api<CardState>(`/projects/${projectId}/repository/push`, { method: "POST", body: JSON.stringify({ confirm: true }) }); setPreview(null); setDone("Отправлено в репозиторий."); return next; })}>{busy === "push" ? "Отправляем…" : "Подтверждаю, отправить"}</button>
                    <button className={styles.ghost} onClick={() => setPreview(null)}>Отмена</button>
                  </div>
                </div>
              )}
              {state.canDecide && <button className={styles.ghost} style={{ marginTop: 8 }} disabled={Boolean(busy)}
                onClick={() => { if (window.confirm("Отключить репозиторий? Сохранённый ключ будет удалён. Сам репозиторий и файлы в нём останутся.")) void run("disconnect", () => api<CardState>(`/projects/${projectId}/repository`, { method: "DELETE" })); }}>Отключить</button>}
            </section>
          )}
        </>
      )}
    </Shell>
  );
}

function Shell({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.top}><div className={styles.topInner}>
        <a className={styles.back} href={`/projects/${projectId}`}>← Проект</a>
        <span className={styles.topTitle}>Решение</span>
      </div></header>
      <main className={styles.container}>{children}</main>
    </div>
  );
}
