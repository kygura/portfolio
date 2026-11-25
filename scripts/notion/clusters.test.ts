import assert from "node:assert/strict";
import test from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import {
  finish,
  clusterCorpus,
  clusterPrompt,
  corpusHash,
  markFor,
  orderedSlugs,
  cleanTopics,
  parseAnswer,
  pendingSlugs,
  fireClusterRoutine,
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
    { name: "The Sovereign Self", thesis: "You cannot be free of the thing doing the freeing.", slugs: ["b", "a"] },
    { name: "Power", thesis: "The state re-forms.", slugs: ["c", "d"] },
  ],
  topics: { a: ["freedom", "the self"], b: ["freedom"], c: ["the state"], d: ["the state", "freedom"] },
});
const TOPICS = { a: ["t"], b: ["t"], c: ["t"], d: ["t"] };

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
  assert.equal(parseAnswer(JSON.stringify({ clusters: [{ name: "X", thesis: "", slugs: ["a", "b"] }], topics: TOPICS }), CORPUS), null);
  const parsed = parseAnswer(
    "Here you go: " + JSON.stringify({ clusters: [{ name: "One — two", thesis: "a – b", slugs: ["a", "a", "b", "c", "d", "ghost"] }], topics: TOPICS }),
    CORPUS,
  );
  assert.deepEqual(parsed?.clusters, [{ name: "One, two", thesis: "a, b", slugs: ["a", "b", "c", "d"] }]);
});

test("parseAnswer rejects titles longer than three words", () => {
  const long = JSON.stringify({ clusters: [{ name: "A long title for a cluster", thesis: "", slugs: ["a", "b", "c", "d"] }], topics: TOPICS });
  assert.equal(parseAnswer(long, CORPUS), null);
  const short = JSON.stringify({ clusters: [{ name: "Of the State", thesis: "", slugs: ["a", "b", "c", "d"] }], topics: TOPICS });
  assert.equal(parseAnswer(short, CORPUS)?.clusters[0].name, "Of the State");
});

test("parseAnswer cleans topics and rejects an answer that leaves an essay without one", () => {
  const clusters = [{ name: "All", thesis: "", slugs: ["a", "b", "c", "d"] }];
  const messy = JSON.stringify({
    clusters,
    topics: {
      a: ["  The Self ", "the self", "free — will", "a topic that is far too long to be a label", 7],
      b: ["one", "two", "three", "four", "five"],
      c: ["the state"],
      d: ["the state"],
      ghost: ["ignored"],
    },
  });
  assert.deepEqual(parseAnswer(messy, CORPUS)?.topics, {
    a: ["the self", "free will"],
    b: ["one", "two", "three", "four"],
    c: ["the state"],
    d: ["the state"],
  });
  assert.deepEqual(cleanTopics("not a list"), []);

  const missing = JSON.stringify({ clusters, topics: { a: ["t"], b: ["t"], c: ["t"] } });
  assert.equal(parseAnswer(missing, CORPUS), null);
  assert.equal(parseAnswer(JSON.stringify({ clusters }), CORPUS), null);
});

test("clusters with Haiku, numbers the clusters and caches by corpus hash", async () => {
  const { store, cache } = memoryCache();
  const { client, calls } = fakeClient([GOOD]);
  const clustering = await clusterCorpus(CORPUS, { client, cache, previous: null });
  assert.equal(clustering.source, "model");
  assert.deepEqual(clustering.clusters.map((c) => [c.numeral, c.id]), [["I", "the-sovereign-self"], ["II", "power"]]);
  assert.deepEqual(orderedSlugs(clustering.clusters), ["b", "a", "c", "d"]);
  assert.equal(store.size, 1);
  assert.deepEqual(clustering.topics.d, ["the state", "freedom"]);

  // Same corpus: served from cache, no second call.
  await clusterCorpus(CORPUS, { client, cache, previous: null });
  assert.equal(calls.length, 1);
});

test("a new publication re-clusters with the previous clustering as context", async () => {
  const { cache } = memoryCache();
  const first = await clusterCorpus(CORPUS, { client: fakeClient([GOOD]).client, cache, previous: null });
  const grown = [...CORPUS, post("e")];
  const { client, calls } = fakeClient([
    JSON.stringify({
      clusters: [{ name: "Power", thesis: "", slugs: ["c", "d", "e"] }, { name: "Self", thesis: "", slugs: ["a", "b"] }],
      topics: { ...TOPICS, e: ["t"] },
    }),
  ]);
  const next = await clusterCorpus(grown, { client, cache, previous: first.clusters, previousTopics: first.topics });
  assert.equal(calls.length, 1);
  const sent = (calls[0] as { messages: { content: string }[] }).messages[0].content;
  assert.match(sent, /<previous_clustering>/);
  assert.match(sent, /"topics":\{"a":\["freedom","the self"\]/);
  assert.equal(markFor(next.clusters, "e"), "I.3");
});

test("retries an unusable answer once, then reconciles the previous clustering", async () => {
  const previous = reconcile(null, CORPUS.slice(0, 3), "old").clusters;
  const { client, calls } = fakeClient(["{}", '{"clusters":[]}']);
  const clustering = await clusterCorpus(CORPUS, { client, previous, previousTopics: { a: ["freedom"], gone: ["x"] } });
  assert.equal(calls.length, 2);
  // Topics survive for essays still present; a new essay has none yet.
  assert.deepEqual(clustering.topics, { a: ["freedom"] });
  assert.equal(clustering.source, "reconciled");
  assert.deepEqual(clustering.clusters.map((c) => c.name), ["Writings", "Unsorted"]);
  assert.deepEqual(clustering.clusters[1].slugs, ["d"]);
});

test("without a client, removed posts drop out of the previous clustering", async () => {
  const previous = reconcile(null, CORPUS, "old").clusters;
  const clustering = await clusterCorpus(CORPUS.slice(1), { client: null, previous });
  assert.deepEqual(orderedSlugs(clustering.clusters), ["b", "c", "d"]);
});

test("corpusHash changes when tags change, not when their order does", () => {
  const tagged = (tags: string[]) => [{ ...post("a"), tags }, ...CORPUS.slice(1)];
  assert.notEqual(corpusHash(CORPUS), corpusHash(tagged(["agency"])));
  assert.notEqual(corpusHash(tagged(["agency"])), corpusHash(tagged(["agency", "craft"])));
  assert.equal(corpusHash(tagged(["agency", "craft"])), corpusHash(tagged(["craft", "agency"])));
  assert.equal(corpusHash(CORPUS), corpusHash(tagged([])));
});

test("the prompt carries an essay's tags as a keywords attribute", () => {
  const { system, user } = clusterPrompt([{ ...post("a"), tags: ["craft", "agency"] }, post("b")], null);
  assert.match(user, /<essay slug="a" title="A" keywords="agency, craft">/);
  assert.match(user, /<essay slug="b" title="B">/);
  assert.match(system, /keywords/);
});

test("pendingSlugs lists essays left unsorted or without topics by a reconciled clustering", () => {
  const clustering: Clustering = {
    hash: "h",
    source: "reconciled",
    clusters: [
      { id: "one", numeral: "I", name: "One", thesis: "", slugs: ["a", "b"], index: "a" },
      { id: "unsorted", numeral: "II", name: "Unsorted", thesis: "", slugs: ["c"], index: "c" },
    ],
    topics: { a: ["x"], c: ["y"] },
  };
  assert.deepEqual(pendingSlugs(clustering, ["a", "b", "c"]), ["b", "c"]);
  assert.deepEqual(pendingSlugs({ ...clustering, source: "model" }, ["a", "b", "c"]), []);
});

test("fireClusterRoutine posts the pending slugs to the routine's API trigger", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ type: "routine_fire", claude_code_session_url: "https://claude.ai/code/session_x" }));
  }) as unknown as typeof fetch;
  const env = { CLAUDE_CLUSTER_ROUTINE_ID: "trig_abc", CLAUDE_CLUSTER_ROUTINE_TOKEN: "tok" };

  const result = await fireClusterRoutine(["new-essay"], env, fakeFetch);
  assert.deepEqual(result, { fired: true, sessionUrl: "https://claude.ai/code/session_x" });
  assert.equal(calls[0].url, "https://api.anthropic.com/v1/claude_code/routines/trig_abc/fire");
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, "Bearer tok");
  assert.match(String(calls[0].init.body), /new-essay/);
});

test("fireClusterRoutine does nothing without configuration and never throws", async () => {
  const unconfigured = await fireClusterRoutine(["a"], {});
  assert.equal(unconfigured.fired, false);
  const failing = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
  const rejected = await fireClusterRoutine(["a"], { CLAUDE_CLUSTER_ROUTINE_ID: "trig_x", CLAUDE_CLUSTER_ROUTINE_TOKEN: "t" }, failing);
  assert.deepEqual(rejected, { fired: false, reason: "the fire endpoint answered 401" });
  const throwing = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  const errored = await fireClusterRoutine(["a"], { CLAUDE_CLUSTER_ROUTINE_ID: "trig_x", CLAUDE_CLUSTER_ROUTINE_TOKEN: "t" }, throwing);
  assert.equal(errored.fired, false);
});

test("finish leads each cluster with its index, or the first essay when the index is missing or foreign", () => {
  const [chosen, fallback, foreign] = finish([
    { name: "Of the State", thesis: "t", slugs: ["a", "b", "c"], index: "c" },
    { name: "Of Machines", thesis: "t", slugs: ["d", "e"] },
    { name: "Of Authorship", thesis: "t", slugs: ["f", "g"], index: "zzz" },
  ]);
  assert.deepEqual([chosen.index, chosen.slugs], ["c", ["c", "a", "b"]]);
  assert.deepEqual([fallback.index, fallback.slugs], ["d", ["d", "e"]]);
  assert.deepEqual([foreign.index, foreign.slugs], ["f", ["f", "g"]]);
});
