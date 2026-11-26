// What changed between two versions of an application's contracts, implementation plan or test plan, by name — the
// list «Изменить через ИИ» shows before anything is saved. Same shapes the server stores (contracts.ts, roadmap.ts,
// testplan.ts).
import { t } from "@/lib/i18n";
import type { DesignDiff } from "./architecture-changes";

type Keyed = { key: string };
type Doc = Record<string, unknown>;
const items = <T extends Keyed>(doc: Doc | null | undefined, part: string) => ((doc?.[part] as T[] | undefined) ?? []);

function compare<T extends Keyed>(diff: DesignDiff, before: T[], after: T[], label: (item: T) => string) {
  const old = new Map(before.map((item) => [item.key, item]));
  const next = new Set(after.map((item) => item.key));
  for (const item of after) {
    const was = old.get(item.key);
    if (!was) diff.added.push(label(item));
    else if (JSON.stringify(was) !== JSON.stringify(item)) diff.changed.push(label(item));
  }
  for (const item of before) if (!next.has(item.key)) diff.removed.push(label(item));
}

export function contractsDiff(before: Doc | null, after: Doc): DesignDiff {
  const diff: DesignDiff = { added: [], changed: [], removed: [] };
  compare(diff, items<Keyed & { name: string }>(before, "modules"), items(after, "modules"), (item) => t("Модуль «{0}»", [item.name]));
  compare(diff, items<Keyed & { method: string; path: string }>(before, "operations"), items(after, "operations"), (item) => t("Операция {0} {1}", [item.method, item.path]));
  compare(diff, items<Keyed & { name: string }>(before, "events"), items(after, "events"), (item) => t("Событие «{0}»", [item.name]));
  compare(diff, items<Keyed & { service: string }>(before, "integrations"), items(after, "integrations"), (item) => t("Интеграция «{0}»", [item.service]));
  return diff;
}

type Task = Keyed & { title: string };
type PlanModule = Keyed & { name: string; tasks?: Task[] };
export function roadmapDiff(before: Doc | null, after: Doc): DesignDiff {
  const diff: DesignDiff = { added: [], changed: [], removed: [] };
  const modules = (doc: Doc | null) => items<PlanModule>(doc, "modules");
  // A module is «changed» by its own fields; its tasks are listed one by one.
  const bare = (doc: Doc | null) => modules(doc).map(({ tasks: _tasks, ...rest }) => rest as PlanModule);
  compare(diff, bare(before), bare(after), (item) => t("Модуль «{0}»", [item.name]));
  const tasks = (doc: Doc | null) => modules(doc).flatMap((module) => (module.tasks ?? []).map((task) => ({ ...task, key: `${module.key}/${task.key}`, module: module.name })));
  compare(diff, tasks(before), tasks(after), (item) => t("Задача «{0}» ({1})", [item.title, item.module]));
  compare(diff, items<Keyed & { text: string }>(before, "risks"), items(after, "risks"), (item) => t("Риск: {0}", [item.text]));
  if (before && before.hoursPerDay !== after.hoursPerDay) diff.changed.push(t("Часов работы в день: {0}", [String(after.hoursPerDay)]));
  if (before && before.notes !== after.notes) diff.changed.push(t("Заметки к плану"));
  return diff;
}

export function testplanDiff(before: Doc | null, after: Doc): DesignDiff {
  const diff: DesignDiff = { added: [], changed: [], removed: [] };
  compare(diff, items<Keyed & { title: string; source?: string }>(before, "cases"), items(after, "cases"), (item) => (item.source === "ai" ? t("Кейс «{0}» (от ИИ)", [item.title]) : t("Кейс «{0}»", [item.title])));
  const skipped = (doc: Doc | null) => items<{ class: string; why: string } & Keyed>(doc, "skipped").map((item) => ({ ...item, key: item.class }));
  compare(diff, skipped(before), skipped(after), (item) => t("Не проверяем «{0}»", [item.class]));
  if (before && before.notes !== after.notes) diff.changed.push(t("Заметки к плану проверки"));
  return diff;
}
