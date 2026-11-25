import assert from "node:assert/strict";
import test from "node:test";
import { isPublished, pagesFingerprint, shouldSkip, type BuildStamp, type StampPage } from "./build-stamp.ts";

const pages: StampPage[] = [
  { id: "aaaa-1111", lastEdited: "2026-11-25T22:00:00.000Z", published: true },
  { id: "bbbb-2222", lastEdited: "2026-11-25T21:00:00.000Z", published: true },
  { id: "cccc-3333", lastEdited: "2026-11-25T22:09:00.000Z", published: false },
];
const live: BuildStamp = { commit: "abc", pages: pagesFingerprint(pages), syncedAt: "2026-11-25T22:05:30.000Z" };

test("pagesFingerprint ignores drafts, order and dashes", () => {
  const reordered = [pages[1], { ...pages[0], id: "AAAA1111" }];
  assert.equal(pagesFingerprint(reordered), pagesFingerprint(pages));
  const draftEdited = pages.map((page) => (page.published ? page : { ...page, lastEdited: "2026-11-25T23:00:00.000Z" }));
  assert.equal(pagesFingerprint(draftEdited), pagesFingerprint(pages));
});

test("shouldSkip skips a redelivered event or a draft edit", () => {
  assert.equal(shouldSkip(live, pages, "abc"), true);
});

test("shouldSkip builds on a new commit, a publish, an unpublish or a published edit", () => {
  assert.equal(shouldSkip(live, pages, "def"), false);
  assert.equal(shouldSkip(live, pages.map((page) => ({ ...page, published: true })), "abc"), false);
  assert.equal(shouldSkip(live, pages.slice(1), "abc"), false);
  assert.equal(shouldSkip(live, [{ ...pages[0], lastEdited: "2026-11-25T22:06:00.000Z" }, pages[1], pages[2]], "abc"), false);
});

test("shouldSkip builds when an edit falls in the minute the live build synced", () => {
  const sameMinute: BuildStamp = { ...live, syncedAt: "2026-11-25T22:00:40.000Z" };
  assert.equal(shouldSkip(sameMinute, pages, "abc"), false);
});

test("shouldSkip builds when the live stamp is missing or incomplete", () => {
  assert.equal(shouldSkip(null, pages, "abc"), false);
  assert.equal(shouldSkip({ ...live, pages: null }, pages, "abc"), false);
  assert.equal(shouldSkip(live, pages, null), false);
});

test("isPublished reads the Published checkbox", () => {
  assert.equal(isPublished({ Published: { type: "checkbox", checkbox: true } }), true);
  assert.equal(isPublished({ Published: { type: "checkbox", checkbox: false } }), false);
  assert.equal(isPublished({}), false);
});
