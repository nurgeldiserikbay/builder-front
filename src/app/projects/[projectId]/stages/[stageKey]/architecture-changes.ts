// What changed between two architecture designs (for «Изменить через ИИ»), and the one-tap fixes of the quality review.
// Both work on the design the server stores (builder-back src/journey/architecture.ts).
import { t } from "@/lib/i18n";
import type { ArchitectureDesign, DesignComponent, DesignThreat, SchemaEntity, SchemaRelation } from "./architecture-editor";

/** «Исправить»: what the platform's first design has for this finding, to add to one part of the design. */
export type ArchFix = { kind: "arch_add"; part: "entities" | "components" | "threats"; items: Array<SchemaEntity | DesignComponent | DesignThreat>; relations?: SchemaRelation[] };

function fresh(key: string, used: Set<string>): string {
  let next = key; let n = 2;
  while (used.has(next)) next = `${key}_${n++}`.slice(0, 32);
  used.add(next);
  return next;
}

/** Adds the items not yet in the design (by key, and for components by kind and name). The server checks the result on save. */
export function applyArchFix(design: ArchitectureDesign, fix: ArchFix): ArchitectureDesign {
  if (fix.part === "entities") {
    const used = new Set(design.schema.entities.map((entity) => entity.key));
    const added = (fix.items as SchemaEntity[]).filter((entity) => !used.has(entity.key));
    const keys = new Set([...used, ...added.map((entity) => entity.key)]);
    const relationKeys = new Set(design.schema.relations.map((relation) => relation.key));
    const pairs = new Set(design.schema.relations.map((relation) => `${relation.from}:${relation.to}`));
    const relations = (fix.relations ?? []).filter((relation) => keys.has(relation.from) && keys.has(relation.to) && !pairs.has(`${relation.from}:${relation.to}`))
      .map((relation) => ({ ...relation, key: fresh(relation.key, relationKeys) }));
    return { ...design, schema: { entities: [...design.schema.entities, ...added], relations: [...design.schema.relations, ...relations] } };
  }
  if (fix.part === "components") {
    const used = new Set(design.components.map((item) => item.key));
    const have = new Set(design.components.map((item) => `${item.kind}:${item.name.toLowerCase()}`));
    const added = (fix.items as DesignComponent[]).filter((item) => !have.has(`${item.kind}:${item.name.toLowerCase()}`)).map((item) => ({ ...item, key: fresh(item.key, used) }));
    return { ...design, components: [...design.components, ...added] };
  }
  const used = new Set(design.threats.map((item) => item.key));
  const have = new Set(design.threats.map((item) => item.how));
  const added = (fix.items as DesignThreat[]).filter((item) => !have.has(item.how)).map((item) => ({ ...item, key: fresh(item.key, used) }));
  return { ...design, threats: [...design.threats, ...added] };
}

export interface DesignDiff { added: string[]; changed: string[]; removed: string[] }

/** Lines a person reads: what the proposal adds, changes and removes, by name. */
export function designDiff(before: ArchitectureDesign, after: ArchitectureDesign): DesignDiff {
  const diff: DesignDiff = { added: [], changed: [], removed: [] };
  const compare = <T extends { key: string }>(a: T[], b: T[], label: (item: T) => string) => {
    const old = new Map(a.map((item) => [item.key, item]));
    const next = new Map(b.map((item) => [item.key, item]));
    for (const item of b) {
      const was = old.get(item.key);
      if (!was) diff.added.push(label(item));
      else if (JSON.stringify(was) !== JSON.stringify(item)) diff.changed.push(label(item));
    }
    for (const item of a) if (!next.has(item.key)) diff.removed.push(label(item));
  };
  const entityName = (key: string, design: ArchitectureDesign) => design.schema.entities.find((entity) => entity.key === key)?.name ?? key;
  compare(before.schema.entities, after.schema.entities, (entity) => t("Запись «{0}»", [entity.name]));
  compare(before.schema.relations, after.schema.relations, (relation) => t("Связь «{0}» → «{1}»", [entityName(relation.from, after), entityName(relation.to, after)]));
  compare(before.components, after.components, (item) => t("Компонент «{0}»", [item.name]));
  compare(before.decisions, after.decisions, (item) => t("Решение «{0}»", [item.title]));
  compare(before.threats, after.threats, (item) => t("Угроза: {0}", [item.how]));
  compare(before.environments, after.environments, (item) => (item.key === "prod" ? t("Рабочее окружение") : t("Тестовое окружение")));
  return diff;
}
