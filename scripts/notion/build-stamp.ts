/**
 * Build stamps: skip a production build when it would publish exactly what is
 * already live. Notion redelivers events and fires them for unpublished
 * drafts, and each one used to queue a full build.
 *
 * Every production build that syncs from Notion publishes /build-stamp.json:
 * the commit, a fingerprint of the published pages (id and last edit) and the
 * time the sync started. Vercel's ignore step (scripts/should-build.ts)
 * compares that with Notion before building. Plain TypeScript with no
 * dependencies, so it runs under bare Node before `bun install`.
 */
import { createHash } from "node:crypto";

export interface StampPage {
  id: string;
  lastEdited: string;
  published: boolean;
}

export interface BuildStamp {
  commit: string | null;
  /** Fingerprint of the published pages, or null when the build did not sync. */
  pages: string | null;
  /** ISO time at which the sync started reading Notion. */
  syncedAt: string | null;
}

export function pagesFingerprint(pages: StampPage[]): string {
  const lines = pages
    .filter((page) => page.published)
    .map((page) => `${page.id.replace(/-/g, "").toLowerCase()}:${page.lastEdited}`)
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16);
}

/**
 * True only when a build would change nothing: same commit, same published
 * pages, and no published page edited in or after the minute the live build
 * synced (Notion reports edit times to the minute).
 */
export function shouldSkip(live: BuildStamp | null, pages: StampPage[], commit: string | null): boolean {
  if (!live?.pages || !live.syncedAt || !live.commit || !commit) return false;
  if (live.commit !== commit) return false;
  if (live.pages !== pagesFingerprint(pages)) return false;
  const syncedMinute = Math.floor(Date.parse(live.syncedAt) / 60_000) * 60_000;
  if (!Number.isFinite(syncedMinute)) return false;
  return pages.filter((page) => page.published).every((page) => Date.parse(page.lastEdited) < syncedMinute);
}

/** The Published checkbox, read the way scripts/notion/metadata.ts reads it. */
export function isPublished(properties: Record<string, { type?: string; checkbox?: boolean }> | undefined): boolean {
  if (!properties) return false;
  for (const name of ["Published", "published"]) {
    const property = properties[name];
    if (property?.type === "checkbox") return property.checkbox === true;
  }
  return false;
}
