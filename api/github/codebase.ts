import Anthropic from "@anthropic-ai/sdk";

/**
 * The "talk to the codebase" endpoint for one of the owner's public repos.
 *
 *   GET  /api/github/codebase?repo=<name>  the repo's file tree, pinned to a commit
 *   POST /api/github/codebase              { repo, messages } → an NDJSON stream of
 *                                          ChatEvents: the files Claude opens, then
 *                                          its answer as text deltas
 *
 * Claude gets the path list and README up front and opens files with a
 * read_file tool, so the page can follow along in its file viewer.
 */

const GITHUB_API = "https://api.github.com";
const RAW_GITHUB = "https://raw.githubusercontent.com";

/** Mirrors the index's hide topic: a hidden repo cannot be browsed either. */
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

export interface CodebaseEntry {
  path: string;
  size: number;
}

/** What the page needs to draw the tree and fetch files from GitHub's raw host. */
export interface Codebase {
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  branch: string;
  /** Commit SHA; raw file URLs use it so they never change under the page. */
  commit: string;
  pushedAt: string;
  /** Blobs only, sorted by path. Directories are implied. */
  entries: CodebaseEntry[];
  /** GitHub cut the listing short, or it passed MAX_ENTRIES. */
  truncated: boolean;
  /** Whether the chat is configured (it needs a model key). */
  chat: boolean;
}

/** Streamed to the page, one JSON object per line. */
export type ChatEvent =
  | { type: "read"; path: string; startLine?: number; endLine?: number }
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// ---- Locating the repo ---------------------------------------------------------

/** Build output and dependencies: never the author's work, and noise in a tree. */
const IGNORED_DIRS = new Set([
  "node_modules", "vendor", "dist", "build", "out", "target", "coverage",
  "__pycache__", "venv", "env", "site-packages", "bower_components", "Pods",
]);

const MAX_ENTRIES = 5000;

/** Dot-directories other than .github say little; build trees say nothing. */
export function isVisible(path: string): boolean {
  return !path
    .split("/")
    .slice(0, -1)
    .some((dir) => (dir.startsWith(".") && dir !== ".github") || IGNORED_DIRS.has(dir));
}

/** Thrown for a repo the endpoint will not open: unknown, private, forked or hidden. */
export class NotBrowsable extends Error {}

const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

function githubHeaders(token: string | null): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "kygra-portfolio-showcase",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

export async function locateCodebase(
  user: string,
  name: string,
  token: string | null,
  fetchImpl: Fetch = fetch,
  filter: RepoFilter = NO_FILTER,
): Promise<Omit<Codebase, "chat">> {
  // Checked before any request, so a left-out repo's name gets the same
  // answer as one that does not exist.
  const key = name.toLowerCase();
  if (!REPO_NAME.test(name) || name.startsWith(".")) throw new NotBrowsable(`No repository named ${name}`);
  if (filter.exclude.has(key) || (filter.include.size > 0 && !filter.include.has(key))) {
    throw new NotBrowsable(`No repository named ${name}`);
  }
  const headers = githubHeaders(token);
  const fullName = `${user}/${name}`;
  const meta = await fetchImpl(`${GITHUB_API}/repos/${fullName}`, { headers, signal: AbortSignal.timeout(8000) });
  if (meta.status === 404) throw new NotBrowsable(`No repository named ${name}`);
  if (!meta.ok) throw new Error(`GitHub responded ${meta.status} for ${fullName}`);
  const repo = (await meta.json()) as {
    name?: string;
    full_name?: string;
    owner?: { login?: string };
    private?: boolean;
    fork?: boolean;
    topics?: string[];
    default_branch?: string;
    description?: string | null;
    html_url?: string;
    pushed_at?: string;
  };
  if (
    repo.owner?.login?.toLowerCase() !== user.toLowerCase() ||
    repo.private ||
    repo.fork ||
    repo.topics?.includes(HIDE_TOPIC) ||
    !repo.default_branch
  ) {
    throw new NotBrowsable(`No repository named ${name}`);
  }
  const branch = repo.default_branch;

  const branchResponse = await fetchImpl(`${GITHUB_API}/repos/${fullName}/branches/${encodeURIComponent(branch)}`, {
    headers,
    signal: AbortSignal.timeout(8000),
  });
  if (!branchResponse.ok) throw new Error(`GitHub responded ${branchResponse.status} for ${fullName}'s branch`);
  const commit = ((await branchResponse.json()) as { commit?: { sha?: string } }).commit?.sha;
  if (!commit) throw new Error(`No commit for ${fullName}'s ${branch}`);

  const treeResponse = await fetchImpl(`${GITHUB_API}/repos/${fullName}/git/trees/${commit}?recursive=1`, {
    headers,
    signal: AbortSignal.timeout(8000),
  });
  if (!treeResponse.ok) throw new Error(`GitHub responded ${treeResponse.status} for ${fullName}'s tree`);
  const tree = (await treeResponse.json()) as {
    tree?: { path: string; type: string; size?: number }[];
    truncated?: boolean;
  };
  const blobs = (tree.tree ?? [])
    .filter((entry) => entry.type === "blob" && isVisible(entry.path))
    .map((entry) => ({ path: entry.path, size: entry.size ?? 0 }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    name: repo.name ?? name,
    fullName: repo.full_name ?? fullName,
    description: repo.description ?? null,
    url: repo.html_url ?? `https://github.com/${fullName}`,
    branch,
    commit,
    pushedAt: repo.pushed_at ?? new Date(0).toISOString(),
    entries: blobs.slice(0, MAX_ENTRIES),
    truncated: Boolean(tree.truncated) || blobs.length > MAX_ENTRIES,
  };
}

/** Located repos stay warm for ten minutes, so a conversation re-asks GitHub once. */
const LOCATE_TTL = 10 * 60_000;

function createLocator(locate: typeof locateCodebase) {
  const memo = new Map<string, { at: number; pending: Promise<Omit<Codebase, "chat">> }>();
  return (user: string, name: string, token: string | null, fetchImpl: Fetch, filter: RepoFilter) => {
    const key = name.toLowerCase();
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < LOCATE_TTL) return hit.pending;
    const pending = locate(user, name, token, fetchImpl, filter);
    memo.set(key, { at: Date.now(), pending });
    pending.catch(() => memo.delete(key));
    return pending;
  };
}

// ---- Reading files ---------------------------------------------------------------

/** Per read_file call; the model can page through a longer file by line range. */
const READ_LINES = 400;
const READ_CHARS = 40_000;
const README_CHARS = 16_000;
const PROMPT_PATHS = 2500;

export async function fetchRaw(fullName: string, commit: string, path: string, fetchImpl: Fetch = fetch): Promise<string | null> {
  try {
    const response = await fetchImpl(`${RAW_GITHUB}/${fullName}/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const text = await response.text();
    // A NUL in the first few KB is a binary file.
    return text.slice(0, 4096).includes("\u0000") ? null : text;
  } catch {
    return null;
  }
}

/** The slice of a file the model asked for, numbered so it can cite lines. */
export function numberedSlice(text: string, startLine = 1, endLine?: number): { body: string; start: number; end: number; total: number } {
  const lines = text.split("\n");
  const total = lines.length;
  const start = Math.min(Math.max(1, Math.floor(startLine)), total);
  const wanted = Math.min(endLine ? Math.floor(endLine) : start + READ_LINES - 1, start + READ_LINES - 1, total);
  const end = Math.max(start, wanted);
  let body = "";
  let last = start - 1;
  for (let n = start; n <= end; n++) {
    const line = `${n}\t${lines[n - 1]}\n`;
    if (body.length + line.length > READ_CHARS) break;
    body += line;
    last = n;
  }
  return { body, start, end: last, total };
}

// ---- The conversation --------------------------------------------------------------

export const CHAT_MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 8;
const MAX_TURNS = 20;
const MAX_TURN_CHARS = 2000;
const MAX_HISTORY_CHARS = 24_000;

const READ_FILE_TOOL: Anthropic.Tool = {
  name: "read_file",
  description:
    "Read a file from the repository at the pinned commit. Returns the file's lines prefixed with line numbers. " +
    `Files longer than ${READ_LINES} lines come back in pages: pass start_line and end_line to read further. ` +
    "Only paths from the file list in the system prompt exist.",
  eager_input_streaming: true,
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Repository-relative path, exactly as it appears in the file list." },
      start_line: { type: "integer", description: "First line to return, 1-based. Defaults to 1." },
      end_line: { type: "integer", description: "Last line to return, inclusive." },
    },
    required: ["path"],
    additionalProperties: false,
  },
};

interface ReadFileInput {
  path: string;
  start_line?: number;
  end_line?: number;
}

function parseReadFile(input: unknown): ReadFileInput | null {
  if (!input || typeof input !== "object") return null;
  const { path, start_line, end_line } = input as Record<string, unknown>;
  if (typeof path !== "string" || !path) return null;
  const optionalInt = (value: unknown) => value === undefined || (typeof value === "number" && Number.isInteger(value) && value > 0);
  if (!optionalInt(start_line) || !optionalInt(end_line)) return null;
  return { path, start_line: start_line as number | undefined, end_line: end_line as number | undefined };
}

export function systemPrompt(codebase: Omit<Codebase, "chat">, readme: { path: string; text: string } | null): string {
  const paths = codebase.entries.slice(0, PROMPT_PATHS).map((entry) => entry.path);
  return [
    `You answer questions about the source code of ${codebase.fullName}, a project by the owner of this portfolio site. ` +
      "Visitors ask about how it works, how it is structured, and why it was built the way it is.",
    "",
    "Ground every answer in the code. Open files with read_file before describing them; the file list alone does not tell you what a file does. " +
      "Read only what the question needs: a handful of files for most questions. " +
      "If the code does not answer the question, say so plainly rather than guessing.",
    "",
    "The page shows a file viewer beside the chat. Cite code as an inline code span holding the path, optionally with a line or range: " +
      "`src/app.ts`, `src/app.ts:42` or `src/app.ts:42-60`. Each citation becomes a link that opens the file at those lines, so cite the specific lines you mean, " +
      "using the line numbers read_file returned. Use only paths from the file list.",
    "",
    "Write for a curious developer: short paragraphs, Markdown, no headings for short answers, and code blocks only for short excerpts that matter. " +
      "Stay on the subject of this codebase; decline anything else in one sentence.",
    "",
    `Default branch: ${codebase.branch}. Commit: ${codebase.commit}.`,
    codebase.description ? `GitHub description: ${codebase.description}` : "",
    "",
    `<file_list count="${codebase.entries.length}"${paths.length < codebase.entries.length ? ` shown="${paths.length}"` : ""}>`,
    paths.join("\n"),
    "</file_list>",
    readme ? `\n<readme path="${readme.path}">\n${readme.text.slice(0, README_CHARS)}\n</readme>` : "",
  ].join("\n");
}

/** Plain-text history from the page, checked and trimmed to the most recent turns that fit. */
export function sanitizeHistory(raw: unknown): ChatTurn[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const turns: ChatTurn[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const { role, content } = entry as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim()) return null;
    turns.push({ role, content: role === "user" ? content.slice(0, MAX_TURN_CHARS) : content });
  }
  if (turns[turns.length - 1].role !== "user") return null;

  // Keep the newest turns that fit, starting on a user turn.
  const kept: ChatTurn[] = [];
  let chars = 0;
  for (let i = turns.length - 1; i >= 0 && kept.length < MAX_TURNS; i--) {
    chars += turns[i].content.length;
    if (chars > MAX_HISTORY_CHARS && kept.length > 0) break;
    kept.unshift(turns[i]);
  }
  while (kept.length && kept[0].role !== "user") kept.shift();
  return kept.length ? kept : null;
}

export interface ChatDeps {
  client: Anthropic;
  fetchImpl?: Fetch;
}

/**
 * Runs the tool loop and yields events as they happen: a "read" when Claude
 * opens a file, text deltas as it writes. Each round is streamed; tool calls
 * are run once the round's message is complete.
 */
export async function* runChat(
  codebase: Omit<Codebase, "chat">,
  history: ChatTurn[],
  { client, fetchImpl = fetch }: ChatDeps,
): AsyncGenerator<ChatEvent> {
  const known = new Set(codebase.entries.map((entry) => entry.path));
  const readmePath = codebase.entries.find((entry) => /^readme(\.(md|mdx|rst|txt))?$/i.test(entry.path))?.path;
  const readmeText = readmePath ? await fetchRaw(codebase.fullName, codebase.commit, readmePath, fetchImpl) : null;
  const system = systemPrompt(codebase, readmePath && readmeText ? { path: readmePath, text: readmeText } : null);
  const files = new Map<string, string | null>();

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((turn) => ({ role: turn.role, content: turn.content }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS - 1;
    const stream = client.beta.messages.stream({
      model: CHAT_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      // The system prompt (paths + README) is the same for every question about this commit.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      // The last round answers from what was read: no more tools.
      tools: lastRound ? undefined : [READ_FILE_TOOL],
      messages: lastRound
        ? [...messages, { role: "user", content: "Answer now from what you have read; do not open more files." }]
        : messages,
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        }
      }
      message = await stream.finalMessage();
    } catch (error) {
      if (error instanceof Anthropic.APIError) throw error;
      // A tool input the SDK could not parse at all ends the answer here.
      console.warn(`Unparseable tool input for ${codebase.fullName}`, error);
      yield { type: "error", message: "The answer was cut off. Try asking again." };
      return;
    }

    if (message.stop_reason === "refusal") {
      yield { type: "text", text: "\n\nI can't help with that one." };
      break;
    }
    if (message.stop_reason === "max_tokens") break;
    const toolUses = message.content.filter((block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use");
    if (message.stop_reason !== "tool_use" || toolUses.length === 0) break;

    // Text written between tool calls reads as a run-on with the answer; break it.
    if (message.content.some((block) => block.type === "text")) yield { type: "text", text: "\n\n" };

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tool of toolUses) {
      const input = tool.name === "read_file" ? parseReadFile(tool.input) : null;
      if (!input) {
        results.push({ type: "tool_result", tool_use_id: tool.id, is_error: true, content: `Invalid input: ${JSON.stringify(tool.input)}` });
        continue;
      }
      const path = input.path.replace(/^\.?\//, "");
      if (!known.has(path)) {
        results.push({ type: "tool_result", tool_use_id: tool.id, is_error: true, content: `No file at ${path}. Use a path from the file list.` });
        continue;
      }
      if (!files.has(path)) files.set(path, await fetchRaw(codebase.fullName, codebase.commit, path, fetchImpl));
      const text = files.get(path);
      if (text === null || text === undefined) {
        results.push({ type: "tool_result", tool_use_id: tool.id, is_error: true, content: `${path} is binary or could not be read.` });
        continue;
      }
      const slice = numberedSlice(text, input.start_line, input.end_line);
      yield { type: "read", path, startLine: slice.start, endLine: slice.end };
      const more = slice.end < slice.total ? ` Lines ${slice.end + 1}-${slice.total} not shown; read them with start_line.` : "";
      results.push({
        type: "tool_result",
        tool_use_id: tool.id,
        content: `${path} (lines ${slice.start}-${slice.end} of ${slice.total}).${more}\n${slice.body}`,
      });
    }

    messages.push({ role: "assistant", content: message.content });
    messages.push({ role: "user", content: results });
  }
  yield { type: "done" };
}

// ---- Abuse limits ----------------------------------------------------------------

/** Per-instance, best effort: a burst from one address gets turned away. */
const WINDOW_MS = 10 * 60_000;
const WINDOW_REQUESTS = 20;
const hits = new Map<string, number[]>();

export function allowRequest(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= WINDOW_REQUESTS) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return true;
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

export const runtime = "nodejs";

export interface HandlerOptions {
  user?: string;
  token?: string | null;
  filter?: RepoFilter;
  fetchImpl?: Fetch;
  client?: Anthropic | null;
  locate?: ReturnType<typeof createLocator>;
}

const defaultLocate = createLocator(locateCodebase);

function notFound(error: unknown): Response | null {
  return error instanceof NotBrowsable
    ? Response.json({ error: error.message }, { status: 404, headers: { "cache-control": "public, s-maxage=3600" } })
    : null;
}

export async function handleCodebase(
  request: Request,
  {
    user = GITHUB_USER,
    token = GITHUB_TOKEN,
    filter = FILTER,
    fetchImpl = fetch,
    client = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null,
    locate = defaultLocate,
  }: HandlerOptions = {},
): Promise<Response> {
  if (request.method === "GET") {
    const name = new URL(request.url).searchParams.get("repo") ?? "";
    try {
      const codebase = await locate(user, name, token, fetchImpl, filter);
      const body: Codebase = { ...codebase, chat: client !== null };
      return Response.json(body, {
        headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=86400" },
      });
    } catch (error) {
      const missing = notFound(error);
      if (missing) return missing;
      console.error(`Failed to list ${name}`, error);
      return Response.json({ error: "Could not reach GitHub" }, { status: 502, headers: { "cache-control": "no-store" } });
    }
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: { allow: "GET, POST" } });
  }
  if (!client) return Response.json({ error: "The chat is not configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { repo?: unknown; messages?: unknown } | null;
  const name = typeof body?.repo === "string" ? body.repo : "";
  const history = sanitizeHistory(body?.messages);
  if (!history) return Response.json({ error: "Send a question" }, { status: 400 });

  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowRequest(address)) {
    return Response.json({ error: "Too many questions at once. Try again in a few minutes." }, { status: 429 });
  }

  let codebase: Omit<Codebase, "chat">;
  try {
    codebase = await locate(user, name, token, fetchImpl, filter);
  } catch (error) {
    const missing = notFound(error);
    if (missing) return missing;
    console.error(`Failed to locate ${name} for a chat`, error);
    return Response.json({ error: "Could not reach GitHub" }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        for await (const event of runChat(codebase, history, { client, fetchImpl })) send(event);
      } catch (error) {
        if (error instanceof Anthropic.RateLimitError) {
          send({ type: "error", message: "The model is busy. Try again in a minute." });
        } else if (error instanceof Anthropic.APIError) {
          console.error(`Chat failed for ${codebase.fullName}: ${error.status}`, error.message);
          send({ type: "error", message: "The model could not answer right now." });
        } else {
          console.error(`Chat failed for ${codebase.fullName}`, error);
          send({ type: "error", message: "Something went wrong while answering." });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}

export function GET(request: Request): Promise<Response> {
  return handleCodebase(request);
}

export function POST(request: Request): Promise<Response> {
  return handleCodebase(request);
}
