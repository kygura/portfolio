import assert from "node:assert/strict";
import test from "node:test";
import { renderRichText } from "./richtext.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rt(items: unknown[]): unknown[] {
  return items as unknown[];
}

function textItem(
  plain_text: string,
  annotations: Partial<{
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color: string;
  }> = {},
  href: string | null = null,
): unknown {
  return {
    type: "text",
    plain_text,
    href,
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

function equationItem(expression: string): unknown {
  return {
    type: "equation",
    plain_text: expression,
    href: null,
    annotations: {},
    equation: { expression },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("empty array returns empty string", () => {
  assert.equal(renderRichText(rt([])), "");
});

test("plain text passes through unchanged", () => {
  const result = renderRichText(rt([textItem("Hello world")]));
  assert.equal(result, "Hello world");
});

test("bold wraps with **", () => {
  const result = renderRichText(rt([textItem("bold text", { bold: true })]));
  assert.equal(result, "**bold text**");
});

test("bold + italic: italic wraps bold result with _", () => {
  const result = renderRichText(
    rt([textItem("both", { bold: true, italic: true })]),
  );
  assert.equal(result, "_**both**_");
});

test("code annotation wraps in backticks, no bold/italic applied", () => {
  const result = renderRichText(
    rt([textItem("snippet", { code: true, bold: true, italic: true })]),
  );
  assert.equal(result, "`snippet`");
});

test("link wrapping [text](url)", () => {
  const result = renderRichText(
    rt([
      {
        type: "text",
        plain_text: "click here",
        href: "https://example.com",
        annotations: {},
      },
    ]),
  );
  assert.equal(result, "[click here](https://example.com)");
});

test("bold + italic + link combined", () => {
  const item = {
    type: "text",
    plain_text: "docs",
    href: "https://docs.example.com",
    annotations: { bold: true, italic: true },
  };
  const result = renderRichText(rt([item]));
  assert.equal(result, "[_**docs**_](https://docs.example.com)");
});

test("equation renders as `$expression$`", () => {
  const result = renderRichText(rt([equationItem("E=mc^2")]));
  assert.equal(result, "`$E=mc^2$`");
});

test("strikethrough wraps outermost", () => {
  const result = renderRichText(
    rt([textItem("old", { bold: true, strikethrough: true })]),
  );
  assert.equal(result, "~~**old**~~");
});

test("multiple items are joined without separator", () => {
  const result = renderRichText(
    rt([textItem("Hello "), textItem("world", { bold: true })]),
  );
  assert.equal(result, "Hello **world**");
});

test("missing plain_text defaults to empty string", () => {
  const result = renderRichText(
    rt([{ type: "text", annotations: {}, href: null }]),
  );
  assert.equal(result, "");
});

test("null/undefined items are handled defensively", () => {
  // Should not throw
  assert.doesNotThrow(() => renderRichText(rt([null, undefined])));
});
