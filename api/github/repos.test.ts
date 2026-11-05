import assert from "node:assert/strict";
import test from "node:test";
import {
  blocksFraming,
  buildCodeMap,
  buildShowcase,
  capWords,
  clip,
  createDescriber,
  findSocialImage,
  isListed,
  languageOf,
  liveUrlFor,
  parseRepoList,
  rankRepos,
  readmeSummary,
  type GithubRepo,
} from "./repos.ts";

const NOW = new Date("2026-10-21T00:00:00Z");

/** GitHub's JSON README response: base64 content plus the blob SHA. */
function readmeResponse(text: string, sha = "sha-1"): Response {
  return Response.json({ sha, encoding: "base64", content: Buffer.from(text).toString("base64") });
}

function repo(name: string, overrides: Partial<GithubRepo> = {}): GithubRepo {
  return {
    name,
    full_name: `kygura/${name}`,
    html_url: `https://github.com/kygura/${name}`,
    description: null,
    homepage: null,
    stargazers_count: 0,
    forks_count: 0,
    language: "TypeScript",
    topics: [],
    pushed_at: "2026-01-01T00:00:00Z",
    fork: false,
    archived: false,
    private: false,
    has_pages: false,
    default_branch: "main",
    size: 100,
    ...overrides,
  };
}

test("ranks by stars with a fading bonus for recent pushes", () => {
  const ranked = rankRepos(
    [
      repo("old-starred", { stargazers_count: 12, pushed_at: "2025-01-01T00:00:00Z" }),
      repo("fresh", { stargazers_count: 1, pushed_at: "2026-10-20T00:00:00Z" }),
      repo("stale", { stargazers_count: 1, pushed_at: "2025-06-01T00:00:00Z" }),
    ],
    "kygura",
    NOW,
    10,
  );
  assert.deepEqual(ranked.map((r) => r.name), ["old-starred", "fresh", "stale"]);
});

test("flagship is an optional boost: tagged repos lead, untagged ones still show", () => {
  const ranked = rankRepos(
    [
      repo("popular", { stargazers_count: 40 }),
      repo("swarm", { topics: ["flagship"], archived: true }),
      repo("polytech", { topics: ["flagship"], private: true, pushed_at: "2026-10-20T00:00:00Z" }),
      repo("quiet"),
    ],
    "kygura",
    NOW,
    10,
  );
  assert.deepEqual(ranked.map((r) => r.name), ["polytech", "swarm", "popular", "quiet"]);
});

test("leaves out the site's own repo", () => {
  const ranked = rankRepos([repo("kygra-portfolio"), repo("lexis")], "kygura", NOW, 10, "kygra-portfolio");
  assert.deepEqual(ranked.map((r) => r.name), ["lexis"]);
});

test("drops forks, hidden repos and the profile repo, but keeps archived ones", () => {
  const ranked = rankRepos(
    [
      repo("keep"),
      repo("forked", { fork: true }),
      repo("archived", { archived: true }),
      repo("hidden", { topics: ["portfolio-hide"] }),
      repo("Kygura"),
    ],
    "kygura",
    NOW,
    10,
  );
  assert.deepEqual(ranked.map((r) => r.name), ["keep", "archived"]);
});

test("repo lists ignore case, owner prefixes and separators", () => {
  assert.deepEqual([...parseRepoList(" Lexis, kygura/Tally\n  atlas  ")], ["lexis", "tally", "atlas"]);
  assert.equal(parseRepoList(undefined).size, 0);
  assert.equal(parseRepoList(" , ").size, 0);
});

test("an include list makes the index an allowlist; exclude always wins", () => {
  const all = [repo("lexis"), repo("tally"), repo("secret"), repo("draft", { topics: ["portfolio-hide"] })];
  const names = (include: string, exclude: string) =>
    rankRepos(all, "kygura", NOW, 10, null, { include: parseRepoList(include), exclude: parseRepoList(exclude) })
      .map((r) => r.name)
      .sort();
  assert.deepEqual(names("", ""), ["lexis", "secret", "tally"]);
  assert.deepEqual(names("", "secret"), ["lexis", "tally"]);
  assert.deepEqual(names("lexis, Tally", ""), ["lexis", "tally"]);
  assert.deepEqual(names("lexis,tally", "tally"), ["lexis"]);
  assert.deepEqual(names("draft", ""), []); // the hide topic still wins
  assert.equal(isListed("LEXIS", { include: parseRepoList("lexis"), exclude: new Set() }), true);
});

test("live URL prefers the homepage, then GitHub Pages", () => {
  assert.equal(liveUrlFor(repo("a", { homepage: "example.com" }), "kygura"), "https://example.com/");
  assert.equal(liveUrlFor(repo("b", { homepage: "", has_pages: true }), "Kygura"), "https://kygura.github.io/b/");
  assert.equal(liveUrlFor(repo("kygura.github.io", { has_pages: true }), "kygura"), "https://kygura.github.io/");
  assert.equal(liveUrlFor(repo("c"), "kygura"), null);
});

test("detects pages that refuse to be framed", () => {
  assert.equal(blocksFraming(new Headers()), false);
  assert.equal(blocksFraming(new Headers({ "x-frame-options": "DENY" })), true);
  assert.equal(blocksFraming(new Headers({ "x-frame-options": "SAMEORIGIN" })), true);
  assert.equal(blocksFraming(new Headers({ "content-security-policy": "frame-ancestors 'self'" })), true);
  assert.equal(blocksFraming(new Headers({ "content-security-policy": "default-src 'self'; frame-ancestors *" })), false);
  assert.equal(blocksFraming(new Headers({ "content-security-policy": "default-src 'self'" })), false);
});

test("finds og:image in either attribute order and resolves relative URLs", () => {
  assert.equal(
    findSocialImage('<meta content="/og.png" property="og:image">', "https://site.dev/app/"),
    "https://site.dev/og.png",
  );
  assert.equal(
    findSocialImage('<meta name="twitter:image" content="https://cdn.dev/t.png" />', "https://site.dev"),
    "https://cdn.dev/t.png",
  );
  assert.equal(findSocialImage("<title>none</title>", "https://site.dev"), null);
});

test("deployments keep their preview; code-only and dead sites map their source, private ones drop", async () => {
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === "https://api.github.com/repos/kygura/framed/readme") {
      return readmeResponse("# framed\n\nA framed site that renders straight into the software index preview.");
    }
    if (url.endsWith("/readme")) return new Response("Not Found", { status: 404 });
    if (url.startsWith("https://api.github.com/users/")) {
      return Response.json([
        repo("framed", { stargazers_count: 5, homepage: "https://framed.dev", topics: ["flagship", "web"] }),
        repo("blocked", { stargazers_count: 4, homepage: "https://blocked.dev", topics: ["flagship"] }),
        repo("plain", { stargazers_count: 3, homepage: "https://plain.dev", topics: ["flagship"] }),
        repo("slow", { stargazers_count: 2, homepage: "https://slow.dev", topics: ["flagship"] }),
        repo("gone", { stargazers_count: 2, homepage: "https://gone.dev", topics: ["flagship"] }),
        repo("parked", { stargazers_count: 2, homepage: "https://parked.dev", topics: ["flagship"] }),
        repo("private-app", { private: true, homepage: "https://private.dev", topics: ["flagship"] }),
        repo("code-only", { stargazers_count: 9, topics: ["flagship"] }),
        repo("private-code", { private: true, topics: ["flagship"] }),
      ]);
    }
    if (url.includes("/git/trees/")) {
      if (!url.includes("/code-only/") && !url.includes("/parked/")) return new Response("", { status: 404 });
      return Response.json({ tree: [{ path: "src/main.rs", type: "blob", size: 900 }, { path: "README.md", type: "blob", size: 100 }] });
    }
    if (url.startsWith("https://framed.dev")) return new Response("<html></html>");
    if (url.startsWith("https://blocked.dev")) {
      return new Response('<meta property="og:image" content="/card.png">', {
        headers: { "x-frame-options": "DENY" },
      });
    }
    if (url.startsWith("https://plain.dev") || url.startsWith("https://private.dev")) {
      return new Response("<title>no og</title>", { headers: { "x-frame-options": "DENY" } });
    }
    if (url.startsWith("https://slow.dev")) throw new DOMException("timed out", "TimeoutError");
    if (url.startsWith("https://parked.dev")) return new Response("gone", { status: 404 });
    throw new TypeError("fetch failed"); // gone.dev: DNS failure
  }) as typeof fetch;

  const showcase = await buildShowcase({ user: "kygura", now: NOW, fetchImpl });
  const byName = Object.fromEntries(showcase.repos.map((r) => [r.name, r]));
  const previews = Object.fromEntries(showcase.repos.map((r) => [r.name, r.preview])) as Record<string, { kind: string; src?: string }>;

  // gone.dev's tree fetch fails, so it has nothing to show and drops out.
  assert.deepEqual(Object.keys(byName).sort(), ["blocked", "code-only", "framed", "parked", "plain", "private-app", "slow"]);
  assert.equal(byName["code-only"].liveUrl, null);
  assert.equal(byName.parked.liveUrl, null); // its site answers 404: the source stands in
  assert.equal(previews["code-only"].kind, "map");
  assert.equal(byName.framed.description, "A framed site that renders straight into the software index preview.");
  assert.deepEqual(byName.framed.topics, ["web"]); // internal topics stay off the page
  assert.deepEqual(previews.framed, { kind: "frame", src: "https://framed.dev/" });
  assert.deepEqual(previews.blocked, { kind: "image", src: "https://blocked.dev/card.png" });
  assert.match(previews.plain.src ?? "", /^https:\/\/opengraph\.githubassets\.com\/\d+\/kygura\/plain$/);
  assert.deepEqual(previews.slow, { kind: "frame", src: "https://slow.dev/" }); // a slow site is still framed
  assert.deepEqual(previews["private-app"], { kind: "none" }); // GitHub has no public card for it
});

test("the cap fills in rank order, and a repo with nothing to map gives up its place", async () => {
  const trees: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://api.github.com/users/")) {
      return Response.json([
        repo("binary-only", { stargazers_count: 9 }),
        repo("empty", { stargazers_count: 8, size: 0 }),
        repo("code-a", { stargazers_count: 7 }),
        repo("site-a", { stargazers_count: 1, homepage: "https://a.dev" }),
        repo("code-b"),
      ]);
    }
    if (url.endsWith("/readme")) return new Response("", { status: 404 });
    if (url.includes("/git/trees/")) {
      trees.push(url.split("/")[5]);
      const path = url.includes("/binary-only/") ? "logo.png" : "lib.py";
      return Response.json({ tree: [{ path, type: "blob", size: 500 }] });
    }
    return new Response("<html></html>");
  }) as typeof fetch;
  const showcase = await buildShowcase({ user: "kygura", now: NOW, limit: 2, fetchImpl });
  assert.deepEqual(showcase.repos.map((r) => r.name), ["code-a", "site-a"]);
  assert.deepEqual(trees.sort(), ["binary-only", "code-a"]); // never fetched past the cap; empty repos skip the call
});

test("languageOf skips dependencies, build output, dot-dirs, lockfiles and unmapped types", () => {
  assert.equal(languageOf("src/app.tsx"), "TypeScript");
  assert.equal(languageOf("Cargo.toml"), "Config");
  assert.equal(languageOf("node_modules/x/index.js"), null);
  assert.equal(languageOf("web/dist/app.js"), null);
  assert.equal(languageOf(".github/workflows/ci.yml"), null);
  assert.equal(languageOf("package-lock.json"), null);
  assert.equal(languageOf("public/vendor.min.js"), null);
  assert.equal(languageOf("assets/hero.png"), null);
});

test("code map folds the tree to two levels, strips a shared root and caps the plots", () => {
  const blob = (path: string, size: number) => ({ path, type: "blob", size });
  const map = buildCodeMap([
    blob("src/engine/core.rs", 4000),
    blob("src/engine/deep/nested/step.rs", 1000),
    blob("src/cli/main.rs", 1500),
    blob("src/lib.rs", 500),
    blob("src/ui/theme.css", 300),
    { path: "src/engine", type: "tree" },
  ]);
  assert.ok(map);
  assert.equal(map.base, "src/");
  assert.equal(map.files, 5);
  assert.equal(map.bytes, 7300);
  assert.deepEqual(map.languages, [{ name: "Rust", bytes: 7000 }, { name: "CSS", bytes: 300 }]);
  assert.deepEqual(map.nodes.map((n) => n.name), ["engine/", "cli/", "lib.rs", "ui/"]);
  const engine = map.nodes[0];
  assert.deepEqual(engine.children?.map((c) => [c.name, c.bytes, c.files]), [["core.rs", 4000, 1], ["deep/", 1000, 1]]);
  assert.equal(map.nodes[3].lang, "CSS");

  const wide = buildCodeMap(Array.from({ length: 30 }, (_, i) => blob(`m${i}/f.ts`, 100 + i)));
  assert.equal(wide?.nodes.length, 10);
  const rest = wide?.nodes[9];
  assert.equal(rest?.name, "+21");
  assert.equal(rest?.files, 21);

  assert.equal(buildCodeMap([blob("logo.png", 9000)]), null);
});

test("README summary skips banners, badges and code to the opening prose", () => {
  const readme = [
    "<p align=\"center\"><img src=\"logo.png\"></p>",
    "# Hyperion",
    "[![CI](https://x/badge.svg)](https://x) [![npm](https://y/badge.svg)](https://y)",
    "<!-- intro -->",
    "An **agentic** trading system for [Hyperliquid](https://hyperliquid.xyz) that turns `plain language` into orders.",
    "```bash\nbun install\n```",
    "Deterministic risk guards sit between the agent and real capital.",
    "## Install",
    "Run the thing.",
  ].join("\n\n");
  assert.equal(
    readmeSummary(readme, "hyperion"),
    "An agentic trading system for Hyperliquid that turns plain language into orders. " +
      "Deterministic risk guards sit between the agent and real capital.",
  );
});

test("README summary returns null when there is no prose, and clips long text", () => {
  assert.equal(readmeSummary("# repo\n\n- a list\n- only", "repo"), null);
  const long = readmeSummary(`${"Long sentence goes on here. ".repeat(40)}`, "repo");
  assert.ok(long && long.length <= 600 && long.endsWith("."));
});

test("model descriptions win over the README excerpt, and only kept repos are described", async () => {
  const described: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://api.github.com/users/")) {
      return Response.json([
        repo("lexis", { stargazers_count: 3, homepage: "https://lexis.dev" }),
        repo("quiet", { stargazers_count: 2, homepage: "https://quiet.dev" }),
        repo("over-cap", { stargazers_count: 1, homepage: "https://over.dev" }),
      ]);
    }
    if (url.endsWith("/readme")) {
      return readmeResponse("# x\n\nA long enough opening paragraph that serves as the fallback excerpt.");
    }
    return new Response("<html></html>");
  }) as typeof fetch;

  const showcase = await buildShowcase({
    user: "kygura",
    now: NOW,
    limit: 2,
    fetchImpl,
    describe: async (r) => {
      described.push(r.name);
      return r.name === "lexis" ? "An editorial companion for long-form writers." : null;
    },
  });
  assert.deepEqual(described.sort(), ["lexis", "quiet"]);
  assert.equal(showcase.repos[0].description, "An editorial companion for long-form writers.");
  assert.equal(showcase.repos[1].description, "A long enough opening paragraph that serves as the fallback excerpt.");
});

function fakeClient(reply: { text: string; stop_reason?: string }, calls: unknown[]) {
  return {
    messages: {
      create: async (params: unknown) => {
        calls.push(params);
        return { stop_reason: reply.stop_reason ?? "end_turn", content: [{ type: "text", text: reply.text }] };
      },
    },
  } as never;
}

test("describer calls Haiku once per README version and rejects SKIP or refusals", async () => {
  const calls: unknown[] = [];
  const describe = createDescriber({ apiKey: "k", client: fakeClient({ text: " A terse tool. " }, calls) });
  const readme = { sha: "abc", text: "# lexis\n\nSomething." };
  assert.equal(await describe(repo("lexis"), readme), "A terse tool.");
  assert.equal(await describe(repo("lexis"), readme), "A terse tool.");
  assert.equal(calls.length, 1); // memoised by README SHA
  assert.equal((calls[0] as { model: string }).model, "claude-haiku-5-5");
  await describe(repo("lexis"), { ...readme, sha: "def" });
  assert.equal(calls.length, 2); // a changed README is described afresh

  const skip = createDescriber({ apiKey: "k", client: fakeClient({ text: "SKIP" }, []) });
  assert.equal(await skip(repo("thin"), readme), null);
  const refused = createDescriber({ apiKey: "k", client: fakeClient({ text: "x", stop_reason: "refusal" }, []) });
  assert.equal(await refused(repo("r"), readme), null);
});

test("a failed description is retried on the next request", async () => {
  let attempts = 0;
  const client = {
    messages: {
      create: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("overloaded");
        return { stop_reason: "end_turn", content: [{ type: "text", text: "Back up." }] };
      },
    },
  } as never;
  const describe = createDescriber({ apiKey: "k", client });
  const readme = { sha: "s", text: "t" };
  assert.equal(await describe(repo("a"), readme), null);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(await describe(repo("a"), readme), "Back up.");
});

test("a token switches to the owner's own listing, which includes private repos", async () => {
  const seen: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push(`${String(input)} ${new Headers(init?.headers).get("authorization") ?? ""}`);
    return Response.json([]);
  }) as typeof fetch;
  await buildShowcase({ user: "kygura", token: "t0k", fetchImpl });
  assert.match(seen[0], /^https:\/\/api\.github\.com\/user\/repos\?affiliation=owner&visibility=all.* Bearer t0k$/);
});

test("descriptions are cut at whole sentences, never with an ellipsis", () => {
  assert.equal(clip("One. Two. Three.", 10), "One. Two.");
  assert.equal(clip("A single sentence that runs well past the limit. Then more.", 10), "A single sentence that runs well past the limit.");
  assert.equal(clip("no stops at all in this one", 5), "no stops at all in this one");
  assert.equal(clip("Version 1.5 ships. Next.", 19), "Version 1.5 ships."); // decimals are not sentence ends
  assert.equal(capWords("Short and done.", 40), "Short and done.");
  const wordy = `First sentence stands alone. ${"more words ".repeat(30)}end.`;
  assert.equal(capWords(wordy, 40), "First sentence stands alone.");
});

test("surfaces a GitHub failure instead of an empty index", async () => {
  const fetchImpl = (async () => new Response("rate limited", { status: 403 })) as typeof fetch;
  await assert.rejects(buildShowcase({ user: "kygura", fetchImpl }), /403/);
});
