/**
 * Mote's sprite: a 16×16 grid drawn as SVG rects, one class per palette slot
 * so every colour comes from the theme tokens (see `.mote__px--*` in
 * index.css). The body is fixed; the face is laid over it per expression.
 *
 *   o outline   b body (accent)   d shade (deep accent)   h highlight
 *   t antenna bulb   c cheek   e eye / mouth   w eye shine
 */

export const SIZE = 16;

const BODY = [
  ".........oo.....",
  "........otto....",
  "........otto....",
  ".........oo.....",
  ".........o......",
  "....oooooooo....",
  "...obbbbbbbbo...",
  "..obhhbbbbbbbo..",
  "..obhbbbbbbbbo..",
  ".obbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbo.",
  ".odbbbbbbbbbbdo.",
  ".oddbbbbbbbbddo.",
  "..oddddddddddo..",
  "...oooo..oooo...",
];

export type Face = "idle" | "blink" | "talk" | "happy" | "look" | "sleep" | "surprised";

/** [x, y, slot] overlays, drawn after the body. */
type Overlay = [number, number, string][];

const eyes = (y: number): Overlay => [
  [4, y, "w"], [5, y, "e"], [4, y + 1, "e"], [5, y + 1, "e"],
  [10, y, "w"], [11, y, "e"], [10, y + 1, "e"], [11, y + 1, "e"],
];
const shut: Overlay = [[4, 10, "e"], [5, 10, "e"], [10, 10, "e"], [11, 10, "e"]];
const cheeks: Overlay = [[3, 11, "c"], [12, 11, "c"]];
const smile: Overlay = [[7, 11, "e"], [8, 11, "e"]];
const open: Overlay = [[7, 11, "e"], [8, 11, "e"], [7, 12, "e"], [8, 12, "e"]];

const FACES: Record<Face, Overlay> = {
  idle: [...eyes(9), ...cheeks, ...smile],
  blink: [...shut, ...cheeks, ...smile],
  talk: [...eyes(9), ...cheeks, ...open],
  // ^ ^
  happy: [[3, 10, "e"], [4, 9, "e"], [5, 10, "e"], [10, 10, "e"], [11, 9, "e"], [12, 10, "e"], ...cheeks, ...open],
  // eyes up and to the side, at the bulb
  look: [
    [5, 8, "w"], [6, 8, "e"], [5, 9, "e"], [6, 9, "e"],
    [11, 8, "w"], [12, 8, "e"], [11, 9, "e"], [12, 9, "e"],
    ...cheeks, [8, 11, "e"],
  ],
  sleep: [...shut, ...cheeks, [8, 11, "e"]],
  surprised: [...eyes(8), [4, 10, "e"], [11, 10, "e"], ...cheeks, ...open],
};

export interface Run {
  x: number;
  y: number;
  w: number;
  slot: string;
}

/** Horizontal runs of one slot, so a frame is a few dozen rects, not 256. */
export function frame(face: Face): Run[] {
  const grid = BODY.map((row) => row.split(""));
  for (const [x, y, slot] of FACES[face]) grid[y][x] = slot;
  const runs: Run[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < SIZE) {
      const slot = row[x];
      let w = 1;
      while (x + w < SIZE && row[x + w] === slot) w += 1;
      if (slot !== ".") runs.push({ x, y, w, slot });
      x += w;
    }
  });
  return runs;
}
