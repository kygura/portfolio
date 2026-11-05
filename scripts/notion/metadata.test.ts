import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dedupeBySlug,
  extractPostMetadata,
  getPageDataSourceId,
} from "./metadata.ts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

type TestPage = {
  id: string;
  created_time?: string;
  last_edited_time?: string;
  parent?: { type?: string; database_id?: string; data_source_id?: string };
  properties: Record<string, Record<string, unknown>>;
};

function makeFullPage() {
  const page: TestPage = {
    id: "abc-123",
    created_time: "2026-05-01T00:00:00.000Z",
    last_edited_time: "2026-05-24T12:00:00.000Z",
    parent: { type: "database_id", database_id: "db-999" },
    properties: {
      Title: {
        type: "title",
        title: [{ plain_text: "On the Ego" }],
      },
      "Publication Date": {
        type: "date",
        date: { start: "2026-05-24" },
      },
      Keywords: {
        type: "multi_select",
        multi_select: [{ name: "philosophy" }, { name: "self" }],
      },
      Published: {
        type: "checkbox",
        checkbox: true,
      },
    },
  };
  return page;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractPostMetadata", () => {
  it("extracts all fields from a full page fixture", () => {
    const meta = extractPostMetadata(makeFullPage());

    assert.equal(meta.pageId, "abc-123");
    assert.equal(meta.title, "On the Ego");
    assert.equal(meta.slug, "on-the-ego");
    assert.equal(meta.date, "2026-05-24");
    assert.deepEqual(meta.tags, ["philosophy", "self"]);
    assert.equal(meta.published, true);
    assert.equal(meta.excerpt, "");
    assert.equal(meta.createdTime, "2026-05-01T00:00:00.000Z");
    assert.equal(meta.lastEditedTime, "2026-05-24T12:00:00.000Z");
  });

  it("falls back to created_time when Publication Date is null", () => {
    const page = makeFullPage();
    page.properties["Publication Date"].date = null;
    const meta = extractPostMetadata(page);
    assert.equal(meta.date, "2026-05-01T00:00:00.000Z");
  });

  it("falls back to created_time when Publication Date property is absent", () => {
    const page = makeFullPage();
    delete page.properties["Publication Date"];
    const meta = extractPostMetadata(page);
    assert.equal(meta.date, "2026-05-01T00:00:00.000Z");
  });

  it("uses optional Slug rich_text in preference to title-derived slug", () => {
    const page = makeFullPage();
    page.properties["Slug"] = {
      type: "rich_text",
      rich_text: [{ plain_text: "custom-slug" }],
    };
    const meta = extractPostMetadata(page);
    assert.equal(meta.slug, "custom-slug");
  });

  it("populates excerpt from optional Description rich_text", () => {
    const page = makeFullPage();
    page.properties["Description"] = {
      type: "rich_text",
      rich_text: [{ plain_text: "A short description." }],
    };
    const meta = extractPostMetadata(page);
    assert.equal(meta.excerpt, "A short description.");
  });

  it("defaults published to false when Published checkbox is absent", () => {
    const page = makeFullPage();
    delete page.properties["Published"];
    const meta = extractPostMetadata(page);
    assert.equal(meta.published, false);
  });

  it("uses page.id as title fallback when Title is empty", () => {
    const page = makeFullPage();
    page.properties["Title"].title = [];
    const meta = extractPostMetadata(page);
    assert.equal(meta.title, "abc-123");
  });

  it("falls back to last_edited_time for createdTime when created_time is absent", () => {
    const page = {
      id: "xyz-456",
      last_edited_time: "2026-05-20T00:00:00.000Z",
      properties: {
        Title: { type: "title", title: [{ plain_text: "No Create Time" }] },
        "Publication Date": { type: "date", date: { start: "2026-05-20" } },
        Keywords: { type: "multi_select", multi_select: [] },
        Published: { type: "checkbox", checkbox: false },
      },
    };
    const meta = extractPostMetadata(page);
    assert.equal(meta.createdTime, "2026-05-20T00:00:00.000Z");
    assert.equal(meta.lastEditedTime, "2026-05-20T00:00:00.000Z");
  });

  it("falls back to alternate property key 'Tags' for tags", () => {
    const page = makeFullPage();
    delete page.properties["Keywords"];
    page.properties["Tags"] = {
      type: "multi_select",
      multi_select: [{ name: "alt-tag" }],
    };
    const meta = extractPostMetadata(page);
    assert.deepEqual(meta.tags, ["alt-tag"]);
  });

  it("returns empty tags array when multi_select is absent", () => {
    const page = makeFullPage();
    delete page.properties["Keywords"];
    const meta = extractPostMetadata(page);
    assert.deepEqual(meta.tags, []);
  });
});

describe("getPageDataSourceId", () => {
  it("returns data_source_id when parent type is data_source_id", () => {
    const page = { id: "p1", parent: { type: "data_source_id", data_source_id: "ds-abc" } };
    assert.equal(getPageDataSourceId(page), "ds-abc");
  });

  it("returns database_id when parent type is database_id", () => {
    const page = { id: "p2", parent: { type: "database_id", database_id: "db-xyz" } };
    assert.equal(getPageDataSourceId(page), "db-xyz");
  });

  it("returns null for unknown parent type", () => {
    const page = { id: "p3", parent: { type: "workspace" } };
    assert.equal(getPageDataSourceId(page), null);
  });

  it("returns null when parent is absent", () => {
    const page = { id: "p4" };
    assert.equal(getPageDataSourceId(page), null);
  });

  it("returns null when data_source_id value is undefined", () => {
    const page = { id: "p5", parent: { type: "data_source_id" } };
    assert.equal(getPageDataSourceId(page), null);
  });
});

describe("dedupeBySlug", () => {
  const entry = (pageId: string, slug: string, lastEditedTime: string) => ({
    meta: {
      pageId,
      slug,
      title: slug,
      excerpt: "",
      date: "2026-01-01",
      tags: [],
      published: true,
      createdTime: lastEditedTime,
      lastEditedTime,
    },
  });

  it("keeps the most recently edited page when slugs collide", () => {
    const older = entry("old", "the-vessel", "2026-10-30T19:12:38.248Z");
    const newer = entry("new", "the-vessel", "2026-11-03T17:01:59.400Z");
    const other = entry("x", "on-the-ego", "2026-01-01T00:00:00.000Z");

    for (const input of [[older, other, newer], [newer, other, older]]) {
      const { kept, conflicts } = dedupeBySlug(input);
      assert.deepEqual(kept.map((e) => e.meta.pageId).sort(), ["new", "x"]);
      assert.deepEqual(conflicts, [{ slug: "the-vessel", kept: "new", dropped: "old" }]);
    }
  });

  it("passes unique slugs through untouched", () => {
    const input = [entry("a", "a", "2026-01-01T00:00:00Z"), entry("b", "b", "2026-01-02T00:00:00Z")];
    const { kept, conflicts } = dedupeBySlug(input);
    assert.deepEqual(kept, input);
    assert.deepEqual(conflicts, []);
  });
});
