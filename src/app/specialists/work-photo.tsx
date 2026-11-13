"use client";

import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { portfolioPhotos } from "@/lib/journey";

/** A portfolio photo. The API serves it only with the session cookie, so it is fetched as a blob. */
export default function WorkPhoto({ photoId, alt }: { photoId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let made: string | null = null;
    let live = true;
    setUrl(null); setFailed(false);
    portfolioPhotos.objectUrl(photoId).then((next) => { made = next; if (live) setUrl(next); else URL.revokeObjectURL(next); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [photoId]);
  const frame = { width: "100%", aspectRatio: "4 / 3", borderRadius: 12, background: "#f1efe9", display: "block", objectFit: "cover" as const };
  if (failed) return <span style={{ ...frame, display: "grid", placeItems: "center", color: "#6b6b6b", fontSize: 14 }}>{t("Фото не загрузилось")}</span>;
  if (!url) return <span style={frame} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element -- a blob URL, not something next/image can optimise
  return <img src={url} alt={alt} style={frame} />;
}
