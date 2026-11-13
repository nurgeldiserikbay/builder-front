"use client";

import { t } from "@/lib/i18n";
import { useState } from "react";
import { explainError, images, type ProjectImage } from "@/lib/journey";
import styles from "../../../journey.module.css";

const aspects: Array<{ key: string; label: string; ratio: number | null }> = [
  { key: "free", label: t("Как есть"), ratio: null }, { key: "1:1", label: t("Квадрат"), ratio: 1 }, { key: "4:3", label: "4:3", ratio: 4 / 3 },
  { key: "16:9", label: t("Широкое 16:9"), ratio: 16 / 9 }, { key: "3:4", label: t("Портрет 3:4"), ratio: 3 / 4 },
];

/** The largest box of the chosen shape inside the photo, shrunk by zoom and moved by the two sliders; all in fractions. */
export function cropRect(image: { width: number; height: number }, ratio: number | null, zoom: number, posX: number, posY: number) {
  const imageRatio = image.width / image.height;
  const target = ratio ?? imageRatio;
  let width = 1;
  let height = 1;
  if (target > imageRatio) height = imageRatio / target; else width = target / imageRatio;
  width /= zoom; height /= zoom;
  return { x: (1 - width) * posX, y: (1 - height) * posY, width, height };
}

/** Crop on the phone without extra libraries: shape, zoom and position; the server keeps the original and adds a copy. */
export default function PhotoCrop({ projectId, image, url, onDone, onCancel }: { projectId: string; image: ProjectImage; url: string | undefined; onDone: (created: ProjectImage) => void; onCancel: () => void }) {
  const [aspect, setAspect] = useState(aspects[1]!);
  const [zoom, setZoom] = useState(1);
  const [posX, setPosX] = useState(0.5);
  const [posY, setPosY] = useState(0.5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rect = cropRect(image, aspect.ratio, zoom, posX, posY);
  const box = { aspectRatio: `${rect.width * image.width} / ${rect.height * image.height}` };

  async function save() {
    setBusy(true); setError("");
    try { onDone(await images.crop(projectId, image.id, rect)); } catch (problem) { setError(explainError(problem)); setBusy(false); }
  }

  return (
    <div className={styles.photoPanel} aria-label={t("Обрезать фото")}>
      <div style={{ ...box, width: "100%", maxWidth: 360, overflow: "hidden", position: "relative", borderRadius: 10, background: "#eee" }}>
        {url && <img src={url} alt={image.alt} style={{ position: "absolute", width: `${100 / rect.width}%`, height: `${100 / rect.height}%`, left: `${(-rect.x / rect.width) * 100}%`, top: `${(-rect.y / rect.height) * 100}%`, maxWidth: "none" }} />}
      </div>
      <div className={styles.row} style={{ flexWrap: "wrap", marginTop: 10 }} role="radiogroup" aria-label={t("Форма")}>
        {aspects.map((item) => (
          <button key={item.key} type="button" role="radio" aria-checked={aspect.key === item.key} className={aspect.key === item.key ? styles.button : styles.secondary} onClick={() => { setAspect(item); setZoom(1); }}>{item.label}</button>
        ))}
      </div>
      <label className={styles.field}><span className={styles.label}>{t("Приблизить")}</span>
        <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
      <label className={styles.field}><span className={styles.label}>{t("Сдвинуть влево — вправо")}</span>
        <input type="range" min={0} max={1} step={0.01} value={posX} onChange={(event) => setPosX(Number(event.target.value))} /></label>
      <label className={styles.field}><span className={styles.label}>{t("Сдвинуть вверх — вниз")}</span>
        <input type="range" min={0} max={1} step={0.01} value={posY} onChange={(event) => setPosY(Number(event.target.value))} /></label>
      <p className={styles.why}>{t("Сохранится копия обрезанного фото, исходное останется в библиотеке.")}</p>
      {error && <p className={`${styles.notice} ${styles.warn}`} role="alert">{error}</p>}
      <div className={styles.row}>
        <button type="button" className={styles.button} disabled={busy} onClick={save}>{busy ? t("Сохраняем…") : t("Сохранить")}</button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={onCancel}>{t("Отмена")}</button>
      </div>
    </div>
  );
}
