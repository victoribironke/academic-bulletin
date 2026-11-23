/**
 * A small, safe reader for the Academic Policy's markdown (work order task
 * H9): headings, paragraphs, bold and italics, nested numbered and bulleted
 * lists, tables, quotes and in-page links. It produces plain data that the
 * page renders as React elements, never as raw HTML.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type ListItem = { content: Inline[]; children: Block[] };

export type Block =
  | { type: "paragraph"; content: Inline[] }
  | { type: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] }
  | { type: "quote"; blocks: Block[] };

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!|=>~<]/;

/** Inline markdown: **bold**, *italic*, ***both***, [text](href), \escapes. */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ type: "text", text });
    text = "";
  };
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === "\\" && i + 1 < source.length && ESCAPABLE.test(source[i + 1])) {
      text += source[i + 1];
      i += 2;
      continue;
    }
    if (char === "[") {
      const close = source.indexOf("](", i + 1);
      const end = close >= 0 ? source.indexOf(")", close + 2) : -1;
      if (close > i && end > close) {
        flush();
        out.push({ type: "link", href: source.slice(close + 2, end), children: parseInline(source.slice(i + 1, close)) });
        i = end + 1;
        continue;
      }
    }
    if (char === "*") {
      const run = source.slice(i).match(/^\*{1,3}/)![0];
      const end = source.indexOf(run, i + run.length);
      if (end > i + run.length) {
        flush();
        const inner = parseInline(source.slice(i + run.length, end));
        out.push(
          run.length === 3
            ? { type: "strong", children: [{ type: "em", children: inner }] }
            : run.length === 2
              ? { type: "strong", children: inner }
              : { type: "em", children: inner },
        );
        i = end + run.length;
        continue;
      }
      // An unmatched marker is ordinary text.
      text += run;
      i += run.length;
      continue;
    }
    text += char;
    i += 1;
  }
  flush();
  return out;
}

/** The words of inline content, without any markdown. */
export function inlineText(content: Inline[]): string {
  return content.map((part) => (part.type === "text" ? part.text : inlineText(part.children))).join("");
}

/** The words of blocks, for search. */
export function blocksText(blocks: Block[]): string {
  return blocks
    .map((block) => {
      if (block.type === "paragraph") return inlineText(block.content);
      if (block.type === "quote") return blocksText(block.blocks);
      if (block.type === "table") {
        return [block.header, ...block.rows].map((row) => row.map(inlineText).join(" ")).join("\n");
      }
      return block.items.map((item) => [inlineText(item.content), blocksText(item.children)].join("\n")).join("\n");
    })
    .join("\n");
}

const LIST_ITEM = /^( *)(?:(\d+)[.)]|[-*+])\s+(.*)$/;
const indentOf = (line: string) => line.match(/^ */)![0].length;
const isBlank = (line: string) => line.trim() === "";
// A line of "=" is left out; Word's "<!-- end list -->" ends a list.
const isNoise = (line: string) => /^\s*\\?=+\s*$/.test(line);
const isListEnd = (line: string) => /^\s*<!--.*-->\s*$/.test(line);

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] === "\\" && trimmed[i + 1] === "|") {
      cell += "|";
      i += 1;
    } else if (trimmed[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += trimmed[i];
    }
  }
  cells.push(cell.trim());
  return cells;
}

type FlatItem = { indent: number; ordered: boolean; number: number; lines: string[] };

/** Nests flat list items by their indent. */
function nestItems(items: FlatItem[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < items.length) {
    const base = items[i].indent;
    const list: Extract<Block, { type: "list" }> = {
      type: "list",
      ordered: items[i].ordered,
      start: items[i].number,
      items: [],
    };
    while (i < items.length && items[i].indent >= base && (items[i].indent > base || items[i].ordered === list.ordered)) {
      if (items[i].indent > base) {
        // Deeper items belong to the item before them.
        const children: FlatItem[] = [];
        while (i < items.length && items[i].indent > base) children.push(items[i++]);
        const parent = list.items[list.items.length - 1];
        if (parent) parent.children.push(...nestItems(children));
        else list.items.push({ content: [], children: nestItems(children) });
        continue;
      }
      list.items.push({ content: parseInline(items[i].lines.join(" ")), children: [] });
      i += 1;
    }
    blocks.push(list);
  }
  return blocks;
}

/** Block markdown, as used in the policy. */
export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r/g, "").split("\n").filter((line) => !isNoise(line));
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line) || isListEnd(line)) {
      i += 1;
      continue;
    }
    if (line.trimStart().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        const cells = splitRow(lines[i]);
        if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) rows.push(cells);
        i += 1;
      }
      const [header = [], ...body] = rows;
      blocks.push({
        type: "table",
        header: header.map(parseInline),
        rows: body.map((row) => row.map(parseInline)),
      });
      continue;
    }
    if (line.trimStart().startsWith(">")) {
      const quoted: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        quoted.push(lines[i].trimStart().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", blocks: parseBlocks(quoted.join("\n")) });
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const items: FlatItem[] = [];
      while (i < lines.length) {
        const current = lines[i];
        if (isListEnd(current)) {
          i += 1;
          break;
        }
        const match = current.match(LIST_ITEM);
        if (match) {
          items.push({ indent: match[1].length, ordered: Boolean(match[2]), number: Number(match[2] ?? 1), lines: [match[3]] });
          i += 1;
          continue;
        }
        if (isBlank(current)) {
          // A blank line ends the list unless an item or an indented line follows.
          let next = i + 1;
          while (next < lines.length && isBlank(lines[next])) next += 1;
          if (
            next < lines.length &&
            !isListEnd(lines[next]) &&
            (LIST_ITEM.test(lines[next]) || indentOf(lines[next]) > 0)
          ) {
            i = next;
            continue;
          }
          break;
        }
        if (indentOf(current) > 0 && items.length > 0) {
          items[items.length - 1].lines.push(current.trim());
          i += 1;
          continue;
        }
        break;
      }
      blocks.push(...nestItems(items));
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !isListEnd(lines[i]) &&
      !LIST_ITEM.test(lines[i]) &&
      !lines[i].trimStart().startsWith("|") &&
      !lines[i].trimStart().startsWith(">")
    ) {
      paragraph.push(lines[i].trim().replace(/^#{1,6}\s*/, ""));
      i += 1;
    }
    blocks.push({ type: "paragraph", content: parseInline(paragraph.join(" ")) });
  }
  return blocks;
}
