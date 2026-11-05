import crypto from "node:crypto";
import { z } from "zod";

// Self-contained on purpose: Vercel compiles each function but keeps import
// specifiers as written, so a relative `../_lib/*.ts` import fails at runtime.

function firstConfigured(names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/**
 * HMAC key used to verify the `X-Notion-Signature` header, if one is configured
 * under any accepted name.
 */
function getOptionalWebhookVerificationToken(): string | null {
  return firstConfigured(["NOTION_WEBHOOK_VERIFICATION_TOKEN", "WEBHOOK_SECRET"]);
}

/**
 * When `true`, the webhook rejects events whose signature is missing or invalid.
 * Defaults to `false` so an already-registered subscription keeps delivering
 * without re-running the Notion-side setup.
 */
function isWebhookSignatureRequired(): boolean {
  return process.env.NOTION_WEBHOOK_REQUIRE_SIGNATURE === "true";
}

/** Notion database / data-source IDs whose page events should trigger a rebuild. */
function getWatchedNotionParentIds(): string[] {
  return ["NOTION_DATA_SOURCE_ID", "NOTION_DATABASE_ID"]
    .map((name) => firstConfigured([name]))
    .filter((value): value is string => Boolean(value));
}

type RebuildResult =
  | { triggered: true; job: unknown; reason?: string }
  | { triggered: false; reason: string };

/**
 * Ask Vercel to rebuild the site. The build re-reads every published post
 * from Notion, so one trigger reconciles any number of edits, and a missed
 * trigger is repaired by the next one.
 */
async function triggerRebuild(): Promise<RebuildResult> {
  const hookUrl = firstConfigured(["VERCEL_DEPLOY_HOOK_URL"]);
  if (!hookUrl) {
    return { triggered: false, reason: "VERCEL_DEPLOY_HOOK_URL is not configured" };
  }

  const response = await fetch(hookUrl, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Deploy hook responded with ${response.status}`);
  }

  const body = await response.json().catch(() => null);
  return { triggered: true, job: (body as { job?: unknown } | null)?.job ?? null };
}

const verificationSchema = z.object({
  verification_token: z.string().trim().min(1),
});

const webhookEventSchema = z.object({
  id: z.string().trim().optional(),
  type: z.string().trim().optional(),
  entity: z
    .object({
      id: z.string().trim().optional(),
      type: z.string().trim().optional(),
    })
    .optional(),
  data: z
    .object({
      parent: z
        .object({
          id: z.string().trim().optional(),
          type: z.string().trim().optional(),
          data_source_id: z.string().trim().optional(),
        })
        .optional(),
    })
    .optional(),
});

const rebuildEventTypes = new Set([
  "page.created",
  "page.properties_updated",
  "page.content_updated",
  "page.deleted",
  "page.undeleted",
  "page.moved",
]);

function safeEqual(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

/**
 * Verify the `X-Notion-Signature` header against the configured token. Accepts
 * both the bare hex digest and the `sha256=<hex>` prefixed form so we are
 * resilient to header formatting.
 */
function isValidSignature(
  rawBody: string,
  signature: string | null,
  token: string,
): boolean {
  if (!signature) {
    return false;
  }

  const digest = crypto.createHmac("sha256", token).update(rawBody).digest("hex");

  return [digest, `sha256=${digest}`].some((candidate) =>
    safeEqual(candidate, signature),
  );
}

function normalizeId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

/**
 * Page events from outside the Publications database are ignored when the
 * payload names a parent and we know which database to watch. A page moved
 * out of the database still rebuilds, so the post disappears.
 */
function isFromWatchedParent(
  type: string,
  parent: { id?: string; data_source_id?: string } | undefined,
): boolean {
  const watched = getWatchedNotionParentIds().map(normalizeId);
  const candidates = [parent?.id, parent?.data_source_id]
    .filter((id): id is string => Boolean(id))
    .map(normalizeId);

  if (type === "page.moved" || watched.length === 0 || candidates.length === 0) {
    return true;
  }
  return candidates.some((id) => watched.includes(id));
}

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const signature = request.headers.get("x-notion-signature");

  // One-time subscription handshake: Notion posts the verification token with
  // no signature. Echo it (and log it) so the operator can store it as
  // NOTION_WEBHOOK_VERIFICATION_TOKEN.
  const verification = verificationSchema.safeParse(parsedBody);
  if (verification.success && !signature) {
    console.info(
      "Notion webhook verification token received:",
      verification.data.verification_token,
    );
    return Response.json({
      ok: true,
      verification_token: verification.data.verification_token,
    });
  }

  // Graceful verification: enforce only when a token is configured AND strict
  // mode is on. Otherwise log and process, so an already-registered webhook
  // keeps working without re-running the Notion-side setup.
  const verificationToken = getOptionalWebhookVerificationToken();
  const verified = verificationToken
    ? isValidSignature(rawBody, signature, verificationToken)
    : false;

  if (!verified) {
    if (isWebhookSignatureRequired()) {
      return Response.json({ error: "Invalid Notion signature" }, { status: 401 });
    }
    console.warn(
      verificationToken
        ? "Notion webhook signature missing/invalid — processing anyway. Set NOTION_WEBHOOK_REQUIRE_SIGNATURE=true to enforce."
        : "Notion webhook signature verification disabled — no verification token configured (WEBHOOK_SECRET / NOTION_WEBHOOK_VERIFICATION_TOKEN).",
    );
  }

  const event = webhookEventSchema.safeParse(parsedBody);
  if (!event.success) {
    return Response.json({ error: "Invalid webhook event payload" }, { status: 400 });
  }

  const { id, type, data } = event.data;
  const eventId = id ?? null;

  if (!type || !rebuildEventTypes.has(type)) {
    return Response.json({
      ok: true,
      ignored: true,
      reason: "Unsupported event type",
      eventType: type ?? null,
      eventId,
    });
  }

  if (!isFromWatchedParent(type, data?.parent)) {
    return Response.json({
      ok: true,
      ignored: true,
      reason: "Page is outside the Publications database",
      eventType: type,
      eventId,
    });
  }

  try {
    const result = await triggerRebuild();
    if (!result.triggered) {
      console.error("Notion webhook could not trigger a rebuild:", result.reason);
      return Response.json({ error: result.reason, eventType: type, eventId }, { status: 500 });
    }
    return Response.json({ ok: true, rebuild: "queued", eventType: type, eventId }, { status: 202 });
  } catch (error) {
    console.error("Failed to trigger rebuild from Notion webhook", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to trigger rebuild",
        eventType: type,
        eventId,
      },
      { status: 500 },
    );
  }
}
