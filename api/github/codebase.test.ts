import assert from "node:assert/strict";
import test from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import {
  handleCodebase,
  isVisible,
  locateCodebase,
  numberedSlice,
  parseRepoList,
  runChat,
  sanitizeHistory,
  type ChatEvent,
  type Codebase,
} from "./codebase.ts";

const META = {
  name: "engine",
  full_name: "kygura/engine",
  owner: { login: "kygura" },
  private: false,
  fork: false,
  topics: [],
  default_branch: "main",
  description: "An engine",
  html_url: "https://github.com/kygura/engine",
  pushed_at: "2026-10-01T00:00:00Z",
};

const TREE = {
  tree: [
    { path: "src", type: "tree" },
    { path: "src/main.ts", type: "blob", size: 120 },
    { path: "README.md", type: "blob", size: 40 },
    { path: "node_modules/x/index.js", type: "blob", size: 9 },
    { path: ".vscode/settings.json", type: "blob", size: 9 },
    { path: ".github/workflows/ci.yml", type: "blob", size: 9 },
  ],
  truncated: false,
};

const FILES: Record<string, string> = {
  "README.md": "# Engine\nRuns things.",
  "src/main.ts": "export const run = () => 1;\nrun();",
};

function fakeGithub(meta: Record<string, unknown> = META): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/repos/kygura/engine")) return Response.json(meta);
    if (url.includes("/branches/main")) return Response.json({ commit: { sha: "abc123" } });
    if (url.includes("/git/trees/abc123")) return Response.json(TREE);
    const raw = url.match(/raw\.githubusercontent\.com\/kygura\/engine\/abc123\/(.+)$/);
    if (raw) {
      const text = FILES[decodeURIComponent(raw[1])];
      return text ? new Response(text) : new Response("missing", { status: 404 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

const NO_FILTER = { include: new Set<string>(), exclude: new Set<string>() };

test("isVisible drops build trees and dot-directories but keeps .github", () => {
  assert.equal(isVisible("src/main.ts"), true);
  assert.equal(isVisible("node_modules/x/index.js"), false);
  assert.equal(isVisible(".vscode/settings.json"), false);
  assert.equal(isVisible(".github/workflows/ci.yml"), true);
});

test("locateCodebase pins the tree to the branch's commit", async () => {
  const codebase = await locateCodebase("kygura", "engine", null, fakeGithub());
  assert.equal(codebase.commit, "abc123");
  assert.deepEqual(
    codebase.entries.map((entry) => entry.path),
    [".github/workflows/ci.yml", "README.md", "src/main.ts"],
  );
  assert.equal(codebase.truncated, false);
});

test("locateCodebase refuses private, forked, hidden and filtered repos", async () => {
  for (const meta of [
    { ...META, private: true },
    { ...META, fork: true },
    { ...META, topics: ["portfolio-hide"] },
    { ...META, owner: { login: "someone" } },
  ]) {
    await assert.rejects(locateCodebase("kygura", "engine", null, fakeGithub(meta)), /No repository/);
  }
  await assert.rejects(
    locateCodebase("kygura", "engine", null, fakeGithub(), { include: new Set(), exclude: parseRepoList("engine") }),
    /No repository/,
  );
  await assert.rejects(locateCodebase("kygura", "../etc", null, fakeGithub()), /No repository/);
});

test("numberedSlice numbers lines and caps the page", () => {
  const text = Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`).join("\n");
  const first = numberedSlice(text);
  assert.equal(first.start, 1);
  assert.equal(first.end, 400);
  assert.equal(first.total, 1000);
  assert.match(first.body, /^1\tline 1\n/);
  const later = numberedSlice(text, 990, 2000);
  assert.equal(later.start, 990);
  assert.equal(later.end, 1000);
});

test("sanitizeHistory keeps the newest turns and ends on a question", () => {
  assert.equal(sanitizeHistory([]), null);
  assert.equal(sanitizeHistory([{ role: "assistant", content: "hi" }]), null);
  assert.equal(sanitizeHistory([{ role: "system", content: "x" }]), null);
  const long = sanitizeHistory([{ role: "user", content: "x".repeat(5000) }]);
  assert.equal(long?.[0].content.length, 2000);
  const turns = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `t${i}` }));
  turns.push({ role: "user", content: "last" });
  const kept = sanitizeHistory(turns);
  assert.ok(kept && kept.length <= 20);
  assert.equal(kept?.[0].role, "user");
  assert.equal(kept?.at(-1)?.content, "last");
});

/** A client whose stream replays scripted rounds: text, then an optional final message. */
function fakeClient(rounds: { text: string; message: Partial<Anthropic.Beta.BetaMessage> }[]) {
  const calls: unknown[] = [];
  const client = {
    beta: {
      messages: {
        stream(params: unknown) {
          calls.push(structuredClone(params));
          const round = rounds.shift();
          if (!round) throw new Error("No more rounds");
          return {
            async *[Symbol.asyncIterator]() {
              if (round.text) yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: round.text } };
            },
            finalMessage: async () => round.message,
          };
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, calls };
}

test("runChat reads the files Claude asks for and streams the answer", async () => {
  const codebase = await locateCodebase("kygura", "engine", null, fakeGithub());
  const { client, calls } = fakeClient([
    {
      text: "",
      message: {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "t1", name: "read_file", input: { path: "src/main.ts" } } as Anthropic.Beta.BetaToolUseBlock,
          { type: "tool_use", id: "t2", name: "read_file", input: { path: "src/nope.ts" } } as Anthropic.Beta.BetaToolUseBlock,
        ],
      },
    },
    { text: "It exports `src/main.ts:1`.", message: { stop_reason: "end_turn", content: [] } },
  ]);

  const events: ChatEvent[] = [];
  for await (const event of runChat(codebase, [{ role: "user", content: "What runs?" }], { client, fetchImpl: fakeGithub() })) {
    events.push(event);
  }

  assert.deepEqual(events, [
    { type: "read", path: "src/main.ts", startLine: 1, endLine: 2 },
    { type: "text", text: "It exports `src/main.ts:1`." },
    { type: "done" },
  ]);
  const second = calls[1] as { messages: Anthropic.Beta.BetaMessageParam[]; system: { text: string }[] };
  const results = second.messages.at(-1)?.content as Anthropic.Beta.BetaToolResultBlockParam[];
  assert.match(String(results[0].content), /1\texport const run/);
  assert.equal(results[1].is_error, true);
  assert.match(second.system[0].text, /<readme path="README.md">/);
});

test("handleCodebase lists the tree and validates chat requests", async () => {
  const options = { user: "kygura", token: null, filter: NO_FILTER, fetchImpl: fakeGithub(), client: null };
  const listed = await handleCodebase(new Request("https://nca.ink/api/github/codebase?repo=engine"), options);
  assert.equal(listed.status, 200);
  const body = (await listed.json()) as Codebase;
  assert.equal(body.chat, false);
  assert.equal(body.entries.length, 3);

  const missing = await handleCodebase(new Request("https://nca.ink/api/github/codebase?repo=other"), options);
  assert.equal(missing.status, 404);

  const unconfigured = await handleCodebase(
    new Request("https://nca.ink/api/github/codebase", { method: "POST", body: JSON.stringify({ repo: "engine", messages: [] }) }),
    options,
  );
  assert.equal(unconfigured.status, 503);

  const { client } = fakeClient([]);
  const empty = await handleCodebase(
    new Request("https://nca.ink/api/github/codebase", { method: "POST", body: JSON.stringify({ repo: "engine", messages: [] }) }),
    { ...options, client },
  );
  assert.equal(empty.status, 400);
});
