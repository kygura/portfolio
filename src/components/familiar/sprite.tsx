/**
 * Bit, drawn on an 18×18 grid. Each frame is a list of rows; a character is
 * one cell:
 *   o outline   a chassis   l chassis highlight   d chassis shade
 *   m metal (ears, arms, feet, neck)   v visor   e eye glow   w eye shine
 *   c blush   . empty
 * Colours are theme tokens, so Bit changes with the palette like everything
 * else on the site.
 */

const BASE = [
  "........ee........",
  "........oo........",
  "....oooooooooo....",
  "...ollaaaaaaado...",
  "...olvvvvvvvvdo...",
  ".mmolvwevvwevdomm.",
  ".mmolveevveevdomm.",
  "...olvcvvvvcvdo...",
  "...olaaaaaaaddo...",
  "....oooooooooo....",
  ".......mmmm.......",
  "......oooooo......",
  "....molaaaadom....",
  "...mmolvvvvdomm...",
  "...mmolvcevdomm...",
  ".....olaaaddo.....",
  "......oooooo......",
  ".....mm....mm.....",
];

const withRows = (rows: Record<number, string>) => BASE.map((r, i) => rows[i] ?? r);

const EYES_OFF = {
  0: "........oo........",
  5: ".mmolvvvvvvvvdomm.",
  6: ".mmolvmmvvmmvdomm.",
  7: "...olvvvvvvvvdo...",
};

export const FRAMES = {
  idle: BASE,
  blink: withRows({ 5: ".mmolvvvvvvvvdomm.", 6: ".mmolveevveevdomm." }),
  step: withRows({ 17: "......mm..mm......" }),
  sleep: withRows(EYES_OFF),
  off: withRows({ ...EYES_OFF, 14: "...mmolvvvvdomm..." }),
  happy: withRows({ 0: "........ww........", 7: "...olvcveevcvdo..." }),
} as const;

export type FrameName = keyof typeof FRAMES;

const FILL: Record<string, string> = {
  o: "color-mix(in srgb, var(--accent-deep) 45%, black)",
  a: "var(--accent)",
  l: "color-mix(in srgb, var(--accent) 55%, white)",
  d: "var(--accent-deep)",
  m: "var(--ink-3)",
  v: "var(--code)",
  e: "var(--accent)",
  w: "var(--ink)",
  c: "color-mix(in srgb, var(--danger) 75%, var(--code))",
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
