import { z } from "zod";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const postTagSchema = z.string().trim().min(1);
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
  tags: z.array(postTagSchema).default([]),
  published: z.boolean(),
  createdTime: z.string().trim().min(1),
  lastEditedTime: z.string().trim().min(1),
});

/** Reading languages. English is the original; the rest are translations. */
export const LANGS = ["en", "es"] as const;
export type Lang = (typeof LANGS)[number];
export type TranslationLang = Exclude<Lang, "en">;
export const TRANSLATION_LANGS: TranslationLang[] = ["es"];

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

/**
 * A translation's own title, excerpt and length. `stale` is set when the
 * English original changed after the translation was last checked against it.
 */
export const postTranslationSchema = z.object({
  title: z.string().trim().min(1),
  excerpt: z.string().trim().default(""),
  readTime: z.number().int().positive(),
  stale: z.boolean().default(false),
});

export const postSummarySchema = z.object({
  slug: z.string().regex(slugPattern),
  title: z.string().trim().min(1),
  excerpt: z.string().trim().default(""),
  date: optionalDateSchema,
  tags: z.array(postTagSchema).default([]),
  readTime: z.number().int().positive(),
  translations: z.object({ es: postTranslationSchema.optional() }).optional(),
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
export type PostTranslation = z.infer<typeof postTranslationSchema>;
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
