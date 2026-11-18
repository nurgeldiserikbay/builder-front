"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import { t } from "@/lib/i18n";
import styles from "../../../journey.module.css";

export type VoiceState = { available: boolean; consented: boolean; maxSeconds: number; service: string | null };

const errors: Record<string, string> = {
  VOICE_NOT_RECOGNISED: t("Не получилось разобрать запись. Скажите ещё раз или напишите текстом."),
  VOICE_DAILY_LIMIT_REACHED: t("На сегодня лимит голосовых ответов исчерпан — напишите, пожалуйста, текстом."),
  VOICE_TOO_LONG: t("Запись слишком длинная — скажите короче."),
  VOICE_FORMAT_NOT_SUPPORTED: t("Этот браузер записывает звук в формате, который мы пока не принимаем. Напишите текстом."),
  VOICE_NOT_CONFIGURED: t("Голосовые ответы на этом сервере не подключены."),
};
const FORMATS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/**
 * «🎙 Сказать голосом»: records in the browser, sends the recording once for recognition (not stored) and gives the text to
 * the owner to check and send. Consent is asked once, before the first recording leaves the phone.
 */
export default function VoiceInput({ endpoint, voice, disabled, onText }: { endpoint: string; voice: VoiceState; disabled: boolean; onText: (text: string) => void }) {
  const [consented, setConsented] = useState(voice.consented);
  const [asking, setAsking] = useState(false);
  const [phase, setPhase] = useState<"idle" | "recording" | "sending">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const supported = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); recorder.current?.stream.getTracks().forEach((track) => track.stop()); }, []);
  if (!voice.available || !supported) return null;

  async function send(blob: Blob, consent: boolean) {
    setPhase("sending");
    try {
      const form = new FormData();
      form.append("file", blob, "voice");
      if (consent) form.append("consent", "true");
      const result = await api<{ text: string }>(endpoint, { method: "POST", body: form });
      setConsented(true);
      onText(result.text);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setError(errors[code] ?? explainError(caught));
    } finally { setPhase("idle"); }
  }

  async function start(consent: boolean) {
    setAsking(false); setError("");
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setError(t("Нет доступа к микрофону. Разрешите его в настройках браузера или напишите текстом.")); return; }
    const mimeType = FORMATS.find((format) => MediaRecorder.isTypeSupported(format));
    const media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    media.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    media.onstop = () => {
      if (timer.current) clearInterval(timer.current);
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: (media.mimeType || mimeType || "audio/webm").split(";")[0] });
      if (blob.size) void send(blob, consent); else setPhase("idle");
    };
    recorder.current = media;
    media.start();
    setSeconds(0); setPhase("recording");
    const started = Date.now();
    timer.current = setInterval(() => {
      const passed = Math.floor((Date.now() - started) / 1000);
      setSeconds(passed);
      if (passed >= voice.maxSeconds && media.state === "recording") media.stop();
    }, 250);
  }
  const stop = () => { if (recorder.current?.state === "recording") recorder.current.stop(); };
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div style={{ marginTop: 8 }}>
      {phase === "recording" ? (
        <button type="button" className={`${styles.button} ${styles.block}`} onClick={stop} aria-live="polite">
          <span aria-hidden="true">● </span>{t("Запись {0} — нажмите, чтобы закончить", [clock])}
        </button>
      ) : (
        <button type="button" className={`${styles.secondary} ${styles.block}`} disabled={disabled || phase === "sending"} onClick={() => (consented ? void start(false) : setAsking(true))}>
          {phase === "sending" ? t("Распознаём речь…") : t("🎙 Ответить голосом")}
        </button>
      )}
      {asking && (
        <div className={`${styles.notice} ${styles.info}`} role="dialog" aria-label={t("Согласие на распознавание речи")} style={{ marginTop: 8 }}>
          <p style={{ margin: "0 0 8px" }}>{t("Чтобы понять голосовой ответ, BuildPath отправит запись в сервис распознавания речи ({0}). Запись не хранится: остаётся только текст — вы увидите его и сами решите, отправлять ли.", [voice.service ?? "—"])}</p>
          <div className={styles.row} style={{ gap: 8 }}>
            <button type="button" className={styles.button} onClick={() => void start(true)}>{t("Разрешить и записать")}</button>
            <button type="button" className={styles.ghost} onClick={() => setAsking(false)}>{t("Отмена")}</button>
          </div>
        </div>
      )}
      {phase === "idle" && !asking && !error && <p className={styles.small} style={{ margin: "4px 0 0" }}>{t("До {0} секунд. Текст появится в поле ответа — проверьте его перед отправкой.", [voice.maxSeconds])}</p>}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
