"use client";

// The canvas every diagram is drawn on, with what people know from diagram tools (Lucidchart, draw.io, dbdiagram):
// zoom, fit to the screen, drag to move, full screen, download as SVG or PNG. Diagrams stay generated from stage data;
// the canvas only changes how they are looked at.
import { Children, cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import styles from "./canvas.module.css";

const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2];
const clampZoom = (value: number) => Math.min(2, Math.max(0.4, value));

type SvgProps = { width: number; height: number; viewBox?: string; style?: React.CSSProperties };

/** Latin letters for Cyrillic (and Kazakh) ones: some browsers drop a download name with other letters. */
const LATIN: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i" };
/** Name for the downloaded file: the diagram label in Latin letters, digits and dashes. */
const fileName = (label: string) => label.toLowerCase().split("").map((char) => LATIN[char] ?? char).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "diagram";

export default function DiagramCanvas({ label, children, legend }: { label: string; children: React.ReactElement<SvgProps>; legend?: React.ReactNode }) {
  const svg = Children.only(children);
  const width = Number(svg.props.width) || 1; const height = Number(svg.props.height) || 1;
  const frame = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const [menu, setMenu] = useState(false);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  /** Fit the width of the frame; on a phone a wide diagram is shrunk only as far as text stays readable. */
  const fit = useCallback(() => {
    const box = frame.current;
    if (!box) return;
    const available = box.clientWidth - 8;
    // Full screen: as large as fits (up to 150%). In the page: shrink a wide diagram, but not below readable.
    if (full) setZoom(clampZoom(Math.min(available / width, (box.clientHeight - 8) / height, 1.5)));
    else setZoom(clampZoom(Math.max(width > available ? available / width : 1, 0.7)));
  }, [width, height, full]);
  useEffect(() => { fit(); }, [fit]);
  useEffect(() => {
    if (!full) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setFull(false); };
    window.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", close); document.body.style.overflow = ""; };
  }, [full]);

  const step = (direction: 1 | -1) => setZoom((current) => {
    const index = ZOOMS.findIndex((value) => value >= current - 0.001);
    const next = direction > 0 ? ZOOMS.find((value) => value > current + 0.001) : [...ZOOMS].reverse().find((value) => value < current - 0.001);
    return next ?? (index < 0 ? current : ZOOMS[index]!);
  });

  // Ctrl/⌘ + wheel zooms (as in diagram tools); a plain wheel scrolls the page as usual.
  const onWheel = (event: React.WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom((current) => clampZoom(current * (event.deltaY < 0 ? 1.1 : 0.9)));
  };
  // Drag the empty canvas with a mouse to move around; touch screens scroll natively.
  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || !frame.current) return;
    if ((event.target as Element).closest('[role="button"], button, a')) return;
    drag.current = { x: event.clientX, y: event.clientY, left: frame.current.scrollLeft, top: frame.current.scrollTop };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current || !frame.current) return;
    const dx = event.clientX - drag.current.x; const dy = event.clientY - drag.current.y;
    if (!dragging && Math.abs(dx) + Math.abs(dy) < 4) return;
    setDragging(true);
    frame.current.scrollLeft = drag.current.left - dx;
    frame.current.scrollTop = drag.current.top - dy;
  };
  const endDrag = () => { drag.current = null; window.setTimeout(() => setDragging(false), 0); };

  /** The diagram as a standalone SVG file: same drawing, fonts and colours inlined, readable without BuildPath. */
  const svgText = () => {
    const node = frame.current?.querySelector("svg");
    if (!node) return null;
    const copy = node.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", String(width)); copy.setAttribute("height", String(height));
    copy.setAttribute("font-family", getComputedStyle(node).fontFamily || "sans-serif");
    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("width", "100%"); background.setAttribute("height", "100%"); background.setAttribute("fill", "#ffffff");
    copy.insertBefore(background, copy.firstChild);
    return new XMLSerializer().serializeToString(copy);
  };
  const save = (blob: Blob, name: string) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  const downloadSvg = () => { const text = svgText(); if (text) save(new Blob([text], { type: "image/svg+xml" }), `${fileName(label)}.svg`); setMenu(false); };
  const downloadPng = () => {
    const text = svgText();
    setMenu(false);
    if (!text) return;
    const image = new Image();
    image.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale; canvas.height = height * scale;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(scale, scale); context.drawImage(image, 0, 0);
      try { canvas.toBlob((blob) => { if (blob) save(blob, `${fileName(label)}.png`); }, "image/png"); }
      catch { downloadSvg(); }
    };
    image.onerror = () => downloadSvg();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  };

  const scaled = isValidElement(svg) ? cloneElement(svg, { width: Math.round(width * zoom), height: Math.round(height * zoom), viewBox: svg.props.viewBox ?? `0 0 ${width} ${height}`, style: { ...svg.props.style, display: "block", minWidth: 0, margin: "0 auto" } }) : svg;

  return (
    <div className={`${styles.wrap} ${full ? styles.full : ""}`} role={full ? "dialog" : undefined} aria-modal={full || undefined} aria-label={full ? label : undefined}>
      <div className={styles.toolbar} role="toolbar" aria-label={t("Управление схемой")}>
        {full && <span className={styles.title}>{label}</span>}
        <button type="button" className={styles.tool} onClick={() => step(-1)} aria-label={t("Уменьшить")} title={t("Уменьшить")}>−</button>
        <button type="button" className={styles.zoom} onClick={() => setZoom(1)} title={t("Обычный размер")}>{Math.round(zoom * 100)}%</button>
        <button type="button" className={styles.tool} onClick={() => step(1)} aria-label={t("Увеличить")} title={t("Увеличить")}>+</button>
        <button type="button" className={styles.tool} onClick={fit} title={t("Вписать в экран")} aria-label={t("Вписать в экран")}>⤢</button>
        <span className={styles.spacer} />
        <span className={styles.menuBox}>
          <button type="button" className={styles.tool} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} title={t("Скачать")} aria-label={t("Скачать схему")}>⤓</button>
          {menu && (
            <span className={styles.menu} role="menu">
              <button type="button" role="menuitem" onClick={downloadPng}>{t("Картинка PNG")}</button>
              <button type="button" role="menuitem" onClick={downloadSvg}>{t("Векторный SVG")}</button>
            </span>
          )}
        </span>
        <button type="button" className={styles.tool} onClick={() => setFull(!full)} aria-label={full ? t("Закрыть полный экран") : t("На весь экран")} title={full ? t("Закрыть полный экран") : t("На весь экран")}>{full ? "✕" : "⛶"}</button>
      </div>
      <div ref={frame} className={`${styles.frame} ${dragging ? styles.dragging : ""}`} role="img" aria-label={label} tabIndex={0}
        onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag}
        onClickCapture={(event) => { if (dragging) { event.stopPropagation(); event.preventDefault(); } }}>
        {scaled}
      </div>
      {legend && <div className={styles.legend}>{legend}</div>}
    </div>
  );
}
