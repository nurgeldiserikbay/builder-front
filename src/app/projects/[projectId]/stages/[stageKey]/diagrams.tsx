"use client";

// Diagrams drawn from stage data: the process by roles (swimlanes), the data diagram and a scenario step by step.
// Plain SVG with HTML labels, sized for a phone; wide diagrams scroll sideways.
import { t } from "@/lib/i18n";
import styles from "../../../journey.module.css";

export type ActorKind = "client" | "business" | "staff" | "system" | "external";
export type ProcessActor = { key: string; name: string; kind: ActorKind };
export type ProcessStep = { key: string; actor: string; action: string; capability: string };
export type ProcessScenario = { key: string; title: string; goal: string; steps: ProcessStep[] };
export type DataLink = { to: string; kind: "one" | "many"; label: string };
export type DataEntity = { key: string; name: string; plain?: string; fields: Array<string | { name: string; type: string }>; links: DataLink[] };
export type Sequence = { title: string; participants: string[]; messages: Array<{ from: number; to: number; text: string }> };

export const kindColors: Record<ActorKind, { fill: string; stroke: string; text: string }> = {
  client: { fill: "#e8f2ec", stroke: "#255b42", text: "#173b2a" },
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
export function SwimlaneDiagram({ actors, scenario, highlight }: { actors: ProcessActor[]; scenario: ProcessScenario; highlight?: Record<string, "built" | "manual" | "not_built"> }) {
  const lane = 112; const head = 40; const row = 62; const box = { width: 100, height: 48 };
  const width = Math.max(1, actors.length) * lane;
  const height = head + Math.max(1, scenario.steps.length) * row + 10;
  const index = new Map(actors.map((actor, i) => [actor.key, i]));
  const center = (step: ProcessStep, i: number) => ({ x: (index.get(step.actor) ?? 0) * lane + lane / 2, y: head + i * row + 8 + box.height / 2 });
  const mark = { built: "#255b42", manual: "#8a8f8a", not_built: "#b3261e" };
  return (
    <Scroll label={t("Схема сценария «{0}» по ролям", [scenario.title])}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", minWidth: width }}>
        <defs>{arrowMarker("lane-arrow", "#4b5550")}</defs>
        {actors.map((actor, i) => {
          const colors = kindColors[actor.kind];
          return (
            <g key={actor.key}>
              <rect x={i * lane + 2} y={0} width={lane - 4} height={height} rx={10} fill={i % 2 ? "#fafbfa" : "#f3f5f3"} />
              <Box x={i * lane + 6} y={4} width={lane - 12} height={30} fill={colors.fill} stroke={colors.stroke} color={colors.text} bold>{actor.name}</Box>
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
export function DataDiagram({ entities }: { entities: DataEntity[] }) {
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
              <rect x={x} y={y} width={cardWidth} height={heights[i]} rx={10} fill="#fff" stroke="#2d6da3" strokeWidth={1.3} />
              <rect x={x} y={y} width={cardWidth} height={28} rx={10} fill="#e6f0fa" />
              <text x={x + 10} y={y + 19} fontSize={12.5} fontWeight={800} fill="#173a5a">{entity.name}</text>
              {entity.fields.map((item, k) => {
                const label = typeof item === "string" ? item : `${item.name}: ${item.type}`;
                return <text key={k} x={x + 10} y={y + 46 + k * 16} fontSize={11} fill="#3a423d">{label.length > 40 ? `${label.slice(0, 39)}…` : label}</text>;
              })}
              {outgoing.length ? <line x1={x + 10} y1={fieldsBottom + 2} x2={x + cardWidth - 10} y2={fieldsBottom + 2} stroke="#e1e6e2" /> : null}
              {outgoing.map((link, k) => {
                const text = `→ ${names[link.to]} · ${link.kind === "many" ? t("много") : t("один")}${link.label ? ` (${link.label})` : ""}`;
                return <text key={k} x={x + 10} y={fieldsBottom + 18 + k * 16} fontSize={11} fill="#255b42">{text.length > 40 ? `${text.slice(0, 39)}…` : text}</text>;
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
        <defs>{arrowMarker("seq-arrow", "#255b42")}</defs>
        {sequence.participants.map((name, i) => (
          <g key={name}>
            <line x1={x(i)} y1={head} x2={x(i)} y2={height - 4} stroke="#c9cfca" strokeDasharray="3 3" />
            <Box x={i * column + 4} y={4} width={column - 8} height={32} fill="#e8f2ec" stroke="#255b42" color="#173b2a" bold>{name}</Box>
          </g>
        ))}
        {layout.map(({ from, to, self, left, labelWidth, text, labelHeight }, i) => {
          const y = rows[i];
          return (
            <g key={i}>
              {self
                ? <path d={`M${from},${y - 6} h22 v12 h-20`} fill="none" stroke="#255b42" strokeWidth={1.3} markerEnd="url(#seq-arrow)" />
                : <line x1={from} y1={y} x2={to + (to > from ? -3 : 3)} y2={y} stroke="#255b42" strokeWidth={1.3} markerEnd="url(#seq-arrow)" />}
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
