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

/** Bearer secrets accepted by the manual / scheduled rebuild endpoint. */
function getRebuildSecrets(): string[] {
  return ["NOTION_SYNC_TRIGGER_SECRET", "CRON_SECRET"]
    .map((name) => firstConfigured([name]))
    .filter((value): value is string => Boolean(value));
}

type RebuildResult =
  | { triggered: true; job: unknown }
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

/**
 * Manual and scheduled rebuilds. Accepts `Authorization: Bearer <secret>` with
 * either NOTION_SYNC_TRIGGER_SECRET (manual POST) or CRON_SECRET (Vercel Cron
 * sends a GET with that header). The daily cron is a safety net for webhook
 * deliveries Notion drops.
 */
function isAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization");
  return getRebuildSecrets().some((secret) => header === `Bearer ${secret}`);
}

async function handle(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await triggerRebuild();
    if (result.triggered === false) {
      return Response.json({ error: result.reason }, { status: 500 });
    }
    return Response.json({ ok: true, rebuild: "queued", job: result.job }, { status: 202 });
  } catch (error) {
    console.error("Failed to trigger rebuild", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to trigger rebuild" },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
export const GET = handle;
export const POST = handle;
