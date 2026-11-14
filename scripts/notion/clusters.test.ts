import assert from "node:assert/strict";
import test from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import {
  clusterCorpus,
  corpusHash,
  markFor,
  orderedSlugs,
  parseAnswer,
  reconcile,
  toRoman,
  type ClusterCache,
  type Clustering,
  type CorpusPost,
} from "./clusters.ts";

const post = (slug: string, body = `${slug} body`): CorpusPost => ({ slug, title: slug.toUpperCase(), body });
const CORPUS = [post("a"), post("b"), post("c"), post("d")];

function fakeClient(replies: string[]) {
  const calls: unknown[] = [];
  const client = {
    messages: {
      create: async (params: unknown) => {
        calls.push(params);
        const text = replies.shift() ?? "";
        return { stop_reason: "end_turn", content: [{ type: "text", text }] };
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

function memoryCache() {
  const store = new Map<string, Clustering>();
  const cache: ClusterCache = { get: async (hash) => store.get(hash) ?? null, put: async (c) => void store.set(c.hash, c) };
  return { store, cache };
}

const GOOD = JSON.stringify({
  clusters: [
    { name: "Freedom and the self", thesis: "You cannot be free of the thing doing the freeing.", slugs: ["b", "a"] },
    { name: "Power", thesis: "The state re-forms.", slugs: ["c", "d"] },
  ],
});

test("toRoman and marks", () => {
  assert.equal(toRoman(4), "IV");
  assert.equal(toRoman(9), "IX");
  const { clusters } = reconcile(null, CORPUS, "h");
  assert.equal(markFor(clusters, "c"), "I.3");
  assert.equal(markFor(clusters, "zzz"), "");
});

test("corpusHash changes when the corpus changes, not when order does", () => {
  assert.equal(corpusHash(CORPUS), corpusHash([...CORPUS].reverse()));
  assert.notEqual(corpusHash(CORPUS), corpusHash([...CORPUS, post("e")]));
  assert.notEqual(corpusHash(CORPUS), corpusHash([post("a", "edited"), ...CORPUS.slice(1)]));
});

test("parseAnswer requires every essay exactly once and strips dashes", () => {
  assert.equal(parseAnswer("not json", CORPUS), null);
  assert.equal(parseAnswer(JSON.stringify({ clusters: [{ name: "X", thesis: "", slugs: ["a", "b"] }] }), CORPUS), null);
  const parsed = parseAnswer(
    "Here you go: " + JSON.stringify({ clusters: [{ name: "One — two", thesis: "a – b", slugs: ["a", "a", "b", "c", "d", "ghost"] }] }),
    CORPUS,
  );
  assert.deepEqual(parsed, [{ name: "One, two", thesis: "a, b", slugs: ["a", "b", "c", "d"] }]);
});

test("clusters with Haiku, numbers the clusters and caches by corpus hash", async () => {
  const { store, cache } = memoryCache();
  const { client, calls } = fakeClient([GOOD]);
  const clustering = await clusterCorpus(CORPUS, { client, cache, previous: null });
  assert.equal(clustering.source, "model");
  assert.deepEqual(clustering.clusters.map((c) => [c.numeral, c.id]), [["I", "freedom-and-the-self"], ["II", "power"]]);
  assert.deepEqual(orderedSlugs(clustering.clusters), ["b", "a", "c", "d"]);
  assert.equal(store.size, 1);

  // Same corpus: served from cache, no second call.
  await clusterCorpus(CORPUS, { client, cache, previous: null });
  assert.equal(calls.length, 1);
});

test("a new publication re-clusters with the previous clustering as context", async () => {
  const { cache } = memoryCache();
  const first = await clusterCorpus(CORPUS, { client: fakeClient([GOOD]).client, cache, previous: null });
  const grown = [...CORPUS, post("e")];
  const { client, calls } = fakeClient([
    JSON.stringify({ clusters: [{ name: "Power", thesis: "", slugs: ["c", "d", "e"] }, { name: "Self", thesis: "", slugs: ["a", "b"] }] }),
  ]);
  const next = await clusterCorpus(grown, { client, cache, previous: first.clusters });
  assert.equal(calls.length, 1);
  assert.match((calls[0] as { messages: { content: string }[] }).messages[0].content, /<previous_clustering>/);
  assert.equal(markFor(next.clusters, "e"), "I.3");
});

test("retries an unusable answer once, then reconciles the previous clustering", async () => {
  const previous = reconcile(null, CORPUS.slice(0, 3), "old").clusters;
  const { client, calls } = fakeClient(["{}", '{"clusters":[]}']);
  const clustering = await clusterCorpus(CORPUS, { client, previous });
  assert.equal(calls.length, 2);
  assert.equal(clustering.source, "reconciled");
  assert.deepEqual(clustering.clusters.map((c) => c.name), ["Writings", "Unsorted"]);
  assert.deepEqual(clustering.clusters[1].slugs, ["d"]);
});

test("without a client, removed posts drop out of the previous clustering", async () => {
  const previous = reconcile(null, CORPUS, "old").clusters;
  const clustering = await clusterCorpus(CORPUS.slice(1), { client: null, previous });
  assert.deepEqual(orderedSlugs(clustering.clusters), ["b", "c", "d"]);
});
