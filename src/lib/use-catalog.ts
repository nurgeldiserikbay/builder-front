"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CatalogType } from "@/lib/journey";

let request: Promise<CatalogType[]> | null = null;

/** Stage titles by project type, from the route catalog (loaded once per page). */
export function useStageTitles(): (projectType: string | null, stageKey: string | null) => string {
  const [types, setTypes] = useState<CatalogType[]>([]);
  useEffect(() => {
    request ??= api<{ projectTypes: CatalogType[] }>("/journey/catalog").then((catalog) => catalog.projectTypes).catch(() => { request = null; return []; });
    let alive = true;
    void request.then((value) => { if (alive) setTypes(value); });
    return () => { alive = false; };
  }, []);
  return (projectType, stageKey) => {
    if (!stageKey) return "";
    const own = types.find((type) => type.key === projectType)?.stages.find((stage) => stage.key === stageKey);
    return own?.title ?? types.flatMap((type) => type.stages).find((stage) => stage.key === stageKey)?.title ?? stageKey;
  };
}
