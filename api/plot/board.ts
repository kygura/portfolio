import { createHash } from "node:crypto";

/**
 * /api/plot/board — the shared pixel sheet on /plot.
 *
 * The board is SIZE × SIZE cells, one 4-bit palette index each, packed into a
 * single Redis string with BITFIELD (cell i is the i-th u4, high nibble first).
 * Every placement bumps a sequence number and is pushed onto a short log, so a
 * client that already holds the board only fetches what changed since its last
 * poll; one that has fallen further behind than the log reaches gets the whole
 * board again (32 KB).
 *
 *   GET  /api/plot/board            → { seq, board }        board = base64 of the packed cells
 *   GET  /api/plot/board?since=N    → { seq, changes }      changes = [[cell, colour], …]
 *                                     (or { seq, board } when N is too old)
 *   POST /api/plot/board {x, y, c}  → { seq, cooldown }     or 429 { wait }
 *
 * One placement per address every COOLDOWN_S seconds. Addresses are hashed
 * before they become key names. Storage is Upstash Redis over REST (the Vercel
 * marketplace integration sets KV_REST_API_* or UPSTASH_REDIS_REST_*); without
 * it every call is a 503 and the page keeps a local sheet instead.
 */

export const SIZE = 256;
export const COLOURS = 16;
export const COOLDOWN_S = 5;
export const LOG_MAX = 2000;
export const BOARD_BYTES = (SIZE * SIZE) / 2;

const KEYS = { board: "plot:board", seq: "plot:seq", log: "plot:log" };

// Place a cell, unless this address placed one within the cooldown. Atomic:
// the cooldown check, the write, the sequence bump and the log entry happen
// together. Returns {1, seq} on success, {0, ms left} when cooling down.
const PLACE = `
if not redis.call('SET', KEYS[4], '1', 'NX', 'EX', tonumber(ARGV[3])) then
  return {0, redis.call('PTTL', KEYS[4])}
end
redis.call('BITFIELD', KEYS[1], 'SET', 'u4', '#' .. ARGV[1], ARGV[2])
local seq = redis.call('INCR', KEYS[2])
redis.call('LPUSH', KEYS[3], seq .. ',' .. ARGV[1] .. ',' .. ARGV[2])
redis.call('LTRIM', KEYS[3], 0, tonumber(ARGV[4]) - 1)
return {1, seq}`;

// The whole board and the sequence it is current to, read together.
const SNAPSHOT = `
return {tonumber(redis.call('GET', KEYS[2]) or '0'), redis.call('GET', KEYS[1]) or ''}`;

// The sequence and the log, read together.
const TAIL = `
return {tonumber(redis.call('GET', KEYS[1]) or '0'), redis.call('LRANGE', KEYS[2], 0, tonumber(ARGV[1]) - 1)}`;

// ---- Redis over REST ------------------------------------------------------------

export type Redis = (command: (string | number)[], opts?: { base64?: boolean }) => Promise<unknown>;

export function restRedis(url: string, token: string, fetcher: typeof fetch = fetch): Redis {
  return async (command, { base64 = false } = {}) => {
    const response = await fetcher(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(base64 ? { "upstash-encoding": "base64" } : {}),
      },
      body: JSON.stringify(command),
    });
    const payload = (await response.json().catch(() => null)) as { result?: unknown; error?: string } | null;
    if (!response.ok || !payload || payload.error) {
      throw new Error(`Redis ${response.status}: ${payload?.error ?? "no body"}`);
    }
    return payload.result;
  };
}

function envRedis(): Redis | null {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)?.trim();
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)?.trim();
  return url && token ? restRedis(url, token) : null;
}

// ---- Input ----------------------------------------------------------------------

export interface Placement {
  cell: number;
  colour: number;
}

const isInt = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v < hi;

export function parsePlacement(body: unknown): Placement | null {
  if (!body || typeof body !== "object") return null;
  const { x, y, c } = body as Record<string, unknown>;
  if (!isInt(x, 0, SIZE) || !isInt(y, 0, SIZE) || !isInt(c, 0, COLOURS)) return null;
  return { cell: y * SIZE + x, colour: c };
}

/** "seq,cell,colour" log lines (newest first) → changes after `since`, oldest first. */
export function changesSince(lines: string[], since: number): [number, number][] {
  const out: [number, number][] = [];
  for (const line of lines) {
    const [seq, cell, colour] = line.split(",").map(Number);
    if (!(seq > since)) break;
    out.push([cell, colour]);
  }
  return out.reverse();
}

/** The stored string may be shorter than the board (nothing placed past it yet). */
export function padBoard(base64: string): string {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length >= BOARD_BYTES) return bytes.subarray(0, BOARD_BYTES).toString("base64");
  const full = Buffer.alloc(BOARD_BYTES);
  bytes.copy(full);
  return full.toString("base64");
}

const addressKey = (request: Request) => {
  const address =
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local";
  return `plot:cd:${createHash("sha256").update(address).digest("hex").slice(0, 24)}`;
};

// ---- Handler --------------------------------------------------------------------

const NO_STORE = { "cache-control": "no-store" };

async function snapshot(redis: Redis): Promise<Response> {
  const [seq, board] = (await redis(["EVAL", SNAPSHOT, 2, KEYS.board, KEYS.seq], { base64: true })) as [number, string];
  return Response.json({ seq: Number(seq), size: SIZE, board: padBoard(board) }, { headers: NO_STORE });
}

export interface BoardOptions {
  redis?: Redis | null;
}

export async function handleBoard(request: Request, { redis = envRedis() }: BoardOptions = {}): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: { allow: "GET, POST" } });
  }
  if (!redis) return Response.json({ error: "Not configured" }, { status: 503 });

  try {
    if (request.method === "GET") {
      const since = Number(new URL(request.url).searchParams.get("since"));
      if (!Number.isInteger(since) || since <= 0) return await snapshot(redis);

      const [seq, lines] = (await redis(["EVAL", TAIL, 2, KEYS.seq, KEYS.log, LOG_MAX])) as [number, string[]];
      const behind = Number(seq) - since;
      // Ahead of the server (it was reset) or further back than the log reaches.
      if (behind < 0 || behind > lines.length) return await snapshot(redis);
      return Response.json({ seq: Number(seq), changes: changesSince(lines, since) }, { headers: NO_STORE });
    }

    const placement = parsePlacement(await request.json().catch(() => null));
    if (!placement) return Response.json({ error: "Send x, y and c" }, { status: 400 });

    const [ok, value] = (await redis([
      "EVAL",
      PLACE,
      4,
      KEYS.board,
      KEYS.seq,
      KEYS.log,
      addressKey(request),
      placement.cell,
      placement.colour,
      COOLDOWN_S,
      LOG_MAX,
    ])) as [number, number];

    if (!ok) {
      const wait = Math.max(Number(value), 250);
      return Response.json(
        { error: "Cooling down", wait },
        { status: 429, headers: { ...NO_STORE, "retry-after": String(Math.ceil(wait / 1000)) } },
      );
    }
    return Response.json({ seq: Number(value), cooldown: COOLDOWN_S * 1000 }, { headers: NO_STORE });
  } catch (error) {
    console.error("Plot failed", error);
    return Response.json({ error: "Unavailable" }, { status: 502 });
  }
}

export function GET(request: Request): Promise<Response> {
  return handleBoard(request);
}

export function POST(request: Request): Promise<Response> {
  return handleBoard(request);
}
