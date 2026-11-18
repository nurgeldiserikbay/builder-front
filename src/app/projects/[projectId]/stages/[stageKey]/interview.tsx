"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { t } from "@/lib/i18n";
import { formatTenge } from "@/lib/money";
import styles from "../../../journey.module.css";
import VoiceInput, { type VoiceState } from "./voice-input";

type Message = { role: "assistant" | "owner"; text: string; at: string };
type Interview = {
  composed?: boolean; available?: boolean; topics?: Field[]; voice?: VoiceState;
  mode: "ai" | "template"; messages: Message[]; extracted: Record<string, unknown>; filled: string[]; missingRequired: string[];
  done: boolean; applied: boolean; turnsLeft: number;
};
type Field = { key: string; label: string; required: boolean };

const errors: Record<string, string> = {
  INTERVIEW_TOO_LONG: t("Разговор получился длинным. Нажмите «Заполнить форму» и допишите остальное в полях ниже или начните заново."),
  INTERVIEW_NOTHING_TO_APPLY: t("Пока нечего переносить в форму: ответьте хотя бы на один вопрос."),
  STAGE_INPUTS_NOT_ACCEPTED: t("Сначала примите предыдущие этапы: ИИ составляет этот этап с опорой на них."),
};

/**
 * «Разговор»: the owner tells about the business and answers one question at a time. On form stages the answers fill the
 * form (with AI the questions follow the conversation; without AI the form's questions come one by one). On the process and
 * the ТЗ the AI gathers the answers by topic and then composes the stage from them.
 */
export default function InterviewPanel({ projectId, stageKey, fields: formFields, story, requestPrice, onApplied }: {
  projectId: string; stageKey: string; fields?: Field[]; story: string | null; requestPrice: number | null; onApplied: () => Promise<unknown>;
}) {
  const [state, setState] = useState<Interview | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Only GET says whether voice works here; the answers to messages do not repeat it.
  const [voice, setVoice] = useState<VoiceState | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const base = `/projects/${projectId}/stages/${stageKey}/interview`;

  // The story from the project wizard is offered as the first answer, so the owner does not retell it.
  const offerStory = (next: Interview) => {
    if (story && stageKey === "goal" && next.mode === "ai" && next.messages.length > 0 && !next.messages.some((message) => message.role === "owner")) setText((current) => current || story.slice(0, 1000));
  };
  useEffect(() => { void api<Interview>(base).then((next) => { setState(next); setVoice(next.voice ?? null); offerStory(next); }).catch(() => setState(null)); }, [base]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (state?.messages.length) end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [state?.messages.length]);

  async function act(label: string, work: () => Promise<void>) {
    setBusy(label); setError(""); setNotice("");
    try { await work(); } catch (caught) { const code = caught instanceof Error ? caught.message : ""; setError(errors[code] ?? explainError(caught)); } finally { setBusy(""); }
  }
  const start = () => act("start", async () => {
    const next = await api<Interview>(base, { method: "POST", body: JSON.stringify({ message: null }) });
    setState(next);
    offerStory(next);
  });
  const send = () => act("send", async () => {
    const message = text.trim();
    if (!message) return;
    setState((current) => current && { ...current, messages: [...current.messages, { role: "owner", text: message, at: new Date().toISOString() }] });
    setText("");
    try { setState(await api<Interview>(base, { method: "POST", body: JSON.stringify({ message }) })); }
    catch (caught) { setText(message); setState(await api<Interview>(base)); throw caught; }
  });
  const apply = () => act("apply", async () => {
    await api(`${base}/apply`, { method: "POST" });
    await onApplied();
    setState(await api<Interview>(base));
    setNotice(composed ? t("Готово: ИИ составил этап по разговору. Проверьте результат ниже, поправьте, если что-то не так, и примите этап.") : t("Готово: ответы перенесены в форму ниже. Проверьте их, поправьте, если нужно, и примите этап."));
  });
  const restart = () => { if (window.confirm(t("Начать разговор заново? Ответы в форме останутся, а переписка удалится."))) void act("restart", async () => { const next = await api<Interview>(base, { method: "POST", body: JSON.stringify({ message: null, restart: true }) }); setText(""); setState(next); offerStory(next); }); };

  if (!state || state.available === false) return null;
  const composed = state.composed === true;
  const fields = state.topics ?? formFields ?? [];
  const started = state.messages.length > 0;
  const label = (key: string) => fields.find((field) => field.key === key)?.label ?? key;
  const requiredCount = fields.filter((field) => field.required).length;
  const requiredFilled = requiredCount - state.missingRequired.length;

  return (
    <section className={styles.card} aria-labelledby="interview-title">
      <p className={styles.cardTitle} id="interview-title">{stageKey === "offer" ? t("Расскажите об услугах в разговоре") : stageKey === "process" ? t("Расскажите, как всё устроено, в разговоре") : stageKey === "features" ? t("Обсудите ТЗ в разговоре") : t("Расскажите о бизнесе в разговоре")}</p>
      {!started && (
        <>
          <p className={styles.small} style={{ marginTop: 0 }}>
            {composed
              ? t("ИИ задаст вопросы по одному простыми словами, а потом составит этап по вашим ответам и уже принятым этапам. Ничего не придумывает: чего вы не сказали, он от себя не допишет.")
              : state.mode === "ai"
              ? t("ИИ задаст вопросы по одному простыми словами и сам заполнит форму. Ничего не придумывает — только то, что вы скажете.")
              : t("ИИ пока не подключён: зададим вопросы из формы по одному. Можно и сразу заполнить поля ниже.")}
            {state.mode === "ai" && requestPrice !== null ? ` ${composed ? t("Каждый ваш ответ и составление этапа — по одному запросу к ИИ, около {0} каждый.", [formatTenge(requestPrice)]) : t("Каждый ваш ответ — один запрос к ИИ, около {0}.", [formatTenge(requestPrice)])}` : ""}
          </p>
          <button type="button" className={`${styles.button} ${styles.block}`} disabled={Boolean(busy)} onClick={start}>{busy === "start" ? t("Начинаем…") : t("💬 Начать разговор")}</button>
          <p className={styles.small}>{composed ? t("Можно и без разговора: попросить ИИ составить этап сразу или заполнить его ниже самому.") : t("Удобнее формой? Заполните поля ниже — разговор не обязателен.")}</p>
        </>
      )}
      {started && (
        <>
          <div role="log" aria-live="polite" style={{ display: "grid", gap: 8, maxHeight: 420, overflowY: "auto", padding: "4px 0", overscrollBehavior: "contain" }}>
            {state.messages.map((message, index) => (
              <div key={`${message.at}-${index}`} style={{
                justifySelf: message.role === "owner" ? "end" : "start", maxWidth: "88%", padding: "8px 12px", borderRadius: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere",
                background: message.role === "owner" ? "var(--brand)" : "var(--brand-wash)", color: message.role === "owner" ? "#fff" : "inherit",
                borderBottomRightRadius: message.role === "owner" ? 4 : 14, borderBottomLeftRadius: message.role === "owner" ? 14 : 4,
              }}>
                <span className={styles.srOnly}>{message.role === "owner" ? t("Вы:") : t("BuildPath:")} </span>{message.text}
              </div>
            ))}
            {busy === "send" && <div className={styles.small} style={{ justifySelf: "start" }}>{state.mode === "ai" ? t("ИИ думает…") : t("…")}</div>}
            <div ref={end} />
          </div>
          <p className={styles.small} style={{ margin: "8px 0" }}>
            {t("Обязательные ответы: {0} из {1}.", [requiredFilled, requiredCount])}
            {state.missingRequired.length > 0 && ` ${t("Ещё нужно: {0}.", [state.missingRequired.map(label).join(", ")])}`}
          </p>
          {state.turnsLeft > 1 && (
            <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
              <label className={styles.srOnly} htmlFor="interview-text">{t("Ваш ответ")}</label>
              <textarea id="interview-text" className={styles.textarea} rows={3} maxLength={1000} value={text} placeholder={t("Напишите ответ своими словами")}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); } }} />
              <button className={`${styles.button} ${styles.block}`} style={{ marginTop: 8 }} disabled={Boolean(busy) || !text.trim()}>{busy === "send" ? t("Отправляем…") : t("Отправить")}</button>
              {voice && <VoiceInput endpoint={`${base}/voice`} voice={voice} disabled={Boolean(busy)} onText={(heard) => setText((current) => (current.trim() ? `${current.trim()} ${heard}` : heard).slice(0, 1000))} />}
            </form>
          )}
          <div className={styles.row} style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button type="button" className={state.done ? styles.button : styles.secondary} disabled={Boolean(busy) || state.filled.length === 0} onClick={() => void apply()}>
              {composed
                ? busy === "apply" ? t("Составляем… (до минуты)") : state.applied ? t("Составить ещё раз") : t("Составить по разговору")
                : busy === "apply" ? t("Заполняем…") : state.applied ? t("Заполнить форму ещё раз") : t("Заполнить форму")}
            </button>
            <button type="button" className={styles.ghost} disabled={Boolean(busy)} onClick={restart}>{t("Начать заново")}</button>
          </div>
          {state.filled.length > 0 && <p className={styles.small}>{composed ? t("Уже обсудили: {0}", [state.filled.map(label).join(" · ")]) : t("Уже есть ответы: {0}.", [state.filled.map(label).join(", ")])}</p>}
        </>
      )}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
      {notice && <p className={`${styles.notice} ${styles.success}`} role="status">{notice}</p>}
    </section>
  );
}
