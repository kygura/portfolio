import assert from "node:assert/strict";
import test from "node:test";
import {
  blocksFraming,
  buildCodeMap,
  buildShowcase,
  clip,
  findSocialImage,
  languageOf,
  liveUrlFor,
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

test("only listed repos appear, in the list's order", () => {
  const ranked = rankRepos(
    [
      repo("popular", { stargazers_count: 40 }),
      repo("Lexis"),
      repo("polytech", { private: true }),
      repo("meridian", { fork: true, archived: true }),
      repo("hidden", { topics: ["portfolio-hide"] }),
    ],
    ["polytech", "lexis", "meridian", "missing"],
  );
  assert.deepEqual(ranked.map((r) => r.name), ["polytech", "Lexis", "meridian"]);
  assert.deepEqual(rankRepos([repo("lexis")], []), []);
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
  // A site that lists this portfolio's origin may be framed here, and only that one.
  assert.equal(blocksFraming(new Headers({ "content-security-policy": "frame-ancestors 'self' https://www.nca.ink" })), false);
  assert.equal(blocksFraming(new Headers({ "content-security-policy": "frame-ancestors 'self' https://WWW.nca.ink/" })), false);
  assert.equal(blocksFraming(new Headers({ "content-security-policy": "frame-ancestors https://evil.nca.ink.example" })), true);
  // The check runs against the page that embeds the preview.
  const meridian = new Headers({ "content-security-policy": "frame-ancestors 'self' https://www.nca.ink" });
  assert.equal(blocksFraming(meridian, "https://portfolio-git-x-projects.vercel.app"), true);
  assert.equal(blocksFraming(meridian, "https://www.nca.ink"), false);
  const wild = new Headers({ "content-security-policy": "frame-ancestors 'self' https://*.vercel.app" });
  assert.equal(blocksFraming(wild, "https://portfolio-git-x-projects.vercel.app"), false);
  assert.equal(blocksFraming(wild, "https://vercel.app"), true);
  assert.equal(blocksFraming(wild, "https://vercel.app.evil.example"), true);
  assert.equal(blocksFraming(new Headers({ "content-security-policy": "frame-ancestors https:" }), "http://localhost:5173"), true);
  assert.equal(blocksFraming(new Headers({ "content-security-policy": "frame-ancestors http://localhost:5173" }), "http://localhost:5173"), false);
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

test("deployments keep their preview; code-only and dead sites map their source, private ones drop unless opted in", async () => {
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
      if (!/\/(code-only|parked|private-code)\//.test(url)) return new Response("", { status: 404 });
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

  const showcase = await buildShowcase({
    user: "kygura",
    showcase: ["framed", "blocked", "plain", "slow", "gone", "parked", "private-app", "code-only", "private-code"],
    now: NOW,
    fetchImpl,
  });
  const byName = Object.fromEntries(showcase.repos.map((r) => [r.name, r]));
  const previews = Object.fromEntries(showcase.repos.map((r) => [r.name, r.preview])) as Record<string, { kind: string; src?: string }>;

  // gone.dev's tree fetch fails, so it has nothing to show and drops out.
  assert.deepEqual(Object.keys(byName).sort(), ["blocked", "code-only", "framed", "parked", "plain", "private-app", "private-code", "slow"]);
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

  // Listed, a private repo with no site shows as a code map.
  const privateCode = byName["private-code"];
  assert.equal(privateCode?.preview.kind, "map");
  assert.equal(privateCode?.private, true);
  assert.equal(privateCode?.card, null);
});

test("the cap fills in list order, and a repo with nothing to map gives up its place", async () => {
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
  const showcase = await buildShowcase({
    user: "kygura",
    showcase: ["binary-only", "empty", "code-a", "site-a", "code-b"],
    now: NOW,
    limit: 2,
    fetchImpl,
  });
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
  assert.ok(long && long.length <= 280 && long.endsWith("."));
});

test("descriptions come from the README, else the About line, and only kept repos are read", async () => {
  const readmes: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://api.github.com/users/")) {
      return Response.json([
        repo("lexis", { stargazers_count: 3, homepage: "https://lexis.dev", description: "About line." }),
        repo("quiet", { stargazers_count: 2, homepage: "https://quiet.dev", description: "Quiet about line." }),
        repo("over-cap", { stargazers_count: 1, homepage: "https://over.dev" }),
      ]);
    }
    if (url.endsWith("/readme")) {
      readmes.push(url);
      return url.includes("/lexis/")
        ? readmeResponse("# lexis\n\nAn editorial companion for long-form writers, straight from the README.")
        : readmeResponse("# quiet\n\n- only\n- a list");
    }
    return new Response("<html></html>");
  }) as typeof fetch;

  const showcase = await buildShowcase({ user: "kygura", showcase: ["lexis", "quiet", "over-cap"], now: NOW, limit: 2, fetchImpl });
  assert.equal(readmes.length, 2);
  assert.equal(showcase.repos[0].description, "An editorial companion for long-form writers, straight from the README.");
  assert.equal(showcase.repos[1].description, "Quiet about line.");
});

test("README summary takes a blockquote tagline but skips callouts", () => {
  assert.equal(
    readmeSummary("# x\n\n> [!WARNING]\n> Work in progress, expect breakage.\n\n> A tiny engine for drawing maps of source trees.", "x"),
    "A tiny engine for drawing maps of source trees.",
  );
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
});

test("surfaces a GitHub failure instead of an empty index", async () => {
  const fetchImpl = (async () => new Response("rate limited", { status: 403 })) as typeof fetch;
  await assert.rejects(buildShowcase({ user: "kygura", fetchImpl }), /403/);
});
