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
 * 3. Mirror (production builds synced from Notion, with a Blob token): copy every
 *    post, its committed translations and the manifest to Vercel Blob under
 *    `writings/`, deleting what is no longer published. Failures only warn.
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
import { labelsOf } from "../content/meaning-map.ts";
import {
  createExcerpt,
  estimateReadTime,
  type PostSummary,
} from "../content/posts.ts";
import { getNotionClient, resolveDataSourceId } from "./notion/client.ts";
import { getOptionalNotionToken } from "./notion/env.ts";
import { fetchAllBlocks } from "./notion/blocks.ts";
import { renderBlocksToMarkdown } from "./notion/render.ts";
import { dedupeBySlug, extractPostMetadata } from "./notion/metadata.ts";
import { processPostImages, type ImageDeps } from "./notion/images.ts";
import { collectMirrorFiles, mirrorToBlob, vercelBlobStore } from "./notion/blob-mirror.ts";
import Anthropic from "@anthropic-ai/sdk";
import {
  blobClusterCache,
  clusterCorpus,
  markFor,
  orderedSlugs,
  type Cluster,
  type Clustering,
  type CorpusPost,
  type Topics,
} from "./notion/clusters.ts";

const offline = process.argv.includes("--offline");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = path.join(ROOT, "content", "writings");
const MANIFEST_PATH = path.join(CONTENT_DIR, "manifest.json");
const CLUSTERS_PATH = path.join(CONTENT_DIR, "clusters.json");
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
    const skippedTypes = new Set<string>();
    const rendered = renderBlocksToMarkdown(blocks, (type) => skippedTypes.add(type));
    if (skippedTypes.size > 0) {
      console.warn(`[writings]   ${meta.slug}: skipped unsupported block type(s): ${[...skippedTypes].sort().join(", ")}`);
    }
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
      readTime: estimateReadTime(body),
      tags: meta.tags,
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

function renderLlmsTxt(posts: PostSummary[], clusters: Cluster[], origin: string): string {
  const bySlug = new Map(posts.map((post) => [post.slug, post]));
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
    "Posts are grouped into thematic clusters, each in reading order.",
    "The cluster names, theses and order, and the `topics` of each post in `/writings.json`, are generated by a language model.",
    "The `tags` of a post are keywords set on it in Notion. Both count as topics below.",
    "The posts are written by the author.",
    "",
    ...clusters.flatMap((cluster) => [
      `### ${cluster.numeral}. ${cluster.name}`,
      "",
      ...(cluster.thesis ? [cluster.thesis, ""] : []),
      ...cluster.slugs.flatMap((slug) => {
        const post = bySlug.get(slug);
        if (!post) return [];
        const summary = post.excerpt ? `: ${post.excerpt}` : "";
        const labels = labelsOf(post);
        const topics = labels.length ? ` Topics: ${labels.join(", ")}.` : "";
        return [`- ${post.mark} [${post.title}](${origin}/writings/${post.slug}.md)${summary}${topics}`];
      }),
      "",
    ]),
  ];
  return lines.join("\n");
}

async function readPreviousClustering(): Promise<{ clusters: Cluster[] | null; topics: Topics | null }> {
  try {
    const previous = JSON.parse(await fs.readFile(CLUSTERS_PATH, "utf-8")) as Partial<Clustering>;
    return {
      clusters: Array.isArray(previous.clusters) ? previous.clusters : null,
      topics: previous.topics && typeof previous.topics === "object" ? previous.topics : null,
    };
  } catch {
    return { clusters: null, topics: null };
  }
}

/**
 * Re-cluster the corpus with Haiku when it changed since the last clustering
 * (a publication, an edit, an unpublish). Offline builds and builds without a
 * key adapt the previous clustering instead.
 */
async function clusterPosts(corpus: CorpusPost[]): Promise<Clustering> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const previous = await readPreviousClustering();
  const clustering = await clusterCorpus(corpus, {
    client: !offline && apiKey ? new Anthropic({ apiKey }) : null,
    cache: offline ? null : await blobClusterCache(),
    previous: previous.clusters,
    previousTopics: previous.topics,
    log: (message) => console.warn(`[writings]   ${message}`),
  });
  const shape = clustering.clusters.map((cluster) => `${cluster.numeral} ${cluster.name} (${cluster.slugs.length})`).join(", ");
  console.log(`[writings] clusters (${clustering.source}): ${shape}`);
  const vocabulary = new Set(Object.values(clustering.topics).flat());
  const untagged = corpus
    .filter((post) => !clustering.topics[post.slug]?.length && !post.tags?.length)
    .map((post) => post.slug);
  console.log(`[writings] topics: ${vocabulary.size} across ${corpus.length - untagged.length} of ${corpus.length} posts`);
  if (untagged.length > 0) {
    console.warn(`[writings]   no tags or topics yet for: ${untagged.join(", ")}. They get topics on the next build that reaches the model.`);
  }
  return clustering;
}

/**
 * Published in Notion but kept off the index, the clusters, writings.json and
 * llms.txt. Each still opens at its own /writings/<slug> address.
 */
// Off the index and the corpus, still reachable by URL. Each attacks employment
// or names and insults a real person, which reads badly to a recruiter.
const UNLISTED = new Set(["the-last-sovereign-act", "the-soul-as-a-system-prompt", "the-language-game"]);

async function emit(): Promise<PostSummary[]> {
  await fs.mkdir(CONTENT_DIR, { recursive: true });
  const files = (await fs.readdir(CONTENT_DIR)).filter((file) => file.endsWith(".md"));

  await fs.rm(PUBLIC_POSTS_DIR, { recursive: true, force: true });
  await fs.mkdir(PUBLIC_POSTS_DIR, { recursive: true });

  const summaries: PostSummary[] = [];
  const corpus: CorpusPost[] = [];
  for (const file of files) {
    const raw = await fs.readFile(path.join(CONTENT_DIR, file), "utf-8");
    const parsed = buildPostFromMarkdown(raw, file.slice(0, -3));
    if (!parsed) {
      throw new Error(`content/writings/${file} has no title in its frontmatter`);
    }
    if (`${parsed.summary.slug}.md` !== file) {
      throw new Error(`content/writings/${file} declares slug "${parsed.summary.slug}"; rename the file to match`);
    }
    // The author doesn't write em or en dashes; one showing up means an
    // editor (human or model) slipped it in. Name the post so it gets fixed
    // in Notion, the source every translation is made from.
    const dashes = (raw.match(/[–—]/g) ?? []).length;
    if (dashes > 0) {
      console.warn(`[writings]   ${file}: ${dashes} em/en dash(es), fix them in Notion`);
    }
    await fs.writeFile(path.join(PUBLIC_POSTS_DIR, file), raw, "utf-8");
    if (UNLISTED.has(parsed.summary.slug)) continue;
    summaries.push(parsed.summary);
    corpus.push({ slug: parsed.summary.slug, title: parsed.summary.title, body: parsed.content, tags: parsed.summary.tags });
  }

  // No dates: the corpus orders itself into clusters, each a reading path.
  const clustering = await clusterPosts(corpus);
  const bySlug = new Map(summaries.map((post) => [post.slug, post]));
  const clusterOf = new Map(clustering.clusters.flatMap((cluster) => cluster.slugs.map((slug) => [slug, cluster.id])));
  const sorted = orderedSlugs(clustering.clusters).map((slug) => ({
    ...bySlug.get(slug)!,
    mark: markFor(clustering.clusters, slug),
    cluster: clusterOf.get(slug) ?? "",
    topics: clustering.topics[slug] ?? [],
  }));
  const origin = siteOrigin();

  await fs.writeFile(CLUSTERS_PATH, `${JSON.stringify(clustering, null, 2)}\n`, "utf-8");
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf-8");
  await fs.writeFile(
    path.join(PUBLIC_DIR, "writings.json"),
    `${JSON.stringify(
      sorted.map((post) => ({
        ...post,
        clusterName: clustering.clusters.find((cluster) => cluster.id === post.cluster)?.name ?? "",
        url: `${origin}/writings/${post.slug}`,
        markdownUrl: `${origin}/writings/${post.slug}.md`,
      })),
      null,
      2,
    )}\n`,
    "utf-8",
  );
  await fs.writeFile(path.join(PUBLIC_DIR, "llms.txt"), renderLlmsTxt(sorted, clustering.clusters, origin), "utf-8");

  return sorted;
}

// ---------------------------------------------------------------------------

if (offline) {
  console.log("[writings] --offline: using the committed snapshot");
} else if (getOptionalNotionToken()) {
  await syncFromNotion();
} else {
  console.log("[writings] NOTION_SECRET not set: using the committed snapshot");
}

const posts = await emit();
console.log(`[writings] emitted ${posts.length} posts`);

// ---------------------------------------------------------------------------
// Mirror: content/writings + content/translations → Vercel Blob
// ---------------------------------------------------------------------------

const mirrorStore = vercelBlobStore();
// Only a production build that just synced from Notion speaks for what is
// published. Preview builds share the store and must not overwrite it.
const vercelEnv = process.env.VERCEL_ENV;
if (offline || !getOptionalNotionToken() || (vercelEnv && vercelEnv !== "production")) {
  if (vercelEnv && vercelEnv !== "production") console.log(`[writings] ${vercelEnv} build: skipping the Blob mirror`);
} else if (!mirrorStore) {
  console.log("[writings] no Blob token: skipping the mirror");
} else {
  try {
    const { uploaded, deleted } = await mirrorToBlob(
      await collectMirrorFiles(path.join(ROOT, "content"), [...posts.map((post) => post.slug), ...UNLISTED]),
      mirrorStore,
    );
    console.log(`[writings] mirrored ${uploaded} files to Blob${deleted.length ? `, removed ${deleted.length}` : ""}`);
  } catch (error) {
    console.warn("[writings] Blob mirror failed; the build continues", error);
  }
}
