import assert from "node:assert/strict";
import test from "node:test";
import { CHARGES, PALETTE, SIZE, fullBoard, handleBoard, parseLog, parsePlacement, type Command, type Redis } from "./board.ts";

const URL_ = "http://localhost/api/canvas/board";
const post = (body: unknown, ip = "10.0.0.1") =>
  new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

/** Records commands and answers with whatever the test hands it. */
function fakeRedis(reply: (command: Command) => unknown, multiReply: unknown[] = []) {
  const calls: Command[] = [];
  const redis: Redis = {
    run: async (command) => (calls.push(command), reply(command)),
    multi: async (commands) => (calls.push(...commands), multiReply),
  };
  return { redis, calls };
}

test("parsePlacement accepts in-range integers only", () => {
  assert.deepEqual(parsePlacement({ x: 3, y: 2, c: 5 }), { index: 2 * SIZE + 3, colour: 5 });
  assert.equal(parsePlacement({ x: SIZE, y: 0, c: 0 }), null);
  assert.equal(parsePlacement({ x: 0, y: -1, c: 0 }), null);
  assert.equal(parsePlacement({ x: 0, y: 0, c: PALETTE.length }), null);
  assert.equal(parsePlacement({ x: 1.5, y: 0, c: 0 }), null);
  assert.equal(parsePlacement(null), null);
});

test("parseLog turns newest-first entries into oldest-first pairs", () => {
  assert.deepEqual(parseLog(["9:20:3", "8:10:1", "junk"]), [
    [10, 1],
    [20, 3],
  ]);
});

test("fullBoard pads a short board to its full length", () => {
  const board = fullBoard(Buffer.from([0xab]));
  assert.equal(board.length, (SIZE * SIZE) / 2);
  assert.equal(board[0], 0xab);
  assert.equal(board[1], 0);
});

test("503 without Redis, 405 for other methods", async () => {
  assert.equal((await handleBoard(new Request(URL_), { redis: null })).status, 503);
  const { redis } = fakeRedis(() => null);
  assert.equal((await handleBoard(new Request(URL_, { method: "DELETE" }), { redis })).status, 405);
});

test("GET returns the padded board and the seq in one transaction", async () => {
  const { redis } = fakeRedis(() => null, [Buffer.from([0x12]).toString("base64"), Buffer.from("42").toString("base64")]);
  const response = await handleBoard(new Request(URL_), { redis });
  const body = await response.json();
  assert.equal(body.seq, 42);
  assert.equal(body.size, SIZE);
  assert.equal(body.cap, CHARGES);
  const board = Buffer.from(body.board, "base64");
  assert.equal(board.length, (SIZE * SIZE) / 2);
  assert.equal(board[0], 0x12);
});

test("GET on an empty store returns a blank board at seq 0", async () => {
  const { redis } = fakeRedis(() => null, [null, null]);
  const body = await (await handleBoard(new Request(URL_), { redis })).json();
  assert.equal(body.seq, 0);
  assert.ok(Buffer.from(body.board, "base64").every((b) => b === 0));
});

test("GET ?since returns changes, or asks for a reset", async () => {
  let reply: unknown = [7, ["7:5:2", "6:4:1"]];
  const { redis, calls } = fakeRedis(() => reply);
  const body = await (await handleBoard(new Request(`${URL_}?since=5`), { redis })).json();
  assert.deepEqual(body, { seq: 7, changes: [[4, 1], [5, 2]] });
  assert.equal(calls[0][0], "EVAL");
  assert.equal(calls[0].at(-2), 5);

  reply = [7];
  assert.deepEqual(await (await handleBoard(new Request(`${URL_}?since=7`), { redis })).json(), { seq: 7, changes: [] });
  reply = [7, "reset"];
  assert.deepEqual(await (await handleBoard(new Request(`${URL_}?since=1`), { redis })).json(), { seq: 7, reset: true });
  assert.equal((await handleBoard(new Request(`${URL_}?since=-1`), { redis })).status, 400);
});

test("POST places a pixel under the visitor's bucket", async () => {
  const { redis, calls } = fakeRedis(() => [1, 8, 11, 4000]);
  const response = await handleBoard(post({ x: 1, y: 1, c: 6 }, "1.2.3.4, 5.6.7.8"), { redis, now: () => 1000 });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { seq: 8, charges: 11, nextMs: 4000 });
  assert.ok(calls[0].includes("canvas:bucket:1.2.3.4"));
  assert.ok(calls[0].includes(SIZE + 1));
});

test("POST answers 429 when the bucket is empty and 400 for bad input", async () => {
  const { redis } = fakeRedis(() => [0, 0, 0, 2500]);
  const response = await handleBoard(post({ x: 1, y: 1, c: 6 }), { redis });
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: "Out of pixels", charges: 0, nextMs: 2500 });
  assert.equal((await handleBoard(post({ x: 1, y: 1 }), { redis })).status, 400);
});

test("a Redis failure is a 502", async () => {
  const redis: Redis = {
    run: async () => {
      throw new Error("down");
    },
    multi: async () => {
      throw new Error("down");
    },
  };
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal((await handleBoard(new Request(URL_), { redis })).status, 502);
  } finally {
    console.error = quiet;
  }
});
