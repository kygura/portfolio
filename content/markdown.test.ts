import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPostFromMarkdown,
  parseFrontmatter,
  serializeFrontmatter,
} from "./markdown.ts";

test("serializeFrontmatter + parseFrontmatter round-trips fields", () => {
  const serialized = serializeFrontmatter({
    slug: "on-the-ego",
    title: "On the Ego",
    excerpt: "A short note",
    date: "2026-05-24",
    readTime: 3,
    published: true,
    notionPageId: "page-123",
  });
  const { data, content } = parseFrontmatter(`${serialized}\n\nBody text here.`);

  assert.equal(data.slug, "on-the-ego");
  assert.equal(data.title, "On the Ego");
  assert.equal(data.date, "2026-05-24");
  assert.equal(data.readTime, 3);
  assert.equal(data.published, true);
  assert.equal(data.notionPageId, "page-123");
  assert.match(content, /Body text here\./);
});

test("buildPostFromMarkdown derives a valid summary", () => {
  const raw = serializeFrontmatter({
    slug: "thaumazein",
    title: "Thaumazein",
    excerpt: "",
    date: "2026-05-22",
    readTime: 0,
    published: true,
    notionPageId: "page-456",
  });
  const result = buildPostFromMarkdown(
    `${raw}\n\nWonder is the beginning of philosophy.`,
    "fallback-slug",
  );

  assert.ok(result);
  assert.equal(result.summary.slug, "thaumazein");
  assert.equal(result.summary.title, "Thaumazein");
  assert.ok(result.summary.readTime >= 1, "readTime is estimated when missing");
  assert.ok(result.summary.excerpt.length > 0, "excerpt is derived from body");
  assert.equal(result.content, "Wonder is the beginning of philosophy.");
});

test("buildPostFromMarkdown returns null for content without a title", () => {
  assert.equal(buildPostFromMarkdown("no frontmatter here", "slug"), null);
  assert.equal(buildPostFromMarkdown("", "slug"), null);
});

test("parseFrontmatter never throws on malformed input", () => {
  assert.doesNotThrow(() => parseFrontmatter("---\nbroken: [unclosed\n---\nbody"));
  const { data } = parseFrontmatter("---\nbroken: [unclosed\n---\nbody");
  assert.equal(typeof data, "object");
});
