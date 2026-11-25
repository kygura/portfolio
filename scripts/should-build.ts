/**
 * Vercel ignoreCommand. Exit 0 skips the build; exit 1 builds.
 *
 * A production build is skipped only when the live site already carries this
 * commit and every published Notion page as it is now (see
 * scripts/notion/build-stamp.ts). Anything unexpected builds.
 *
 * Usage: node --experimental-strip-types scripts/should-build.ts
 */
import { isPublished, shouldSkip, type BuildStamp, type StampPage } from "./notion/build-stamp.ts";

const SITE = process.env.SITE_URL?.trim() || "https://www.nca.ink";

function build(reason: string): never {
  console.log(`[should-build] building: ${reason}`);
  process.exit(1);
}

async function publishedPages(token: string, dataSourceId: string): Promise<StampPage[]> {
  const pages: StampPage[] = [];
  let cursor: string | undefined;
  do {
    const response = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "notion-version": "2025-09-03",
        "content-type": "application/json",
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!response.ok) throw new Error(`Notion answered ${response.status}`);
    const body = (await response.json()) as {
      results: { id: string; last_edited_time: string; properties?: Record<string, { type?: string; checkbox?: boolean }> }[];
      has_more: boolean;
      next_cursor: string | null;
    };
    for (const page of body.results) {
      pages.push({ id: page.id, lastEdited: page.last_edited_time, published: isPublished(page.properties) });
    }
    cursor = body.has_more && body.next_cursor ? body.next_cursor : undefined;
  } while (cursor);
  return pages;
}

try {
  if (process.env.VERCEL_ENV !== "production") build(`${process.env.VERCEL_ENV ?? "local"} build`);
  const token = process.env.NOTION_SECRET?.trim();
  const dataSourceId = process.env.NOTION_DATA_SOURCE_ID?.trim();
  if (!token || !dataSourceId) build("NOTION_SECRET or NOTION_DATA_SOURCE_ID is not set");

  const liveResponse = await fetch(`${SITE}/build-stamp.json`, { cache: "no-store" });
  if (!liveResponse.ok) build(`no live stamp (${liveResponse.status})`);
  const live = (await liveResponse.json()) as BuildStamp;

  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null;
  const pages = await publishedPages(token, dataSourceId);
  if (!shouldSkip(live, pages, commit)) build("the commit or the published pages changed since the live build");

  console.log("[should-build] skipping: the live site already has this commit and every published page as it is now");
  process.exit(0);
} catch (error) {
  build(`check failed: ${error}`);
}
