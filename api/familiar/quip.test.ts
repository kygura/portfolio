import assert from "node:assert/strict";
import test from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { MAX_EXCERPT, MODEL, handleQuip, parseQuips, sanitizeQuipRequest } from "./quip.ts";

const PAGE = { path: "/writings/on-stone", title: "On Stone", excerpt: "A long essay about granite, patience and erosion." };

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/familiar/quip", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

function fakeClient(reply: Partial<Anthropic.Message> | Error) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client = {
    messages: {
      create: async (params: Anthropic.MessageCreateParamsNonStreaming) => {
        calls.push(params);
        if (reply instanceof Error) throw reply;
        return { stop_reason: "end_turn", content: [], ...reply };
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

test("sanitizeQuipRequest clips fields and rejects thin input", () => {
  assert.equal(sanitizeQuipRequest(null), null);
  assert.equal(sanitizeQuipRequest({ path: "nope", excerpt: "x".repeat(50) }), null);
  assert.equal(sanitizeQuipRequest({ path: "/a", excerpt: "short" }), null);
  const page = sanitizeQuipRequest({ path: "/a", title: 7, excerpt: "y ".repeat(5000) });
  assert.ok(page);
  assert.equal(page.title, "");
  assert.ok(page.excerpt.length <= MAX_EXCERPT);
});

test("parseQuips strips bullets and quotes and keeps three lines", () => {
  assert.deepEqual(parseQuips('1. "granite remembers"\n- erosion is patient\n\n* so am i\nfourth line'), [
    "granite remembers",
    "erosion is patient",
    "so am i",
  ]);
  assert.deepEqual(parseQuips("x".repeat(200)), []);
});

test("returns 503 without a client and 405 for GET", async () => {
  assert.equal((await handleQuip(post(PAGE), { client: null })).status, 503);
  const { client } = fakeClient({});
  assert.equal((await handleQuip(new Request("http://localhost/x"), { client })).status, 405);
});

test("asks Haiku and returns the parsed lines", async () => {
  const { client, calls } = fakeClient({
    content: [{ type: "text", text: "granite remembers\nerosion is patient\nso am i", citations: null }],
  });
  const response = await handleQuip(post(PAGE, { "x-forwarded-for": "10.0.0.1" }), { client });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { quips: ["granite remembers", "erosion is patient", "so am i"] });
  assert.equal(calls[0].model, MODEL);
  assert.match(JSON.stringify(calls[0].messages), /granite/);
});

test("refusals and API errors become a 502 the client falls back from", async () => {
  const refused = fakeClient({ stop_reason: "refusal", content: [] });
  assert.equal((await handleQuip(post(PAGE, { "x-forwarded-for": "10.0.0.2" }), refused)).status, 502);
  const broken = fakeClient(new Error("boom"));
  assert.equal((await handleQuip(post(PAGE, { "x-forwarded-for": "10.0.0.3" }), broken)).status, 502);
});

test("rate limits a single address", async () => {
  const { client } = fakeClient({ content: [{ type: "text", text: "hi there", citations: null }] });
  let last = 200;
  for (let i = 0; i < 32; i++) last = (await handleQuip(post(PAGE, { "x-forwarded-for": "10.9.9.9" }), { client })).status;
  assert.equal(last, 429);
});
