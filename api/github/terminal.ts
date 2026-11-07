import Anthropic from "@anthropic-ai/sdk";
import { get as getBlob, put as putBlob } from "@vercel/blob";

/**
 * GET /api/github/terminal?repo=<name> — a short terminal session for a
 * code-only card, scripted by Claude from the repo's README, manifests and
 * entry point the first time someone asks for it. Sessions are cached by the
 * repo's tree SHA (in memory and in Vercel Blob), so each commit costs at
 * most one model call however many visitors press play. The output is
 * illustrative and the card says so.
 */

const GITHUB_API = "https://api.github.com";

/** Mirrors the index's hide topic: a hidden repo has no session either. */
const HIDE_TOPIC = "portfolio-hide";

/** Mirrors the index's SHOWCASE_INCLUDE / SHOWCASE_EXCLUDE lists (see repos.ts). */
export interface RepoFilter {
  include: Set<string>;
  exclude: Set<string>;
}

export function parseRepoList(value: string | null | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(/[\s,]+/)
      .map((entry) => entry.trim().toLowerCase().split("/").pop() ?? "")
      .filter(Boolean),
  );
}

const NO_FILTER: RepoFilter = { include: new Set(), exclude: new Set() };

type Fetch = typeof fetch;

export interface TerminalStep {
  /** "$" for a shell, ">>>" or ">" inside a REPL. */
  prompt: string;
  command: string;
  output: string[];
}

export interface TerminalSession {
  repo: string;
  /** Tree SHA the session was written from. */
  sha: string;
  /** Empty when the source gives no honest way to show the project running. */
  steps: TerminalStep[];
}

/** The repo material the model writes from. */
export interface RepoSource {
  name: string;
  description: string | null;
  sha: string;
  paths: string[];
  /** Path → text, for the README, manifests and one entry file. */
  files: Record<string, string>;
}

/** Writes the steps for a source, or null when the model call failed. */
export type Script = (source: RepoSource) => Promise<TerminalStep[] | null>;

// ---- Gathering the source ------------------------------------------------------

/** Same exclusions as the code map: build output and dependencies are not the project. */
const IGNORED_DIRS = new Set([
  "node_modules", "vendor", "dist", "build", "out", "target", "coverage",
  "__pycache__", "venv", "env", "site-packages", "bower_components", "Pods",
]);

/** Root files that say how a project is run, in the order worth reading them. */
const MANIFESTS = [
  "package.json", "Cargo.toml", "pyproject.toml", "go.mod", "setup.py", "deno.json",
  "Makefile", "justfile", "composer.json", "Gemfile", "build.zig", "mix.exs",
];

const ENTRY = /(^|\/)(main|cli|index|app|lib|__main__|mod)\.(ts|js|mjs|py|rs|go|rb|zig|ex)$/;

const MAX_PATHS = 400;
const MAX_MANIFESTS = 3;
const README_CHARS = 20_000;
const FILE_CHARS = 8_000;

const visible = (path: string) =>
  !path.split("/").slice(0, -1).some((dir) => dir.startsWith(".") || IGNORED_DIRS.has(dir));

/** The shallowest likely entry point, preferring src/ and bin/ at equal depth. */
export function pickEntry(paths: string[]): string | null {
  const depth = (path: string) => path.split("/").length - (/^(src|bin|cmd)\//.test(path) ? 0.5 : 0);
  return paths.filter((path) => ENTRY.test(path)).sort((a, b) => depth(a) - depth(b) || a.length - b.length)[0] ?? null;
}

async function rawFile(
  fullName: string,
  path: string,
  headers: Record<string, string>,
  fetchImpl: Fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(`${GITHUB_API}/repos/${fullName}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
      headers: { ...headers, accept: "application/vnd.github.raw+json" },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

/** Thrown for a repo the endpoint will not script: unknown, private, forked or hidden. */
export class NotScriptable extends Error {}

/** A repo the endpoint will script, located but not yet read. */
export interface LocatedRepo {
  fullName: string;
  sha: string;
  /** Reads the README, up to three manifests and one entry file. */
  read: () => Promise<RepoSource>;
}

/**
 * The owner's own public repo at its default branch. Only the metadata and
 * tree are fetched here; the files wait until a session has to be written.
 */
export async function locateRepo(
  user: string,
  name: string,
  token: string | null,
  fetchImpl: Fetch = fetch,
  filter: RepoFilter = NO_FILTER,
): Promise<LocatedRepo> {
  // Checked before any request, so a left-out repo's name gets the same
  // answer as one that does not exist.
  const key = name.toLowerCase();
  if (filter.exclude.has(key)) {
    throw new NotScriptable(`No repository named ${name}`);
  }
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "kygra-portfolio-showcase",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  const fullName = `${user}/${name}`;
  const meta = await fetchImpl(`${GITHUB_API}/repos/${fullName}`, { headers });
  if (meta.status === 404) throw new NotScriptable(`No repository named ${name}`);
  if (!meta.ok) throw new Error(`GitHub responded ${meta.status} for ${fullName}`);
  const repo = (await meta.json()) as {
    owner?: { login?: string };
    private?: boolean;
    fork?: boolean;
    topics?: string[];
    default_branch?: string;
    description?: string | null;
  };
  if (
    repo.owner?.login?.toLowerCase() !== user.toLowerCase() ||
    repo.private ||
    repo.fork ||
    repo.topics?.includes(HIDE_TOPIC) ||
    !repo.default_branch
  ) {
    throw new NotScriptable(`No repository named ${name}`);
  }

  const treeResponse = await fetchImpl(
    `${GITHUB_API}/repos/${fullName}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`,
    { headers, signal: AbortSignal.timeout(8000) },
  );
  if (!treeResponse.ok) throw new Error(`GitHub responded ${treeResponse.status} for ${fullName}'s tree`);
  const tree = (await treeResponse.json()) as { sha: string; tree?: { path: string; type: string }[] };
  const paths = (tree.tree ?? []).filter((entry) => entry.type === "blob" && visible(entry.path)).map((entry) => entry.path);

  const read = async (): Promise<RepoSource> => {
    const readmePath = paths.find((path) => /^readme(\.(md|mdx|rst|txt))?$/i.test(path));
    const manifests = MANIFESTS.filter((file) => paths.includes(file)).slice(0, MAX_MANIFESTS);
    const entry = pickEntry(paths);
    const wanted = [readmePath, ...manifests, entry].filter((path): path is string => Boolean(path));
    const texts = await Promise.all(wanted.map((path) => rawFile(fullName, path, headers, fetchImpl)));

    const files: Record<string, string> = {};
    wanted.forEach((path, i) => {
      const text = texts[i];
      if (text) files[path] = text.slice(0, path === readmePath ? README_CHARS : FILE_CHARS);
    });
    return { name, description: repo.description ?? null, sha: tree.sha, paths: paths.slice(0, MAX_PATHS), files };
  };

  return { fullName, sha: tree.sha, read };
}

// ---- Scripting the session -----------------------------------------------------

const SCRIPT_MODEL = "claude-opus-5-5";

const SCRIPT_SYSTEM = [
  "You script a short terminal session that shows a software project working, for a card on its author's portfolio page.",
  "Visitors watch it replay; nobody types. Ground every command in the material given:",
  "use the commands, scripts, CLI flags, entry points and APIs that the README, manifests and source actually show.",
  "Never invent flags, subcommands, endpoints or features the material does not support.",
  "Output is illustrative, but it must be what this code would plausibly print: modest, consistent numbers,",
  "no benchmarks or results the README does not claim, no secrets, tokens, keys or personal data.",
  "Write 2 to 5 steps. Show the project doing its job rather than setting up: skip cloning and dependency installs",
  "unless installing is the point. For a library, import it in a REPL or run a short script that calls it.",
  "Each step has a prompt ('$' for a shell, '>>>' or '>' inside a REPL), one command line, and its output lines.",
  "Keep lines under 72 characters and each output under 12 lines; elide long output with a single '…' line.",
  "If the material gives no honest way to show the project running, return an empty steps list.",
].join(" ");

/** Bump when the prompt or schema changes, so cached sessions are written afresh. */
const SCRIPT_VERSION = "v1";

const SESSION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["steps"],
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prompt", "command", "output"],
        properties: {
          prompt: { type: "string" },
          command: { type: "string" },
          output: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const MAX_STEPS = 5;
const MAX_LINES = 12;
const MAX_WIDTH = 96;

const clipLine = (line: string) => (line.length > MAX_WIDTH ? `${line.slice(0, MAX_WIDTH - 1)}…` : line);

/** Holds the model to the card's bounds, whatever it returned. */
export function tidySteps(raw: unknown): TerminalStep[] {
  const steps = (raw as { steps?: unknown })?.steps;
  if (!Array.isArray(steps)) return [];
  return steps.slice(0, MAX_STEPS).flatMap((step) => {
    const { prompt, command, output } = (step ?? {}) as Partial<TerminalStep>;
    if (typeof command !== "string" || !command.trim()) return [];
    const lines = Array.isArray(output) ? output.filter((line): line is string => typeof line === "string") : [];
    return [
      {
        prompt: typeof prompt === "string" && prompt.trim() && prompt.length <= 8 ? prompt.trim() : "$",
        command: clipLine(command.split("\n")[0].trim()),
        output: (lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES - 1), "…"] : lines).map((line) =>
          clipLine(line.replace(/\s+$/, "")),
        ),
      },
    ];
  });
}

export function sourcePrompt(source: RepoSource): string {
  const files = Object.entries(source.files)
    .map(([path, text]) => `<file path="${path}">\n${text}\n</file>`)
    .join("\n\n");
  return [
    `Project: ${source.name}`,
    source.description ? `About: ${source.description}` : null,
    `<tree>\n${source.paths.join("\n")}\n</tree>`,
    files,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function createScripter({
  apiKey,
  client = new Anthropic({ apiKey }),
}: {
  apiKey: string;
  client?: Pick<Anthropic, "beta">;
}): Script {
  return async (source) => {
    try {
      const response = await client.beta.messages.create({
        model: SCRIPT_MODEL,
        max_tokens: 8000,
        output_config: { effort: "low", format: { type: "json_schema", schema: SESSION_SCHEMA } },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SCRIPT_SYSTEM,
        messages: [{ role: "user", content: sourcePrompt(source) }],
      });
      if (response.stop_reason !== "end_turn") return null;
      const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
      return tidySteps(JSON.parse(text));
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        console.warn(`Terminal script failed for ${source.name}: ${error.status}`, error.message);
      } else {
        console.warn(`Terminal script failed for ${source.name}`, error);
      }
      return null;
    }
  };
}

interface SessionStoreOptions {
  script: Script;
  blobToken?: string | null;
  blobAccess?: "public" | "private";
}

/**
 * Sessions keyed by repo and tree SHA: in memory for the warm instance and in
 * Vercel Blob across deploys. An empty session is cached too, so a repo the
 * model found nothing to show for is not asked again until it changes. A
 * failed call is not cached and is retried on the next request.
 */
export function createSessionStore({ script, blobToken, blobAccess = "public" }: SessionStoreOptions) {
  const memo = new Map<string, Promise<TerminalStep[] | null>>();

  const fromBlob = async (key: string): Promise<TerminalStep[] | null> => {
    if (!blobToken) return null;
    try {
      const hit = await getBlob(key, { access: blobAccess, token: blobToken });
      return hit ? tidySteps(JSON.parse(await new Response(hit.stream).text())) : null;
    } catch {
      return null;
    }
  };

  const toBlob = async (key: string, steps: TerminalStep[]) => {
    if (!blobToken) return;
    try {
      await putBlob(key, JSON.stringify({ steps }), {
        access: blobAccess,
        token: blobToken,
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    } catch (error) {
      console.warn("Could not cache a terminal session", error);
    }
  };

  return ({ fullName, sha, read }: LocatedRepo) => {
    const key = `showcase/terminal/${SCRIPT_VERSION}/${fullName}/${sha}.json`;
    let pending = memo.get(key);
    if (!pending) {
      pending = (async () => {
        const cached = await fromBlob(key);
        if (cached) return cached;
        const fresh = await script(await read());
        if (fresh) await toBlob(key, fresh);
        return fresh;
      })();
      memo.set(key, pending);
      pending.then(
        (value) => value ?? memo.delete(key),
        () => memo.delete(key),
      );
    }
    return pending;
  };
}

// ---- Handler -------------------------------------------------------------------
// No sibling imports: Vercel keeps `.ts` specifiers in compiled functions.

const GITHUB_USER = process.env.GITHUB_USER?.trim() || "kygura";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim() || null;
const FILTER: RepoFilter = {
  include: parseRepoList(process.env.SHOWCASE_INCLUDE),
  exclude: parseRepoList(process.env.SHOWCASE_EXCLUDE),
};
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() || null;

const sessions = ANTHROPIC_API_KEY
  ? createSessionStore({
      script: createScripter({ apiKey: ANTHROPIC_API_KEY }),
      blobToken: process.env.BLOB_READ_WRITE_TOKEN?.trim() || process.env.NOTION_SYNC_READ_WRITE_TOKEN?.trim() || null,
      blobAccess: process.env.BLOB_ACCESS === "private" ? "private" : "public",
    })
  : null;

export const runtime = "nodejs";

const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * The client adds the repo's push time to the URL, so the CDN copy (a day,
 * stale for a week) turns over when the repo does.
 */
export async function handleTerminal(
  request: Request,
  store: ReturnType<typeof createSessionStore> | null,
  {
    user = GITHUB_USER,
    token = GITHUB_TOKEN,
    filter = FILTER,
    fetchImpl = fetch,
  }: { user?: string; token?: string | null; filter?: RepoFilter; fetchImpl?: Fetch } = {},
): Promise<Response> {
  const name = new URL(request.url).searchParams.get("repo") ?? "";
  if (!REPO_NAME.test(name) || name.startsWith(".")) {
    return Response.json({ error: "Unknown repository" }, { status: 400 });
  }
  if (!store) {
    return Response.json({ error: "Terminal sessions are not configured" }, { status: 503 });
  }
  try {
    const located = await locateRepo(user, name, token, fetchImpl, filter);
    const steps = await store(located);
    if (!steps) {
      return Response.json(
        { error: "Could not write a session right now" },
        { status: 502, headers: { "cache-control": "no-store" } },
      );
    }
    const session: TerminalSession = { repo: name, sha: located.sha, steps };
    return Response.json(session, {
      headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (error) {
    if (error instanceof NotScriptable) {
      return Response.json({ error: error.message }, { status: 404, headers: { "cache-control": "public, s-maxage=3600" } });
    }
    console.error(`Failed to build a terminal session for ${name}`, error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to build a session" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}

export function GET(request: Request): Promise<Response> {
  return handleTerminal(request, sessions);
}
