/**
 * Mirror the published writings to Vercel Blob, so the posts survive outside
 * the deployment: every post's markdown, its committed translations and the
 * manifest, under one prefix. Runs at the end of each build.
 *
 *   writings/manifest.json
 *   writings/posts/<slug>.md
 *   writings/translations/<lang>/<slug>.md
 *
 * The mirror always matches the build: files that no longer exist locally
 * (an unpublished or renamed post) are deleted from the store. It is a
 * secondary copy, so a failure is reported but never fails the build.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { del as delBlob, list as listBlobs, put as putBlob } from "@vercel/blob";

export const MIRROR_PREFIX = "writings/";

export interface MirrorFile {
  /** Path under the mirror prefix, e.g. "posts/thaumazein.md". */
  path: string;
  body: string;
  contentType: string;
}

export interface MirrorStore {
  put(pathname: string, body: string, contentType: string): Promise<void>;
  /** Every pathname currently stored under the prefix. */
  list(prefix: string): Promise<string[]>;
  del(pathnames: string[]): Promise<void>;
}

export interface MirrorResult {
  uploaded: number;
  deleted: string[];
}

export async function mirrorToBlob(files: MirrorFile[], store: MirrorStore): Promise<MirrorResult> {
  const wanted = new Set(files.map((file) => MIRROR_PREFIX + file.path));
  const existing = await store.list(MIRROR_PREFIX);

  // Upload a few at a time: the store rate-limits bursts.
  const queue = [...files];
  const workers = Array.from({ length: 6 }, async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      await store.put(MIRROR_PREFIX + file.path, file.body, file.contentType);
    }
  });
  await Promise.all(workers);

  const stale = existing.filter((pathname) => !wanted.has(pathname));
  if (stale.length > 0) await store.del(stale);
  return { uploaded: files.length, deleted: stale };
}

const MARKDOWN = "text/markdown; charset=utf-8";

/**
 * What to mirror, read from `contentDir` (the repo's content/): the manifest,
 * every post, and the committed translations of published posts only.
 */
export async function collectMirrorFiles(contentDir: string, publishedSlugs: string[]): Promise<MirrorFile[]> {
  const writingsDir = path.join(contentDir, "writings");
  const files: MirrorFile[] = [
    {
      path: "manifest.json",
      body: await fs.readFile(path.join(writingsDir, "manifest.json"), "utf-8"),
      contentType: "application/json",
    },
  ];
  for (const name of (await fs.readdir(writingsDir)).filter((file) => file.endsWith(".md")).sort()) {
    files.push({ path: `posts/${name}`, body: await fs.readFile(path.join(writingsDir, name), "utf-8"), contentType: MARKDOWN });
  }
  const published = new Set(publishedSlugs.map((slug) => `${slug}.md`));
  const translationsDir = path.join(contentDir, "translations");
  for (const lang of (await fs.readdir(translationsDir).catch(() => [] as string[])).sort()) {
    const dir = path.join(translationsDir, lang);
    if (!(await fs.stat(dir)).isDirectory()) continue;
    for (const name of (await fs.readdir(dir)).filter((file) => published.has(file)).sort()) {
      files.push({ path: `translations/${lang}/${name}`, body: await fs.readFile(path.join(dir, name), "utf-8"), contentType: MARKDOWN });
    }
  }
  return files;
}

/** The real store, or null when no read-write token is configured. */
export function vercelBlobStore(env: NodeJS.ProcessEnv = process.env): MirrorStore | null {
  const token = env.BLOB_READ_WRITE_TOKEN?.trim() || env.NOTION_SYNC_READ_WRITE_TOKEN?.trim();
  if (!token) return null;
  const access = env.BLOB_ACCESS === "private" ? "private" : "public";
  return {
    async put(pathname, body, contentType) {
      await putBlob(pathname, body, {
        access,
        token,
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
      });
    },
    async list(prefix) {
      const pathnames: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await listBlobs({ prefix, cursor, token });
        pathnames.push(...page.blobs.map((blob) => blob.pathname));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return pathnames;
    },
    async del(pathnames) {
      await delBlob(pathnames, { token });
    },
  };
}
