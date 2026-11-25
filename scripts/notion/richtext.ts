/**
 * Renders a Notion rich-text array to GitHub-Flavored Markdown.
 */

interface RichTextAnnotations {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
  color?: string;
}

interface RichTextItem {
  type?: string;
  plain_text?: string;
  href?: string | null;
  annotations?: RichTextAnnotations;
  equation?: { expression?: string };
  [key: string]: unknown;
}

/**
 * Convert a Notion rich-text array to a GFM markdown string.
 */
export function renderRichText(richText: unknown[]): string {
  if (!Array.isArray(richText) || richText.length === 0) return "";

  return richText
    .map((raw) => renderRichTextItem(raw as RichTextItem))
    .join("");
}

function renderRichTextItem(item: RichTextItem): string {
  if (!item || typeof item !== "object") return "";

  // Equation inline: `$expression$`
  if (item.type === "equation") {
    const expr = item.equation?.expression ?? "";
    return `\`$${expr}$\``;
  }

  // All other types (text, mention, …) use plain_text as base
  const base = item.plain_text ?? "";
  const a = item.annotations ?? {};

  let result: string;

  if (a.code) {
    // Code span — no bold/italic/strikethrough applied
    result = `\`${base}\``;
  } else {
    result = base;
    // Apply inner → outer: bold, italic, then strikethrough (outermost)
    if (a.bold) result = `**${result}**`;
    if (a.italic) result = `_${result}_`;
    if (a.strikethrough) result = `~~${result}~~`;
  }

  // Link wrapping
  const href = item.href;
  if (href && typeof href === "string" && href.length > 0) {
    result = `[${result}](${href})`;
  }

  return result;
}
