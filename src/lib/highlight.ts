import type { CSSProperties } from "react";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism-light";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";

/**
 * The full `Prism` export bundles every language refractor ships with —
 * ~780kB on the post route. Registering the grammars posts actually use
 * keeps highlighting while cutting the chunk by an order of magnitude.
 */
const LANGUAGES = {
  bash, css, diff, go, javascript, json, jsx, markdown, markup,
  python, rust, sql, tsx, typescript, yaml,
};
for (const [name, grammar] of Object.entries(LANGUAGES)) {
  SyntaxHighlighter.registerLanguage(name, grammar);
}
// Common aliases so a fence tagged `js`/`ts`/`sh`/`html` still highlights.
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("shell", bash);
SyntaxHighlighter.registerLanguage("html", markup);
SyntaxHighlighter.registerLanguage("xml", markup);
SyntaxHighlighter.registerLanguage("yml", yaml);

/**
 * Prism theme drawn from the site tokens: comments recede to ink-3, keywords
 * take the accent, literals sit at ink-2. CSS variables keep it in step with
 * the accent switch.
 */
const base = { color: "var(--ink)", background: "none", fontFamily: "var(--f-mono)" };
export const tokenTheme: Record<string, CSSProperties> = {
  'code[class*="language-"]': base,
  'pre[class*="language-"]': base,
  comment: { color: "var(--ink-3)", fontStyle: "italic" },
  prolog: { color: "var(--ink-3)" },
  doctype: { color: "var(--ink-3)" },
  cdata: { color: "var(--ink-3)" },
  punctuation: { color: "var(--ink-2)" },
  keyword: { color: "var(--accent)" },
  atrule: { color: "var(--accent)" },
  important: { color: "var(--accent)" },
  builtin: { color: "var(--accent)" },
  "class-name": { color: "var(--ink)", fontStyle: "italic" },
  function: { color: "var(--ink)" },
  tag: { color: "var(--accent)" },
  selector: { color: "var(--accent)" },
  "attr-name": { color: "var(--ink-2)" },
  property: { color: "var(--ink-2)" },
  string: { color: "var(--ink-2)" },
  char: { color: "var(--ink-2)" },
  "attr-value": { color: "var(--ink-2)" },
  regex: { color: "var(--ink-2)" },
  number: { color: "var(--ink-2)" },
  boolean: { color: "var(--ink-2)" },
  constant: { color: "var(--ink-2)" },
  variable: { color: "var(--ink)" },
  operator: { color: "var(--ink-2)" },
  inserted: { color: "var(--accent)" },
  deleted: { color: "var(--danger)" },
  bold: { fontWeight: 600 },
  italic: { fontStyle: "italic" },
};

/** Prism grammar name for a file path, or "text" when none is registered. */
export function languageForPath(path: string): string {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (name === "dockerfile" || name === "makefile") return "bash";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  const byExt: Record<string, string> = {
    ts: "typescript", mts: "typescript", cts: "typescript", tsx: "tsx",
    js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
    py: "python", rs: "rust", go: "go", sql: "sql", css: "css", scss: "css",
    json: "json", yml: "yaml", yaml: "yaml", md: "markdown", mdx: "markdown",
    html: "markup", xml: "markup", svg: "markup", sh: "bash", bash: "bash", zsh: "bash", diff: "diff",
  };
  return byExt[ext] ?? "text";
}

export { SyntaxHighlighter };
