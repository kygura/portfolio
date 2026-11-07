import assert from "node:assert/strict";
import test from "node:test";
import {
  createScripter,
  createSessionStore,
  handleTerminal,
  parseRepoList,
  pickEntry,
  sourcePrompt,
  tidySteps,
  type RepoSource,
  type TerminalSession,
} from "./terminal.ts";

const raw = (text: string) => new Response(text);

/** A GitHub stand-in: one public repo with a README, a manifest and an entry file. */
function github(overrides: Record<string, unknown> = {}, seen: string[] = []) {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    seen.push(url);
    if (url === "https://api.github.com/repos/kygura/tally") {
      return Response.json({
        owner: { login: "kygura" },
        private: false,
        fork: false,
        topics: [],
        default_branch: "main",
        description: "Counts things.",
        ...overrides,
      });
    }
    if (url.startsWith("https://api.github.com/repos/kygura/tally/git/trees/main")) {
      return Response.json({
        sha: "tree-1",
        tree: [
          { path: "README.md", type: "blob" },
          { path: "Cargo.toml", type: "blob" },
          { path: "src/main.rs", type: "blob" },
          { path: "src/count/mod.rs", type: "blob" },
          { path: "target/debug/tally", type: "blob" },
          { path: "src", type: "tree" },
        ],
      });
    }
    if (url.endsWith("/contents/README.md")) return raw("# tally\n\nRun `tally --words file.txt`.");
    if (url.endsWith("/contents/Cargo.toml")) return raw('[package]\nname = "tally"');
    if (url.endsWith("/contents/src/main.rs")) return raw("fn main() {}");
    if (url.startsWith("https://api.github.com/repos/")) return new Response("Not Found", { status: 404 });
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
}

const request = (repo: string) => new Request(`https://nca.ink/api/github/terminal?repo=${repo}&rev=1`);

test("tidySteps holds the model to the card's bounds", () => {
  const long = "x".repeat(200);
  const steps = tidySteps({
    steps: [
      { prompt: "$", command: "tally --words notes.txt\nrm -rf /", output: ["  412 words  "] },
      { prompt: "", command: "  ", output: [] },
      { prompt: "a very long prompt", command: long, output: Array.from({ length: 20 }, (_, i) => `line ${i}`) },
      { prompt: ">>>", command: "a", output: [1, "kept"] },
      ...Array.from({ length: 5 }, () => ({ prompt: "$", command: "ls", output: [] })),
    ],
  });
  assert.equal(steps.length, 4); // capped at five, the blank command dropped
  assert.deepEqual(steps[0], { prompt: "$", command: "tally --words notes.txt", output: ["  412 words"] });
  assert.equal(steps[1].prompt, "$");
  assert.equal(steps[1].command.length, 96);
  assert.equal(steps[1].output.length, 12);
  assert.equal(steps[1].output[11], "…");
  assert.deepEqual(steps[2].output, ["kept"]);
  assert.deepEqual(tidySteps(null), []);
  assert.deepEqual(tidySteps({ steps: "nope" }), []);
});

test("pickEntry prefers the shallowest entry point, src/ breaking ties", () => {
  assert.equal(pickEntry(["lib/deep/index.ts", "src/main.rs", "README.md"]), "src/main.rs");
  assert.equal(pickEntry(["lib/app.py", "src/app.py"]), "src/app.py");
  assert.equal(pickEntry(["src/app.py", "app.py"]), "app.py");
  assert.equal(pickEntry(["README.md"]), null);
});

test("writes a session from the source once per tree, reading files only on a miss", async () => {
  const seen: string[] = [];
  const sources: RepoSource[] = [];
  const store = createSessionStore({
    script: async (source) => {
      sources.push(source);
      return [{ prompt: "$", command: "tally --words notes.txt", output: ["412 words"] }];
    },
  });

  const first = await handleTerminal(request("tally"), store, { user: "kygura", fetchImpl: github({}, seen) });
  assert.equal(first.status, 200);
  const session = (await first.json()) as TerminalSession;
  assert.deepEqual(session, {
    repo: "tally",
    sha: "tree-1",
    steps: [{ prompt: "$", command: "tally --words notes.txt", output: ["412 words"] }],
  });
  assert.match(first.headers.get("cache-control") ?? "", /s-maxage=86400/);

  assert.equal(sources.length, 1);
  assert.deepEqual(Object.keys(sources[0].files), ["README.md", "Cargo.toml", "src/main.rs"]);
  assert.ok(!sources[0].paths.some((path) => path.startsWith("target/")));

  seen.length = 0;
  await handleTerminal(request("tally"), store, { user: "kygura", fetchImpl: github({}, seen) });
  assert.equal(sources.length, 1); // same tree: served from memory
  assert.ok(!seen.some((url) => url.includes("/contents/"))); // and no file reads
});

test("refuses private, forked, hidden, foreign and malformed repos without calling the model", async () => {
  let calls = 0;
  const store = createSessionStore({ script: async () => (calls++, []) });
  const cases: [string, Record<string, unknown>][] = [
    ["tally", { private: true }],
    ["tally", { fork: true }],
    ["tally", { topics: ["portfolio-hide"] }],
    ["tally", { owner: { login: "someone-else" } }],
    ["missing", {}],
  ];
  for (const [name, overrides] of cases) {
    const response = await handleTerminal(request(name), store, { user: "kygura", fetchImpl: github(overrides) });
    assert.equal(response.status, 404, JSON.stringify(overrides));
  }
  for (const bad of ["..", "a/b", "", "x".repeat(101)]) {
    const response = await handleTerminal(request(encodeURIComponent(bad)), store, { user: "kygura", fetchImpl: github() });
    assert.equal(response.status, 400, bad);
  }
  assert.equal(calls, 0);
});

test("left-out repos look exactly like missing ones, and GitHub is never asked about them", async () => {
  let calls = 0;
  const store = createSessionStore({ script: async () => (calls++, []) });
  const seen: string[] = [];
  const answers = [];
  for (const filter of [
    { include: new Set<string>(), exclude: parseRepoList("tally") },
    { include: parseRepoList("tally"), exclude: parseRepoList("Tally") },
  ]) {
    const response = await handleTerminal(request("tally"), store, { user: "kygura", filter, fetchImpl: github({}, seen) });
    answers.push([response.status, await response.json()]);
  }
  const missing = await handleTerminal(request("missing"), store, { user: "kygura", fetchImpl: github() });
  const missingBody = await missing.json();
  assert.deepEqual(answers, [
    [404, { error: "No repository named tally" }],
    [404, { error: "No repository named tally" }],
  ]);
  assert.deepEqual(missingBody, { error: "No repository named missing" });
  assert.deepEqual(seen, []);
  assert.equal(calls, 0);

  const allowed = await handleTerminal(request("tally"), store, {
    user: "kygura",
    filter: { include: parseRepoList("lexis"), exclude: new Set() }, // public repos need no include
    fetchImpl: github(),
  });
  assert.equal(allowed.status, 200);
});

test("without a model key the endpoint says so instead of failing", async () => {
  const response = await handleTerminal(request("tally"), null, { user: "kygura", fetchImpl: github() });
  assert.equal(response.status, 503);
});

test("a failed model call is not cached and is retried next time", async () => {
  let attempts = 0;
  const store = createSessionStore({
    script: async () => (++attempts === 1 ? null : [{ prompt: "$", command: "tally", output: [] }]),
  });
  const failed = await handleTerminal(request("tally"), store, { user: "kygura", fetchImpl: github() });
  assert.equal(failed.status, 502);
  assert.equal(failed.headers.get("cache-control"), "no-store");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const retried = await handleTerminal(request("tally"), store, { user: "kygura", fetchImpl: github() });
  assert.equal(retried.status, 200);
  assert.equal(attempts, 2);
});

test("scripter sends the source with a JSON schema and the default fallback, and rejects refusals", async () => {
  const calls: Record<string, unknown>[] = [];
  const client = (reply: { text: string; stop_reason?: string }) =>
    ({
      beta: {
        messages: {
          create: async (params: Record<string, unknown>) => {
            calls.push(params);
            return { stop_reason: reply.stop_reason ?? "end_turn", content: [{ type: "text", text: reply.text }] };
          },
        },
      },
    }) as never;
  const source: RepoSource = {
    name: "tally",
    description: "Counts things.",
    sha: "s",
    paths: ["src/main.rs"],
    files: { "README.md": "# tally" },
  };

  const script = createScripter({
    apiKey: "k",
    client: client({ text: '{"steps":[{"prompt":"$","command":"tally","output":["3"]}]}' }),
  });
  assert.deepEqual(await script(source), [{ prompt: "$", command: "tally", output: ["3"] }]);
  const params = calls[0] as {
    model: string;
    fallbacks: string;
    betas: string[];
    output_config: { format: { type: string } };
    messages: { content: string }[];
  };
  assert.equal(params.model, "claude-opus-5-5");
  assert.equal(params.fallbacks, "default");
  assert.deepEqual(params.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(params.output_config.format.type, "json_schema");
  assert.equal(params.messages[0].content, sourcePrompt(source));
  assert.match(params.messages[0].content, /<file path="README.md">\n# tally\n<\/file>/);

  const refused = createScripter({ apiKey: "k", client: client({ text: "", stop_reason: "refusal" }) });
  assert.equal(await refused(source), null);
  const garbled = createScripter({ apiKey: "k", client: client({ text: "not json" }) });
  assert.equal(await garbled(source), null);
});
