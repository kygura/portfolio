import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MIRROR_PREFIX, collectMirrorFiles, mirrorToBlob, vercelBlobStore, type MirrorStore } from "./blob-mirror.ts";

function memoryStore(initial: string[] = []) {
  const files = new Map<string, { body: string; contentType: string }>(
    initial.map((pathname) => [pathname, { body: "old", contentType: "text/markdown" }]),
  );
  const store: MirrorStore = {
    put: async (pathname, body, contentType) => void files.set(pathname, { body, contentType }),
    list: async (prefix) => [...files.keys()].filter((key) => key.startsWith(prefix)),
    del: async (pathnames) => pathnames.forEach((pathname) => files.delete(pathname)),
  };
  return { files, store };
}

test("uploads every file under the prefix and overwrites changed ones", async () => {
  const { files, store } = memoryStore([`${MIRROR_PREFIX}posts/a.md`]);
  const result = await mirrorToBlob(
    [
      { path: "posts/a.md", body: "new a", contentType: "text/markdown; charset=utf-8" },
      { path: "posts/b.md", body: "b", contentType: "text/markdown; charset=utf-8" },
      { path: "manifest.json", body: "[]", contentType: "application/json" },
    ],
    store,
  );
  assert.equal(result.uploaded, 3);
  assert.deepEqual(result.deleted, []);
  assert.equal(files.get(`${MIRROR_PREFIX}posts/a.md`)?.body, "new a");
  assert.equal(files.get(`${MIRROR_PREFIX}manifest.json`)?.contentType, "application/json");
});

test("deletes mirrored files that are no longer published, and nothing outside the prefix", async () => {
  const { files, store } = memoryStore([
    `${MIRROR_PREFIX}posts/gone.md`,
    `${MIRROR_PREFIX}translations/es/gone.md`,
    "translations/v2/a/fr/hash.txt",
    "showcase/descriptions/v2/x.txt",
  ]);
  const result = await mirrorToBlob([{ path: "posts/a.md", body: "a", contentType: "text/markdown" }], store);
  assert.deepEqual(result.deleted.sort(), [`${MIRROR_PREFIX}posts/gone.md`, `${MIRROR_PREFIX}translations/es/gone.md`]);
  assert.ok(files.has("translations/v2/a/fr/hash.txt"));
  assert.ok(files.has("showcase/descriptions/v2/x.txt"));
});

test("vercelBlobStore needs a token", () => {
  assert.equal(vercelBlobStore({}), null);
  assert.ok(vercelBlobStore({ NOTION_SYNC_READ_WRITE_TOKEN: "vercel_blob_rw_x" }));
  assert.ok(vercelBlobStore({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_y" }));
});

test("collectMirrorFiles takes the manifest, every post and only published translations", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-"));
  await fs.mkdir(path.join(dir, "writings"));
  await fs.mkdir(path.join(dir, "translations", "es"), { recursive: true });
  await fs.writeFile(path.join(dir, "writings", "manifest.json"), "[]");
  await fs.writeFile(path.join(dir, "writings", "a.md"), "A");
  await fs.writeFile(path.join(dir, "translations", "es", "a.md"), "A es");
  await fs.writeFile(path.join(dir, "translations", "es", "old.md"), "orphan");
  const files = await collectMirrorFiles(dir, ["a"]);
  assert.deepEqual(files.map((file) => file.path), ["manifest.json", "posts/a.md", "translations/es/a.md"]);
});

test("collectMirrorFiles reads the real content directory", async () => {
  const content = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../content");
  const manifest = JSON.parse(await fs.readFile(path.join(content, "writings", "manifest.json"), "utf-8")) as { slug: string }[];
  const files = await collectMirrorFiles(content, manifest.map((post) => post.slug));
  const posts = files.filter((file) => file.path.startsWith("posts/"));
  assert.equal(posts.length, manifest.length);
  assert.ok(files.some((file) => file.path.startsWith("translations/es/")));
});
