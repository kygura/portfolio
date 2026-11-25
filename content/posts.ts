import { z } from "zod";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const notionPostMetadataSchema = z.object({
  pageId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  excerpt: z.string().trim().default(""),
  published: z.boolean(),
  createdTime: z.string().trim().min(1),
  lastEditedTime: z.string().trim().min(1),
});

export const postSummarySchema = z.object({
  slug: z.string().regex(slugPattern),
  title: z.string().trim().min(1),
  excerpt: z.string().trim().default(""),
  readTime: z.number().int().positive(),
  /** Position in the current clustering: "II.3" (cluster II, third essay). */
  mark: z.string().default(""),
  /** Id of the cluster the essay sits in. */
  cluster: z.string().default(""),
  /** Topics the essay shares with others; two essays with a common topic are linked. */
  topics: z.array(z.string()).default([]),
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

