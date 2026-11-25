/**
 * The map of the writings: essays as points, joined wherever two of them
 * share a topic. Pure and dependency-free, so the page and the tests use the
 * same code. Topics come from the build (scripts/notion/clusters.ts).
 */

export interface MapPost {
  slug: string;
  title: string;
  cluster: string;
  topics: string[];
}

export interface MapEdge {
  /** Slugs of the two essays, in corpus order. */
  a: string;
  b: string;
  /** The topics both essays carry. Never empty. */
  topics: string[];
}

export interface MapTopic {
  name: string;
  /** Essays that carry it. */
  slugs: string[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Accept loosely typed summaries (a manifest read as JSON) and fill the gaps. */
export function toMapPosts(posts: Partial<MapPost>[]): MapPost[] {
  return posts.flatMap((post) =>
    post.slug
      ? [{ slug: post.slug, title: post.title ?? post.slug, cluster: post.cluster ?? "", topics: post.topics ?? [] }]
      : [],
  );
}

/** One edge per pair of essays that share at least one topic. */
export function buildEdges(posts: MapPost[]): MapEdge[] {
  const edges: MapEdge[] = [];
  for (let i = 0; i < posts.length; i++) {
    const own = new Set(posts[i].topics);
    for (let j = i + 1; j < posts.length; j++) {
      const shared = posts[j].topics.filter((topic) => own.has(topic));
      if (shared.length > 0) edges.push({ a: posts[i].slug, b: posts[j].slug, topics: shared });
    }
  }
  return edges;
}

/** Topics that link something (two essays or more), most shared first. */
export function linkingTopics(posts: MapPost[]): MapTopic[] {
  const bySlugs = new Map<string, string[]>();
  for (const post of posts) {
    for (const topic of new Set(post.topics)) {
      bySlugs.set(topic, [...(bySlugs.get(topic) ?? []), post.slug]);
    }
  }
  return [...bySlugs]
    .filter(([, slugs]) => slugs.length > 1)
    .map(([name, slugs]) => ({ name, slugs }))
    .sort((a, b) => b.slugs.length - a.slugs.length || a.name.localeCompare(b.name));
}

export interface Neighbour {
  slug: string;
  topics: string[];
}

/** Essays linked to `slug`, the ones sharing the most topics first. */
export function neighboursOf(slug: string, edges: MapEdge[]): Neighbour[] {
  return edges
    .filter((edge) => edge.a === slug || edge.b === slug)
    .map((edge) => ({ slug: edge.a === slug ? edge.b : edge.a, topics: edge.topics }))
    .sort((a, b) => b.topics.length - a.topics.length);
}

/** Width a label needs, in px. An estimate: the map never measures text. */
export function labelWidth(title: string, charWidth = 7.4): number {
  return Math.max(48, title.length * charWidth);
}

/** How tall the map must be at a given width for the labels to fit. */
export function mapHeight(posts: MapPost[], width: number): number {
  const area = posts.reduce((sum, post) => sum + (labelWidth(post.title) + 44) * 92, 0);
  return Math.round(Math.max(420, Math.min(2600, (area * 1.45) / Math.max(width, 240))));
}

const LABEL_HEIGHT = 46;
const PAD = 14;

/**
 * Place the essays. A small force simulation: every pair repels, linked pairs
 * attract in proportion to the topics they share, and each essay leans toward
 * the middle of its cluster. Then the label boxes are pushed apart until none
 * overlap. Deterministic: the same corpus and size give the same map.
 */
export function layoutMap(posts: MapPost[], edges: MapEdge[], size: Size): Map<string, Point> {
  const n = posts.length;
  const out = new Map<string, Point>();
  if (n === 0) return out;

  const index = new Map(posts.map((post, i) => [post.slug, i]));
  const clusterIds = [...new Set(posts.map((post) => post.cluster))];
  const aspect = size.width / size.height;

  // Start: clusters around an ellipse, essays in a ring around their cluster.
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const seen = new Map<string, number>();
  posts.forEach((post, i) => {
    const c = clusterIds.indexOf(post.cluster);
    const k = seen.get(post.cluster) ?? 0;
    seen.set(post.cluster, k + 1);
    const ca = (c / clusterIds.length) * Math.PI * 2 - Math.PI / 2;
    const a = k * 2.399963; // golden angle: an even ring without knowing its size
    xs[i] = Math.cos(ca) * 1.2 * aspect + Math.cos(a) * 0.35;
    ys[i] = Math.sin(ca) * 1.2 + Math.sin(a) * 0.35;
  });

  const links = edges
    .map((edge) => ({ i: index.get(edge.a), j: index.get(edge.b), w: edge.topics.length }))
    .filter((link): link is { i: number; j: number; w: number } => link.i !== undefined && link.j !== undefined);

  const ITERATIONS = 320;
  for (let step = 0; step < ITERATIONS; step++) {
    const heat = 0.12 * (1 - step / ITERATIONS) + 0.005;
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        // Labels are wide, so sideways distance counts for less.
        const dx = (xs[i] - xs[j]) / aspect;
        const dy = xs[i] === xs[j] && ys[i] === ys[j] ? 0.01 : ys[i] - ys[j];
        const d2 = Math.max(dx * dx + dy * dy, 0.0025);
        const push = 0.22 / d2;
        const d = Math.sqrt(d2);
        fx[i] += (dx / d) * push; fy[i] += (dy / d) * push;
        fx[j] -= (dx / d) * push; fy[j] -= (dy / d) * push;
      }
    }
    for (const { i, j, w } of links) {
      const dx = xs[j] - xs[i];
      const dy = ys[j] - ys[i];
      const pull = 0.16 * w;
      fx[i] += dx * pull; fy[i] += dy * pull;
      fx[j] -= dx * pull; fy[j] -= dy * pull;
    }
    for (const id of clusterIds) {
      const members = posts.map((post, i) => (post.cluster === id ? i : -1)).filter((i) => i >= 0);
      const cx = members.reduce((sum, i) => sum + xs[i], 0) / members.length;
      const cy = members.reduce((sum, i) => sum + ys[i], 0) / members.length;
      for (const i of members) {
        fx[i] += (cx - xs[i]) * 0.55;
        fy[i] += (cy - ys[i]) * 0.55;
      }
    }
    for (let i = 0; i < n; i++) {
      fx[i] -= xs[i] * 0.05;
      fy[i] -= ys[i] * 0.05;
      const f = Math.hypot(fx[i], fy[i]) || 1;
      const move = Math.min(f, 6) * heat;
      xs[i] += (fx[i] / f) * move;
      ys[i] += (fy[i] / f) * move;
    }
  }

  // Fit to the box, leaving room for each label.
  const widths = posts.map((post) => labelWidth(post.title));
  const span = (values: Float64Array) => {
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
    return { min, range: max - min || 1 };
  };
  const sx = span(xs);
  const sy = span(ys);
  const margin = Math.min(110, size.width * 0.16);
  for (let i = 0; i < n; i++) {
    xs[i] = margin + ((xs[i] - sx.min) / sx.range) * (size.width - margin * 2);
    ys[i] = 30 + ((ys[i] - sy.min) / sy.range) * (size.height - 30 - LABEL_HEIGHT - 10);
  }

  // Push overlapping label boxes apart. A box hangs below its point.
  for (let pass = 0; pass < 240; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const needX = (widths[i] + widths[j]) / 2 + PAD;
        const needY = LABEL_HEIGHT + PAD;
        const dx = xs[j] - xs[i];
        const dy = ys[j] - ys[i];
        const overX = needX - Math.abs(dx);
        const overY = needY - Math.abs(dy);
        if (overX <= 0 || overY <= 0) continue;
        moved = true;
        // Resolve along the axis that needs the smaller move.
        if (overY < overX * 0.6) {
          const shift = (overY / 2) * (dy >= 0 ? 1 : -1);
          ys[i] -= shift; ys[j] += shift;
        } else {
          const shift = (overX / 2) * (dx >= 0 ? 1 : -1);
          xs[i] -= shift; xs[j] += shift;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const half = Math.min(widths[i] / 2 + 6, size.width / 2);
      xs[i] = Math.min(size.width - half, Math.max(half, xs[i]));
      ys[i] = Math.min(size.height - LABEL_HEIGHT - 6, Math.max(22, ys[i]));
    }
    if (!moved) break;
  }

  posts.forEach((post, i) => out.set(post.slug, { x: Math.round(xs[i] * 10) / 10, y: Math.round(ys[i] * 10) / 10 }));
  return out;
}
