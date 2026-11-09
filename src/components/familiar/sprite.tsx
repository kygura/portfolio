/**
 * Moss, drawn on a 14×12 grid. Each frame is a list of rows; a character is
 * one cell: `a` body (accent), `d` shade (accent-deep), `e` eye (page ground),
 * `h` highlight (ink), `.` empty. Colours are theme tokens, so Moss changes
 * with the palette like everything else on the site.
 */

const BASE = [
  ".......aa.....",
  "......daa.....",
  "......d.......",
  "....aaaaaa....",
  "...aaaaaaaa...",
  "..ahaaaaaaaa..",
  "..aaeaaaaeaa..",
  "..aaeaaaaeaa..",
  "..aaaaaaaaaa..",
  "..daaaaaaaad..",
  "...dddddddd...",
  "...d.d..d.d...",
];

const withRows = (rows: Record<number, string>) => BASE.map((r, i) => rows[i] ?? r);

export const FRAMES = {
  idle: BASE,
  blink: withRows({ 6: "..aaaaaaaaaa..", 7: "..aadaaaadaa.." }),
  step: withRows({ 11: "....d.dd.d...." }),
  sleep: withRows({
    0: "..............",
    1: "......dd......",
    2: "......d.......",
    6: "..aaaaaaaaaa..",
    7: "..addaaaadda..",
  }),
  happy: withRows({ 6: "..adeaaaaeda..", 7: "..aaaaaaaaaa..", 8: "..aaaddddaaa.." }),
} as const;

export type FrameName = keyof typeof FRAMES;

const FILL: Record<string, string> = {
  a: "var(--accent)",
  d: "var(--accent-deep)",
  e: "var(--bg)",
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
