import { test } from "node:test";
import assert from "node:assert/strict";
import { cv } from "../../content/cv.ts";
import { escapeHtml, injectCvIntoShell, renderCvHtml, renderCvMarkdown } from "./render.ts";

const shell = `<!doctype html><html><head><title>Old</title>
<meta property="og:title" content="Old" />
<meta property="og:description" content="Old" />
</head><body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>`;

test("escapeHtml escapes markup characters", () => {
  assert.equal(escapeHtml(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
});

test("markdown carries every section and entry", () => {
  const md = renderCvMarkdown(cv, "https://www.nca.ink");
  for (const heading of ["## About", "## Technical Projects", "## Education", "## Technical Skills", "## Languages"]) {
    assert.ok(md.includes(heading), heading);
  }
  for (const project of cv.projects) assert.ok(md.includes(`### ${project.title}`));
  for (const edu of cv.education) assert.ok(md.includes(edu.institution));
  assert.ok(md.includes("<https://www.nca.ink/CV_NCA.pdf>"));
});

test("html escapes content", () => {
  const html = renderCvHtml(cv);
  assert.ok(html.includes("AI Integration &amp; LLM Tooling"));
  assert.ok(!html.includes("AI Integration & LLM"));
});

test("shell injection fills #root and rewrites the head", () => {
  const out = injectCvIntoShell(shell, cv, "https://www.nca.ink");
  assert.match(out, /<div id="root">\n<article id="cv-static"/);
  assert.match(out, /<title>Nicolás Cerrato Antón \| Curriculum Vitae<\/title>/);
  assert.ok(out.includes(`<link rel="alternate" type="text/markdown" href="https://www.nca.ink/cv.md"`));
  assert.ok(out.includes(`<script type="module" src="/assets/index.js">`));
  assert.ok(!out.includes('content="Old"'));
});

test("shell injection fails loudly without an empty root", () => {
  assert.throws(() => injectCvIntoShell("<html><head></head><body></body></html>", cv));
});
