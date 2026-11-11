/**
 * /api/canvas/board — the shared pixel board on /canvas.
 *
 * The board is SIZE × SIZE pixels, four bits each (one of 16 palette colours),
 * stored as one Redis string written with BITFIELD. Every placement also bumps
 * a sequence number and pushes "seq:index:colour" onto a capped log, so a
 * client that knows the last seq it saw can catch up with a small diff instead
 * of the whole board.
 *
 *   GET  /api/canvas/board            → { size, palette, cap, refillMs, seq, board }
 *                                       (board: base64, 4 bits/px, high nibble first)
 *   GET  /api/canvas/board?since=SEQ  → { seq, changes: [[index, colour], …] } or { seq, reset: true }
 *   POST /api/canvas/board {x, y, c}  → { seq, charges, nextMs } or 429 { charges: 0, nextMs }
 *
 * Each visitor (by IP) holds up to CHARGES pixels, refilled one per REFILL_MS.
 * The bucket, the write and the log push run in one Lua script, so they are
 * atomic. Redis is Upstash over its REST API (plain fetch, no client library).
 * Without credentials every route answers 503 and the page runs locally.
 */

export const SIZE = 256;
export const CHARGES = 12;
export const REFILL_MS = 4_000;
export const LOG_MAX = 4_000;

export const PALETTE = [
  "#f2ede0", "#c4bdab", "#858074", "#45443f",
  "#1b1c1e", "#7c2f2a", "#d4483c", "#ee8b37",
  "#f1c84b", "#93b94f", "#3e7c4c", "#2c6d78",
  "#5ba8d4", "#3a4d9e", "#8858b6", "#d985ae",
] as const;

const KEY = {
  board: "canvas:board",
  seq: "canvas:seq",
  log: "canvas:log",
  bucket: (who: string) => `canvas:bucket:${who}`,
};

// KEYS: board, seq, bucket, log. ARGV: index, colour, cap, refill, now, logMax.
const PLACE = `
local cap = tonumber(ARGV[3])
local refill = tonumber(ARGV[4])
local now = tonumber(ARGV[5])
local b = redis.call('HMGET', KEYS[3], 'n', 't')
local n = tonumber(b[1]) or cap
local t = tonumber(b[2]) or now
local gained = math.floor((now - t) / refill)
if gained > 0 then
  n = math.min(cap, n + gained)
  t = t + gained * refill
end
if n >= cap then t = now end
if n < 1 then return {0, 0, 0, t + refill - now} end
n = n - 1
redis.call('HSET', KEYS[3], 'n', n, 't', t)
redis.call('PEXPIRE', KEYS[3], cap * refill + 60000)
redis.call('BITFIELD', KEYS[1], 'SET', 'u4', '#' .. ARGV[1], ARGV[2])
local seq = redis.call('INCR', KEYS[2])
redis.call('LPUSH', KEYS[4], seq .. ':' .. ARGV[1] .. ':' .. ARGV[2])
redis.call('LTRIM', KEYS[4], 0, tonumber(ARGV[6]) - 1)
local wait = 0
if n < cap then wait = t + refill - now end
return {1, seq, n, wait}
`;

// KEYS: seq, log. ARGV: since, logMax. Returns {seq} | {seq, items} | {seq, 'reset'}.
const SINCE = `
local seq = tonumber(redis.call('GET', KEYS[1]) or '0')
local since = tonumber(ARGV[1])
local n = seq - since
if n == 0 then return {seq} end
if n < 0 or n > tonumber(ARGV[2]) then return {seq, 'reset'} end
return {seq, redis.call('LRANGE', KEYS[2], 0, n - 1)}
`;

// ---- Redis over REST -------------------------------------------------------------

export type Command = (string | number)[];
export interface Redis {
  /** Run one command. With base64, string replies come back base64-encoded. */
  run(command: Command, base64?: boolean): Promise<unknown>;
  /** Run commands in one MULTI/EXEC transaction. */
  multi(commands: Command[], base64?: boolean): Promise<unknown[]>;
}

export function restRedis(url: string, token: string): Redis {
  const call = async (path: string, body: unknown, base64: boolean) => {
    const response = await fetch(`${url.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(base64 ? { "upstash-encoding": "base64" } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Redis ${response.status}: ${await response.text().catch(() => "")}`);
    return response.json();
  };
  type Reply = { result?: unknown; error?: string };
  const unwrap = (reply: Reply) => {
    if (reply.error) throw new Error(`Redis: ${reply.error}`);
    return reply.result;
  };
  return {
    run: async (command, base64 = false) => unwrap((await call("", command, base64)) as Reply),
    multi: async (commands, base64 = false) => ((await call("/multi-exec", commands, base64)) as Reply[]).map(unwrap),
  };
}

function envRedis(): Redis | null {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)?.trim();
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)?.trim();
  return url && token ? restRedis(url, token) : null;
}

// ---- Pure helpers ----------------------------------------------------------------

const BOARD_BYTES = (SIZE * SIZE) / 2;
const b64 = (s: string) => Buffer.from(s, "base64");

/** Redis returns the board only as long as its last written byte; pad it out. */
export function fullBoard(raw: Buffer | null): Buffer {
  const out = Buffer.alloc(BOARD_BYTES);
  if (raw) raw.copy(out, 0, 0, Math.min(raw.length, BOARD_BYTES));
  return out;
}

export interface Placement {
  index: number;
  colour: number;
}

export function parsePlacement(body: unknown): Placement | null {
  if (!body || typeof body !== "object") return null;
  const { x, y, c } = body as Record<string, unknown>;
  const ok = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < max;
  if (!ok(x, SIZE) || !ok(y, SIZE) || !ok(c, PALETTE.length)) return null;
  return { index: y * SIZE + x, colour: c };
}

/** "seq:index:colour" entries, newest first → [index, colour] oldest first. */
export function parseLog(items: string[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const [, index, colour] = items[i].split(":").map(Number);
    if (Number.isInteger(index) && Number.isInteger(colour)) out.push([index, colour]);
  }
  return out;
}

const visitor = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

// ---- Handler ---------------------------------------------------------------------

export interface BoardOptions {
  redis?: Redis | null;
  now?: () => number;
}

export async function handleBoard(
  request: Request,
  { redis = envRedis(), now = Date.now }: BoardOptions = {},
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, { allow: "GET, POST" });
  }
  if (!redis) return json({ error: "Not configured" }, 503);

  try {
    if (request.method === "GET") {
      const since = new URL(request.url).searchParams.get("since");
      if (since !== null) {
        const from = Number(since);
        if (!Number.isInteger(from) || from < 0) return json({ error: "Bad since" }, 400);
        const [seq, tail] = (await redis.run(["EVAL", SINCE, 2, KEY.seq, KEY.log, from, LOG_MAX])) as [
          number,
          string[] | "reset" | undefined,
        ];
        if (tail === "reset") return json({ seq, reset: true });
        return json({ seq, changes: parseLog(tail ?? []) });
      }
      // Board and seq in one transaction, so the diff picks up exactly where the snapshot ends.
      const [board, seq] = (await redis.multi([["GET", KEY.board], ["GET", KEY.seq]], true)) as (string | null)[];
      return json({
        size: SIZE,
        palette: PALETTE,
        cap: CHARGES,
        refillMs: REFILL_MS,
        seq: seq ? Number(b64(seq).toString()) : 0,
        board: fullBoard(board ? b64(board) : null).toString("base64"),
      });
    }

    const placement = parsePlacement(await request.json().catch(() => null));
    if (!placement) return json({ error: "Send x, y and c" }, 400);
    const [placed, seq, charges, nextMs] = (await redis.run([
      "EVAL",
      PLACE,
      4,
      KEY.board,
      KEY.seq,
      KEY.bucket(visitor(request)),
      KEY.log,
      placement.index,
      placement.colour,
      CHARGES,
      REFILL_MS,
      now(),
      LOG_MAX,
    ])) as number[];
    if (!placed) return json({ error: "Out of pixels", charges: 0, nextMs }, 429);
    return json({ seq, charges, nextMs });
  } catch (error) {
    console.error("Canvas failed", error);
    return json({ error: "Unavailable" }, 502);
  }
}

export function GET(request: Request): Promise<Response> {
  return handleBoard(request);
}

export function POST(request: Request): Promise<Response> {
  return handleBoard(request);
}
