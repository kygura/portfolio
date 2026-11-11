import assert from "node:assert/strict";
import test from "node:test";
import type { Redis } from "./board.ts";
import {
  MAX_PIXELS,
  RESIDENTS,
  SIZE,
  WINDOW,
  dailyTurns,
  describe,
  initialState,
  maybeTurn,
  parseState,
  parseTurn,
  windowOrigin,
} from "./_agents.ts";

const mason = RESIDENTS.find((r) => r.id === "mason")!;

test("windowOrigin keeps the window on the sheet", () => {
  assert.deepEqual(windowOrigin(100, 100), [84, 84]);
  assert.deepEqual(windowOrigin(0, 0), [0, 0]);
  assert.deepEqual(windowOrigin(SIZE - 1, SIZE - 1), [SIZE - WINDOW, SIZE - WINDOW]);
});

test("parseState falls back to home on missing or broken state", () => {
  assert.deepEqual(parseState(null, mason), initialState(mason));
  assert.deepEqual(parseState("{nope", mason), initialState(mason));
  const s = parseState(JSON.stringify({ x: 999, y: 10, note: "plan", thought: "hi", at: 5 }), mason);
  assert.equal(s.x, SIZE - 1);
  assert.equal(s.y, 10);
  assert.equal(s.note, "plan");
});

test("parseTurn maps window cells onto the sheet and drops bad ones", () => {
  const state = { ...initialState(mason), x: 100, y: 100 };
  const turn = parseTurn(
    JSON.stringify({
      pixels: [
        { x: 0, y: 0, c: 3 },
        { x: 0, y: 0, c: 4 }, // duplicate cell
        { x: 32, y: 0, c: 1 }, // off the window
        { x: 1, y: 1, c: 16 }, // no such colour
        { x: 1.5, y: 1, c: 1 },
        { x: 31, y: 31, c: 0 },
      ],
      move: { dx: 200, dy: -3 },
      thought: "  laying   the north wall ",
      note: "x".repeat(500),
    }),
    state,
  );
  assert.ok(turn);
  assert.deepEqual(turn.pixels, [
    { cell: 84 * SIZE + 84, colour: 3 },
    { cell: 115 * SIZE + 115, colour: 0 },
  ]);
  assert.deepEqual(turn.move, [48, -3]);
  assert.equal(turn.thought, "laying the north wall");
  assert.equal(turn.note.length, 240);
  assert.equal(parseTurn("not json", state), null);
});

test("parseTurn caps the pixels per turn", () => {
  const pixels = Array.from({ length: 100 }, (_, i) => ({ x: i % 32, y: Math.floor(i / 32), c: 2 }));
  const turn = parseTurn(JSON.stringify({ pixels, move: { dx: 0, dy: 0 }, thought: "", note: "" }), initialState(mason));
  assert.equal(turn?.pixels.length, MAX_PIXELS);
});

test("describe shows colours, owners and the map for the window", () => {
  const colours = new Uint8Array(SIZE * SIZE);
  const owners = new Uint8Array(SIZE * SIZE);
  const state = { ...initialState(mason), x: 16, y: 16 }; // window 0..31
  colours[0] = 6; // a person's mark
  colours[1] = 2;
  owners[1] = mason.index; // mason's own
  colours[2] = 12;
  owners[2] = RESIDENTS.find((r) => r.id === "tide")!.index;
  const text = describe(mason, state, colours, owners);
  const block = (tag: string) => text.split(`<${tag}>\n`)[1].split(`\n</${tag}>`)[0].split("\n");
  assert.equal(block("colours").length, WINDOW);
  assert.ok(block("colours")[0].startsWith("62c0"));
  assert.ok(block("owners")[0].startsWith("P@t."));
  assert.equal(block("map").length, 16);
  assert.ok(block("map")[0].startsWith("1."));
  assert.match(text, /1 cells drawn by people/);
  assert.match(text, /first turn/);
});

function fakeRedis() {
  const store = new Map<string, string>();
  const expires = new Map<string, number>();
  let now = 0;
  const redis: Redis = async (command) => {
    const [name, key, ...rest] = command.map(String);
    const live = (k: string) => !(expires.has(k) && expires.get(k)! <= now);
    if (name === "SET" && rest.includes("NX")) {
      if (store.has(key) && live(key)) return null;
      store.set(key, rest[0]);
      expires.set(key, now + Number(rest[rest.indexOf("PX") + 1]));
      return "OK";
    }
    if (name === "INCR") {
      const n = Number(store.get(key) ?? 0) + 1;
      store.set(key, String(n));
      return n;
    }
    if (name === "EXPIRE") return 1;
    throw new Error(`unexpected ${name}`);
  };
  return { redis, tick: (ms: number) => (now += ms), store };
}

test("maybeTurn takes at most one turn per gap and stops at the day's budget", async () => {
  const { redis, tick, store } = fakeRedis();
  let asked = 0;
  // The turn itself fails (the fake can't run it), which is fine: we're testing the gate.
  const ask = async () => {
    asked++;
    return null;
  };
  const original = console.error;
  console.error = () => {};
  try {
    const at = Date.parse("2026-11-11T12:00:00Z");
    await maybeTurn(redis, ask, { budget: 2, now: at });
    assert.equal(store.get("plot:agents:day:2026-11-11"), "1");
    await maybeTurn(redis, ask, { budget: 2, now: at }); // inside the gap
    assert.equal(store.get("plot:agents:day:2026-11-11"), "1");
    tick(15_000);
    await maybeTurn(redis, ask, { budget: 2, now: at });
    tick(15_000);
    await maybeTurn(redis, ask, { budget: 2, now: at }); // over budget
    assert.equal(store.get("plot:agents:day:2026-11-11"), "3");
    assert.equal(await maybeTurn(redis, null), null);
    assert.equal(await maybeTurn(redis, ask, { budget: 0 }), null);
  } finally {
    console.error = original;
  }
  assert.equal(asked, 0); // the fake has no GET/EVAL, so no turn got as far as asking
});

test("dailyTurns reads the budget from the environment", () => {
  assert.equal(dailyTurns({}), 240);
  assert.equal(dailyTurns({ PLOT_AGENT_DAILY_TURNS: "10" }), 10);
  assert.equal(dailyTurns({ PLOT_AGENT_DAILY_TURNS: "lots" }), 240);
});
