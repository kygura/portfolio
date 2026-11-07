import Anthropic from "@anthropic-ai/sdk";
import { get as getBlob, put as putBlob } from "@vercel/blob";

/**
 * GET /api/github/repos — the software index, built from the GitHub API: the
 * owner's repositories ranked by stars and recent pushes. Repos with a working
 * live site (private ones too, given a token that can read them) get the best
 * preview it allows (an embedded frame, its og:image, or GitHub's generated
 * social card); public repos without one get a map of their source tree.
 */

const GITHUB_API = "https://api.github.com";

/** Repos tagged with this topic never appear in the index. */
export const HIDE_TOPIC = "portfolio-hide";

/** Optional: repos tagged with this topic rank ahead of the rest. */
export const FLAGSHIP_TOPIC = "flagship";

/** Bookkeeping topics that steer the index but say nothing to a visitor. */
const INTERNAL_TOPICS = new Set([HIDE_TOPIC, FLAGSHIP_TOPIC]);

/**
 * Which repos may appear, set in the environment so the names stay out of
 * this public repo. Public repos appear by default; `exclude` (and the hide
 * topic) keeps one off the page. `include` opts private repos in: listed,
 * they appear even without a live site, as a code map with no source link.
 * Exclude always wins.
 */
export interface RepoFilter {
  include: Set<string>;
  exclude: Set<string>;
}

/** "a, b c\nowner/d" → {"a", "b", "c", "d"}: commas or whitespace, owner prefix and case ignored. */
export function parseRepoList(value: string | null | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(/[\s,]+/)
      .map((entry) => entry.trim().toLowerCase().split("/").pop() ?? "")
      .filter(Boolean),
  );
}

/** True when the filter lets this repo name onto the page (exclude only: public repos are in by default). */
export function isListed(name: string, filter: RepoFilter): boolean {
  return !filter.exclude.has(name.toLowerCase());
}

/** True when a private repo was opted in by name, so it may show without a live site. */
export function isOptedIn(name: string, filter: RepoFilter): boolean {
  const key = name.toLowerCase();
  return filter.include.has(key) && !filter.exclude.has(key);
}

const NO_FILTER: RepoFilter = { include: new Set(), exclude: new Set() };

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
  /** Haiku's short take on the README, else its opening prose, else the "About" line. */
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

/** A README as GitHub serves it: the blob SHA changes whenever the text does. */
export interface Readme {
  sha: string;
  text: string;
}

/** Turns a README into a short description, or null to fall back to the excerpt. */
export type Describe = (repo: GithubRepo, readme: Readme) => Promise<string | null>;

interface ShowcaseOptions {
  /** Optional model-written descriptions; without it cards use the README excerpt. */
  describe?: Describe | null;
  user: string;
  /** The repo this site deploys from, left out so the page never frames itself. */
  selfRepo?: string | null;
  filter?: RepoFilter;
  token?: string | null;
  limit?: number;
  now?: Date;
  fetchImpl?: Fetch;
}

const DAY_MS = 86_400_000;

/**
 * Stars count in full; a push in the last few weeks is worth a handful of
 * stars and fades over about two months, so a busy new repo can sit beside
 * an older starred one.
 */
export function scoreRepo(repo: GithubRepo, now: Date): number {
  const days = Math.max(0, (now.getTime() - Date.parse(repo.pushed_at)) / DAY_MS);
  return repo.stargazers_count + 6 * Math.exp(-days / 60);
}

const hasTopic = (repo: GithubRepo, topic: string) => (repo.topics ?? []).includes(topic);

/**
 * Every repo of the owner's own, minus forks, archived repos, hidden repos,
 * repos the filter leaves out, the profile README repo and this site's own repo. Flagship
 * repos lead; stars and recency order the rest.
 */
export function rankRepos(
  repos: GithubRepo[],
  user: string,
  now: Date,
  limit: number,
  selfRepo?: string | null,
  filter: RepoFilter = NO_FILTER,
): GithubRepo[] {
  const skip = new Set([user.toLowerCase(), selfRepo?.toLowerCase()]);
  return repos
    .filter(
      (repo) =>
        !repo.fork &&
        !repo.archived &&
        !hasTopic(repo, HIDE_TOPIC) &&
        !skip.has(repo.name.toLowerCase()) &&
        isListed(repo.name, filter),
    )
    .sort(
      (a, b) =>
        Number(hasTopic(b, FLAGSHIP_TOPIC)) - Number(hasTopic(a, FLAGSHIP_TOPIC)) ||
        scoreRepo(b, now) - scoreRepo(a, now) ||
        b.pushed_at.localeCompare(a.pushed_at),
    )
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

/** True when the response headers forbid embedding the page in our frame. */
export function blocksFraming(headers: Headers): boolean {
  const xfo = headers.get("x-frame-options");
  if (xfo && /deny|sameorigin/i.test(xfo)) return true;

  const csp = headers.get("content-security-policy");
  const ancestors = csp?.match(/frame-ancestors([^;]*)/i)?.[1].trim();
  if (ancestors !== undefined) {
    // Anything short of a wildcard would need our exact origin listed.
    return !ancestors.split(/\s+/).some((source) => source === "*" || source === "https:");
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

const SUMMARY_TARGET = 280;
const SUMMARY_MAX = 600;

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

/** Model output past the word cap keeps its opening sentence, which stands alone. */
export function capWords(text: string, maxWords: number): string {
  if (text.split(/\s+/).length <= maxWords) return text;
  const first = text.match(/^.*?[.!?](?=\s|$)/s)?.[0];
  return first ?? text;
}

/**
 * The README's opening prose: paragraphs after the title, skipping badges,
 * images, HTML banners, code, tables, quotes and lists, until there is
 * enough to read as a description.
 */
export function readmeSummary(markdown: string, repoName: string): string | null {
  const blocks = markdown
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, "")
    .split(/\n\s*\n/);

  const paragraphs: string[] = [];
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block || /^(#|>|\||[-*+] |\d+[.)] |---|===|\[!\[|!\[|<)/.test(block)) continue;
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
): Promise<Readme | null> {
  try {
    const response = await fetchImpl(`${GITHUB_API}/repos/${repo.full_name}/readme`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { sha?: string; content?: string; encoding?: string };
    if (!body.sha || typeof body.content !== "string" || body.encoding !== "base64") return null;
    return { sha: body.sha, text: Buffer.from(body.content, "base64").toString("utf8") };
  } catch {
    return null;
  }
}

// ---- Model-written descriptions ------------------------------------------------

const DESCRIBE_MODEL = "claude-haiku-5-5";

/** Long READMEs are cut here to bound cost; the opening is what describes a project. */
const README_CHAR_LIMIT = 40_000;

const DESCRIBE_SYSTEM = [
  "You write the description line for a software project on a developer's portfolio page.",
  "The project's name is already shown as the card title, so never mention it; open with what the thing is,",
  "for example 'A personal market terminal that…' or 'An engine that…'.",
  "Reply with one or two plain sentences, 35 words at most, saying what the project is and what makes it interesting.",
  "Write for a curious visitor, not a contributor: no install steps, ports, commands, file paths or badges.",
  "No markdown, no quotes, no lead-in such as 'This project'.",
  "If the README says too little to describe the project, reply with exactly: SKIP",
].join(" ");

/** Bump when the prompt changes, so cached descriptions are written afresh. */
const DESCRIBE_VERSION = "v2";

interface DescriberOptions {
  apiKey: string;
  /** Vercel Blob read-write token; summaries persist there across deploys. */
  blobToken?: string | null;
  blobAccess?: "public" | "private";
  client?: Pick<Anthropic, "messages">;
}

/**
 * Haiku descriptions cached by README SHA: in memory for the warm instance,
 * and in Vercel Blob (when configured) so a redeploy or cold start reuses
 * them. Keys are immutable, so an entry is written once and only a changed
 * README triggers a new call. Any failure yields null and the card falls
 * back to the README excerpt.
 */
export function createDescriber({
  apiKey,
  blobToken,
  blobAccess = "public",
  client = new Anthropic({ apiKey }),
}: DescriberOptions): Describe {
  const memo = new Map<string, Promise<string | null>>();

  const fromBlob = async (key: string): Promise<string | null> => {
    if (!blobToken) return null;
    try {
      const hit = await getBlob(key, { access: blobAccess, token: blobToken });
      return hit ? (await new Response(hit.stream).text()).trim() || null : null;
    } catch {
      return null;
    }
  };

  const toBlob = async (key: string, text: string) => {
    if (!blobToken) return;
    try {
      await putBlob(key, text, {
        access: blobAccess,
        token: blobToken,
        contentType: "text/plain; charset=utf-8",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    } catch (error) {
      console.warn("Could not cache a project description", error);
    }
  };

  const generate = async (repo: GithubRepo, readme: Readme): Promise<string | null> => {
    try {
      const response = await client.messages.create({
        model: DESCRIBE_MODEL,
        max_tokens: 400,
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        system: DESCRIBE_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Project: ${repo.name}\n\n<readme>\n${readme.text.slice(0, README_CHAR_LIMIT)}\n</readme>`,
          },
        ],
      });
      if (response.stop_reason !== "end_turn") return null;
      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("")
        .trim();
      return text && text !== "SKIP" ? capWords(text, 40) : null;
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        console.warn(`Haiku description failed for ${repo.full_name}: ${error.status}`, error.message);
      } else {
        console.warn(`Haiku description failed for ${repo.full_name}`, error);
      }
      return null;
    }
  };

  return (repo, readme) => {
    const key = `showcase/descriptions/${DESCRIBE_VERSION}/${repo.full_name}/${readme.sha}.txt`;
    let pending = memo.get(key);
    if (!pending) {
      pending = (async () => {
        const cached = await fromBlob(key);
        if (cached) return capWords(cached, 40);
        const fresh = await generate(repo, readme);
        if (fresh) await toBlob(key, fresh);
        return fresh;
      })();
      memo.set(key, pending);
      // A failed attempt is retried on the next request rather than pinned.
      pending.then((value) => value ?? memo.delete(key));
    }
    return pending;
  };
}

/**
 * The best preview the live site allows, or null when the deployment is gone:
 * the host does not resolve or refuses, or the page answers 404/410. A slow
 * site, or a 403/5xx (often bot protection against our fetch), is still
 * framed: the visitor's browser can load what this request could not.
 */
async function previewFor(liveUrl: string, fallback: RepoPreview, fetchImpl: Fetch): Promise<RepoPreview | null> {
  try {
    const response = await fetchImpl(liveUrl, {
      redirect: "follow",
      headers: { accept: "text/html", "user-agent": "kygra-portfolio-showcase" },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok) return { kind: "frame", src: liveUrl };
    if (!blocksFraming(response.headers)) return { kind: "frame", src: response.url || liveUrl };
    const image = findSocialImage(await response.text(), response.url || liveUrl);
    return image ? { kind: "image", src: image } : fallback;
  } catch (error) {
    return error instanceof Error && error.name === "TimeoutError" ? { kind: "frame", src: liveUrl } : null;
  }
}

export async function buildShowcase({
  user,
  selfRepo,
  filter,
  describe,
  token,
  limit = 9,
  now = new Date(),
  fetchImpl = fetch,
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
  // code-only card whose map is fetched below. Private repos need a site
  // (visitors could open nothing else) unless SHOWCASE_INCLUDE opts them in.
  type Candidate = { repo: GithubRepo; liveUrl: string | null; card: string | null; preview: RepoPreview | null };
  const ranked = rankRepos((await response.json()) as GithubRepo[], user, now, Infinity, selfRepo, filter);
  const candidates = (
    await Promise.all(
      ranked.map(async (repo): Promise<Candidate | null> => {
        const card = repo.private ? null : githubCard(repo.full_name, repo.pushed_at);
        const liveUrl = liveUrlFor(repo, user);
        if (liveUrl) {
          const fallback: RepoPreview = card ? { kind: "image", src: card } : { kind: "none" };
          const preview = await previewFor(liveUrl, fallback, fetchImpl);
          if (preview) return { repo, liveUrl, card, preview };
        }
        return repo.private && !isOptedIn(repo.name, filter ?? NO_FILTER)
          ? null
          : { repo, liveUrl: null, card, preview: null };
      }),
    )
  ).filter((candidate): candidate is Candidate => candidate !== null);

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

  // READMEs (and any model calls) only for the repos that make the page.
  const repos = await Promise.all(
    kept.map(async ({ repo, liveUrl, card, preview }): Promise<ShowcaseRepo> => {
      const readme = await readmeFor(repo, headers, fetchImpl);
      const described = readme && describe ? await describe(repo, readme) : null;
      return {
        name: repo.name,
        fullName: repo.full_name,
        description: described ?? (readme && readmeSummary(readme.text, repo.name)) ?? repo.description,
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

/**
 * Haiku descriptions need ANTHROPIC_API_KEY. They persist in Vercel Blob when
 * a read-write token is set (BLOB_READ_WRITE_TOKEN, or the store the Notion
 * pipeline used); BLOB_ACCESS must match the store's access mode.
 */
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() || null;
const describe = ANTHROPIC_API_KEY
  ? createDescriber({
      apiKey: ANTHROPIC_API_KEY,
      blobToken: process.env.BLOB_READ_WRITE_TOKEN?.trim() || process.env.NOTION_SYNC_READ_WRITE_TOKEN?.trim() || null,
      blobAccess: process.env.BLOB_ACCESS === "private" ? "private" : "public",
    })
  : null;

/**
 * Public repos appear by default.
 * SHOWCASE_INCLUDE: private repos to show even without a live site.
 * SHOWCASE_EXCLUDE: these repos never appear, whatever else says so.
 * Both take names separated by commas or whitespace.
 */
const FILTER: RepoFilter = {
  include: parseRepoList(process.env.SHOWCASE_INCLUDE),
  exclude: parseRepoList(process.env.SHOWCASE_EXCLUDE),
};

// ---- Handler -------------------------------------------------------------------
// This file imports no sibling modules (packages are fine): Vercel compiles
// each function to .js but keeps `.ts` import specifiers, so a relative
// import fails at runtime.

export const runtime = "nodejs";

/**
 * The CDN holds a response for an hour and serves the stale copy for a day
 * while it refreshes, so GitHub sees a handful of requests whatever the
 * traffic.
 */
export async function GET(): Promise<Response> {
  try {
    const showcase = await buildShowcase({
      user: GITHUB_USER,
      token: GITHUB_TOKEN,
      describe,
      // Vercel's system env names the repo each deployment builds from.
      selfRepo: process.env.VERCEL_GIT_REPO_SLUG,
      filter: FILTER,
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
