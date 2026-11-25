/**
 * Renders an array of Notion blocks to GitHub-Flavored Markdown.
 */

import type { NotionBlock } from "./types.ts";
import { renderRichText } from "./richtext.ts";

/**
 * Convert a fully-fetched Notion block tree to GFM markdown.
 */
export function renderBlocksToMarkdown(
  blocks: NotionBlock[],
  onSkip?: (type: string) => void,
): string {
  skipReporter = onSkip;
  try {
    return renderBlockList(blocks, 0).trim();
  } finally {
    skipReporter = undefined;
  }
}

/** Told about each block of an unhandled type that rendered nothing. */
let skipReporter: ((type: string) => void) | undefined;

// ---------------------------------------------------------------------------
// Internal rendering
// ---------------------------------------------------------------------------

/** Render a list of sibling blocks, handling list grouping and depth. */
function renderBlockList(blocks: NotionBlock[], depth: number): string {
  const parts: string[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];
    const btype = block.type;

    if (isListType(btype)) {
      // Collect the consecutive run of this same list type
      const runType = btype;
      const run: NotionBlock[] = [];
      const numberedCounter = 1;

      while (i < blocks.length && isListType(blocks[i].type)) {
        run.push(blocks[i]);
        i++;
      }

      // Render each item in the run, tracking numbered counters
      const runLines: string[] = [];
      let nCounter = 1;
      for (const item of run) {
        const rendered = renderSingleBlock(item, depth, nCounter);
        if (item.type === "numbered_list_item") nCounter++;
        if (rendered !== null) runLines.push(rendered);
        void numberedCounter;
      }

      if (runLines.length > 0) {
        parts.push(runLines.join("\n"));
      }
    } else {
      const rendered = renderSingleBlock(block, depth, 1);
      if (rendered !== null) parts.push(rendered);
      i++;
    }
  }

  return parts.join("\n\n");
}

function isListType(type: string): boolean {
  return (
    type === "bulleted_list_item" ||
    type === "numbered_list_item" ||
    type === "to_do"
  );
}

/**
 * Render a single block, returning null if the block should be skipped.
 * `nCounter` is the current 1-based counter for numbered lists.
 */
function renderSingleBlock(
  block: NotionBlock,
  depth: number,
  nCounter: number,
): string | null {
  const type = block.type;
  const payload = block[type] as Record<string, unknown> | undefined;

  // Helper: get rich_text from payload safely
  const rt = (p: Record<string, unknown> | undefined): unknown[] =>
    Array.isArray(p?.rich_text) ? (p!.rich_text as unknown[]) : [];

  const indent = "  ".repeat(depth);

  try {
    switch (type) {
      case "paragraph": {
        const text = renderRichText(rt(payload));
        if (!text || !text.trim()) return null;
        return indent + text;
      }

      case "heading_1": {
        const text = renderRichText(rt(payload));
        return `${indent}# ${text}`;
      }

      case "heading_2": {
        const text = renderRichText(rt(payload));
        return `${indent}## ${text}`;
      }

      case "heading_3": {
        const text = renderRichText(rt(payload));
        return `${indent}### ${text}`;
      }

      case "bulleted_list_item": {
        const text = renderRichText(rt(payload));
        let result = `${indent}- ${text}`;
        if (block.children && block.children.length > 0) {
          const childText = renderBlockList(block.children, depth + 1);
          if (childText) result += "\n" + childText;
        }
        return result;
      }

      case "numbered_list_item": {
        const text = renderRichText(rt(payload));
        let result = `${indent}${nCounter}. ${text}`;
        if (block.children && block.children.length > 0) {
          const childText = renderBlockList(block.children, depth + 1);
          if (childText) result += "\n" + childText;
        }
        return result;
      }

      case "to_do": {
        const checked = !!(payload?.checked);
        const checkmark = checked ? "[x]" : "[ ]";
        const text = renderRichText(rt(payload));
        return `${indent}- ${checkmark} ${text}`;
      }

      case "quote": {
        const text = renderRichText(rt(payload));
        let lines: string[] = text ? text.split("\n") : [];

        if (block.children && block.children.length > 0) {
          const childText = renderBlockList(block.children, 0);
          if (childText) lines = lines.concat(childText.split("\n"));
        }

        return lines.map((l) => `> ${l}`).join("\n");
      }

      case "callout": {
        const iconObj = payload?.icon as
          | { type?: string; emoji?: string }
          | undefined;
        let alertType = "NOTE";

        if (iconObj?.type === "emoji" && iconObj.emoji) {
          const emoji = iconObj.emoji;
          if (emoji === "💡" || emoji === "🔥") alertType = "TIP";
          else if (emoji === "⚠️") alertType = "WARNING";
          else if (emoji === "❗" || emoji === "‼️") alertType = "IMPORTANT";
          else if (emoji === "🛑" || emoji === "⛔") alertType = "CAUTION";
        }

        const text = renderRichText(rt(payload));
        let contentLines: string[] = text ? text.split("\n") : [];

        if (block.children && block.children.length > 0) {
          const childText = renderBlockList(block.children, 0);
          if (childText) contentLines = contentLines.concat(childText.split("\n"));
        }

        const header = `> [!${alertType}]`;
        const body = contentLines.map((l) => `> ${l}`).join("\n");
        return body ? `${header}\n${body}` : header;
      }

      case "code": {
        const language = (payload?.language as string) ?? "";
        const codeLines = Array.isArray(payload?.rich_text)
          ? (payload!.rich_text as Array<{ plain_text?: string }>)
              .map((item) => item.plain_text ?? "")
              .join("")
          : "";
        return `\`\`\`${language}\n${codeLines}\n\`\`\``;
      }

      case "divider": {
        return "---";
      }

      case "image": {
        const p = payload as
          | {
              type?: string;
              external?: { url?: string };
              file?: { url?: string };
              caption?: unknown[];
            }
          | undefined;
        const url =
          p?.type === "external"
            ? (p.external?.url ?? "")
            : (p?.file?.url ?? "");
        const caption = renderRichText(p?.caption ?? []);
        return `![${caption}](${url})`;
      }

      case "equation": {
        const expr = (payload?.expression as string) ?? "";
        return `$$\n${expr}\n$$`;
      }

      case "bookmark":
      case "embed":
      case "link_preview": {
        const p = payload as
          | { url?: string; caption?: unknown[] }
          | undefined;
        const url = (p?.url as string) ?? "";
        const captionText = renderRichText(p?.caption ?? []);
        const text = captionText || url;
        return `[${text}](${url})`;
      }

      case "video":
      case "file":
      case "pdf": {
        const p = payload as
          | {
              type?: string;
              external?: { url?: string };
              file?: { url?: string };
              caption?: unknown[];
            }
          | undefined;
        const url =
          p?.type === "external"
            ? (p.external?.url ?? "")
            : (p?.file?.url ?? "");
        const captionText = renderRichText(p?.caption ?? []);
        const lastSegment = url.split("/").filter(Boolean).pop() ?? url;
        const text = captionText || lastSegment;
        return `[${text}](${url})`;
      }

      case "table": {
        // Children are table_row blocks
        const rows = block.children ?? [];
        if (rows.length === 0) return null;

        const renderRow = (rowBlock: NotionBlock): string => {
          const rowPayload = rowBlock["table_row"] as
            | { cells?: unknown[][] }
            | undefined;
          const cells = rowPayload?.cells ?? [];
          const cellTexts = cells.map((cell) =>
            renderRichText(Array.isArray(cell) ? cell : []),
          );
          return "| " + cellTexts.join(" | ") + " |";
        };

        const headerRow = renderRow(rows[0]);
        const colCount = (
          (rows[0]["table_row"] as { cells?: unknown[][] } | undefined)?.cells
            ?.length ?? 1
        );
        const separator = "| " + Array(colCount).fill("---").join(" | ") + " |";
        const bodyRows = rows.slice(1).map(renderRow);

        return [headerRow, separator, ...bodyRows].join("\n");
      }

      case "table_row": {
        // Standalone table_row (not inside a table) — skip
        return null;
      }

      case "toggle": {
        const summaryText = renderRichText(rt(payload));
        const childText =
          block.children && block.children.length > 0
            ? renderBlockList(block.children, 0)
            : "";
        return `<details><summary>${summaryText}</summary>\n\n${childText}\n\n</details>`;
      }

      case "column_list":
      case "column":
      case "synced_block": {
        if (!block.children || block.children.length === 0) return null;
        return renderBlockList(block.children, depth);
      }

      case "child_page":
      case "child_database":
      default: {
        if (block.children && block.children.length > 0) {
          return renderBlockList(block.children, depth);
        }
        skipReporter?.(type);
        return null;
      }
    }
  } catch {
    // Be defensive — never throw on malformed blocks
    return null;
  }
}
