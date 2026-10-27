/**
 * What Mote says when the model can't be reached (no key in dev, an outage,
 * the rate limit): a few lines per page, so it still has something to say.
 */
import type { Mood } from "./api";

type Line = [string, Mood];

const BY_PAGE: [RegExp, Line[]][] = [
  [/^\/$/, [
    ["every scene up there is low-poly on purpose. i checked.", "curious"],
    ["press [ or ] and the world changes. i never get used to it.", "surprised"],
    ["i like it down here. the hero is very loud.", "happy"],
  ]],
  [/^\/writings\/./, [
    ["i'm reading along. you go first.", "curious"],
    ["this one took a while to write, i think.", "thinking"],
  ]],
  [/^\/writings/, [
    ["so many words. pick one and i'll read it with you.", "curious"],
    ["the newest ones are at the top. i keep track.", "happy"],
  ]],
  [/^\/projects/, [
    ["some of these cards have a terminal. press play.", "curious"],
    ["i don't understand all of these but i like the names.", "happy"],
  ]],
  [/^\/cv/, [
    ["this is the serious page. i'll be quiet. mostly.", "sleepy"],
  ]],
];

const ANYWHERE: Line[] = [
  ["hm. i lost my thought. it'll come back.", "thinking"],
  ["press m and the tape deck plays. i like side b.", "happy"],
  ["i'm only small, but i'm paying attention.", "curious"],
];

export function offlineLine(path: string): { say: string; mood: Mood } {
  const lines = BY_PAGE.find(([test]) => test.test(path))?.[1] ?? ANYWHERE;
  const [say, mood] = lines[Math.floor(Math.random() * lines.length)];
  return { say, mood };
}

export const BREATHER: { say: string; mood: Mood } = { say: "i've been talking a lot. give me a minute.", mood: "sleepy" };
