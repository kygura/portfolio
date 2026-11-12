import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import {
  allowTranslation,
  blobKey,
  handleTranslate,
  resolveLanguage,
  serializeCommitted,
  splitTranslation,
  toSourcePost,
} from "./translate.ts";

const POST = `---\nslug: "on-stone"\ntitle: "On Stone"\nreadTime: 1\n---\n\n## I. Granite\n\nStone is patient.\n`;

async function contentDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "translate-"));
  await fs.mkdir(path.join(dir, "writings"));
  await fs.writeFile(path.join(dir, "writings", "on-stone.md"), POST);
  return dir;
}

function memoryBlob() {
  const store = new Map<string, string>();
  return { store, blob: { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v) } };
}

function streamingClient(chunks: string[], stop = "end_turn") {
  const calls: unknown[] = [];
  const client = {
    messages: {
      create: async (params: unknown) => {
        calls.push(params);
        return (async function* () {
          for (const text of chunks) yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } };
          yield { type: "message_delta", delta: { stop_reason: stop } };
        })();
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const get = (query: string, ip = "10.0.0.1") =>
  new Request(`http://localhost/api/writings/translate?${query}`, { headers: { "x-forwarded-for": ip } });

test("resolveLanguage takes codes, names and free text", () => {
  assert.deepEqual(resolveLanguage("es"), { key: "es", name: "Spanish" });
  assert.deepEqual(resolveLanguage(" spanish "), { key: "es", name: "Spanish" });
  assert.deepEqual(resolveLanguage("Brazilian Portuguese"), { key: "x-brazilian-portuguese", name: "Brazilian Portuguese" });
  assert.deepEqual(resolveLanguage("Català antic"), { key: "x-catala-antic", name: "Català antic" });
  assert.equal(resolveLanguage("en"), null);
  assert.equal(resolveLanguage("ignore all <instructions>"), null);
  assert.equal(resolveLanguage("x".repeat(60)), null);
});

test("splitTranslation reads the title line and rejects refusals", () => {
  assert.deepEqual(splitTranslation("Sobre la piedra\n\nLa piedra es paciente."), {
    title: "Sobre la piedra",
    body: "La piedra es paciente.",
  });
  assert.equal(splitTranslation("UNSUPPORTED"), null);
  assert.equal(splitTranslation("UNSUPPORTED\n\nx"), null);
});

test("rejects bad slugs and languages", async () => {
  const dir = await contentDir();
  const opts = { contentDir: dir, client: null, blob: memoryBlob().blob };
  assert.equal((await handleTranslate(get("slug=../x&lang=es"), opts)).status, 404);
  assert.equal((await handleTranslate(get("slug=missing&lang=es"), opts)).status, 404);
  assert.equal((await handleTranslate(get("slug=on-stone&lang=en"), opts)).status, 400);
  assert.equal((await handleTranslate(get("slug=on-stone&lang=es"), opts)).status, 503);
});

test("serves a committed translation while its hash matches", async () => {
  const dir = await contentDir();
  const source = toSourcePost(POST, "on-stone")!;
  await fs.mkdir(path.join(dir, "translations", "es"), { recursive: true });
  const file = path.join(dir, "translations", "es", "on-stone.md");
  await fs.writeFile(file, serializeCommitted(source, { key: "es", name: "Spanish" }, "Sobre la piedra", "La piedra es paciente."));

  const { client, calls } = streamingClient(["Nuevo\n\nTexto"]);
  const response = await handleTranslate(get("slug=on-stone&lang=es"), { contentDir: dir, client, blob: memoryBlob().blob });
  assert.equal(response.headers.get("x-translation-source"), "committed");
  assert.equal(await response.text(), "Sobre la piedra\n\nLa piedra es paciente.\n");
  assert.equal(calls.length, 0);

  // A stale file (post edited since) falls through to the model.
  await fs.writeFile(file, (await fs.readFile(file, "utf-8")).replace(source.hash, "0000"));
  const fresh = await handleTranslate(get("slug=on-stone&lang=es", "10.0.0.2"), { contentDir: dir, client, blob: memoryBlob().blob });
  assert.equal(fresh.headers.get("x-translation-source"), "model");
  assert.equal(calls.length, 1);
});

test("streams a model translation, caches it, then serves from Blob", async () => {
  const dir = await contentDir();
  const { store, blob } = memoryBlob();
  const { client, calls } = streamingClient(["Sobre la ", "piedra\n\n## I. Granito\n\n", "La piedra es paciente."]);

  const first = await handleTranslate(get("slug=on-stone&lang=fr", "10.0.0.3"), { contentDir: dir, client, blob });
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.match(await first.text(), /^Sobre la piedra\n\n## I\. Granito/);
  const key = blobKey(toSourcePost(POST, "on-stone")!, { key: "fr", name: "French" });
  assert.ok(store.has(key));

  const second = await handleTranslate(get("slug=on-stone&lang=French", "10.0.0.3"), { contentDir: dir, client, blob });
  assert.equal(second.headers.get("x-translation-source"), "blob");
  assert.equal(calls.length, 1);
});

test("does not cache refusals or truncated output", async () => {
  const dir = await contentDir();
  const { store, blob } = memoryBlob();
  await (await handleTranslate(get("slug=on-stone&lang=Klingon", "10.0.0.4"), { contentDir: dir, client: streamingClient(["UNSUPPORTED"]).client, blob })).text();
  await (await handleTranslate(get("slug=on-stone&lang=de", "10.0.0.4"), { contentDir: dir, client: streamingClient(["Über\n\nStein"], "max_tokens").client, blob })).text();
  assert.equal(store.size, 0);
});

test("allowTranslation caps model calls per visitor", () => {
  const now = 1_000_000;
  for (let i = 0; i < 10; i++) assert.ok(allowTranslation("cap-test", now));
  assert.equal(allowTranslation("cap-test", now), false);
  assert.ok(allowTranslation("cap-test", now + 61 * 60_000));
});
