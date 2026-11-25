import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

const TOPICS_SHOWN = 13;

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
  const [allTopics, setAllTopics] = useState(false);

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
  // Only the most shared topics show at first, so the map stays in view while choosing.
  const shownTopics = allTopics
    ? topics
    : topics.filter((topic, index) => index < TOPICS_SHOWN || (pinned?.kind === "topic" && pinned.name === topic.name));
  const hiddenTopics = topics.length - shownTopics.length;
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

  // Lit edges are ranked shortest first, so the nearest links draw before the far ones.
  const edgeOrder = (() => {
    const length = (edge: (typeof edges)[number]) => {
      const from = points.get(edge.a);
      const to = points.get(edge.b);
      return from && to ? Math.hypot(to.x - from.x, to.y - from.y) : 0;
    };
    const litEdges = edges.filter(edgeLit).sort((x, y) => length(x) - length(y));
    const rank = new Map(litEdges.map((edge, index) => [edge, index]));
    // An essay lights up when the first line to reach it arrives.
    const nodeRank = new Map<string, number>();
    litEdges.forEach((edge, index) => {
      if (!nodeRank.has(edge.a)) nodeRank.set(edge.a, index);
      if (!nodeRank.has(edge.b)) nodeRank.set(edge.b, index);
    });
    return { lines: edges.map((edge) => ({ edge, rank: rank.get(edge) ?? -1 })), nodeRank };
  })();

  const toggle = (next: Exclude<Focus, null>) =>
    setPinned((current) => (JSON.stringify(current) === JSON.stringify(next) ? null : next));
  const isPinned = (candidate: Exclude<Focus, null>) => JSON.stringify(pinned) === JSON.stringify(candidate);


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
              {shownTopics.map((topic) => {
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
              {(hiddenTopics > 0 || allTopics) && topics.length > TOPICS_SHOWN && (
                <li>
                  <button
                    type="button"
                    className="mmap__chip mmap__chip--more"
                    aria-expanded={allTopics}
                    onClick={() => setAllTopics((open) => !open)}
                  >
                    {allTopics ? "Fewer" : `+${hiddenTopics} more`}
                  </button>
                </li>
              )}
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

          {/* On focus: every topic link of what is focused. All are drawn, hidden at rest,
              so they can fade and grow out of the focused essay, and fade away again. */}
          <g className="mmap__edges" aria-hidden="true">
            {edgeOrder.lines.map(({ edge, rank }) => {
              let from = points.get(edge.a);
              let to = points.get(edge.b);
              if (!from || !to) return null;
              // Draw from the focused essay outwards.
              if (focus?.kind === "post" && edge.b === focus.slug) [from, to] = [to, from];
              return (
                <line
                  key={`${edge.a}|${edge.b}`}
                  className="mmap__edge"
                  data-strong={edge.topics.length > 1 ? "" : undefined}
                  data-lit={rank >= 0 ? "" : undefined}
                  style={rank >= 0 ? ({ "--i": rank } as CSSProperties) : undefined}
                  pathLength={1}
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
                style={lit?.has(post.slug) ? ({ "--i": edgeOrder.nodeRank.get(post.slug) ?? 0 } as CSSProperties) : undefined}
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
    </section>
  );
};

export default MeaningMap;
