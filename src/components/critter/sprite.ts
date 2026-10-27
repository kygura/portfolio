/**
 * Mote's sprite: a little round robot after the 16-bit JRPG kind, 16×16
 * pixels drawn as SVG rects, one class per palette slot so every colour comes
 * from the theme tokens (see `.mote__px--*` in index.css). The body is fixed;
 * the eyes and speaker grille are laid over it per expression.
 *
 *   o outline   b plating (accent)   d shade (deep accent)   h highlight
 *   v visor glass   t lamp (lens eyes, chest light)   e grille   w glint
 */

export const SIZE = 16;

const BODY = [
  "....oooooooo....",
  "...ohhbbbbbbo...",
  "..ohbbbbbbbbbo..",
  ".oobbbbbbbbbboo.",
  "odobvvvvvvvvbodo",
  "odobvvvvvvvvbodo",
  ".oobbbbbbbbbboo.",
  "...oddddddddo...",
  ".oo.oooooooo.oo.",
  "obdoohbbbbdoodbo",
  "obdoobbttbdoodbo",
  "oddoobbttbdooddo",
  ".oo.obbbbbdo.oo.",
  "....oddddddo....",
  "....odo..odo....",
  "...oddo..oddo...",
];

export type Face = "idle" | "blink" | "talk" | "happy" | "look" | "sleep" | "surprised";

/** [x, y, slot] overlays, drawn after the body. */
type Overlay = [number, number, string][];

const lenses: Overlay = [
  [5, 4, "w"], [6, 4, "t"], [5, 5, "t"], [6, 5, "t"],
  [9, 4, "w"], [10, 4, "t"], [9, 5, "t"], [10, 5, "t"],
];
const shutters = (slot: string): Overlay => [[5, 5, slot], [6, 5, slot], [9, 5, slot], [10, 5, slot]];
/** The speaker grille under the visor, open while he talks. */
const grille: Overlay = [[6, 7, "e"], [8, 7, "e"], [10, 7, "e"]];

const FACES: Record<Face, Overlay> = {
  idle: lenses,
  blink: shutters("t"),
  talk: [...lenses, ...grille],
  // ∩ ∩: lenses squeezed into happy arcs
  happy: [[4, 5, "t"], [5, 4, "t"], [6, 4, "t"], [7, 5, "t"], [8, 5, "t"], [9, 4, "t"], [10, 4, "t"], [11, 5, "t"], ...grille],
  // lenses slid up and over, at nothing in particular
  look: [[6, 4, "t"], [7, 4, "t"], [10, 4, "t"], [11, 4, "t"]],
  sleep: shutters("d"),
  surprised: [[5, 4, "w"], [6, 4, "w"], [5, 5, "w"], [6, 5, "w"], [9, 4, "w"], [10, 4, "w"], [9, 5, "w"], [10, 5, "w"], ...grille],
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
