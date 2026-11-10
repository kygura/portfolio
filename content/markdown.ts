/**
 * Shared, dependency-free markdown frontmatter (de)serialization used by the
 * Blob store (runtime), the build-time sync script, and the bundled local
 * fallback. The parser is defensive: malformed input yields `null`/empty rather
 * than throwing, which keeps the import-time fallback from crashing the app.
 */
import {
  createExcerpt,
  estimateReadTime,
  normalizeSlug,
  type PostSummary,
} from "./posts.ts";

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

export interface PostFrontmatterFields {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: number;
  published: boolean;
  notionPageId: string;
}

function parseScalar(raw: string): unknown {
  const value = raw.trim();
  if (!value) {
    return "";
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
  }

  if (value === "true") return true;
  if (value === "false") return false;

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }

  const numeric = Number(value);
  if (value !== "" && !Number.isNaN(numeric)) {
    return numeric;
  }

  return value;
}

/** Split raw markdown into parsed frontmatter fields and the body content. */
export function parseFrontmatter(raw: string): {
  data: Record<string, unknown>;
  content: string;
} {
  const match = String(raw).match(FRONTMATTER_RE);
  if (!match) {
    return { data: {}, content: String(raw) };
  }

  const [, frontmatter, body] = match;
  const data: Record<string, unknown> = {};

  for (const line of frontmatter.split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    if (!key) {
      continue;
    }
    data[key] = parseScalar(line.slice(separator + 1));
  }

  return { data, content: body };
}

/** Serialize frontmatter fields into a `---` delimited block. */
export function serializeFrontmatter(fields: PostFrontmatterFields): string {
  return [
    "---",
    `slug: ${JSON.stringify(fields.slug)}`,
    `title: ${JSON.stringify(fields.title)}`,
    `excerpt: ${JSON.stringify(fields.excerpt)}`,
    `date: ${JSON.stringify(fields.date)}`,
    `readTime: ${fields.readTime}`,
    `published: ${fields.published}`,
    `notionPageId: ${JSON.stringify(fields.notionPageId)}`,
    "---",
  ].join("\n");
}

/**
 * Build a post summary + content from a raw markdown file. Returns `null` for
 * input that cannot form a valid post (missing title or unusable slug).
 */
export function buildPostFromMarkdown(
  raw: string,
  fallbackSlug: string,
): { summary: PostSummary; content: string } | null {
  try {
    const { data, content } = parseFrontmatter(raw);

    const title = String(data.title ?? "").trim();
    if (!title) {
      return null;
    }

    const slug = normalizeSlug(String(data.slug ?? "") || fallbackSlug);
    if (!slug) {
      return null;
    }

    const date = String(data.date ?? "").trim();
    const body = content.trim();
    const excerpt = String(data.excerpt ?? "").trim() || createExcerpt(body);
    const readTimeRaw = Number(data.readTime);
    const readTime =
      Number.isFinite(readTimeRaw) && readTimeRaw > 0
        ? Math.floor(readTimeRaw)
        : estimateReadTime(body);

    return {
      summary: { slug, title, excerpt, date, readTime },
      content: body,
    };
  } catch {
    return null;
  }
}
