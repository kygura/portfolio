/**
 * Bit, an old stone automaton, drawn on an 18×18 grid. Each frame is a list
 * of rows; a character is one cell:
 *   o outline / cracks   s stone   l lit stone   k shaded stone
 *   m loose stones (ears, hands)   v hollow (eye socket)   g moss
 *   r rune glow   w glow core   . empty
 * Stone comes from the ink tokens and the glow and moss from the accent, so
 * Bit changes with the palette like everything else on the site.
 */

const BASE = [
  "..........r.......",
  "..................",
  "....gggooooo......",
  "...ogllsssssso....",
  "...olsssssssskko..",
  ".m.olsvvvvvvsko.m.",
  ".m.olsvrwwrvsko.m.",
  ".m.olsvvrrvvsko.m.",
  "...olssosssskko...",
  "....ooooggoooo....",
  ".......kkkk.......",
  ".....oooooooo.....",
  ".....olssssko.....",
  ".mm..olsrrsko..mm.",
  ".mm..olrssrko..mm.",
  ".....ogsrrsko.....",
  "......oooooo......",
  "..................",
];

const withRows = (rows: Record<number, string>) => BASE.map((r, i) => rows[i] ?? r);

const DARK_EYE = {
  0: "..................",
  6: ".m.olsvvvvvvsko.m.",
  7: ".m.olsvvvvvvsko.m.",
};

export const FRAMES = {
  idle: BASE,
  blink: withRows({ 6: ".m.olsvvrrvvsko.m.", 7: ".m.olsvvvvvvsko.m." }),
  step: withRows({ 0: "........r........." }),
  sleep: withRows(DARK_EYE),
  off: withRows({
    ...DARK_EYE,
    13: ".mm..olskksko..mm.",
    14: ".mm..olksskko..mm.",
    15: ".....ogskksko.....",
  }),
  happy: withRows({
    0: "..........w.......",
    6: ".m.olsvwwwwvsko.m.",
    7: ".m.olsvrrrrvsko.m.",
    13: ".mm..olswwsko..mm.",
  }),
} as const;

export type FrameName = keyof typeof FRAMES;

const FILL: Record<string, string> = {
  o: "color-mix(in srgb, var(--ink-3) 22%, black)",
  s: "color-mix(in srgb, var(--ink-3) 80%, var(--bg))",
  l: "color-mix(in srgb, var(--ink-2) 75%, var(--bg))",
  k: "color-mix(in srgb, var(--ink-3) 45%, var(--bg))",
  m: "color-mix(in srgb, var(--ink-3) 60%, var(--bg))",
  v: "var(--code)",
  g: "var(--accent-deep)",
  r: "var(--accent)",
  w: "color-mix(in srgb, var(--accent) 45%, white)",
};

export const SPRITE_W = 18;
export const SPRITE_H = 18;

export function Sprite({ frame, scale = 3 }: { frame: FrameName; scale?: number }) {
  const rows = FRAMES[frame];
  return (
    <svg
      width={SPRITE_W * scale}
      height={SPRITE_H * scale}
      viewBox={`0 0 ${SPRITE_W} ${SPRITE_H}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={FILL[c]} />
        )
      )}
    </svg>
  );
}
