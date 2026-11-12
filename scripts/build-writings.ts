/**
 * Build-time writings pipeline. Runs before `vite build`.
 *
 * 1. Sync (only when NOTION_SECRET is set and --offline is not passed):
 *    pull every published page from the Notion "Publications" data source,
 *    render it to markdown, copy its images next to the site, and write
 *    `content/writings/<slug>.md`. Any failure aborts the build, so a broken
 *    sync never replaces the live deployment.
 * 2. Emit (always): turn `content/writings/*.md` into
 *    - `content/writings/manifest.json`  post summaries bundled by the app
 *    - `public/writings.json`            the same list, for agents and feeds
 *    - `public/writings/<slug>.md`       raw markdown per post
 *    - `public/llms.txt`                 an index agents can start from
 *
 * Without NOTION_SECRET (local dev, forks) the committed snapshot in
 * `content/writings/` is used as-is.
 *
 * Usage: bun scripts/build-writings.ts [--offline]
 * Bun loads .env / .env.local on its own, so local runs pick up NOTION_SECRET.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { iteratePaginatedAPI, isFullPage } from "@notionhq/client";
import { buildPostFromMarkdown, parseFrontmatter, serializeFrontmatter } from "../content/markdown.ts";
import {
  createExcerpt,
  estimateReadTime,
  sortPostsByDateDesc,
  type PostSummary,
} from "../content/posts.ts";
import { getNotionClient, resolveDataSourceId } from "./notion/client.ts";
import { getOptionalNotionToken } from "./notion/env.ts";
import { fetchAllBlocks } from "./notion/blocks.ts";
import { renderBlocksToMarkdown } from "./notion/render.ts";
import { dedupeBySlug, extractPostMetadata } from "./notion/metadata.ts";
import { processPostImages, type ImageDeps } from "./notion/images.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = path.join(ROOT, "content", "writings");
const MANIFEST_PATH = path.join(CONTENT_DIR, "manifest.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const PUBLIC_POSTS_DIR = path.join(PUBLIC_DIR, "writings");
const PUBLIC_MEDIA_DIR = path.join(PUBLIC_DIR, "media", "writings");
const MEDIA_URL_PREFIX = "/media/writings";

const SITE_TITLE = "Nicolas Cerrato Anton: Writings";
const SITE_DESCRIPTION =
  "Essays on the arts, engineering, the esoteric and the existential.";

function siteOrigin(): string {
  const configured =
    process.env.SITE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "";
  if (!configured.trim()) {
    return "";
  }
  const origin = configured.trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(origin) ? origin : `https://${origin}`;
}

// ---------------------------------------------------------------------------
// Sync: Notion → content/writings/*.md
// ---------------------------------------------------------------------------

const localImageDeps: ImageDeps = {
  fetchImpl: fetch,
  async put(pathname, body) {
    const target = path.join(PUBLIC_MEDIA_DIR, pathname);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    return { url: `${MEDIA_URL_PREFIX}/${pathname}`, pathname };
  },
};

async function syncFromNotion(): Promise<void> {
  const client = getNotionClient();
  const dataSourceId = await resolveDataSourceId(client);

  const pages = [];
  for await (const result of iteratePaginatedAPI(
    (args: { data_source_id: string; start_cursor?: string; page_size?: number }) =>
      client.dataSources.query(args),
    { data_source_id: dataSourceId, page_size: 100 },
  )) {
    if (isFullPage(result)) {
      pages.push(result);
    }
  }

  const { kept: published, conflicts } = dedupeBySlug(
    pages
      .map((page) => ({ page, meta: extractPostMetadata(page as never) }))
      .filter(({ meta }) => meta.published),
  );
  for (const { slug, kept, dropped } of conflicts) {
    console.warn(
      `[writings]   duplicate slug "${slug}": using most recently edited page ${kept}, ignoring ${dropped}. Rename or unpublish one in Notion.`,
    );
  }

  console.log(`[writings] Notion: ${published.length} published of ${pages.length} pages`);

  await fs.rm(PUBLIC_MEDIA_DIR, { recursive: true, force: true });
  await fs.mkdir(CONTENT_DIR, { recursive: true });

  const synced = new Set<string>();
  for (const { page, meta } of published) {
    const blocks = await fetchAllBlocks(page.id, client);
    const rendered = renderBlocksToMarkdown(blocks);
    if (!rendered.trim()) {
      console.warn(`[writings]   skipped ${meta.slug}: page has no content`);
      continue;
    }

    const { markdown } = await processPostImages(rendered, meta.slug, localImageDeps);
    const body = markdown.trim();
    const frontmatter = serializeFrontmatter({
      slug: meta.slug,
      title: meta.title,
      excerpt: meta.excerpt || createExcerpt(body),
      date: meta.date,
      readTime: estimateReadTime(body),
      published: true,
      notionPageId: meta.pageId,
    });

    await fs.writeFile(path.join(CONTENT_DIR, `${meta.slug}.md`), `${frontmatter}\n\n${body}\n`, "utf-8");
    synced.add(meta.slug);
    console.log(`[writings]   ${meta.slug}`);
  }

  // Drop snapshot files for posts that were unpublished, renamed or deleted.
  // Hand-written files (no notionPageId) are left alone.
  for (const file of await fs.readdir(CONTENT_DIR)) {
    if (!file.endsWith(".md") || synced.has(file.slice(0, -3))) {
      continue;
    }
    const raw = await fs.readFile(path.join(CONTENT_DIR, file), "utf-8");
    if (parseFrontmatter(raw).data.notionPageId) {
      await fs.rm(path.join(CONTENT_DIR, file));
      console.log(`[writings]   removed ${file}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Emit: content/writings/*.md → manifest + agent-facing static files
// ---------------------------------------------------------------------------

function renderLlmsTxt(posts: PostSummary[], origin: string): string {
  const lines = [
    `# ${SITE_TITLE}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "Every post is available as raw markdown with YAML frontmatter at",
    "`/writings/<slug>.md`. The full list, with metadata, is at `/writings.json`.",
    "",
    "## About",
    "",
    `- [Curriculum Vitae](${origin}/cv.md): experience, projects, education and skills of Nicolas Cerrato Anton`,
    "",
    "## Posts",
    "",
    ...posts.map((post) => {
      const summary = post.excerpt ? `: ${post.excerpt}` : "";
      return `- [${post.title}](${origin}/writings/${post.slug}.md)${summary}`;
    }),
    "",
  ];
  return lines.join("\n");
}

async function emit(): Promise<PostSummary[]> {
  await fs.mkdir(CONTENT_DIR, { recursive: true });
  const files = (await fs.readdir(CONTENT_DIR)).filter((file) => file.endsWith(".md"));

  await fs.rm(PUBLIC_POSTS_DIR, { recursive: true, force: true });
  await fs.mkdir(PUBLIC_POSTS_DIR, { recursive: true });

  const summaries: PostSummary[] = [];
  for (const file of files) {
    const raw = await fs.readFile(path.join(CONTENT_DIR, file), "utf-8");
    const parsed = buildPostFromMarkdown(raw, file.slice(0, -3));
    if (!parsed) {
      throw new Error(`content/writings/${file} has no title in its frontmatter`);
    }
    if (`${parsed.summary.slug}.md` !== file) {
      throw new Error(`content/writings/${file} declares slug "${parsed.summary.slug}"; rename the file to match`);
    }
    summaries.push(parsed.summary);
    await fs.writeFile(path.join(PUBLIC_POSTS_DIR, file), raw, "utf-8");
  }

  const sorted = sortPostsByDateDesc(summaries);
  const origin = siteOrigin();

  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf-8");
  await fs.writeFile(
    path.join(PUBLIC_DIR, "writings.json"),
    `${JSON.stringify(
      sorted.map((post) => ({
        ...post,
        url: `${origin}/writings/${post.slug}`,
        markdownUrl: `${origin}/writings/${post.slug}.md`,
      })),
      null,
      2,
    )}\n`,
    "utf-8",
  );
  await fs.writeFile(path.join(PUBLIC_DIR, "llms.txt"), renderLlmsTxt(sorted, origin), "utf-8");

  return sorted;
}

// ---------------------------------------------------------------------------

const offline = process.argv.includes("--offline");

if (offline) {
  console.log("[writings] --offline: using the committed snapshot");
} else if (getOptionalNotionToken()) {
  await syncFromNotion();
} else {
  console.log("[writings] NOTION_SECRET not set: using the committed snapshot");
}

const posts = await emit();
console.log(`[writings] emitted ${posts.length} posts`);
