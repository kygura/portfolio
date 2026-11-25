import assert from "node:assert/strict";
import test from "node:test";
import { buildEdges, labelWidth, layoutMap, linkingTopics, mapHeight, neighboursOf, type MapPost } from "./meaning-map.ts";

const post = (slug: string, cluster: string, topics: string[]): MapPost => ({ slug, title: `Essay ${slug}`, cluster, topics });
const POSTS = [
  post("a", "one", ["freedom", "the self"]),
  post("b", "one", ["freedom", "the self", "history"]),
  post("c", "two", ["history"]),
  post("d", "two", ["alone"]),
];

test("an edge joins every pair that shares a topic, and names what they share", () => {
  assert.deepEqual(buildEdges(POSTS), [
    { a: "a", b: "b", topics: ["freedom", "the self"] },
    { a: "b", b: "c", topics: ["history"] },
  ]);
  assert.deepEqual(buildEdges([post("x", "one", [])]), []);
});

test("linking topics leave out a topic only one essay carries", () => {
  assert.deepEqual(linkingTopics(POSTS).map((topic) => [topic.name, topic.slugs.length]), [
    ["freedom", 2],
    ["history", 2],
    ["the self", 2],
  ]);
});

test("neighbours are ordered by how much they share", () => {
  const edges = buildEdges(POSTS);
  assert.deepEqual(neighboursOf("b", edges), [
    { slug: "a", topics: ["freedom", "the self"] },
    { slug: "c", topics: ["history"] },
  ]);
  assert.deepEqual(neighboursOf("d", edges), []);
});

test("the layout is deterministic, inside the box and free of label overlaps", () => {
  const many = Array.from({ length: 24 }, (_, i) =>
    post(`essay-number-${i}`, `c${i % 4}`, [`t${i % 5}`, `t${(i * 3) % 7}`]),
  );
  const width = 1000;
  const size = { width, height: mapHeight(many, width) };
  const edges = buildEdges(many);
  const first = layoutMap(many, edges, size);
  assert.deepEqual([...first], [...layoutMap(many, edges, size)]);
  assert.equal(first.size, many.length);

  for (const [, point] of first) {
    assert.ok(point.x >= 0 && point.x <= size.width, `x ${point.x}`);
    assert.ok(point.y >= 0 && point.y <= size.height, `y ${point.y}`);
  }
  for (let i = 0; i < many.length; i++) {
    for (let j = i + 1; j < many.length; j++) {
      const p = first.get(many[i].slug)!;
      const q = first.get(many[j].slug)!;
      const clearX = Math.abs(p.x - q.x) >= (labelWidth(many[i].title) + labelWidth(many[j].title)) / 2;
      const clearY = Math.abs(p.y - q.y) >= 46;
      assert.ok(clearX || clearY, `${many[i].slug} overlaps ${many[j].slug}`);
    }
  }
});

test("an empty corpus lays out to nothing", () => {
  assert.equal(layoutMap([], [], { width: 800, height: 600 }).size, 0);
});
