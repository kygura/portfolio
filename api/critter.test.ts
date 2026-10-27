import assert from "node:assert/strict";
import test from "node:test";
import {
  createLimiter,
  createMemo,
  createSpeaker,
  glancePrompt,
  handleCritter,
  readGlance,
  tidyRemark,
  type Glance,
  type Remark,
} from "./critter.ts";

const glance = (overrides: Partial<Glance> = {}): Glance => ({
  mode: "arrive",
  path: "/writings",
  title: "Writings",
  section: "",
  text: "Notes on maps and software.",
  question: "",
  history: [],
  ...overrides,
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://example.test/api/critter", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

test("readGlance keeps known fields and clips them", () => {
  const read = readGlance({
    mode: "linger",
    path: "/writings/x",
    title: "  A   title ",
    text: "y".repeat(10_000),
    question: "ignored outside ask",
    history: [{ who: "visitor", text: "hi" }],
    extra: true,
  });
  assert.ok(read);
  assert.equal(read.title, "A title");
  assert.equal(read.text.length, 6000);
  assert.equal(read.question, "");
  assert.deepEqual(read.history, []);
});

test("readGlance rejects unknown modes, bad paths and empty questions", () => {
  assert.equal(readGlance({ mode: "shout", path: "/" }), null);
  assert.equal(readGlance({ mode: "arrive", path: "https://evil.test" }), null);
  assert.equal(readGlance({ mode: "ask", path: "/", question: "   " }), null);
  assert.equal(readGlance(null), null);
});

test("readGlance keeps the last six well-formed turns of a conversation", () => {
  const history = [
    ...Array.from({ length: 8 }, (_, i) => ({ who: i % 2 ? "mote" : "visitor", text: `line ${i}` })),
    { who: "system", text: "nope" },
  ];
  const read = readGlance({ mode: "ask", path: "/", question: "what is this?", history });
  assert.ok(read);
  assert.equal(read.history.length, 5);
  assert.equal(read.history.at(-1)?.text, "line 7");
});

test("tidyRemark caps the line and falls back to a known mood", () => {
  const tidy = tidyRemark({ say: "z".repeat(400), mood: "furious" });
  assert.ok(tidy);
  assert.equal(tidy.say.length, 240);
  assert.ok(tidy.say.endsWith("…"));
  assert.equal(tidy.mood, "curious");
  assert.equal(tidyRemark({ say: "  " }), null);
});

test("glancePrompt carries the page, the conversation and the ask", () => {
  const prompt = glancePrompt(
    glance({ mode: "ask", section: "On maps", question: "why maps?", history: [{ who: "mote", text: "hm" }] }),
  );
  assert.match(prompt, /<page path="\/writings">/);
  assert.match(prompt, /<section>On maps<\/section>/);
  assert.match(prompt, /mote: hm/);
  assert.match(prompt, /<visitor>why maps\?<\/visitor>/);
  assert.match(prompt, /Reply\.$/);
});

test("createSpeaker parses structured output and gives up on a cut-off reply", async () => {
  let stop = "end_turn";
  const client = {
    messages: {
      create: async () => ({
        stop_reason: stop,
        content: [{ type: "text", text: JSON.stringify({ say: "the contours here are lovely", mood: "happy" }) }],
      }),
    },
  } as unknown as Parameters<typeof createSpeaker>[0]["client"];
  const speak = createSpeaker({ apiKey: "test", client });
  assert.deepEqual(await speak(glance()), { say: "the contours here are lovely", mood: "happy" });
  stop = "max_tokens";
  assert.equal(await speak(glance()), null);
});

test("createMemo reuses unprompted remarks but not answers or failures", async () => {
  let calls = 0;
  let fail = false;
  const speak = createMemo(async () => {
    calls += 1;
    return fail ? null : ({ say: `line ${calls}`, mood: "curious" } satisfies Remark);
  });
  await speak(glance());
  await speak(glance());
  assert.equal(calls, 1);
  await speak(glance({ mode: "ask", question: "a" }));
  await speak(glance({ mode: "ask", question: "a" }));
  assert.equal(calls, 3);
  fail = true;
  await speak(glance({ path: "/cv" }));
  await speak(glance({ path: "/cv" }));
  assert.equal(calls, 5);
});

test("createLimiter allows a burst then refuses until the window passes", () => {
  let t = 0;
  const allow = createLimiter(2, 1000, () => t);
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), false);
  assert.equal(allow("b"), true);
  t = 1500;
  assert.equal(allow("a"), true);
});

test("handleCritter answers, and says why when it cannot", async () => {
  const speak = async () => ({ say: "hello, reader", mood: "happy" }) as Remark;
  const ok = await handleCritter(post({ mode: "arrive", path: "/" }), speak);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { say: "hello, reader", mood: "happy" });

  assert.equal((await handleCritter(post({ mode: "arrive", path: "/" }), null)).status, 503);
  assert.equal((await handleCritter(post("not json"), speak)).status, 400);
  assert.equal((await handleCritter(post({ mode: "arrive", path: "/" }), async () => null)).status, 502);
  assert.equal((await handleCritter(post({ mode: "arrive", path: "/" }), speak, () => false)).status, 429);
});
