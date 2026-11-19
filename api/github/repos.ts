/**
 * GET /api/github/repos: the software index. Only the repos named in SHOWCASE
 * appear, in that order, with their details read from the GitHub API. Repos
 * with a working live site (private ones too, given a token that can read
 * them) get the best preview it allows (an embedded frame, its og:image, or
 * GitHub's generated social card); repos without one get a map of their
 * source tree.
 */

const GITHUB_API = "https://api.github.com";

/**
 * The software page, curated by hand: only these repos appear, in this order.
 * A repo that is not listed never shows, however public or starred it is. A
 * listed private repo shows too: with its live site if it has one, else as a
 * code map with no source link. Names match GitHub's case-insensitively.
 *
 * To add a project, add its repo name here. codebase.ts keeps a copy (Vercel
 * functions cannot import siblings); a test keeps the two in step.
 */
export const SHOWCASE: readonly string[] = [
  "hypertrade",
  "meridian",
  "polytech",
  "lexis-editorial",
  "vessel",
  "provenance",
  "hl-cycles",
  "iceberg",
  "atlas",
  "hyperion",
  "claude-mods",
  "voxflow",
  "tiny-cove",
];

/** Old bookkeeping topics some repos still carry; they say nothing to a visitor. */
const INTERNAL_TOPICS = new Set(["portfolio-hide", "flagship"]);

export interface GithubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics?: string[];
  pushed_at: string;
  fork: boolean;
  archived: boolean;
  private: boolean;
  has_pages: boolean;
  default_branch?: string;
  /** In KB; 0 for an empty repository. */
  size?: number;
}

/** One plot on a code map: a directory (with children) or a single file. */
export interface CodeMapNode {
  name: string;
  bytes: number;
  files: number;
  /** The file's language, or the one holding most bytes under a directory. */
  lang: string | null;
  children?: CodeMapNode[];
}

/** A repo's source tree, folded to two levels for a treemap. */
export interface CodeMap {
  /** Directories every file sat under, stripped so the map shows structure ("src/"). */
  base: string;
  files: number;
  bytes: number;
  /** GitHub cut the tree listing short (over 100k entries). */
  truncated: boolean;
  /** Most bytes first. */
  languages: { name: string; bytes: number }[];
  nodes: CodeMapNode[];
}

export type RepoPreview =
  | { kind: "frame"; src: string }
  | { kind: "image"; src: string }
  | { kind: "map"; map: CodeMap }
  | { kind: "none" };

export interface ShowcaseRepo {
  name: string;
  fullName: string;
  /** The README's opening prose, else the repo's "About" line. */
  description: string | null;
  url: string;
  /** Null for a code-only repo: no deployment, or one that is gone. */
  liveUrl: string | null;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  pushedAt: string;
  archived: boolean;
  /** Private repos get no source link: visitors would hit a 404. */
  private: boolean;
  /** GitHub's social card, the placeholder while a frame loads; private repos have none. */
  card: string | null;
  preview: RepoPreview;
}

export interface Showcase {
  user: string;
  generatedAt: string;
  repos: ShowcaseRepo[];
}

type Fetch = typeof fetch;

interface ShowcaseOptions {
  user: string;
  /** The approved repos, in page order; defaults to SHOWCASE. */
  showcase?: readonly string[];
  token?: string | null;
  limit?: number;
  now?: Date;
  fetchImpl?: Fetch;
  /** Origin of the page that will embed the previews; defaults to SITE_ORIGIN. */
  origin?: string;
}

/**
 * The owner's repos that appear in the showcase list, in the list's order.
 * Everything else is left out.
 */
export function rankRepos(
  repos: GithubRepo[],
  showcase: readonly string[] = SHOWCASE,
  limit = Infinity,
): GithubRepo[] {
  const position = new Map(showcase.map((name, index) => [name.toLowerCase(), index]));
  return repos
    .filter((repo) => position.has(repo.name.toLowerCase()))
    .sort((a, b) => position.get(a.name.toLowerCase())! - position.get(b.name.toLowerCase())!)
    .slice(0, limit);
}

/** The repo's homepage if it is a web URL, else its GitHub Pages site. */
export function liveUrlFor(repo: GithubRepo, user: string): string | null {
  const homepage = repo.homepage?.trim();
  if (homepage) {
    const withScheme = /^https?:\/\//i.test(homepage) ? homepage : `https://${homepage}`;
    try {
      const url = new URL(withScheme);
      if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
    } catch {
      // not a URL; fall through
    }
  }
  if (repo.has_pages) {
    const owner = user.toLowerCase();
    return repo.name.toLowerCase() === `${owner}.github.io`
      ? `https://${owner}.github.io/`
      : `https://${owner}.github.io/${repo.name}/`;
  }
  return null;
}

/** This site's production origin: the default embedder for framing checks. */
export const SITE_ORIGIN = "https://www.nca.ink";

/**
 * True when one frame-ancestors source admits `origin`: `*`, a bare scheme,
 * an exact origin, or a `*.` host wildcard (one or more labels deep, as in
 * CSP). Trailing slashes and case are ignored; a source with a path or an
 * explicit port other than the origin's is not matched.
 */
function sourceAllows(source: string, origin: URL): boolean {
  const s = source.replace(/\/$/, "").toLowerCase();
  if (s === "*") return true;
  if (/^[a-z][a-z0-9+.-]*:$/.test(s)) return s === origin.protocol;
  const m = s.match(/^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([a-z0-9.-]+)(?::(\d+|\*))?$/);
  if (!m) return false;
  const [, scheme, wild, host, port] = m;
  if (scheme ? `${scheme}:` !== origin.protocol : origin.protocol !== "https:") return false;
  if (port && port !== "*" && port !== (origin.port || (origin.protocol === "https:" ? "443" : "80"))) return false;
  const h = origin.hostname.toLowerCase();
  return wild ? h.endsWith(`.${host}`) : h === host;
}

/**
 * True when the response headers forbid embedding the page in a frame on
 * `origin` (the page that hosts the preview, production by default).
 */
export function blocksFraming(headers: Headers, origin: string = SITE_ORIGIN): boolean {
  const xfo = headers.get("x-frame-options");
  if (xfo && /deny|sameorigin/i.test(xfo)) return true;

  const csp = headers.get("content-security-policy");
  const ancestors = csp?.match(/frame-ancestors([^;]*)/i)?.[1].trim();
  if (ancestors !== undefined) {
    let embedder: URL;
    try {
      embedder = new URL(origin);
    } catch {
      return true;
    }
    return !ancestors.split(/\s+/).some((source) => sourceAllows(source, embedder));
  }
  return false;
}

/** Pulls og:image / twitter:image out of the page head, resolved against the page URL. */
export function findSocialImage(html: string, pageUrl: string): string | null {
  const head = html.slice(0, 64_000);
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1].toLowerCase();
    if (key !== "og:image" && key !== "twitter:image") continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!content) continue;
    try {
      return new URL(content, pageUrl).toString();
    } catch {
      // ignore a malformed URL
    }
  }
  return null;
}

/** GitHub's generated social card; any path segment busts its cache. */
export function githubCard(fullName: string, pushedAt: string): string {
  return `https://opengraph.githubassets.com/${Date.parse(pushedAt) || 0}/${fullName}`;
}

// ---- Code maps -----------------------------------------------------------------

/** Extensions worth mapping; anything else (images, binaries, data) is left off. */
const LANGUAGES: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", pyi: "Python",
  rs: "Rust", go: "Go", java: "Java", kt: "Kotlin", kts: "Kotlin", scala: "Scala",
  swift: "Swift", m: "Objective-C", c: "C", h: "C", cc: "C++", cpp: "C++", hpp: "C++", cxx: "C++",
  cs: "C#", fs: "F#", rb: "Ruby", php: "PHP", lua: "Lua", zig: "Zig", nim: "Nim",
  ex: "Elixir", exs: "Elixir", erl: "Erlang", hs: "Haskell", ml: "OCaml", clj: "Clojure",
  dart: "Dart", jl: "Julia", r: "R", sol: "Solidity", move: "Move", cairo: "Cairo",
  sh: "Shell", bash: "Shell", zsh: "Shell", fish: "Shell", ps1: "PowerShell",
  html: "HTML", css: "CSS", scss: "CSS", sass: "CSS", less: "CSS",
  vue: "Vue", svelte: "Svelte", astro: "Astro",
  glsl: "Shader", wgsl: "Shader", hlsl: "Shader", frag: "Shader", vert: "Shader",
  sql: "SQL", graphql: "GraphQL", gql: "GraphQL", proto: "Protobuf",
  md: "Markdown", mdx: "Markdown", rst: "Markdown", tex: "TeX",
  json: "Config", yaml: "Config", yml: "Config", toml: "Config", ini: "Config", xml: "Config",
};

/** Build output, dependencies and tooling state: never the author's work. */
const IGNORED_DIRS = new Set([
  "node_modules", "vendor", "dist", "build", "out", "target", "coverage",
  "__pycache__", "venv", "env", "site-packages", "bower_components", "Pods",
]);

const LOCKFILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb", "Cargo.lock",
  "poetry.lock", "uv.lock", "Pipfile.lock", "composer.lock", "Gemfile.lock", "go.sum", "flake.lock",
]);

/** A tree entry as GitHub's recursive tree listing returns it. */
export interface TreeEntry {
  path: string;
  type: string;
  size?: number;
}

/** The language a mapped file counts toward, or null to leave it off the map. */
export function languageOf(path: string): string | null {
  const segments = path.split("/");
  const name = segments[segments.length - 1];
  // Dot-directories (.github, .vscode) and build/dependency trees say little about the project.
  if (segments.slice(0, -1).some((dir) => dir.startsWith(".") || IGNORED_DIRS.has(dir))) return null;
  if (LOCKFILES.has(name) || /\.min\.(js|css)$/.test(name) || /\.(map|snap)$/.test(name)) return null;
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  return LANGUAGES[ext] ?? null;
}

const MAP_GROUPS = 10;
const MAP_CHILDREN = 8;

interface Folder {
  bytes: number;
  files: number;
  langs: Map<string, number>;
  dirs: Map<string, Folder>;
  leaves: CodeMapNode[];
}

const folder = (): Folder => ({ bytes: 0, files: 0, langs: new Map(), dirs: new Map(), leaves: [] });

const dominant = (langs: Map<string, number>) =>
  [...langs].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

const bySize = (a: CodeMapNode, b: CodeMapNode) => b.bytes - a.bytes || a.name.localeCompare(b.name);

/** Keeps the largest nodes and folds the rest into one "+N" plot. */
function capNodes(nodes: CodeMapNode[], max: number): CodeMapNode[] {
  const sorted = [...nodes].sort(bySize);
  if (sorted.length <= max) return sorted;
  const rest = sorted.slice(max - 1);
  const langs = new Map<string, number>();
  for (const node of rest) if (node.lang) langs.set(node.lang, (langs.get(node.lang) ?? 0) + node.bytes);
  return [
    ...sorted.slice(0, max - 1),
    {
      name: `+${rest.length}`,
      bytes: rest.reduce((sum, node) => sum + node.bytes, 0),
      files: rest.reduce((sum, node) => sum + node.files, 0),
      lang: dominant(langs),
    },
  ];
}

const toNode = (name: string, dir: Folder): CodeMapNode => ({
  name: `${name}/`,
  bytes: dir.bytes,
  files: dir.files,
  lang: dominant(dir.langs),
});

/**
 * Folds a recursive tree listing into a two-level map: the top directories
 * (and loose files) of the project, each with its largest children. When
 * every file sits under one directory, that directory becomes the base, so
 * a repo whose code all lives in src/ maps src/'s structure instead.
 */
export function buildCodeMap(entries: TreeEntry[], truncated = false): CodeMap | null {
  let files = entries.flatMap((entry) => {
    if (entry.type !== "blob" || !entry.size) return [];
    const lang = languageOf(entry.path);
    return lang ? [{ parts: entry.path.split("/"), size: entry.size, lang }] : [];
  });
  if (!files.length) return null;

  let base = "";
  for (let depth = 0; depth < 3; depth++) {
    const first = files[0].parts[0];
    if (!files.every((file) => file.parts.length > 1 && file.parts[0] === first)) break;
    base += `${first}/`;
    files = files.map((file) => ({ ...file, parts: file.parts.slice(1) }));
  }

  const root = folder();
  for (const { parts, size, lang } of files) {
    const add = (dir: Folder) => {
      dir.bytes += size;
      dir.files += 1;
      dir.langs.set(lang, (dir.langs.get(lang) ?? 0) + size);
    };
    add(root);
    if (parts.length === 1) {
      root.leaves.push({ name: parts[0], bytes: size, files: 1, lang });
      continue;
    }
    let top = root.dirs.get(parts[0]);
    if (!top) root.dirs.set(parts[0], (top = folder()));
    add(top);
    if (parts.length === 2) {
      top.leaves.push({ name: parts[1], bytes: size, files: 1, lang });
      continue;
    }
    let child = top.dirs.get(parts[1]);
    if (!child) top.dirs.set(parts[1], (child = folder()));
    add(child);
  }

  const nodes = [
    ...[...root.dirs].map(([name, dir]) => ({
      ...toNode(name, dir),
      children: capNodes([...[...dir.dirs].map(([n, d]) => toNode(n, d)), ...dir.leaves], MAP_CHILDREN),
    })),
    ...root.leaves,
  ];

  return {
    base,
    files: root.files,
    bytes: root.bytes,
    truncated,
    languages: [...root.langs].map(([name, bytes]) => ({ name, bytes })).sort((a, b) => b.bytes - a.bytes),
    nodes: capNodes(nodes, MAP_GROUPS),
  };
}

async function codeMapFor(
  repo: GithubRepo,
  headers: Record<string, string>,
  fetchImpl: Fetch,
): Promise<CodeMap | null> {
  if (!repo.default_branch || repo.size === 0) return null;
  try {
    const response = await fetchImpl(
      `${GITHUB_API}/repos/${repo.full_name}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`,
      { headers, signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { tree?: TreeEntry[]; truncated?: boolean };
    return Array.isArray(body.tree) ? buildCodeMap(body.tree, Boolean(body.truncated)) : null;
  } catch {
    return null;
  }
}

/** A short first paragraph pulls in the next one; past this it stands alone. */
const SUMMARY_TARGET = 100;
/** A card shows a line or two, not the README's whole pitch. */
const SUMMARY_MAX = 280;

/** Inline markdown down to plain text: images gone, links to their label. */
function plainInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sentence ends: a stop followed by whitespace or the end of the text. */
const SENTENCE_END = /[.!?](?=\s|$)/g;

/**
 * Whole sentences only, never a trailing "…": the last sentence end inside
 * the limit, else the first sentence however long, else the text as is.
 */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const ends = [...text.matchAll(SENTENCE_END)].map((match) => (match.index ?? 0) + 1);
  const fits = ends.filter((end) => end <= max);
  if (fits.length) return text.slice(0, fits[fits.length - 1]);
  return ends.length ? text.slice(0, ends[0]) : text;
}

/**
 * The README's opening prose, as written: the first paragraph after the
 * title (a short one pulls in the next), skipping badges, images, HTML
 * banners, code, tables, lists and callouts. A blockquote tagline counts.
 * Clipped to whole sentences.
 */
export function readmeSummary(markdown: string, repoName: string): string | null {
  const blocks = markdown
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, "")
    .split(/\n\s*\n/);

  const paragraphs: string[] = [];
  for (const raw of blocks) {
    let block = raw.trim();
    // "> A tagline." reads as prose; "> [!NOTE]" callouts do not.
    if (block.startsWith(">")) {
      if (/^>\s*\[!/.test(block)) continue;
      block = block.replace(/^>\s?/gm, "").trim();
    }
    if (!block || /^(#|\||[-*+] |\d+[.)] |---|===|\[!\[|!\[|<)/.test(block)) continue;
    const text = plainInline(block);
    if (text.length < 40) continue; // badge rows, taglines that only repeat the name
    if (text.toLowerCase() === repoName.toLowerCase()) continue;
    paragraphs.push(text);
    if (paragraphs.join(" ").length >= SUMMARY_TARGET || paragraphs.length === 2) break;
  }
  return paragraphs.length ? clip(paragraphs.join(" "), SUMMARY_MAX) : null;
}

async function readmeFor(
  repo: GithubRepo,
  headers: Record<string, string>,
  fetchImpl: Fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(`${GITHUB_API}/repos/${repo.full_name}/readme`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { content?: string; encoding?: string };
    if (typeof body.content !== "string" || body.encoding !== "base64") return null;
    return Buffer.from(body.content, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * The best preview the live site allows, or null when the deployment is gone:
 * the host does not resolve or refuses, or the page answers 404/410. A slow
 * site, or a 403/5xx (often bot protection against our fetch), is still
 * framed: the visitor's browser can load what this request could not.
 */
async function previewFor(
  liveUrl: string,
  fallback: RepoPreview,
  fetchImpl: Fetch,
  origin: string,
): Promise<RepoPreview | null> {
  try {
    const response = await fetchImpl(liveUrl, {
      redirect: "follow",
      headers: { accept: "text/html", "user-agent": "kygra-portfolio-showcase" },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok) return { kind: "frame", src: liveUrl };
    if (!blocksFraming(response.headers, origin)) return { kind: "frame", src: response.url || liveUrl };
    const image = findSocialImage(await response.text(), response.url || liveUrl);
    return image ? { kind: "image", src: image } : fallback;
  } catch (error) {
    return error instanceof Error && error.name === "TimeoutError" ? { kind: "frame", src: liveUrl } : null;
  }
}

export async function buildShowcase({
  user,
  showcase = SHOWCASE,
  token,
  limit = showcase.length,
  now = new Date(),
  fetchImpl = fetch,
  origin = SITE_ORIGIN,
}: ShowcaseOptions): Promise<Showcase> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "kygra-portfolio-showcase",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  // A token reads the owner's own listing, private repos included; without
  // one only the public listing is reachable.
  const listing = token
    ? `${GITHUB_API}/user/repos?affiliation=owner&visibility=all&sort=pushed&per_page=100`
    : `${GITHUB_API}/users/${encodeURIComponent(user)}/repos?type=owner&sort=pushed&per_page=100`;
  const response = await fetchImpl(listing, { headers });
  if (!response.ok) {
    throw new Error(`GitHub responded ${response.status} for ${user}'s repositories`);
  }

  // Every deployment is checked first. A repo whose site answers keeps that
  // preview; a public one with no site, or a site that is gone, becomes a
  // code-only card whose map is fetched below. Listed private repos without a
  // site become code-only cards as well, with no source link.
  type Candidate = { repo: GithubRepo; liveUrl: string | null; card: string | null; preview: RepoPreview | null };
  const ranked = rankRepos((await response.json()) as GithubRepo[], showcase);
  const candidates = await Promise.all(
    ranked.map(async (repo): Promise<Candidate> => {
      const card = repo.private ? null : githubCard(repo.full_name, repo.pushed_at);
      const liveUrl = liveUrlFor(repo, user);
      if (liveUrl) {
        const fallback: RepoPreview = card ? { kind: "image", src: card } : { kind: "none" };
        const preview = await previewFor(liveUrl, fallback, fetchImpl, origin);
        if (preview) return { repo, liveUrl, card, preview };
      }
      return { repo, liveUrl: null, card, preview: null };
    }),
  );

  // Maps only for the repos that can still make the page: fill the cap in
  // rank order, and when a repo has nothing to map (empty, binary-only),
  // the next one takes its place.
  const kept: (Candidate & { preview: RepoPreview })[] = [];
  let queue = candidates;
  while (kept.length < limit && queue.length) {
    const batch = queue.slice(0, limit - kept.length);
    queue = queue.slice(batch.length);
    const resolved = await Promise.all(
      batch.map(async (candidate) => {
        if (candidate.preview) return { ...candidate, preview: candidate.preview };
        const map = await codeMapFor(candidate.repo, headers, fetchImpl);
        return map ? { ...candidate, preview: { kind: "map", map } as RepoPreview } : null;
      }),
    );
    kept.push(...resolved.filter((entry) => entry !== null));
  }

  // READMEs only for the repos that make the page.
  const repos = await Promise.all(
    kept.map(async ({ repo, liveUrl, card, preview }): Promise<ShowcaseRepo> => {
      const readme = await readmeFor(repo, headers, fetchImpl);
      return {
        name: repo.name,
        fullName: repo.full_name,
        description: (readme && readmeSummary(readme, repo.name)) ?? repo.description,
        url: repo.html_url,
        liveUrl,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        topics: (repo.topics ?? []).filter((topic) => !INTERNAL_TOPICS.has(topic)),
        pushedAt: repo.pushed_at,
        archived: repo.archived,
        private: repo.private,
        card,
        preview,
      };
    }),
  );

  return { user, generatedAt: now.toISOString(), repos };
}

/** GitHub account whose repositories make up the software index. */
const GITHUB_USER = process.env.GITHUB_USER?.trim() || "kygura";

/**
 * Optional token for the GitHub API, needed for private repos (read access to
 * metadata and contents). Without it requests share a 60/hour limit per IP;
 * the CDN cache keeps the index well under that either way.
 */
const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim() || null;

// ---- Handler -------------------------------------------------------------------
// This file imports no sibling modules (packages are fine): Vercel compiles
// each function to .js but keeps `.ts` import specifiers, so a relative
// import fails at runtime.

export const runtime = "nodejs";

/**
 * The origin the request was made from, so a preview deployment checks
 * framing against its own host and not production's. The CDN keys its cache
 * on the host, so each deployment gets its own copy.
 */
function requestOrigin(request: Request | undefined): string {
  if (!request) return SITE_ORIGIN;
  try {
    return new URL(request.url).origin;
  } catch {
    return SITE_ORIGIN;
  }
}

/**
 * The CDN holds a response for an hour and serves the stale copy for a day
 * while it refreshes, so GitHub sees a handful of requests whatever the
 * traffic.
 */
export async function GET(request?: Request): Promise<Response> {
  try {
    const showcase = await buildShowcase({
      user: GITHUB_USER,
      token: GITHUB_TOKEN,
      origin: requestOrigin(request),
    });
    return Response.json(showcase, {
      headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    console.error("Failed to build the software index", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load repositories" },
      { status: 502, headers: { "cache-control": "public, s-maxage=60" } },
    );
  }
}
