import assert from "node:assert/strict";
import test from "node:test";
import { renderBlocksToMarkdown } from "./render.ts";
import type { NotionBlock } from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function block(
  type: string,
  payload: Record<string, unknown>,
  children: NotionBlock[] = [],
): NotionBlock {
  return { id: "test-id", type, has_children: children.length > 0, children, [type]: payload } as unknown as NotionBlock;
}

function richText(text: string, annotations: Record<string, unknown> = {}): unknown {
  return {
    type: "text",
    plain_text: text,
    href: null,
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: "default",
      ...annotations,
    },
  };
}

// ---------------------------------------------------------------------------
// Paragraph
// ---------------------------------------------------------------------------

test("paragraph renders plain text", () => {
  const result = renderBlocksToMarkdown([
    block("paragraph", { rich_text: [richText("Hello paragraph")] }),
  ]);
  assert.equal(result, "Hello paragraph");
});

test("empty paragraph is skipped", () => {
  const result = renderBlocksToMarkdown([
    block("paragraph", { rich_text: [] }),
    block("paragraph", { rich_text: [richText("actual")] }),
  ]);
  assert.equal(result, "actual");
});

// ---------------------------------------------------------------------------
// Headings
// ---------------------------------------------------------------------------

test("heading_1 renders with # prefix", () => {
  const result = renderBlocksToMarkdown([
    block("heading_1", { rich_text: [richText("Big Title")] }),
  ]);
  assert.equal(result, "# Big Title");
});

test("heading_2 renders with ## prefix", () => {
  const result = renderBlocksToMarkdown([
    block("heading_2", { rich_text: [richText("Medium")] }),
  ]);
  assert.equal(result, "## Medium");
});

test("heading_3 renders with ### prefix", () => {
  const result = renderBlocksToMarkdown([
    block("heading_3", { rich_text: [richText("Small")] }),
  ]);
  assert.equal(result, "### Small");
});

// ---------------------------------------------------------------------------
// Bulleted list with nested child
// ---------------------------------------------------------------------------

test("bulleted list item with nested child has two-space indent", () => {
  const child = block("bulleted_list_item", { rich_text: [richText("child item")] });
  const parent = block(
    "bulleted_list_item",
    { rich_text: [richText("parent item")] },
    [child],
  );
  const result = renderBlocksToMarkdown([parent]);
  assert.ok(result.startsWith("- parent item"), `result: ${result}`);
  assert.ok(result.includes("  - child item"), `should have indented child, got: ${result}`);
});

// ---------------------------------------------------------------------------
// Numbered list
// ---------------------------------------------------------------------------

test("numbered list of 3 items produces 1. / 2. / 3.", () => {
  const items = [1, 2, 3].map((n) =>
    block("numbered_list_item", { rich_text: [richText(`item ${n}`)] }),
  );
  const result = renderBlocksToMarkdown(items);
  assert.ok(result.includes("1. item 1"), `missing 1.: ${result}`);
  assert.ok(result.includes("2. item 2"), `missing 2.: ${result}`);
  assert.ok(result.includes("3. item 3"), `missing 3.: ${result}`);
});

// ---------------------------------------------------------------------------
// To-do
// ---------------------------------------------------------------------------

test("to_do checked=true renders - [x]", () => {
  const result = renderBlocksToMarkdown([
    block("to_do", { rich_text: [richText("done")], checked: true }),
  ]);
  assert.equal(result, "- [x] done");
});

test("to_do checked=false renders - [ ]", () => {
  const result = renderBlocksToMarkdown([
    block("to_do", { rich_text: [richText("pending")], checked: false }),
  ]);
  assert.equal(result, "- [ ] pending");
});

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

test("quote prefixes lines with >", () => {
  const result = renderBlocksToMarkdown([
    block("quote", { rich_text: [richText("Wisdom here")] }),
  ]);
  assert.equal(result, "> Wisdom here");
});

// ---------------------------------------------------------------------------
// Callout
// ---------------------------------------------------------------------------

test("callout with ⚠️ emoji renders > [!WARNING]", () => {
  const result = renderBlocksToMarkdown([
    block("callout", {
      rich_text: [richText("Be careful")],
      icon: { type: "emoji", emoji: "⚠️" },
    }),
  ]);
  assert.ok(result.includes("> [!WARNING]"), `result: ${result}`);
  assert.ok(result.includes("> Be careful"), `result: ${result}`);
});

test("callout with 💡 emoji renders > [!TIP]", () => {
  const result = renderBlocksToMarkdown([
    block("callout", {
      rich_text: [richText("Pro tip")],
      icon: { type: "emoji", emoji: "💡" },
    }),
  ]);
  assert.ok(result.includes("> [!TIP]"), `result: ${result}`);
});

test("callout without recognized emoji defaults to NOTE", () => {
  const result = renderBlocksToMarkdown([
    block("callout", {
      rich_text: [richText("Just a note")],
      icon: { type: "emoji", emoji: "🤔" },
    }),
  ]);
  assert.ok(result.includes("> [!NOTE]"), `result: ${result}`);
});

// ---------------------------------------------------------------------------
// Code block
// ---------------------------------------------------------------------------

test("code block with language js renders fenced block", () => {
  const result = renderBlocksToMarkdown([
    block("code", {
      language: "javascript",
      rich_text: [{ type: "text", plain_text: "const x = 1;" }],
    }),
  ]);
  assert.ok(result.startsWith("```javascript"), `result: ${result}`);
  assert.ok(result.includes("const x = 1;"), `result: ${result}`);
  assert.ok(result.endsWith("```"), `result: ${result}`);
});

// ---------------------------------------------------------------------------
// Divider
// ---------------------------------------------------------------------------

test("divider renders as ---", () => {
  const result = renderBlocksToMarkdown([block("divider", {})]);
  assert.equal(result, "---");
});

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

test("image external renders ![caption](url)", () => {
  const result = renderBlocksToMarkdown([
    block("image", {
      type: "external",
      external: { url: "https://x/y.png" },
      caption: [richText("alt text")],
    }),
  ]);
  assert.equal(result, "![alt text](https://x/y.png)");
});

test("image with no caption renders with empty alt", () => {
  const result = renderBlocksToMarkdown([
    block("image", {
      type: "external",
      external: { url: "https://x/y.png" },
      caption: [],
    }),
  ]);
  assert.equal(result, "![](https://x/y.png)");
});

// ---------------------------------------------------------------------------
// Table (GFM)
// ---------------------------------------------------------------------------

test("2-column table renders header, separator with | --- |, and body row", () => {
  const headerRow = {
    id: "r1",
    type: "table_row",
    has_children: false,
    children: [],
    table_row: {
      cells: [
        [richText("Name")],
        [richText("Value")],
      ],
    },
  } as unknown as NotionBlock;

  const bodyRow = {
    id: "r2",
    type: "table_row",
    has_children: false,
    children: [],
    table_row: {
      cells: [
        [richText("Alpha")],
        [richText("1")],
      ],
    },
  } as unknown as NotionBlock;

  const tableBlock = {
    id: "t1",
    type: "table",
    has_children: true,
    children: [headerRow, bodyRow],
    table: { has_column_header: true, has_row_header: false },
  } as unknown as NotionBlock;

  const result = renderBlocksToMarkdown([tableBlock]);

  assert.ok(result.includes("| Name | Value |"), `missing header row: ${result}`);
  assert.ok(result.includes("| --- | --- |"), `missing separator: ${result}`);
  assert.ok(result.includes("| Alpha | 1 |"), `missing body row: ${result}`);
});

// ---------------------------------------------------------------------------
// Block grouping — list items joined by single newlines, not blank lines
// ---------------------------------------------------------------------------

test("consecutive bulleted items have no blank line between them", () => {
  const items = ["a", "b", "c"].map((t) =>
    block("bulleted_list_item", { rich_text: [richText(t)] }),
  );
  const result = renderBlocksToMarkdown(items);
  // Should be: "- a\n- b\n- c"  (no blank lines)
  assert.equal(result, "- a\n- b\n- c");
});

test("non-list blocks are separated by blank lines", () => {
  const result = renderBlocksToMarkdown([
    block("paragraph", { rich_text: [richText("First")] }),
    block("paragraph", { rich_text: [richText("Second")] }),
  ]);
  assert.equal(result, "First\n\nSecond");
});

// ---------------------------------------------------------------------------
// Defensive / edge cases
// ---------------------------------------------------------------------------

test("unknown block type with children renders children", () => {
  const child = block("paragraph", { rich_text: [richText("child content")] });
  const unknown = {
    id: "u1",
    type: "unsupported_type",
    has_children: true,
    children: [child],
    unsupported_type: {},
  } as unknown as NotionBlock;
  const result = renderBlocksToMarkdown([unknown]);
  assert.equal(result, "child content");
});

test("unknown block type without children is skipped", () => {
  const unknown = {
    id: "u2",
    type: "unsupported_type",
    has_children: false,
    children: [],
    unsupported_type: {},
  } as unknown as NotionBlock;
  const result = renderBlocksToMarkdown([unknown]);
  assert.equal(result, "");
});

test("a skipped block type is reported to onSkip", () => {
  const unknown = {
    id: "u3",
    type: "unsupported_type",
    has_children: false,
    children: [],
    unsupported_type: {},
  } as unknown as NotionBlock;
  const paragraph = block("paragraph", { rich_text: [richText("kept")] });
  const skipped: string[] = [];
  const result = renderBlocksToMarkdown([paragraph, unknown], (type) => skipped.push(type));
  assert.equal(result, "kept");
  assert.deepEqual(skipped, ["unsupported_type"]);
});

test("empty block array returns empty string", () => {
  assert.equal(renderBlocksToMarkdown([]), "");
});

test("equation block renders $$ fence", () => {
  const result = renderBlocksToMarkdown([
    block("equation", { expression: "E=mc^2" }),
  ]);
  assert.equal(result, "$$\nE=mc^2\n$$");
});

test("toggle renders details/summary HTML", () => {
  const child = block("paragraph", { rich_text: [richText("hidden content")] });
  const toggleBlock = block(
    "toggle",
    { rich_text: [richText("Show more")] },
    [child],
  );
  const result = renderBlocksToMarkdown([toggleBlock]);
  assert.ok(result.includes("<details>"), `result: ${result}`);
  assert.ok(result.includes("<summary>Show more</summary>"), `result: ${result}`);
  assert.ok(result.includes("hidden content"), `result: ${result}`);
  assert.ok(result.includes("</details>"), `result: ${result}`);
});
