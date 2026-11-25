import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  buildEdges,
  buildSkeleton,
  labelsOf,
  labelWidth,
  layoutMap,
  linkingTopics,
  mapHeight,
  neighboursOf,
  toMapPosts,
} from "../../content/meaning-map";
import type { PostSummary } from "../../content/posts";
import type { Cluster } from "../hooks/useMarkdownPosts";

interface MeaningMapProps {
  posts: PostSummary[];
  clusters: Cluster[];
}

type Focus =
  | { kind: "post"; slug: string }
  | { kind: "topic"; name: string }
  | { kind: "cluster"; id: string }
  | null;

/**
 * The writings as a map: every essay is a point, and a line joins two essays
 * that share a topic. Clusters and topics above the map light up their
 * essays. Pointing at an essay shows what it is linked to, and why.
 */
const MeaningMap = ({ posts, clusters }: MeaningMapProps) => {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(880);
  const [hover, setHover] = useState<Focus>(null);
  const [pinned, setPinned] = useState<Focus>(null);
  const focus = hover ?? pinned;

  // The map is drawn at the real width, so its text never scales down.
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = () => setWidth((current) => {
      const next = Math.max(280, Math.round(node.clientWidth / 20) * 20);
      return next === current ? current : next;
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const nodes = useMemo(() => toMapPosts(posts), [posts]);
  const edges = useMemo(() => buildEdges(nodes), [nodes]);
  const topics = useMemo(() => linkingTopics(nodes), [nodes]);
  const height = useMemo(() => mapHeight(nodes, width), [nodes, width]);
  // The skeleton is what is drawn at rest, and what shapes the layout.
  // Each cluster's index essay, chosen by the clustering, is the hub it is drawn around.
  const indexes = useMemo(
    () => new Map(clusters.flatMap((cluster) => (cluster.index ? [[cluster.id, cluster.index] as const] : []))),
    [clusters],
  );
  const skeleton = useMemo(() => buildSkeleton(nodes, edges, indexes), [nodes, edges, indexes]);
  const points = useMemo(() => layoutMap(nodes, skeleton.links, { width, height }), [nodes, skeleton, width, height]);
  const hubSlugs = useMemo(() => new Set(skeleton.hubs.values()), [skeleton]);
  const centreHub = skeleton.hubs.get(skeleton.centre);
  const maxBridge = Math.max(1, ...skeleton.links.filter((link) => link.kind === "bridge").map((link) => link.weight));
  const bySlug = useMemo(() => new Map(posts.map((post) => [post.slug, post])), [posts]);

  // Which essays the current focus lights up, and which of them is the source.
  const lit = useMemo(() => {
    if (!focus) return null;
    if (focus.kind === "topic") return new Set(posts.filter((post) => labelsOf(post).includes(focus.name)).map((post) => post.slug));
    if (focus.kind === "cluster") return new Set(posts.filter((post) => post.cluster === focus.id).map((post) => post.slug));
    return new Set([focus.slug, ...neighboursOf(focus.slug, edges).map((neighbour) => neighbour.slug)]);
  }, [focus, posts, edges]);

  const edgeLit = (edge: (typeof edges)[number]) => {
    if (!focus) return false;
    if (focus.kind === "post") return edge.a === focus.slug || edge.b === focus.slug;
    if (focus.kind === "topic") return edge.topics.includes(focus.name);
    return bySlug.get(edge.a)?.cluster === focus.id && bySlug.get(edge.b)?.cluster === focus.id;
  };

  const toggle = (next: Exclude<Focus, null>) =>
    setPinned((current) => (JSON.stringify(current) === JSON.stringify(next) ? null : next));
  const isPinned = (candidate: Exclude<Focus, null>) => JSON.stringify(pinned) === JSON.stringify(candidate);

  const active = focus?.kind === "post" ? bySlug.get(focus.slug) ?? null : null;
  const neighbours = active ? neighboursOf(active.slug, edges) : [];
  const activeTopic = focus?.kind === "topic" ? topics.find((topic) => topic.name === focus.name) ?? null : null;
  const activeCluster = focus?.kind === "cluster" ? clusters.find((cluster) => cluster.id === focus.id) ?? null : null;

  return (
    <section className="mmap" aria-label="Map of the writings">
      <div className="mmap__rail">
        <p className="mmap__rail-label" id="mmap-clusters">Clusters</p>
        <ul className="mmap__chips" aria-labelledby="mmap-clusters">
          {clusters.map((cluster) => {
            const self = { kind: "cluster", id: cluster.id } as const;
            return (
              <li key={cluster.id}>
                <button
                  type="button"
                  className="mmap__chip mmap__chip--cluster"
                  aria-pressed={isPinned(self)}
                  onClick={() => toggle(self)}
                  onMouseEnter={() => setHover(self)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(self)}
                  onBlur={() => setHover(null)}
                >
                  <span className="mmap__chip-mark">{cluster.numeral}</span>
                  {cluster.name}
                </button>
              </li>
            );
          })}
        </ul>

        {topics.length > 0 && (
          <>
            <p className="mmap__rail-label" id="mmap-topics">Topics</p>
            <ul className="mmap__chips" aria-labelledby="mmap-topics">
              {topics.map((topic) => {
                const self = { kind: "topic", name: topic.name } as const;
                return (
                  <li key={topic.name}>
                    <button
                      type="button"
                      className="mmap__chip"
                      aria-pressed={isPinned(self)}
                      onClick={() => toggle(self)}
                      onMouseEnter={() => setHover(self)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(self)}
                      onBlur={() => setHover(null)}
                    >
                      {topic.name}
                      <span className="mmap__chip-count">{topic.slugs.length}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <div className="mmap__frame" ref={frame}>
        <svg
          className="mmap__svg"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          data-focused={focus ? "" : undefined}
          role="group"
          aria-label={`${posts.length} essays in ${skeleton.hubs.size} clusters`}
        >
          {/* At rest: one line per essay. Spokes to the hub of its cluster, bridges between hubs. */}
          <g className="mmap__skeleton" aria-hidden="true">
            {skeleton.links.map((link) => {
              const from = points.get(link.a);
              const to = points.get(link.b);
              if (!from || !to) return null;
              return (
                <line
                  key={`${link.a}|${link.b}`}
                  className={link.kind === "bridge" ? "mmap__bridge" : "mmap__spoke"}
                  strokeWidth={link.kind === "bridge" ? 1.25 + (link.weight / maxBridge) * 2.25 : 1}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                />
              );
            })}
          </g>

          {/* On focus: every topic link of what is focused. */}
          <g className="mmap__edges" aria-hidden="true">
            {edges.filter(edgeLit).map((edge) => {
              const from = points.get(edge.a);
              const to = points.get(edge.b);
              if (!from || !to) return null;
              return (
                <line
                  key={`${edge.a}|${edge.b}`}
                  className="mmap__edge"
                  data-strong={edge.topics.length > 1 ? "" : undefined}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                />
              );
            })}
          </g>

          {posts.map((post) => {
            const point = points.get(post.slug);
            if (!point) return null;
            const self = { kind: "post", slug: post.slug } as const;
            const isHub = hubSlugs.has(post.slug);
            const isCentre = post.slug === centreHub;
            return (
              <Link
                key={post.slug}
                to={`/writings/${post.slug}`}
                className="mmap__node"
                data-lit={lit?.has(post.slug) ? "" : undefined}
                data-source={focus?.kind === "post" && focus.slug === post.slug ? "" : undefined}
                data-hub={isHub ? "" : undefined}
                data-centre={isCentre ? "" : undefined}
                onMouseEnter={() => setHover(self)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(self)}
                onBlur={() => setHover(null)}
              >
                {/* The target covers the dot and the label, so the whole entry is easy to hit. */}
                <rect
                  className="mmap__hit"
                  x={point.x - Math.max(44, labelWidth(post.title) / 2)}
                  y={point.y - 22}
                  width={Math.max(88, labelWidth(post.title))}
                  height={70}
                  rx={10}
                />
                <circle className="mmap__dot" cx={point.x} cy={point.y} r={isCentre ? 12 : isHub ? 10 : 7} />
                <text className="mmap__mark" x={point.x} y={point.y + 25} textAnchor="middle">{post.mark}</text>
                <text className="mmap__title" x={point.x} y={point.y + 42} textAnchor="middle">{post.title}</text>
              </Link>
            );
          })}
        </svg>
      </div>

      <div className="mmap__panel" aria-live="polite">
        {active && (
          <>
            <p className="mmap__panel-kicker">{active.mark} · {active.readTime} min · {labelsOf(active).join(", ")}</p>
            <h2 className="mmap__panel-title">{active.title}</h2>
            {neighbours.length > 0 ? (
              <ul className="mmap__links">
                {neighbours.slice(0, 6).map((neighbour) => (
                  <li key={neighbour.slug}>
                    <span className="mmap__links-title">{bySlug.get(neighbour.slug)?.title}</span>
                    <span className="mmap__links-why">{neighbour.topics.join(", ")}</span>
                  </li>
                ))}
                {neighbours.length > 6 && <li className="mmap__links-more">and {neighbours.length - 6} more</li>}
              </ul>
            ) : (
              <p className="mmap__panel-text">No shared topics with another essay yet.</p>
            )}
          </>
        )}
        {activeTopic && (
          <>
            <p className="mmap__panel-kicker">Topic · {activeTopic.slugs.length} essays</p>
            <h2 className="mmap__panel-title">{activeTopic.name}</h2>
            <p className="mmap__panel-text">{activeTopic.slugs.map((slug) => bySlug.get(slug)?.title).join(" · ")}</p>
          </>
        )}
        {activeCluster && (
          <>
            <p className="mmap__panel-kicker">Cluster {activeCluster.numeral} · {activeCluster.slugs.length} essays</p>
            <h2 className="mmap__panel-title">{activeCluster.name}</h2>
            {activeCluster.thesis && <p className="mmap__panel-text mmap__panel-text--thesis">{activeCluster.thesis}</p>}
          </>
        )}
        {!focus && (
          <p className="mmap__panel-hint">
            Each cluster is drawn around its index, the essay chosen to represent it, shown with a larger
            point. The clusters join through the central one, and a thicker line means more shared
            topics. Point at an essay to see every essay it
            shares a topic with, or pick a cluster or a topic above. Select an essay to read it.
          </p>
        )}
      </div>
    </section>
  );
};

export default MeaningMap;
