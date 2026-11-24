"use client";

import { t, dateLocale } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../projects/journey.module.css";
import AppHeader from "../../app-header";
import own from "./security.module.css";

type Session = { id: string; current: boolean; device: string; ipHint: string | null; method: string; createdAt: string; lastSeenAt: string };
type SignIn = { id: string; at: string; method: string; outcome: string; device: string; ipHint: string | null };
type Security = {
  twoStep: { enabled: boolean; enabledAt: string | null; recoveryCodesLeft: number | null; available: boolean };
  hasPassword: boolean;
  sessions: Session[];
  signIns: SignIn[];
};
type Setup = { secret: string; otpauthUri: string };

const errors: Record<string, string> = {
  TWO_STEP_CODE_INVALID: t("Код не подошёл. Введите шесть цифр, которые сейчас показывает приложение, или один из резервных кодов."),
  TWO_STEP_NOT_STARTED: t("Начните заново: нажмите «Включить» и отсканируйте новый QR-код."),
  TWO_STEP_ALREADY_ON: t("Вход с кодом уже включён."),
  TWO_STEP_ALREADY_OFF: t("Вход с кодом уже выключен."),
  TWO_STEP_UNAVAILABLE: t("Вход с кодом пока не настроен на сервере. Напишите в поддержку."),
  TWO_STEP_NEEDS_PASSWORD: t("Вы входите через Google или Telegram — код из приложения защищает только вход по паролю."),
  INVALID_PASSWORD: t("Пароль не подошёл."),
  LOGIN_RATE_LIMITED: t("Слишком много попыток. Подождите 15 минут."),
  SESSION_NOT_FOUND: t("Этот сеанс уже завершён."),
};
const explain = (caught: unknown) => (caught instanceof ApiError && errors[caught.message]) || explainError(caught);

const methods: Record<string, string> = {
  password: t("Пароль"),
  two_step: t("Пароль и код"),
  google: "Google",
  telegram: "Telegram",
};
const outcomes: Record<string, { text: string; tone: string }> = {
  success: { text: t("Вход"), tone: "done" },
  recovery_code: { text: t("Вход по резервному коду"), tone: "attention" },
  wrong_password: { text: t("Неверный пароль"), tone: "closed" },
  wrong_code: { text: t("Неверный код"), tone: "closed" },
};
const device = (name: string) => name === "Неизвестное устройство" ? t("Устройство не записано") : name;
const when = (value: string) => new Date(value).toLocaleString(dateLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const ago = (value: string) => {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 15) return t("сейчас");
  if (minutes < 60) return t("{0} мин назад", [minutes]);
  return when(value);
};

export default function SecurityPage() {
  const router = useRouter();
  const [data, setData] = useState<Security | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"idle" | "password" | "scan" | "codes" | "disable" | "regenerate">("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [qr, setQr] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  const [allSessions, setAllSessions] = useState(false);

  useEffect(() => {
    api<Security>("/me/security").then(setData).catch((caught) => {
      if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent("/account/security")}`); return; }
      setError(explain(caught));
    });
  }, [router]);

  useEffect(() => {
    if (!setup) { setQr(""); return; }
    QRCode.toString(setup.otpauthUri, { type: "svg", margin: 1, width: 184, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(""));
  }, [setup]);

  const reset = () => { setStep("idle"); setPassword(""); setCode(""); setSetup(null); setFormError(""); };

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFormError("");
    try { await action(); } catch (caught) { setFormError(explain(caught)); } finally { setBusy(false); }
  }

  const startSetup = (event: React.FormEvent) => { event.preventDefault(); void run(async () => {
    setSetup(await api<Setup>("/me/two-step/setup", { method: "POST", body: JSON.stringify({ password }) }));
    setPassword("");
    setStep("scan");
  }); };
  const enable = (event: React.FormEvent) => { event.preventDefault(); void run(async () => {
    const result = await api<Security & { recoveryCodes: string[] }>("/me/two-step/enable", { method: "POST", body: JSON.stringify({ code }) });
    const { recoveryCodes, ...rest } = result;
    setData(rest);
    setCodes(recoveryCodes);
    setCode("");
    setSetup(null);
    setStep("codes");
  }); };
  const disable = (event: React.FormEvent) => { event.preventDefault(); void run(async () => {
    setData(await api<Security>("/me/two-step/disable", { method: "POST", body: JSON.stringify({ password, code }) }));
    reset();
  }); };
  const regenerate = (event: React.FormEvent) => { event.preventDefault(); void run(async () => {
    const result = await api<{ recoveryCodes: string[] }>("/me/two-step/recovery-codes", { method: "POST", body: JSON.stringify({ password }) });
    setCodes(result.recoveryCodes);
    setPassword("");
    setData((current) => current && { ...current, twoStep: { ...current.twoStep, recoveryCodesLeft: result.recoveryCodes.length } });
    setStep("codes");
  }); };

  async function revoke(id: string | null) {
    setBusy(true);
    setError("");
    try {
      setData(await api<Security>(id ? `/me/sessions/${id}/revoke` : "/me/sessions/revoke-others", { method: "POST" }));
    } catch (caught) { setError(explain(caught)); } finally { setBusy(false); }
  }

  const copyCodes = () => { void navigator.clipboard?.writeText(codes.join("\n")); };
  const downloadCodes = () => {
    const blob = new Blob([`${t("Резервные коды BuildPath. Каждый работает один раз.")}\n\n${codes.join("\n")}\n`], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "buildpath-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const others = data?.sessions.filter((session) => !session.current) ?? [];
  const twoStep = data?.twoStep;

  return (
    <div className={styles.shell}>
      <AppHeader back={{ href: "/account", label: t("← Аккаунт") }} title={t("Безопасность")} />
      <main className={styles.container}>
        <div className={styles.pageHead}>
          <div>
            <p className={styles.kicker}>{t("Аккаунт")}</p>
            <h1 className={styles.h1}>{t("Безопасность")}</h1>
            <p className={styles.small} style={{ margin: "6px 0 0" }}>{t("Кто и откуда входит в ваш аккаунт. О входе с нового устройства мы сразу пишем в Telegram и на почту.")}</p>
          </div>
        </div>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {!data && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}

        {data && twoStep && <>
          <section className={styles.card} aria-labelledby="two-step">
            <div className={styles.sectionHead}>
              <p id="two-step" className={styles.cardTitle} style={{ margin: 0 }}>{t("Вход с кодом из приложения")}</p>
              <span className={`${styles.chip} ${twoStep.enabled ? styles.done : styles.closed}`} style={{ marginTop: 0 }}>{twoStep.enabled ? t("Включён") : t("Выключен")}</span>
            </div>

            {!data.hasPassword && <p style={{ margin: 0 }}>{t("Вы входите через Google или Telegram — их защита (в том числе двухэтапная проверка) действует и здесь. Код из приложения нужен только для входа по паролю.")}</p>}

            {data.hasPassword && step === "idle" && !twoStep.enabled && <>
              <p style={{ marginTop: 0 }}>{t("После пароля BuildPath попросит шестизначный код из приложения-аутентификатора на телефоне — Google Authenticator, Яндекс Ключ, 1Password или другого. Даже если пароль узнают, без телефона в аккаунт не войти.")}</p>
              {twoStep.available
                ? <button className={styles.button} onClick={() => setStep("password")}>{t("Включить")}</button>
                : <p className={`${styles.notice} ${styles.warning}`}>{errors.TWO_STEP_UNAVAILABLE}</p>}
            </>}

            {data.hasPassword && step === "idle" && twoStep.enabled && <>
              <p style={{ marginTop: 0 }}>{t("Включён {0}. При входе по паролю нужен код из приложения.", [when(twoStep.enabledAt!)])}{" "}
                {t("Резервных кодов осталось: {0} из 10.", [twoStep.recoveryCodesLeft ?? 0])}</p>
              {(twoStep.recoveryCodesLeft ?? 0) <= 3 && <p className={`${styles.notice} ${styles.warning}`}>{t("Резервные коды заканчиваются. Создайте новые, пока есть доступ к приложению.")}</p>}
              <div className={styles.row} style={{ gap: 10, flexWrap: "wrap" }}>
                <button className={styles.secondary} onClick={() => setStep("regenerate")}>{t("Новые резервные коды")}</button>
                <button className={styles.ghost} onClick={() => setStep("disable")}>{t("Выключить")}</button>
              </div>
            </>}

            {(step === "password" || step === "regenerate") && <form onSubmit={step === "password" ? startSetup : regenerate}>
              <p style={{ marginTop: 0 }}>{step === "password" ? t("Подтвердите, что это вы.") : t("Старые резервные коды перестанут работать. Подтвердите паролем.")}</p>
              <label className={`${styles.label} ${own.field}`} htmlFor="sec-password">{t("Пароль от аккаунта")}</label>
              <input id="sec-password" className={styles.input} type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
              {formError && <p className={`${styles.notice} ${styles.error}`} role="alert">{formError}</p>}
              <div className={styles.row} style={{ gap: 10, marginTop: 14 }}>
                <button className={styles.button} disabled={busy || !password}>{busy ? t("Подождите…") : t("Продолжить")}</button>
                <button type="button" className={styles.ghost} onClick={reset}>{t("Отмена")}</button>
              </div>
            </form>}

            {step === "scan" && setup && <form onSubmit={enable}>
              <ol className={styles.list} style={{ marginTop: 0 }}>
                <li>{t("Откройте приложение-аутентификатор и добавьте аккаунт по QR-коду.")}</li>
                <li>{t("Введите шестизначный код, который оно покажет.")}</li>
              </ol>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center", margin: "6px 0 14px" }}>
                {qr ? <div className={own.qr} aria-label={t("QR-код для приложения")} role="img" dangerouslySetInnerHTML={{ __html: qr }} /> : null}
                <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                  <p className={styles.small} style={{ margin: "0 0 4px" }}>{t("Нет камеры или открыто на телефоне? Введите ключ вручную:")}</p>
                  <code className={styles.mono} style={{ wordBreak: "break-all", fontSize: 15, letterSpacing: ".06em" }}>{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
                  <p className={styles.small} style={{ margin: "8px 0 0" }}><a href={setup.otpauthUri}>{t("Открыть в приложении на этом телефоне")}</a></p>
                </div>
              </div>
              <label className={`${styles.label} ${own.field}`} htmlFor="sec-code">{t("Код из приложения")}</label>
              <input id="sec-code" className={styles.input} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required maxLength={7} value={code} onChange={(event) => setCode(event.target.value)} style={{ maxWidth: 200, fontSize: 18, letterSpacing: ".2em" }} />
              {formError && <p className={`${styles.notice} ${styles.error}`} role="alert">{formError}</p>}
              <div className={styles.row} style={{ gap: 10, marginTop: 14 }}>
                <button className={styles.button} disabled={busy || code.replace(/\s/g, "").length !== 6}>{busy ? t("Проверяем…") : t("Включить вход с кодом")}</button>
                <button type="button" className={styles.ghost} onClick={reset}>{t("Отмена")}</button>
              </div>
            </form>}

            {step === "codes" && <>
              <p className={`${styles.notice} ${styles.success}`} style={{ marginTop: 0 }}>{t("Готово. Сохраните резервные коды — они понадобятся, если телефон потеряется. Каждый код работает один раз, и мы показываем их только сейчас.")}</p>
              <ul className={own.codes}>
                {codes.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <div className={styles.row} style={{ gap: 10, flexWrap: "wrap" }}>
                <button className={styles.secondary} onClick={downloadCodes}>{t("Скачать .txt")}</button>
                <button className={styles.secondary} onClick={copyCodes}>{t("Скопировать")}</button>
                <button className={styles.button} onClick={() => { setCodes([]); reset(); }}>{t("Я сохранил коды")}</button>
              </div>
            </>}

            {step === "disable" && <form onSubmit={disable}>
              <p style={{ marginTop: 0 }}>{t("Без кода в аккаунт можно будет войти одним паролем. Подтвердите паролем и кодом из приложения (или резервным кодом).")}</p>
              <label className={`${styles.label} ${own.field}`} htmlFor="off-password">{t("Пароль от аккаунта")}</label>
              <input id="off-password" className={styles.input} type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
              <label className={`${styles.label} ${own.field}`} htmlFor="off-code">{t("Код из приложения или резервный код")}</label>
              <input id="off-code" className={styles.input} autoComplete="one-time-code" required maxLength={12} value={code} onChange={(event) => setCode(event.target.value)} style={{ maxWidth: 220 }} />
              {formError && <p className={`${styles.notice} ${styles.error}`} role="alert">{formError}</p>}
              <div className={styles.row} style={{ gap: 10, marginTop: 14 }}>
                <button className={styles.danger} disabled={busy || !password || code.trim().length < 6}>{busy ? t("Подождите…") : t("Выключить вход с кодом")}</button>
                <button type="button" className={styles.ghost} onClick={reset}>{t("Отмена")}</button>
              </div>
            </form>}
          </section>

          <div className={styles.sectionHeader}>
            <h2 className={styles.h2}>{t("Активные сеансы")}</h2>
            <span className={styles.count}>{data.sessions.length}</span>
            {others.length > 0 && <button className={styles.secondary} style={{ marginLeft: "auto" }} disabled={busy} onClick={() => void revoke(null)}>{t("Выйти на остальных устройствах")}</button>}
          </div>
          <ul className={own.rows}>
            {(allSessions ? data.sessions : data.sessions.slice(0, 6)).map((session) => <li key={session.id}>
              <div className={own.main}>
                <b>{device(session.device)}</b>{session.current && <span className={`${styles.chip} ${styles.active}`} style={{ marginLeft: 8, marginTop: 0 }}>{t("Это устройство")}</span>}
                <span className={own.sub}>{[methods[session.method] ?? session.method, session.ipHint ? t("Сеть {0}", [session.ipHint]) : null, t("вход {0}", [when(session.createdAt)])].filter(Boolean).join(" · ")}</span>
              </div>
              <span className={own.side}>{session.current ? t("сейчас") : ago(session.lastSeenAt)}</span>
              {!session.current && <button className={styles.ghost} disabled={busy} onClick={() => void revoke(session.id)}>{t("Завершить")}</button>}
            </li>)}
          </ul>
          {data.sessions.length > 6 && !allSessions && <button className={`${styles.ghost} ${own.more}`} onClick={() => setAllSessions(true)}>{t("Показать все ({0})", [data.sessions.length])}</button>}
          <p className={styles.small}>{t("Завершённый сеанс выходит из аккаунта при следующем действии. Если сеанс незнакомый — завершите его и смените пароль.")}</p>

          <div className={styles.sectionHeader}>
            <h2 className={styles.h2}>{t("История входов")}</h2>
            <span className={styles.small}>{t("за 90 дней")}</span>
          </div>
          {data.signIns.length === 0
            ? <p className={styles.muted}>{t("Пока нет записей — история ведётся с этого обновления.")}</p>
            : <ul className={own.rows}>
              {data.signIns.map((event) => {
                const outcome = outcomes[event.outcome] ?? { text: event.outcome, tone: "closed" };
                return <li key={event.id}>
                  <span className={own.when}>{when(event.at)}</span>
                  <div className={own.main}>
                    <span className={`${styles.chip} ${styles[outcome.tone]}`} style={{ marginTop: 0 }}>{outcome.text}</span>
                    <span className={own.sub}>{device(event.device)} · {methods[event.method] ?? event.method}{event.ipHint ? ` · ${t("Сеть {0}", [event.ipHint])}` : ""}</span>
                  </div>
                </li>;
              })}
            </ul>}
        </>}
      </main>
    </div>
  );
}
