import { z } from "zod";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const optionalDateSchema = z.preprocess(
  (value) => (value == null ? "" : value),
  z.string().trim(),
);

export const notionPostMetadataSchema = z.object({
  pageId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  excerpt: z.string().trim().default(""),
  date: optionalDateSchema,
  published: z.boolean(),
  createdTime: z.string().trim().min(1),
  lastEditedTime: z.string().trim().min(1),
});

export const postSummarySchema = z.object({
  slug: z.string().regex(slugPattern),
  title: z.string().trim().min(1),
  excerpt: z.string().trim().default(""),
  date: optionalDateSchema,
  readTime: z.number().int().positive(),
});

export const postSchema = postSummarySchema.extend({
  content: z.string(),
});

export const postFrontmatterSchema = postSummarySchema.extend({
  published: z.literal(true),
  notionPageId: z.string().trim().min(1),
});

export const postsManifestSchema = z.array(postSummarySchema);

export type NotionPostMetadata = z.infer<typeof notionPostMetadataSchema>;
export type PostSummary = z.infer<typeof postSummarySchema>;
export type Post = z.infer<typeof postSchema>;
export type PostFrontmatter = z.infer<typeof postFrontmatterSchema>;
export type PostsManifest = z.infer<typeof postsManifestSchema>;

export function normalizeSlug(input: string): string {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function estimateReadTime(markdown: string): number {
  const words = String(markdown)
    .replace(/[`*_>#-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.ceil(words / 200));
}

export function markdownToPlainText(markdown: string): string {
  return String(markdown)
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/[`*_>#~-]/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createExcerpt(markdown: string, maxLength = 220): string {
  const plainText = markdownToPlainText(markdown);

  if (plainText.length <= maxLength) {
    return plainText;
  }

  return `${plainText.slice(0, maxLength).trimEnd()}...`;
}

function postTimestamp(post: { date?: string; createdTime?: string; lastEditedTime?: string }): number {
  const timestamp = new Date(post.date || post.createdTime || post.lastEditedTime || "").getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortPostsByDateDesc<T extends { date?: string; createdTime?: string; lastEditedTime?: string; title?: string }>(
  posts: T[],
): T[] {
  return [...posts].sort((left, right) => {
    const dateComparison = postTimestamp(right) - postTimestamp(left);

    if (dateComparison !== 0) {
      return dateComparison;
    }

    return String(left.title ?? "").localeCompare(String(right.title ?? ""));
  });
}
