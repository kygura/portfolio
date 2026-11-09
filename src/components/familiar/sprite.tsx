/**
 * Bit, drawn on a 14×12 grid. Each frame is a list of rows; a character is
 * one cell: `a` chassis (accent), `d` shade (accent-deep), `v` visor (page
 * ground), `e` eye glow (accent), `h` light (ink), `.` empty. Colours are
 * theme tokens, so Bit changes with the palette like everything else.
 */

const BASE = [
  "......hh......",
  "......dd......",
  "...aaaaaaaa...",
  "..dvvvvvvvvd..",
  "..dveevveevd..",
  "..dvvvvvvvvd..",
  "...aaaaaaaa...",
  "....dddddd....",
  "...aaaaaaaa...",
  "..daaahhaaad..",
  "....d....d....",
  "...dd....dd...",
];

const withRows = (rows: Record<number, string>) => BASE.map((r, i) => rows[i] ?? r);

const EYES_OFF = { 0: "......dd......", 4: "..dvvvvvvvvd..", 5: "..dvddvvddvd.." };

export const FRAMES = {
  idle: BASE,
  blink: withRows({ 4: "..dvvvvvvvvd..", 5: "..dveevveevd.." }),
  step: withRows({ 10: ".....d..d.....", 11: "....dd..dd...." }),
  sleep: withRows(EYES_OFF),
  off: withRows({ ...EYES_OFF, 9: "..daaaddaaad.." }),
  happy: withRows({ 0: "......ee......", 4: "..dvhhvvhhvd..", 9: "..daaaeeaaad.." }),
} as const;

export type FrameName = keyof typeof FRAMES;

const FILL: Record<string, string> = {
  a: "var(--accent)",
  d: "var(--accent-deep)",
  v: "var(--bg)",
  e: "var(--accent)",
  h: "var(--ink)",
};

export const SPRITE_W = 14;
export const SPRITE_H = 12;

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
