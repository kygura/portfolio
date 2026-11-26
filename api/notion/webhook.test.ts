import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

const TOKEN = "test-verification-token";
process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN = TOKEN;

const HOOK_URL = "https://api.vercel.com/v1/integrations/deploy/test-hook";
process.env.NOTION_DATABASE_ID = "11111111-2222-3333-4444-555555555555";

const { POST } = await import("./webhook.ts");

/** Stub the deploy hook; returns the URLs the handler POSTed to. */
async function withDeployHook(
  hookUrl: string | undefined,
  fn: (calls: string[]) => Promise<void>,
): Promise<void> {
  const previousFetch = globalThis.fetch;
  const previousHook = process.env.VERCEL_DEPLOY_HOOK_URL;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return Response.json({ job: { id: "job-1", state: "PENDING" } }, { status: 201 });
  }) as typeof fetch;
  if (hookUrl) {
    process.env.VERCEL_DEPLOY_HOOK_URL = hookUrl;
  } else {
    delete process.env.VERCEL_DEPLOY_HOOK_URL;
  }
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousHook === undefined) {
      delete process.env.VERCEL_DEPLOY_HOOK_URL;
    } else {
      process.env.VERCEL_DEPLOY_HOOK_URL = previousHook;
    }
  }
}

function sign(body: string): string {
  return `sha256=${crypto.createHmac("sha256", TOKEN).update(body).digest("hex")}`;
}

function makeRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/notion/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

async function withStrictMode(fn: () => Promise<void>): Promise<void> {
  const previous = process.env.NOTION_WEBHOOK_REQUIRE_SIGNATURE;
  process.env.NOTION_WEBHOOK_REQUIRE_SIGNATURE = "true";
  try {
    await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.NOTION_WEBHOOK_REQUIRE_SIGNATURE;
    } else {
      process.env.NOTION_WEBHOOK_REQUIRE_SIGNATURE = previous;
    }
  }
}

test("echoes the verification token during the handshake (no signature)", async () => {
  const body = JSON.stringify({ verification_token: "handshake-abc" });
  const response = await POST(makeRequest(body));
  const json = (await response.json()) as { ok: boolean; verification_token: string };

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.verification_token, "handshake-abc");
});

test("echoes the verification token even when the handshake carries a signature", async () => {
  const body = JSON.stringify({ verification_token: "handshake-signed" });
  await withStrictMode(async () => {
    const response = await POST(makeRequest(body, { "x-notion-signature": "sha256=not-checkable-yet" }));
    const json = (await response.json()) as { ok: boolean; verification_token: string };

    assert.equal(response.status, 200);
    assert.equal(json.verification_token, "handshake-signed");
  });
});

test("rejects invalid JSON with 400", async () => {
  const response = await POST(makeRequest("not json"));
  assert.equal(response.status, 400);
});

test("strict mode rejects an invalid signature with 401", async () => {
  await withStrictMode(async () => {
    const body = JSON.stringify({ type: "page.created", entity: { id: "page-1" } });
    const response = await POST(
      makeRequest(body, { "x-notion-signature": "sha256=deadbeef" }),
    );
    assert.equal(response.status, 401);
  });
});

async function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const previous = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("rejects an unsigned event by default (no strict flag set)", async () => {
  await withDeployHook(HOOK_URL, async (calls) => {
    const body = JSON.stringify({ type: "page.created", entity: { id: "page-1" } });
    const response = await POST(makeRequest(body)); // no signature header

    assert.equal(response.status, 401);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 0);
  });
});

test("rejects events when no verification token is configured", async () => {
  await withEnv(
    { NOTION_WEBHOOK_VERIFICATION_TOKEN: undefined, WEBHOOK_SECRET: undefined },
    async () => {
      await withDeployHook(HOOK_URL, async (calls) => {
        const body = JSON.stringify({ type: "page.created", entity: { id: "page-1" } });
        const response = await POST(makeRequest(body, { "x-notion-signature": sign(body) }));

        assert.equal(response.status, 401);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(calls.length, 0);
      });
    },
  );
});

test("NOTION_WEBHOOK_REQUIRE_SIGNATURE=false processes unsigned events", async () => {
  await withEnv({ NOTION_WEBHOOK_REQUIRE_SIGNATURE: "false" }, async () => {
    // Unsupported type keeps it hermetic (no deploy hook call), but proves we do NOT 401.
    const body = JSON.stringify({ type: "comment.created", entity: { id: "page-1" } });
    const response = await POST(makeRequest(body));
    const json = (await response.json()) as { ignored?: boolean; reason?: string };

    assert.equal(response.status, 200);
    assert.equal(json.ignored, true);
    assert.match(json.reason ?? "", /Unsupported/);
  });
});

test("ignores unsupported event types with a valid signature", async () => {
  const body = JSON.stringify({ type: "comment.created", entity: { id: "page-1" } });
  const response = await POST(makeRequest(body, { "x-notion-signature": sign(body) }));
  const json = (await response.json()) as { ignored?: boolean; reason?: string };

  assert.equal(response.status, 200);
  assert.equal(json.ignored, true);
  assert.match(json.reason ?? "", /Unsupported/);
});

test("accepts a bare-hex signature (strict mode, verified)", async () => {
  await withStrictMode(async () => {
    const body = JSON.stringify({ type: "comment.created", entity: { id: "page-1" } });
    const bareHex = crypto.createHmac("sha256", TOKEN).update(body).digest("hex");
    const response = await POST(makeRequest(body, { "x-notion-signature": bareHex }));

    // Verified (no 401), then ignored because the type is unsupported.
    assert.equal(response.status, 200);
  });
});

test("a page event in the Publications database triggers the deploy hook", async () => {
  await withDeployHook(HOOK_URL, async (calls) => {
    const body = JSON.stringify({
      id: "evt-1",
      type: "page.content_updated",
      entity: { id: "page-1", type: "page" },
      data: { parent: { id: "11111111222233334444555555555555", type: "database" } },
    });
    const response = await POST(makeRequest(body, { "x-notion-signature": sign(body) }));
    const json = (await response.json()) as { rebuild?: string };

    assert.equal(response.status, 200);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(json.rebuild, "queued");
    assert.deepEqual(calls, [HOOK_URL]);
  });
});

test("a page event without parent info still triggers the deploy hook", async () => {
  await withDeployHook(HOOK_URL, async (calls) => {
    const body = JSON.stringify({ type: "page.properties_updated", entity: { id: "page-1" } });
    const response = await POST(makeRequest(body, { "x-notion-signature": sign(body) }));

    assert.equal(response.status, 200);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
  });
});

test("ignores page events from other databases", async () => {
  await withDeployHook(HOOK_URL, async (calls) => {
    const body = JSON.stringify({
      type: "page.created",
      entity: { id: "page-1" },
      data: { parent: { id: "99999999-0000-0000-0000-000000000000", type: "database" } },
    });
    const response = await POST(makeRequest(body, { "x-notion-signature": sign(body) }));
    const json = (await response.json()) as { ignored?: boolean };

    assert.equal(response.status, 200);
    assert.equal(json.ignored, true);
    assert.equal(calls.length, 0);
  });
});

test("returns 500 when no deploy hook is configured so Notion retries", async () => {
  await withDeployHook(undefined, async (calls) => {
    const body = JSON.stringify({ type: "page.created", entity: { id: "page-1" } });
    const response = await POST(makeRequest(body, { "x-notion-signature": sign(body) }));

    assert.equal(response.status, 500);
    assert.equal(calls.length, 0);
  });
});
