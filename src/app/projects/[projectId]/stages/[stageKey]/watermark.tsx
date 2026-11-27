"use client";

/**
 * A faint repeated mark with the specialist's address over the stage screen. It does not block clicks or reading; it makes a
 * screenshot point back to whoever took it. Hidden from screen readers: it repeats the same line and says nothing new.
 */
export default function Watermark({ label }: { label: string }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220"><text x="0" y="120" transform="rotate(-24 210 110)" font-family="sans-serif" font-size="14" fill="#5b6470" fill-opacity="0.13">${label.replace(/[<>&"']/g, "")}</text></svg>`;
  return (
    <div aria-hidden="true" data-watermark style={{
      position: "fixed", inset: 0, zIndex: 40, pointerEvents: "none",
      backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`, backgroundRepeat: "repeat",
    }} />
  );
}
