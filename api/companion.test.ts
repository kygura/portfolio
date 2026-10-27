import assert from "node:assert/strict";
import test from "node:test";
import { createLimiter, createSpeaker, handleCompanion, parseView, tidyLine, viewPrompt, type View } from "./companion.ts";

const VIEW: View = {
  path: "/writings",
  title: "Writings",
  heading: "On craft",
  text: "Notes on building small tools.",
  trigger: "arrive",
  recent: [],
};

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/companion", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

test("parseView clips fields and defaults the trigger", () => {
  const view = parseView({ path: "/x", title: "t", text: "a".repeat(10_000), trigger: "nope", recent: ["1", "2", "3", "4", 5] });
  assert.ok(view);
  assert.equal(view.text.length, 3000);
  assert.equal(view.trigger, "poke");
  assert.deepEqual(view.recent, ["2", "3", "4"]);
});

test("parseView rejects bodies without a site path", () => {
  assert.equal(parseView(null), null);
  assert.equal(parseView({ path: "https://elsewhere" }), null);
});

test("tidyLine strips quotes and markdown and cuts long lines at a word", () => {
  assert.equal(tidyLine('"*Oh!* the stars…"'), "Oh! the stars…");
  assert.equal(tidyLine("SKIP"), null);
  const long = tidyLine("word ".repeat(80));
  assert.ok(long && long.length <= 180 && long.endsWith("…"));
});

test("viewPrompt fences the visible text and lists recent lines", () => {
  const prompt = viewPrompt({ ...VIEW, recent: ["Hello there."] });
  assert.match(prompt, /<visible>\nNotes on building small tools\.\n<\/visible>/);
  assert.match(prompt, /- Hello there\./);
});

test("createSpeaker returns the tidied model text", async () => {
  const client = {
    messages: {
      create: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: " 'Small tools, big sparks.' " }] }),
    },
  } as unknown as Parameters<typeof createSpeaker>[0]["client"];
  const speak = createSpeaker({ apiKey: "x", client });
  assert.equal(await speak(VIEW), "Small tools, big sparks.");
});

test("createLimiter allows the limit per window, then refuses", () => {
  const allow = createLimiter({ limit: 2, windowMs: 1000 });
  assert.equal(allow("a", 0), true);
  assert.equal(allow("a", 10), true);
  assert.equal(allow("a", 20), false);
  assert.equal(allow("b", 20), true);
  assert.equal(allow("a", 1500), true);
});

test("handleCompanion answers with a line", async () => {
  const res = await handleCompanion(post(VIEW), async () => "Hi.", () => true);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { line: "Hi." });
});

test("handleCompanion reports missing config, bad input, limits and failures", async () => {
  assert.equal((await handleCompanion(post(VIEW), null, () => true)).status, 503);
  assert.equal((await handleCompanion(post("{"), async () => "x", () => true)).status, 400);
  assert.equal((await handleCompanion(post({ path: "x" }), async () => "x", () => true)).status, 400);
  assert.equal((await handleCompanion(post(VIEW), async () => "x", () => false)).status, 429);
  assert.equal((await handleCompanion(post(VIEW), async () => null, () => true)).status, 502);
});
