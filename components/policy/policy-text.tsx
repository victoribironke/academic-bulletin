import { Fragment, type ReactNode } from "react";
import type { Block, Inline } from "@/lib/policy/markdown";

/** Wraps each match of `highlight` (case ignored) in <mark>. */
function marked(text: string, highlight: string | undefined): ReactNode {
  const needle = highlight?.trim().toLowerCase();
  if (!needle) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(needle);
  while (at >= 0) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-sm bg-amber-200 px-0.5 text-inherit dark:bg-amber-500/40">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

export function PolicyInline({ content, highlight }: { content: Inline[]; highlight?: string }) {
  return (
    <>
      {content.map((part, index) => {
        if (part.type === "text") return <Fragment key={index}>{marked(part.text, highlight)}</Fragment>;
        const children = <PolicyInline content={part.children} highlight={highlight} />;
        if (part.type === "strong") return <strong key={index} className="font-semibold text-foreground">{children}</strong>;
        if (part.type === "em") return <em key={index}>{children}</em>;
        if (part.href.startsWith("#")) {
          return (
            <a key={index} href={part.href} className="text-primary underline underline-offset-2">
              {children}
            </a>
          );
        }
        if (/^https?:\/\//.test(part.href)) {
          return (
            <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
              {children}
            </a>
          );
        }
        return <Fragment key={index}>{children}</Fragment>;
      })}
    </>
  );
}

export function PolicyBlocks({ blocks, highlight }: { blocks: Block[]; highlight?: string }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "paragraph") {
          return (
            <p key={index} className="leading-relaxed">
              <PolicyInline content={block.content} highlight={highlight} />
            </p>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote key={index} className="space-y-2 border-l-4 border-primary/30 pl-4 text-muted-foreground">
              <PolicyBlocks blocks={block.blocks} highlight={highlight} />
            </blockquote>
          );
        }
        if (block.type === "table") {
          return (
            <div key={index} className="overflow-x-auto rounded-md border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {block.header.map((cell, cellIndex) => (
                      <th key={cellIndex} scope="col" className="px-3 py-2 font-medium text-foreground">
                        <PolicyInline content={cell} highlight={highlight} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t align-top">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-3 py-2">
                          <PolicyInline content={cell} highlight={highlight} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const ListTag = block.ordered ? "ol" : "ul";
        return (
          <ListTag
            key={index}
            start={block.ordered && block.start !== 1 ? block.start : undefined}
            className={`space-y-1.5 pl-6 ${block.ordered ? "list-decimal" : "list-disc"}`}
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="space-y-1.5 pl-1 leading-relaxed">
                {item.content.length > 0 && <PolicyInline content={item.content} highlight={highlight} />}
                {item.children.length > 0 && (
                  <div className="space-y-1.5 pt-1.5 [&_ol]:list-[lower-alpha] [&_ol_ol]:list-[lower-roman]">
                    <PolicyBlocks blocks={item.children} highlight={highlight} />
                  </div>
                )}
              </li>
            ))}
          </ListTag>
        );
      })}
    </>
  );
}
