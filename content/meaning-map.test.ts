import assert from "node:assert/strict";
import test from "node:test";
import { buildEdges, buildSkeleton, clusterRegion, convexHull, labelsOf, labelWidth, layoutMap, linkingTopics, mapHeight, neighboursOf, type MapPost } from "./meaning-map.ts";

const post = (slug: string, cluster: string, topics: string[], tags: string[] = []): MapPost => ({
  slug,
  title: `Essay ${slug}`,
  cluster,
  tags,
  topics,
});
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
  const links = buildSkeleton(many, edges).links;
  const first = layoutMap(many, links, size);
  assert.deepEqual([...first], [...layoutMap(many, links, size)]);
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

test("two essays are linked through a tag alone", () => {
  const posts = [post("x", "one", [], ["agency"]), post("y", "two", [], ["Agency "]), post("z", "two", [], ["craft"])];
  assert.deepEqual(buildEdges(posts), [{ a: "x", b: "y", topics: ["agency"] }]);
  assert.deepEqual(linkingTopics(posts).map((topic) => topic.name), ["agency"]);
});

test("a tag on one essay links to the same word as a topic on another", () => {
  const posts = [post("x", "one", ["history"], ["agency"]), post("y", "two", ["agency"]), post("z", "two", ["history"])];
  assert.deepEqual(buildEdges(posts), [
    { a: "x", b: "y", topics: ["agency"] },
    { a: "x", b: "z", topics: ["history"] },
  ]);
  assert.deepEqual(labelsOf(post("w", "one", ["agency", "craft"], ["Agency", "craft"])), ["agency", "craft"]);
});

test("the skeleton gives each cluster a hub and joins the clusters through one centre", () => {
  const mk = (slug: string, cluster: string, topics: string[]): MapPost => ({ slug, title: slug, cluster, tags: [], topics });
  const posts = [
    // Cluster "self": s2 shares with both others, so it is the hub.
    mk("s1", "self", ["will"]),
    mk("s2", "self", ["will", "ego", "state"]),
    mk("s3", "self", ["ego"]),
    // Cluster "state": no essay shares more than another, so the first one is the hub.
    mk("p1", "state", ["state", "power"]),
    mk("p2", "state", ["power"]),
    // Cluster "alone": one essay, linked to nothing.
    mk("x1", "alone", ["nothing else"]),
  ];
  const skeleton = buildSkeleton(posts, buildEdges(posts));
  assert.deepEqual([...skeleton.hubs], [["self", "s2"], ["state", "p1"], ["alone", "x1"]]);
  // "self" and "state" share equally with the outside; the earlier one is the centre.
  assert.equal(skeleton.centre, "self");
  assert.deepEqual(skeleton.links, [
    { a: "s1", b: "s2", kind: "spoke", weight: 1 },
    { a: "s3", b: "s2", kind: "spoke", weight: 1 },
    { a: "p2", b: "p1", kind: "spoke", weight: 1 },
    { a: "s2", b: "p1", kind: "bridge", weight: 1 },
    { a: "s2", b: "x1", kind: "bridge", weight: 1 },
  ]);
  // One line per essay, less one: a tree.
  assert.equal(skeleton.links.length, posts.length - 1);
  assert.equal(buildSkeleton([], []).links.length, 0);
});

test("the skeleton uses a cluster's chosen index as its hub", () => {
  const posts: MapPost[] = [
    { slug: "a", title: "A", cluster: "one", tags: [], topics: ["x", "y"] },
    { slug: "b", title: "B", cluster: "one", tags: [], topics: ["x", "y"] },
    { slug: "c", title: "C", cluster: "one", tags: [], topics: ["x"] },
  ];
  const edges = buildEdges(posts);
  assert.equal(buildSkeleton(posts, edges).hubs.get("one"), "a");
  assert.equal(buildSkeleton(posts, edges, new Map([["one", "c"]])).hubs.get("one"), "c");
  // An index outside the cluster is ignored.
  assert.equal(buildSkeleton(posts, edges, new Map([["one", "zzz"]])).hubs.get("one"), "a");
});

test("a cluster region is the convex hull around its label boxes", () => {
  const hull = convexHull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
  assert.equal(hull.length, 4);
  assert.ok(!hull.some((p) => p.x === 5 && p.y === 5));
  const path = clusterRegion([{ x: 100, y: 100 }], [80]);
  assert.match(path, /^M.*Z$/);
  assert.equal(clusterRegion([], []), "");
});
