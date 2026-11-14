"use client";

// Diagrams drawn from stage data: the process by roles (swimlanes), the data diagram and a scenario step by step.
// Plain SVG with HTML labels, sized for a phone; wide diagrams scroll sideways.
import { useState } from "react";
import { t } from "@/lib/i18n";
import styles from "../../../journey.module.css";

export type ActorKind = "client" | "business" | "staff" | "system" | "external";
export type ProcessActor = { key: string; name: string; kind: ActorKind };
export type ProcessStep = { key: string; actor: string; action: string; capability: string };
export type ProcessScenario = { key: string; title: string; goal: string; steps: ProcessStep[] };
export type DataLink = { to: string; kind: "one" | "many"; label: string };
export type DataEntity = { key: string; name: string; plain?: string; fields: Array<string | { name: string; type: string }>; links: DataLink[] };
export type Sequence = { title: string; participants: string[]; messages: Array<{ from: number; to: number; text: string }> };

/** Colours of a place the quality review has a finding about. */
export const FLAG = { fill: "#fdecea", stroke: "#b3261e", text: "#7a1a14" };

export const kindColors: Record<ActorKind, { fill: string; stroke: string; text: string }> = {
  client: { fill: "#e3f3ea", stroke: "#13804f", text: "#173b2a" },
  business: { fill: "#fdf1dd", stroke: "#a86a12", text: "#5c3a07" },
  staff: { fill: "#ece9fb", stroke: "#5b4bb7", text: "#2f2470" },
  system: { fill: "#e6f0fa", stroke: "#2d6da3", text: "#173a5a" },
  external: { fill: "#f1f1f1", stroke: "#6b6b6b", text: "#333" },
};

function Scroll({ children, label }: { children: React.ReactNode; label: string }) {
  return <div role="img" aria-label={label} style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", margin: "8px -4px 4px", padding: "0 4px" }}>{children}</div>;
}

function Box({ x, y, width, height, fill, stroke, color, children, bold }: { x: number; y: number; width: number; height: number; fill: string; stroke: string; color: string; children: React.ReactNode; bold?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={8} fill={fill} stroke={stroke} strokeWidth={1.2} />
      <foreignObject x={x + 4} y={y + 2} width={width - 8} height={height - 4}>
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 11.5, lineHeight: 1.25, color, fontWeight: bold ? 800 : 500, overflow: "hidden", wordBreak: "break-word" }}>{children}</div>
      </foreignObject>
    </g>
  );
}

const arrowMarker = (id: string, color: string) => (
  <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={color} /></marker>
);

/** One lane per participant; steps go top to bottom in order, each in the lane of whoever does it. */
export function SwimlaneDiagram({ actors, scenario, highlight, flagged }: { actors: ProcessActor[]; scenario: ProcessScenario; highlight?: Record<string, "built" | "manual" | "not_built">; flagged?: Set<string> }) {
  const lane = 112; const head = 40; const row = 62; const box = { width: 100, height: 48 };
  const width = Math.max(1, actors.length) * lane;
  const height = head + Math.max(1, scenario.steps.length) * row + 10;
  const index = new Map(actors.map((actor, i) => [actor.key, i]));
  const center = (step: ProcessStep, i: number) => ({ x: (index.get(step.actor) ?? 0) * lane + lane / 2, y: head + i * row + 8 + box.height / 2 });
  const mark = { built: "#13804f", manual: "#8a8f8a", not_built: "#b3261e" };
  return (
    <Scroll label={t("Схема сценария «{0}» по ролям", [scenario.title])}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", minWidth: width }}>
        <defs>{arrowMarker("lane-arrow", "#4b5550")}</defs>
        {actors.map((actor, i) => {
          const colors = kindColors[actor.kind];
          return (
            <g key={actor.key}>
              <rect x={i * lane + 2} y={0} width={lane - 4} height={height} rx={10} fill={i % 2 ? "#fafbfa" : "#f3f5f3"} />
              <Box x={i * lane + 6} y={4} width={lane - 12} height={30} fill={flagged?.has(actor.key) ? FLAG.fill : colors.fill} stroke={flagged?.has(actor.key) ? FLAG.stroke : colors.stroke} color={flagged?.has(actor.key) ? FLAG.text : colors.text} bold>{flagged?.has(actor.key) ? `! ${actor.name}` : actor.name}</Box>
            </g>
          );
        })}
        {scenario.steps.slice(1).map((step, i) => {
          const from = center(scenario.steps[i]!, i); const to = center(step, i + 1);
          const startY = from.y + box.height / 2; const endY = to.y - box.height / 2 - 2;
          const path = from.x === to.x ? `M${from.x},${startY} L${to.x},${endY}` : `M${from.x},${startY} C${from.x},${startY + 14} ${to.x},${endY - 14} ${to.x},${endY}`;
          return <path key={step.key} d={path} fill="none" stroke="#4b5550" strokeWidth={1.3} markerEnd="url(#lane-arrow)" />;
        })}
        {scenario.steps.map((step, i) => {
          const actor = actors.find((item) => item.key === step.actor);
          const colors = kindColors[actor?.kind ?? "external"];
          const c = center(step, i); const status = highlight?.[step.key];
          return (
            <g key={step.key}>
              <Box x={c.x - box.width / 2} y={c.y - box.height / 2} width={box.width} height={box.height} fill="#fff" stroke={status ? mark[status] : colors.stroke} color="#1c241f">
                <span>{i + 1}. {step.action}</span>
              </Box>
              {status && <circle cx={c.x + box.width / 2 - 4} cy={c.y - box.height / 2 + 4} r={6} fill={mark[status]} />}
            </g>
          );
        })}
      </svg>
    </Scroll>
  );
}

/** Entities as cards with their fields; lines show how they are linked («many» ends with a fork). */
export function DataDiagram({ entities, flagged }: { entities: DataEntity[]; flagged?: Set<string> }) {
  if (!entities.length) return null;
  // One column of cards (readable on a phone). Links run as arcs in the left gutter,
  // each in its own track, and are also listed in words inside the card.
  const index = new Map(entities.map((entity, i) => [entity.key, i]));
  const links = entities.flatMap((entity, i) => entity.links
    .map((link) => ({ from: i, to: index.get(link.to), kind: link.kind, label: link.label }))
    .filter((link): link is { from: number; to: number; kind: "one" | "many"; label: string } => link.to !== undefined && link.to !== link.from));
  const tracks = Math.min(links.length, 6);
  const gutter = 14 + tracks * 9;
  const cardWidth = 250; const gapY = 18;
  const heights = entities.map((entity) => {
    const outgoing = links.filter((link) => link.from === index.get(entity.key)).length;
    return 34 + Math.max(1, entity.fields.length) * 16 + (outgoing ? 8 + outgoing * 16 : 0) + 8;
  });
  const tops: number[] = []; let cursor = 4;
  for (const h of heights) { tops.push(cursor); cursor += h + gapY; }
  const width = gutter + cardWidth + 8; const height = cursor - gapY + 4;
  const anchor = (i: number) => tops[i]! + 14;
  const names = entities.map((entity) => entity.name);
  return (
    <Scroll label={t("Схема данных")}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", minWidth: width }}>
        <defs>{arrowMarker("data-arrow", "#7a827d")}</defs>
        {links.map((link, k) => {
          const trackX = gutter - 10 - (k % Math.max(1, tracks)) * 9;
          const y1 = anchor(link.from) + 4 + (k % 3) * 3; const y2 = anchor(link.to) - 4 + (k % 3) * 3;
          return (
            <path key={k} d={`M${gutter},${y1} H${trackX} V${y2} H${gutter - 2}`} fill="none" stroke="#7a827d" strokeWidth={1.3}
              strokeDasharray={link.kind === "many" ? undefined : "4 3"} markerEnd="url(#data-arrow)" />
          );
        })}
        {entities.map((entity, i) => {
          const x = gutter; const y = tops[i]!;
          const outgoing = links.filter((link) => link.from === i);
          const fieldsBottom = y + 34 + Math.max(1, entity.fields.length) * 16;
          return (
            <g key={entity.key}>
              <rect x={x} y={y} width={cardWidth} height={heights[i]} rx={10} fill="#fff" stroke={flagged?.has(entity.key) ? FLAG.stroke : "#2d6da3"} strokeWidth={flagged?.has(entity.key) ? 2.2 : 1.3} />
              <rect x={x} y={y} width={cardWidth} height={28} rx={10} fill={flagged?.has(entity.key) ? FLAG.fill : "#e6f0fa"} />
              <text x={x + 10} y={y + 19} fontSize={12.5} fontWeight={800} fill={flagged?.has(entity.key) ? FLAG.text : "#173a5a"}>{flagged?.has(entity.key) ? `! ${entity.name}` : entity.name}</text>
              {entity.fields.map((item, k) => {
                const label = typeof item === "string" ? item : `${item.name}: ${item.type}`;
                return <text key={k} x={x + 10} y={y + 46 + k * 16} fontSize={11} fill="#3a423d">{label.length > 40 ? `${label.slice(0, 39)}…` : label}</text>;
              })}
              {outgoing.length ? <line x1={x + 10} y1={fieldsBottom + 2} x2={x + cardWidth - 10} y2={fieldsBottom + 2} stroke="#e1e6e2" /> : null}
              {outgoing.map((link, k) => {
                const text = `→ ${names[link.to]} · ${link.kind === "many" ? t("много") : t("один")}${link.label ? ` (${link.label})` : ""}`;
                return <text key={k} x={x + 10} y={fieldsBottom + 18 + k * 16} fontSize={11} fill="#13804f">{text.length > 40 ? `${text.slice(0, 39)}…` : text}</text>;
              })}
            </g>
          );
        })}
      </svg>
    </Scroll>
  );
}

/** Participants across the top with lifelines; each message is an arrow in order. */
export function SequenceDiagram({ sequence }: { sequence: Sequence }) {
  const column = 96; const head = 40;
  const x = (i: number) => i * column + column / 2;
  // Each message gets a row tall enough for its whole label, so nothing is cut off.
  const layout = sequence.messages.map((message, i) => {
    const from = x(message.from); const to = x(message.to);
    const self = message.from === message.to;
    const left = Math.min(from, to); const span = Math.max(Math.abs(to - from), column);
    const labelWidth = self ? column + 20 : span - 4;
    const text = `${i + 1}. ${message.text}`;
    const perLine = Math.max(8, Math.floor(labelWidth / 5.9));
    const lines = Math.ceil(text.length / perLine) + (text.length > perLine ? 1 : 0);
    const labelHeight = Math.min(lines, 6) * 13 + 2;
    return { message, from, to, self, left, labelWidth, text, labelHeight };
  });
  const rows: number[] = [];
  let cursor = head + 8;
  for (const item of layout) { cursor += item.labelHeight + 4; rows.push(cursor); cursor += 14; }
  const width = sequence.participants.length * column + (layout.some((item) => item.self) ? column / 2 + 28 : 0);
  const height = cursor + 12;
  return (
    <Scroll label={t("Сценарий «{0}» по шагам", [sequence.title])}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", minWidth: width }}>
        <defs>{arrowMarker("seq-arrow", "#13804f")}</defs>
        {sequence.participants.map((name, i) => (
          <g key={name}>
            <line x1={x(i)} y1={head} x2={x(i)} y2={height - 4} stroke="#c9cfca" strokeDasharray="3 3" />
            <Box x={i * column + 4} y={4} width={column - 8} height={32} fill="#e3f3ea" stroke="#13804f" color="#173b2a" bold>{name}</Box>
          </g>
        ))}
        {layout.map(({ from, to, self, left, labelWidth, text, labelHeight }, i) => {
          const y = rows[i];
          return (
            <g key={i}>
              {self
                ? <path d={`M${from},${y - 6} h22 v12 h-20`} fill="none" stroke="#13804f" strokeWidth={1.3} markerEnd="url(#seq-arrow)" />
                : <line x1={from} y1={y} x2={to + (to > from ? -3 : 3)} y2={y} stroke="#13804f" strokeWidth={1.3} markerEnd="url(#seq-arrow)" />}
              <foreignObject x={self ? from + 4 : left + 2} y={y - labelHeight - 4} width={labelWidth} height={labelHeight}>
                <div style={{ fontSize: 10.5, lineHeight: "13px", color: "#1c241f", textAlign: self ? "left" : "center", display: "flex", alignItems: "flex-end", justifyContent: self ? "flex-start" : "center", height: "100%" }}><span>{text}</span></div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </Scroll>
  );
}

export function KindLegend() {
  const labels: Record<ActorKind, string> = { client: t("Клиент"), business: t("Бизнес"), staff: t("Сотрудник"), system: t("Сайт или система"), external: t("Внешний сервис") };
  return (
    <div className={styles.small} style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "4px 0" }}>
      {(Object.keys(labels) as ActorKind[]).map((kind) => (
        <span key={kind} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: kindColors[kind].fill, border: `1px solid ${kindColors[kind].stroke}` }} />{labels[kind]}
        </span>
      ))}
    </div>
  );
}

type FlowScreen = { key: string; title: string; role: string; links: string[] };

/**
 * Screens of each role as a map: the role's first screen on top, then the screens one click away, and so on. Only links
 * that lead deeper are drawn; links back are counted in the box. Screens that cannot be reached and links to another
 * role's screens are marked red — the same things the quality review reports.
 */
export function ScreenFlowDiagram({ screens, roles }: { screens: FlowScreen[]; roles: Array<{ key: string; name: string }> }) {
  const byKey = new Map(screens.map((screen) => [screen.key, screen]));
  const roleKeys = [...roles.map((role) => role.key), ...new Set(screens.map((screen) => screen.role).filter((key) => !roles.some((role) => role.key === key)))];
  const box = { width: 124, height: 50 }; const gapX = 14; const gapY = 36; const pad = 6;
  return (
    <>
      {roleKeys.map((roleKey) => {
        const own = screens.filter((screen) => screen.role === roleKey);
        if (!own.length) return null;
        const roleName = roles.find((role) => role.key === roleKey)?.name ?? roleKey;
        // Breadth-first from the role's first screen: the level is the number of clicks.
        const level = new Map<string, number>([[own[0]!.key, 0]]);
        const parent = new Map<string, string>();
        const queue = [own[0]!.key];
        while (queue.length) {
          const current = queue.shift()!;
          for (const next of byKey.get(current)?.links ?? []) {
            const target = byKey.get(next);
            if (target && target.role === roleKey && !level.has(next)) { level.set(next, level.get(current)! + 1); parent.set(next, current); queue.push(next); }
          }
        }
        const rows: FlowScreen[][] = [];
        for (const screen of own) if (level.has(screen.key)) (rows[level.get(screen.key)!] ??= []).push(screen);
        const lost = own.filter((screen) => !level.has(screen.key));
        if (lost.length) rows.push(lost);
        const widest = Math.max(...rows.map((row) => row.length));
        const width = pad * 2 + widest * box.width + (widest - 1) * gapX;
        const lostTop = lost.length ? 18 : 0;
        const height = pad * 2 + rows.length * box.height + (rows.length - 1) * gapY + lostTop;
        const position = new Map<string, { x: number; y: number }>();
        rows.forEach((row, r) => {
          const rowWidth = row.length * box.width + (row.length - 1) * gapX;
          const left = (width - rowWidth) / 2;
          const y = pad + r * (box.height + gapY) + (lost.length && r === rows.length - 1 ? lostTop : 0);
          row.forEach((screen, c) => position.set(screen.key, { x: left + c * (box.width + gapX), y }));
        });
        return (
          <div key={roleKey} style={{ marginBottom: 12 }}>
            <p className={styles.label} style={{ margin: "8px 0 0" }}>{roleName}</p>
            <Scroll label={t("Схема переходов между экранами роли «{0}»", [roleName])}>
              <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", minWidth: width }}>
                <defs>{arrowMarker(`flow-${roleKey}`, "#4b5550")}</defs>
                {[...parent].map(([child, from]) => {
                  const a = position.get(from)!; const b = position.get(child)!;
                  const x1 = a.x + box.width / 2; const y1 = a.y + box.height; const x2 = b.x + box.width / 2; const y2 = b.y - 2;
                  const mid = (y1 + y2) / 2;
                  return <path key={child} d={`M${x1},${y1} V${mid} H${x2} V${y2}`} fill="none" stroke="#4b5550" strokeWidth={1.2} markerEnd={`url(#flow-${roleKey})`} />;
                })}
                {lost.length > 0 && <text x={pad} y={position.get(lost[0]!.key)!.y - 6} fontSize={11} fill="#b3261e" fontWeight={700}>{t("Сюда нельзя попасть")}</text>}
                {own.map((screen) => {
                  const at = position.get(screen.key)!;
                  const unreachable = !level.has(screen.key);
                  const foreign = screen.links.some((link) => byKey.get(link) && byKey.get(link)!.role !== roleKey);
                  const broken = screen.links.some((link) => !byKey.has(link));
                  const back = screen.links.filter((link) => byKey.get(link)?.role === roleKey && parent.get(link) !== screen.key).length;
                  const danger = unreachable || foreign || broken;
                  const notes = [back ? t("↩ ещё {0}", [back]) : "", foreign ? t("→ чужая роль") : "", broken ? t("→ нет экрана") : ""].filter(Boolean).join(" · ");
                  return (
                    <g key={screen.key}>
                      <rect x={at.x} y={at.y} width={box.width} height={box.height} rx={8} fill={danger ? "#fdecea" : level.get(screen.key) === 0 ? "#e3f3ea" : "#fff"}
                        stroke={danger ? "#b3261e" : "#13804f"} strokeWidth={1.2} strokeDasharray={unreachable ? "4 3" : undefined} />
                      <foreignObject x={at.x + 4} y={at.y + 2} width={box.width - 8} height={box.height - 4}>
                        <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", lineHeight: 1.2, overflow: "hidden" }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#1c241f", wordBreak: "break-word" }}>{screen.title}</span>
                          {notes && <span style={{ fontSize: 10, color: danger ? "#b3261e" : "#5b635e" }}>{notes}</span>}
                        </div>
                      </foreignObject>
                    </g>
                  );
                })}
              </svg>
            </Scroll>
          </div>
        );
      })}
    </>
  );
}

type MapFeature = { key: string; title: string; roles: string[]; priority: "must" | "should" | "later" };

/** Who does what: features down, roles across, the priority of each feature. A role without a tick anywhere does nothing. */
export function FeatureRoleMap({ roles, features }: { roles: Array<{ key: string; name: string }>; features: MapFeature[] }) {
  if (!roles.length || !features.length) return null;
  const priority = { must: { text: t("обязательно"), color: "#13804f" }, should: { text: t("желательно"), color: "#2d6da3" }, later: { text: t("позже"), color: "#8a8f8a" } };
  const cell: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #e1e6e2", fontSize: 13, verticalAlign: "top" };
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", margin: "8px 0" }}>
      <table style={{ borderCollapse: "collapse", minWidth: 120 + roles.length * 84 }} aria-label={t("Карта функций по ролям")}>
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: "left", position: "sticky", left: 0, background: "var(--surface, #fff)" }}>{t("Функция")}</th>
            {roles.map((role) => {
              const idle = !features.some((feature) => feature.roles.includes(role.key));
              return <th key={role.key} style={{ ...cell, textAlign: "center", color: idle ? "#b3261e" : undefined }} title={idle ? t("У роли нет функций") : undefined}>{role.name}{idle ? " !" : ""}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {features.map((feature) => (
            <tr key={feature.key}>
              <td style={{ ...cell, position: "sticky", left: 0, background: "var(--surface, #fff)", maxWidth: 180 }}>
                <span style={{ display: "block", fontWeight: 600 }}>{feature.title}</span>
                <span style={{ fontSize: 11.5, color: priority[feature.priority].color }}>{priority[feature.priority].text}</span>
              </td>
              {roles.map((role) => <td key={role.key} style={{ ...cell, textAlign: "center", color: "#13804f", fontWeight: 800 }} aria-label={feature.roles.includes(role.key) ? t("да") : t("нет")}>{feature.roles.includes(role.key) ? "✓" : ""}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The parts of the system: the person who uses it → what they see → the server, and below, in one group, everything the
 * server works with (data, sign-in, notifications, integrations). With two parts or fewer it is a simple chain.
 */
export function ArchitectureDiagram({ who, components }: { who: string; components: Array<{ title: string; plain: string }> }) {
  if (!components.length) return null;
  const width = 300; const boxH = 58; const gap = 26; const small = { w: 132, h: 54, gapX: 12, gapY: 10 };
  const chain = [{ title: who, plain: "" }, ...components.slice(0, 2)];
  const rest = components.slice(2);
  const chainBottom = 4 + chain.length * boxH + (chain.length - 1) * gap;
  const rows = Math.ceil(rest.length / 2);
  const groupTop = chainBottom + gap; const groupHead = 22;
  const groupHeight = rest.length ? groupHead + rows * small.h + (rows - 1) * small.gapY + 12 : 0;
  const height = (rest.length ? groupTop + groupHeight : chainBottom) + 6;
  const label = (title: string, plain: string, size: number) => (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center", lineHeight: 1.25, overflow: "hidden" }}>
      <span style={{ fontSize: size, fontWeight: 800 }}>{title}</span>
      {plain && <span style={{ fontSize: 10.5 }}>{plain.length > 80 ? `${plain.slice(0, 79)}…` : plain}</span>}
    </div>
  );
  return (
    <Scroll label={t("Схема архитектуры")}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", minWidth: width, margin: "0 auto" }}>
        <defs>{arrowMarker("arch-arrow", "#2d6da3")}</defs>
        {chain.map((item, i) => {
          const y = 4 + i * (boxH + gap);
          const colors = i === 0 ? kindColors.client : kindColors.system;
          return (
            <g key={i}>
              {i > 0 && <line x1={width / 2} y1={y - gap + 2} x2={width / 2} y2={y - 3} stroke="#2d6da3" strokeWidth={1.3} markerEnd="url(#arch-arrow)" />}
              <rect x={4} y={y} width={width - 8} height={boxH} rx={10} fill={colors.fill} stroke={colors.stroke} strokeWidth={1.2} />
              <foreignObject x={10} y={y + 3} width={width - 20} height={boxH - 6}><div style={{ height: "100%", color: colors.text }}>{label(item.title, item.plain, 12.5)}</div></foreignObject>
            </g>
          );
        })}
        {rest.length > 0 && (
          <g>
            <line x1={width / 2} y1={chainBottom + 2} x2={width / 2} y2={groupTop - 3} stroke="#2d6da3" strokeWidth={1.3} markerEnd="url(#arch-arrow)" />
            <rect x={4} y={groupTop} width={width - 8} height={groupHeight} rx={12} fill="none" stroke="#2d6da3" strokeDasharray="5 4" />
            <text x={14} y={groupTop + 15} fontSize={11} fill="#173a5a" fontWeight={700}>{t("С чем работает сервер")}</text>
            {rest.map((item, i) => {
              const x = 4 + 10 + (i % 2) * (small.w + small.gapX);
              const y = groupTop + groupHead + Math.floor(i / 2) * (small.h + small.gapY);
              return (
                <g key={i}>
                  <rect x={x} y={y} width={small.w} height={small.h} rx={8} fill={kindColors.system.fill} stroke={kindColors.system.stroke} strokeWidth={1} />
                  <foreignObject x={x + 4} y={y + 2} width={small.w - 8} height={small.h - 4}><div style={{ height: "100%", color: kindColors.system.text }}>{label(item.title, "", 11.5)}</div></foreignObject>
                </g>
              );
            })}
          </g>
        )}
      </svg>
    </Scroll>
  );
}

type ModuleFeature = { key: string; title: string; roles: string[]; data?: string[] };

/**
 * The module map: roles → features → data. Tapping a role, a feature or a record keeps only its connections bright.
 * A feature with no data and a record no feature uses are red — the latter is also a finding of the quality review.
 */
export function ModuleMap({ roles, features, data }: { roles: Array<{ key: string; name: string }>; features: ModuleFeature[]; data: Array<{ key: string; name: string }> }) {
  const [focus, setFocus] = useState<string | null>(null);
  const col = { w: 98, gap: 24 }; const boxH = 40; const rowGap = 10;
  const xs = [4, 4 + col.w + col.gap, 4 + 2 * (col.w + col.gap)];
  const width = xs[2]! + col.w + 4;
  const rows = Math.max(roles.length, features.length, data.length);
  const height = 24 + rows * (boxH + rowGap);
  const place = (count: number, i: number) => 24 + ((rows - count) * (boxH + rowGap)) / 2 + i * (boxH + rowGap);
  const at = new Map<string, { x: number; y: number }>();
  roles.forEach((role, i) => at.set(`r:${role.key}`, { x: xs[0]!, y: place(roles.length, i) }));
  features.forEach((feature, i) => at.set(`f:${feature.key}`, { x: xs[1]!, y: place(features.length, i) }));
  data.forEach((item, i) => at.set(`d:${item.key}`, { x: xs[2]!, y: place(data.length, i) }));
  const edges = [
    ...features.flatMap((feature) => feature.roles.filter((role) => at.has(`r:${role}`)).map((role) => ({ a: `r:${role}`, b: `f:${feature.key}` }))),
    ...features.flatMap((feature) => (feature.data ?? []).filter((key) => at.has(`d:${key}`)).map((key) => ({ a: `f:${feature.key}`, b: `d:${key}` }))),
  ];
  // What stays bright: the focused node, its direct edges, and through a feature the roles and data on both sides.
  const lit = new Set<string>();
  if (focus) {
    lit.add(focus);
    for (const edge of edges) if (edge.a === focus || edge.b === focus) { lit.add(edge.a); lit.add(edge.b); }
    if (!focus.startsWith("f:")) for (const node of [...lit]) if (node.startsWith("f:")) for (const edge of edges) if (edge.a === node || edge.b === node) { lit.add(edge.a); lit.add(edge.b); }
  }
  const on = (node: string) => !focus || lit.has(node);
  const usedData = new Set(features.flatMap((feature) => feature.data ?? []));
  const node = (id: string, label: string, kind: "role" | "feature" | "data", danger: boolean) => {
    const p = at.get(id)!;
    const colors = danger ? { fill: "#fdecea", stroke: "#b3261e", text: "#7a1a14" } : kind === "role" ? kindColors.client : kind === "feature" ? kindColors.business : kindColors.system;
    return (
      <g key={id} onClick={() => setFocus(focus === id ? null : id)} style={{ cursor: "pointer", opacity: on(id) ? 1 : 0.25 }} role="button" tabIndex={0}
        aria-label={t("Подсветить связи: {0}", [label])} aria-pressed={focus === id} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setFocus(focus === id ? null : id); } }}>
        <rect x={p.x} y={p.y} width={col.w} height={boxH} rx={8} fill={colors.fill} stroke={colors.stroke} strokeWidth={focus === id ? 2.2 : 1.1} />
        <foreignObject x={p.x + 3} y={p.y + 2} width={col.w - 6} height={boxH - 4}>
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 10.5, lineHeight: 1.15, color: colors.text, fontWeight: 700, overflow: "hidden", wordBreak: "break-word" }}>{label}</div>
        </foreignObject>
      </g>
    );
  };
  return (
    <Scroll label={t("Карта модулей: роли, функции и данные")}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", minWidth: width }}>
        {[t("Кто"), t("Что делает"), t("С какими данными")].map((title, i) => <text key={title} x={xs[i]! + col.w / 2} y={14} textAnchor="middle" fontSize={11} fontWeight={800} fill="#3a423d">{title}</text>)}
        {edges.map((edge) => {
          const a = at.get(edge.a)!; const b = at.get(edge.b)!;
          const x1 = a.x + col.w; const y1 = a.y + boxH / 2; const x2 = b.x; const y2 = b.y + boxH / 2; const mid = (x1 + x2) / 2;
          const bright = !focus || (lit.has(edge.a) && lit.has(edge.b));
          return <path key={`${edge.a}-${edge.b}`} d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`} fill="none" stroke={bright ? "#4b5550" : "#c9cfca"} strokeOpacity={bright ? 0.8 : 0.35} strokeWidth={bright && focus ? 1.6 : 1} />;
        })}
        {roles.map((role) => node(`r:${role.key}`, role.name || t("Без названия"), "role", false))}
        {features.map((feature) => node(`f:${feature.key}`, feature.title || t("Без названия"), "feature", !(feature.data ?? []).length))}
        {data.map((item) => node(`d:${item.key}`, item.name, "data", !usedData.has(item.key)))}
      </svg>
    </Scroll>
  );
}

export type ReviewFlag = { id: string; severity: "blocking" | "important" | "minor"; where: string; message: string; fix: string; advice: boolean };
export type ReviewFlags = Record<string, ReviewFlag[]>;

/** The review findings about one place of the result, under its diagram. */
export function FlagList({ flags, keys }: { flags: ReviewFlags | undefined; keys: string[] }) {
  const items = keys.flatMap((key) => flags?.[key] ?? []);
  if (!items.length) return null;
  const label = { blocking: t("Блокирует переход"), important: t("Важно"), minor: t("Мелочь") };
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 6 }} aria-label={t("Замечания проверки к этому месту")}>
      {items.map((item) => (
        <li key={item.id} style={{ borderLeft: `4px solid ${item.severity === "blocking" ? FLAG.stroke : item.severity === "important" ? "#a86a12" : "#8a8f8a"}`, paddingLeft: 8, fontSize: 14 }}>
          <span style={{ fontWeight: 700 }}>{item.where} · {label[item.severity]}{item.advice ? ` · ${t("совет ИИ")}` : ""}.</span> {item.message} <span style={{ color: "#5b635e" }}>{item.fix}</span>
        </li>
      ))}
    </ul>
  );
}

/** Ask the stage page to show a place of the result: editors that know the place switch to it, then it is scrolled into view. */
export function showReviewTarget(target: string) {
  window.dispatchEvent(new CustomEvent("buildpath:review-target", { detail: target }));
  window.setTimeout(() => document.getElementById(`review-target-${target}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
}

/** Places marked red on a diagram: those with a blocking or important finding (minor ones are only listed). */
export function flaggedPlaces(flags: ReviewFlags | undefined): Set<string> {
  return new Set(Object.entries(flags ?? {}).filter(([, items]) => items.some((item) => item.severity !== "minor")).map(([key]) => key));
}
