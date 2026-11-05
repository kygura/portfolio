/**
 * Extracts blog-post metadata from a Notion page object.
 */
import {
  notionPostMetadataSchema,
  normalizeSlug,
  type NotionPostMetadata,
} from "../../content/posts.ts";

type NotionProp = {
  type?: string;
  title?: unknown;
  rich_text?: unknown;
  checkbox?: unknown;
  date?: { start?: unknown } | null;
  multi_select?: unknown;
};

type NotionProps = Record<string, NotionProp | undefined>;

type NotionTextItem = { plain_text?: unknown; name?: unknown } | null | undefined;

type NotionPage = {
  id: string;
  created_time?: string;
  last_edited_time?: string;
  properties?: NotionProps;
  parent?: {
    type?: string;
    data_source_id?: string;
    database_id?: string;
  };
};

// ---------------------------------------------------------------------------
// Property helpers
// ---------------------------------------------------------------------------

function readTitleProperty(props: NotionProps, ...keys: string[]): string {
  for (const key of keys) {
    const prop = props[key];
    if (!prop || prop.type !== "title") continue;
    const items: NotionTextItem[] = Array.isArray(prop.title) ? prop.title : [];
    const text = items.map((t) => (typeof t?.plain_text === "string" ? t.plain_text : "")).join("");
    if (text.trim()) return text.trim();
  }
  return "";
}

function readRichTextProperty(props: NotionProps, ...keys: string[]): string {
  for (const key of keys) {
    const prop = props[key];
    if (!prop || prop.type !== "rich_text") continue;
    const items: NotionTextItem[] = Array.isArray(prop.rich_text) ? prop.rich_text : [];
    const text = items.map((t) => (typeof t?.plain_text === "string" ? t.plain_text : "")).join("");
    if (text.trim()) return text.trim();
  }
  return "";
}

function readCheckboxProperty(props: NotionProps, ...keys: string[]): boolean {
  for (const key of keys) {
    const prop = props[key];
    if (!prop || prop.type !== "checkbox") continue;
    return Boolean(prop.checkbox);
  }
  return false;
}

function readDateProperty(props: NotionProps, ...keys: string[]): string {
  for (const key of keys) {
    const prop = props[key];
    if (!prop || prop.type !== "date") continue;
    const start = prop.date?.start;
    if (typeof start === "string" && start.trim()) return start.trim();
  }
  return "";
}

function readMultiSelectProperty(props: NotionProps, ...keys: string[]): string[] {
  for (const key of keys) {
    const prop = props[key];
    if (!prop || prop.type !== "multi_select") continue;
    const items: NotionTextItem[] = Array.isArray(prop.multi_select) ? prop.multi_select : [];
    return items
      .map((item) => (typeof item?.name === "string" ? item.name.trim() : ""))
      .filter((name) => name.length > 0);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

export function extractPostMetadata(page: NotionPage): NotionPostMetadata {
  const props = page.properties ?? {};

  // title
  const rawTitle = readTitleProperty(props, "Title", "Name", "title") || page.id;

  // date
  const rawDate =
    readDateProperty(props, "Publication Date", "Date", "date") ||
    (page.created_time ?? "");

  // tags
  const tags = readMultiSelectProperty(props, "Keywords", "Tags", "tags");

  // published
  const published = readCheckboxProperty(props, "Published", "published");

  // slug
  const rawSlug = readRichTextProperty(props, "Slug", "slug");
  const slugBase = rawSlug || rawTitle;
  const slug = normalizeSlug(slugBase) || normalizeSlug(page.id);

  // excerpt
  const excerpt = readRichTextProperty(props, "Description", "description");

  // createdTime / lastEditedTime
  const createdTime =
    page.created_time?.trim() ||
    page.last_edited_time?.trim() ||
    new Date(0).toISOString();

  const lastEditedTime =
    page.last_edited_time?.trim() ||
    page.created_time?.trim() ||
    createdTime;

  return notionPostMetadataSchema.parse({
    pageId: page.id,
    title: rawTitle,
    slug,
    excerpt,
    date: rawDate,
    tags,
    published,
    createdTime,
    lastEditedTime,
  });
}

export function getPageDataSourceId(page: NotionPage): string | null {
  const parent = page.parent;
  if (!parent) return null;
  if (parent.type === "data_source_id") return parent.data_source_id ?? null;
  if (parent.type === "database_id") return parent.database_id ?? null;
  return null;
}

export type SlugConflict = { slug: string; kept: string; dropped: string };

/**
 * Collapses entries that share a slug, keeping the most recently edited one.
 * Two published pages with the same title would otherwise collide on
 * `content/writings/<slug>.md`; the newer edit is the one the author meant.
 * Ties go to the entry seen first. Input order is preserved for the survivors.
 */
export function dedupeBySlug<T extends { meta: NotionPostMetadata }>(
  entries: T[],
): { kept: T[]; conflicts: SlugConflict[] } {
  const winners = new Map<string, T>();
  const conflicts: SlugConflict[] = [];

  for (const entry of entries) {
    const current = winners.get(entry.meta.slug);
    if (!current) {
      winners.set(entry.meta.slug, entry);
      continue;
    }
    const newer =
      Date.parse(entry.meta.lastEditedTime) > Date.parse(current.meta.lastEditedTime);
    const [kept, dropped] = newer ? [entry, current] : [current, entry];
    winners.set(entry.meta.slug, kept);
    conflicts.push({ slug: entry.meta.slug, kept: kept.meta.pageId, dropped: dropped.meta.pageId });
  }

  const survivors = new Set(winners.values());
  return { kept: entries.filter((e) => survivors.has(e)), conflicts };
}
