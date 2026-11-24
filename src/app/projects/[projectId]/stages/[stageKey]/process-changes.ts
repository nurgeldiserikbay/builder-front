// What changed between two versions of a business process (for «Изменить через ИИ»), and the one-tap fixes of the
// quality review. Both work on the same shape the server stores (process.ts).
import { t } from "@/lib/i18n";
import type { BusinessProcess } from "./process-editor";

export type AutoFix =
  | { kind: "remove_actor"; actor: string }
  | { kind: "remove_step"; scenario: string; step: string }
  | { kind: "remove_link"; entity: string; to: string }
  | { kind: "add_junction"; a: string; b: string; name: string };

/** Applies a fix the review offered. The server checks the result again when it is saved. */
export function applyFix(process: BusinessProcess, fix: AutoFix): BusinessProcess {
  if (fix.kind === "remove_actor") {
    return { ...process, actors: process.actors.filter((actor) => actor.key !== fix.actor) };
  }
  if (fix.kind === "remove_step") {
    return { ...process, scenarios: process.scenarios.map((scenario) => (scenario.key === fix.scenario ? { ...scenario, steps: scenario.steps.filter((step) => step.key !== fix.step) } : scenario)) };
  }
  if (fix.kind === "remove_link") {
    // Keep the first of the repeated links, drop the rest.
    return { ...process, data: process.data.map((entity) => {
      if (entity.key !== fix.entity) return entity;
      let kept = false;
      return { ...entity, links: entity.links.filter((link) => { if (link.to !== fix.to) return true; if (kept) return false; kept = true; return true; }) };
    }) };
  }
  // Many-to-many: a record in between. Each side has many of it; it has one of each side.
  const used = new Set(process.data.map((entity) => entity.key));
  let key = `${fix.a}_${fix.b}`.slice(0, 40); let n = 2;
  while (used.has(key)) key = `${fix.a}_${fix.b}_${n++}`.slice(0, 40);
  const a = process.data.find((entity) => entity.key === fix.a);
  const b = process.data.find((entity) => entity.key === fix.b);
  return {
    ...process,
    data: [
      ...process.data.map((entity) => (entity.key === fix.a || entity.key === fix.b
        ? { ...entity, links: [...entity.links.filter((link) => link.to !== (entity.key === fix.a ? fix.b : fix.a)), { to: key, kind: "many" as const, label: "" }] }
        : entity)),
      { key, name: fix.name, fields: [t("Количество"), t("Когда добавлено")], links: [
        { to: fix.a, kind: "one" as const, label: a?.name ?? "" },
        { to: fix.b, kind: "one" as const, label: b?.name ?? "" },
      ] },
    ],
  };
}

export type Change = "added" | "changed";
export type ProcessDiff = {
  /** Places drawn in colour on the proposed diagrams: actors, steps and data records by key. */
  marks: Record<string, Change>;
  /** Plain lines for the list under the diagrams. */
  added: string[]; changed: string[]; removed: string[];
  /** Scenarios to look at first: new ones or ones with changed steps. */
  scenarios: string[];
};

/** Equal by content: the database keeps object keys in its own order, so key order must not matter. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])]));
  return value;
}
const same = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

export function processDiff(before: BusinessProcess | null, after: BusinessProcess): ProcessDiff {
  const diff: ProcessDiff = { marks: {}, added: [], changed: [], removed: [], scenarios: [] };
  const old = before ?? { actors: [], scenarios: [], rules: [], data: [] };
  for (const actor of after.actors) {
    const was = old.actors.find((item) => item.key === actor.key);
    if (!was) { diff.marks[actor.key] = "added"; diff.added.push(t("Участник «{0}»", [actor.name])); }
    else if (!same(was, actor)) { diff.marks[actor.key] = "changed"; diff.changed.push(t("Участник «{0}»", [actor.name])); }
  }
  for (const actor of old.actors) if (!after.actors.some((item) => item.key === actor.key)) diff.removed.push(t("Участник «{0}»", [actor.name]));
  for (const scenario of after.scenarios) {
    const was = old.scenarios.find((item) => item.key === scenario.key);
    if (!was) { diff.added.push(t("Сценарий «{0}»", [scenario.title])); diff.scenarios.push(scenario.key); scenario.steps.forEach((step) => { diff.marks[step.key] = "added"; }); continue; }
    let touched = false;
    for (const step of scenario.steps) {
      const prior = was.steps.find((item) => item.key === step.key);
      if (!prior) { diff.marks[step.key] = "added"; diff.added.push(t("Шаг «{0}» в «{1}»", [step.action, scenario.title])); touched = true; }
      else if (!same(prior, step)) { diff.marks[step.key] = "changed"; diff.changed.push(t("Шаг «{0}» в «{1}»", [step.action, scenario.title])); touched = true; }
    }
    for (const step of was.steps) if (!scenario.steps.some((item) => item.key === step.key)) { diff.removed.push(t("Шаг «{0}» в «{1}»", [step.action, scenario.title])); touched = true; }
    if (!same(was.steps.map((step) => step.key), scenario.steps.map((step) => step.key)) && !touched) { diff.changed.push(t("Порядок шагов в «{0}»", [scenario.title])); touched = true; }
    if (was.title !== scenario.title || was.goal !== scenario.goal) { diff.changed.push(t("Сценарий «{0}»", [scenario.title])); touched = true; }
    if (touched) diff.scenarios.push(scenario.key);
  }
  for (const scenario of old.scenarios) if (!after.scenarios.some((item) => item.key === scenario.key)) diff.removed.push(t("Сценарий «{0}»", [scenario.title]));
  for (const entity of after.data) {
    const was = old.data.find((item) => item.key === entity.key);
    if (!was) { diff.marks[entity.key] = "added"; diff.added.push(t("Данные «{0}»", [entity.name])); }
    else if (!same(was, entity)) { diff.marks[entity.key] = "changed"; diff.changed.push(t("Данные «{0}»", [entity.name])); }
  }
  for (const entity of old.data) if (!after.data.some((item) => item.key === entity.key)) diff.removed.push(t("Данные «{0}»", [entity.name]));
  for (const rule of after.rules) if (!old.rules.includes(rule)) diff.added.push(t("Правило: {0}", [rule]));
  for (const rule of old.rules) if (!after.rules.includes(rule)) diff.removed.push(t("Правило: {0}", [rule]));
  return diff;
}
