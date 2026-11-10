import { Fragment, type ReactNode } from "react";

/** Inline **bold** only; everything is rendered as text, never as HTML. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>);
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());

/** Minimal Markdown for the legal documents: headings, paragraphs, bullet lists and tables. */
export function Markdown({ source, tableClassName }: { source: string; tableClassName?: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(level === 1 ? <h1 key={i}>{inline(heading[2])}</h1> : level === 2 ? <h2 key={i}>{inline(heading[2])}</h2> : <h3 key={i}>{inline(heading[2])}</h3>);
      i += 1;
      continue;
    }
    if (line.trim().startsWith("|") && lines[i + 1]?.trim().match(/^\|[\s:|-]+\|$/)) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(cells(lines[i])); i += 1; }
      blocks.push(<div key={i} style={{ overflowX: "auto" }}><table className={tableClassName}>
        <thead><tr>{head.map((cell, index) => <th key={index}>{inline(cell)}</th>)}</tr></thead>
        <tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} data-label={head[c]}>{inline(cell)}</td>)}</tr>)}</tbody>
      </table></div>);
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*-\s+/, "")); i += 1; }
      blocks.push(<ul key={i}>{items.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>);
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\s*-\s|\|)/.test(lines[i])) { paragraph.push(lines[i]); i += 1; }
    blocks.push(<p key={i}>{inline(paragraph.join(" "))}</p>);
  }
  return <>{blocks}</>;
}
