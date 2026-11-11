import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_BYTES, LOG_MAX, SIZE, changesSince, handleBoard, padBoard, parsePlacement, restRedis, type Redis } from "./board.ts";

/** Just enough of the three scripts, keyed off which keys they are handed. */
function fakeRedis() {
  const board = Buffer.alloc(0);
  const state = { board, seq: 0, log: [] as string[], cooling: new Map<string, number>(), now: 0 };
  const redis: Redis = async (command, opts) => {
    const [, , numkeys, ...rest] = command;
    const keys = rest.slice(0, Number(numkeys)).map(String);
    const args = rest.slice(Number(numkeys));
    if (keys.length === 5) {
      const until = state.cooling.get(keys[3]) ?? 0;
      if (until > state.now) return [0, until - state.now];
      state.cooling.set(keys[3], state.now + Number(args[2]) * 1000);
      const cell = Number(args[0]);
      const byte = cell >> 1;
      if (state.board.length <= byte) {
        const grown = Buffer.alloc(byte + 1);
        state.board.copy(grown);
        state.board = grown;
      }
      const shift = cell % 2 === 0 ? 4 : 0;
      state.board[byte] = (state.board[byte] & ~(0xf << shift)) | (Number(args[1]) << shift);
      state.seq += 1;
      state.log.unshift(`${state.seq},${cell},${args[1]}`);
      state.log.length = Math.min(state.log.length, Number(args[3]));
      return [1, state.seq];
    }
    if (keys[0] === "plot:board") {
      assert.equal(opts?.base64, true);
      return [state.seq, state.board.toString("base64")];
    }
    return [state.seq, state.log.slice(0, Number(args[0]))];
  };
  return { redis, state };
}

const place = (body: unknown, ip = "10.0.0.1") =>
  new Request("http://localhost/api/plot/board", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
const read = (since?: number) => new Request(`http://localhost/api/plot/board${since ? `?since=${since}` : ""}`);

const cellAt = (base64: string, cell: number) => {
  const byte = Buffer.from(base64, "base64")[cell >> 1];
  return cell % 2 === 0 ? byte >> 4 : byte & 0xf;
};

test("parsePlacement accepts only whole cells and palette indices", () => {
  assert.deepEqual(parsePlacement({ x: 3, y: 2, c: 7 }), { cell: 2 * SIZE + 3, colour: 7 });
  assert.equal(parsePlacement({ x: SIZE, y: 0, c: 1 }), null);
  assert.equal(parsePlacement({ x: 1.5, y: 0, c: 1 }), null);
  assert.equal(parsePlacement({ x: 0, y: 0, c: 16 }), null);
  assert.equal(parsePlacement({ x: "1", y: 0, c: 1 }), null);
  assert.equal(parsePlacement(null), null);
});

test("changesSince keeps newer entries, oldest first", () => {
  assert.deepEqual(changesSince(["5,10,1", "4,11,2", "3,12,3"], 3), [
    [11, 2],
    [10, 1],
  ]);
  assert.deepEqual(changesSince(["5,10,1"], 5), []);
});

test("padBoard fills a short board out to full size", () => {
  const padded = Buffer.from(padBoard(Buffer.from([0xab]).toString("base64")), "base64");
  assert.equal(padded.length, BOARD_BYTES);
  assert.equal(padded[0], 0xab);
  assert.equal(padded[1], 0);
});

test("503 without storage, 405 for other methods", async () => {
  assert.equal((await handleBoard(read(), { redis: null })).status, 503);
  const { redis } = fakeRedis();
  assert.equal((await handleBoard(new Request("http://localhost/x", { method: "PUT" }), { redis })).status, 405);
});

test("places a cell, then serves it in the board and as a change", async () => {
  const { redis } = fakeRedis();
  const placed = await handleBoard(place({ x: 5, y: 1, c: 9 }), { redis });
  assert.equal(placed.status, 200);
  assert.deepEqual(await placed.json(), { seq: 1, cooldown: 5000 });

  const full = (await (await handleBoard(read(), { redis })).json()) as { seq: number; board: string };
  assert.equal(full.seq, 1);
  assert.equal(Buffer.from(full.board, "base64").length, BOARD_BYTES);
  assert.equal(cellAt(full.board, SIZE + 5), 9);
  assert.equal(cellAt(full.board, SIZE + 4), 0);

  await handleBoard(place({ x: 6, y: 1, c: 2 }, "10.0.0.2"), { redis });
  const diff = await (await handleBoard(read(1), { redis })).json();
  assert.deepEqual(diff, { seq: 2, changes: [[SIZE + 6, 2]] });
});

test("one placement per address per cooldown", async () => {
  const { redis, state } = fakeRedis();
  assert.equal((await handleBoard(place({ x: 0, y: 0, c: 1 }), { redis })).status, 200);
  const again = await handleBoard(place({ x: 1, y: 0, c: 1 }), { redis });
  assert.equal(again.status, 429);
  assert.equal(((await again.json()) as { wait: number }).wait, 5000);
  assert.equal((await handleBoard(place({ x: 1, y: 0, c: 1 }, "10.0.0.9"), { redis })).status, 200);
  state.now = 5000;
  assert.equal((await handleBoard(place({ x: 1, y: 0, c: 1 }), { redis })).status, 200);
});

test("a client too far behind, or ahead after a reset, gets the whole board", async () => {
  const { redis, state } = fakeRedis();
  state.seq = LOG_MAX + 50;
  state.log = ["2050,0,1"];
  assert.ok("board" in ((await (await handleBoard(read(3), { redis })).json()) as object));
  assert.ok("board" in ((await (await handleBoard(read(state.seq + 10), { redis })).json()) as object));
});

test("rejects a bad body and reports storage failures as 502", async () => {
  const { redis } = fakeRedis();
  assert.equal((await handleBoard(place({ x: -1, y: 0, c: 1 }), { redis })).status, 400);
  const broken: Redis = async () => {
    throw new Error("down");
  };
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal((await handleBoard(read(), { redis: broken })).status, 502);
  } finally {
    console.error = original;
  }
});

test("restRedis posts the command and asks for base64 when told", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return Response.json({ result: [1, "AA=="] });
  }) as unknown as typeof fetch;
  const redis = restRedis("https://example.upstash.io", "tok", fetcher);
  assert.deepEqual(await redis(["EVAL", "return 1", 0], { base64: true }), [1, "AA=="]);
  const headers = seen[0].init.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer tok");
  assert.equal(headers["upstash-encoding"], "base64");
  assert.equal(seen[0].init.body, '["EVAL","return 1",0]');

  const failing = restRedis("https://x", "t", (async () => Response.json({ error: "WRONGTYPE" }, { status: 400 })) as unknown as typeof fetch);
  await assert.rejects(failing(["GET", "k"]), /WRONGTYPE/);
});
