/**
 * Rich text (Regulations, Summary of Changes) is stored as HTML from the
 * editor. Anyone who can edit a bulletin could store other HTML by calling the
 * API, and the page would run it in a reviewer's browser. So:
 *
 * - sanitizeRichText keeps only the editor's formatting before anything is
 *   shown. It uses the browser's own HTML parser on an inert document, so no
 *   script, handler or image runs while it works, and copies across only the
 *   allowed tags and link addresses. Everything else is dropped.
 * - unsafeMarkupReason refuses such markup when it is saved, as a second line
 *   of defence. It needs no DOM, so it runs on the server.
 *
 * The Word and PDF exports strip all tags (cleanText), so they never carry it.
 */

/** Formatting the editor produces. Anything else is unwrapped to its text. */
const ALLOWED_TAGS = new Set([
  "p", "br", "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "strike", "sub", "sup", "code", "pre",
  "blockquote", "ul", "ol", "li", "hr", "a", "span",
  "table", "thead", "tbody", "tr", "th", "td",
]);

/** Dropped with everything inside them. */
const DROPPED_TAGS = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet",
  "svg", "math", "template", "noscript", "textarea", "select", "option", "button",
  "input", "form", "link", "meta", "base", "title", "head", "audio", "video",
  "source", "track", "canvas", "img", "picture", "portal", "slot",
]);

const SAFE_LINK = /^(https?:|mailto:)/i;

function copyClean(source: Node, target: Node, doc: Document): void {
  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === 3) {
      target.appendChild(doc.createTextNode(child.textContent ?? ""));
      continue;
    }
    if (child.nodeType !== 1) continue; // comments, processing instructions
    const element = child as Element;
    const tag = element.tagName.toLowerCase();
    if (DROPPED_TAGS.has(tag)) continue;
    if (!ALLOWED_TAGS.has(tag)) {
      copyClean(element, target, doc); // keep the words, lose the tag
      continue;
    }

    const clean = doc.createElement(tag);
    if (tag === "a") {
      const href = (element.getAttribute("href") ?? "").trim();
      if (SAFE_LINK.test(href)) {
        clean.setAttribute("href", href);
        clean.setAttribute("rel", "noopener noreferrer nofollow");
        clean.setAttribute("target", "_blank");
      }
    }
    if (tag === "ol") {
      const start = element.getAttribute("start");
      if (start && /^\d{1,4}$/.test(start)) clean.setAttribute("start", start);
    }
    if ((tag === "td" || tag === "th")) {
      for (const name of ["colspan", "rowspan"]) {
        const value = element.getAttribute(name);
        if (value && /^\d{1,2}$/.test(value)) clean.setAttribute(name, value);
      }
    }
    copyClean(element, clean, doc);
    target.appendChild(clean);
  }
}

/**
 * The HTML with only the editor's formatting left. Browser only: it needs
 * DOMParser. On the server, show the text instead (see SafeRichText).
 */
export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return "";
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const output = document.implementation.createHTMLDocument("");
  const container = output.createElement("div");
  copyClean(parsed.body, container, output);
  return container.innerHTML;
}

const UNSAFE_PATTERNS: Array<[RegExp, string]> = [
  [/<\s*(script|style|iframe|frame|object|embed|applet|svg|math|template|link|meta|base|form|input|button|textarea|select|portal)\b/i, "a script, style, frame, form or embedded object"],
  [/<[^>]*\son[a-z]+\s*=/i, "an event handler attribute"],
  [/<[^>]*\s(srcdoc|formaction|xlink:href)\s*=/i, "an attribute that loads other content"],
  [/(javascript|vbscript)\s*:/i, "a script address"],
  [/data\s*:\s*text\/html/i, "an embedded HTML address"],
];

/** Why this rich text can't be saved, or null when it can. */
export function unsafeMarkupReason(html: string | null | undefined): string | null {
  if (!html) return null;
  for (const [pattern, what] of UNSAFE_PATTERNS) {
    if (pattern.test(html)) return what;
  }
  return null;
}
