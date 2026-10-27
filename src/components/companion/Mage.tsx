/**
 * Wick's sprite: a 16×22 pixel map drawn as SVG rects, so it stays crisp at
 * any scale. Hat, coat and the rest keep their own colours; only the eyes
 * and the spark take the site accent, so he follows the 1–6 theme switch.
 * Eyes, the raised arm and the spark are drawn over the body per mood.
 */
import { memo } from "react";

export type Mood = "idle" | "think" | "talk" | "cast" | "sleep" | "poked";

/** Columns of the sprite, one string per row. "." is empty. */
const BODY = [
  "............kk..",
  "...........kHk..",
  "..........kLhk..",
  ".........kLHk...",
  "........kLHhk...",
  ".......kLHHhk...",
  ".......kLHHhhk..",
  "......kLHHHhhk..",
  ".....kLHHHHhhhk.",
  ".kkLLHHHHHHHHhhk",
  "khhhhhhhhhhhhhhk",
  ".kkkFFFFFFFFkkk.",
  "...kFFFFFFFFFk..",
  "...kFFFFFFFFFk..",
  "...kFFFFFFFFFk..",
  "....kCCCCCCck...",
  "...kBBBBBBBBbk..",
  "..kBBkBBBBBkbbk.",
  "..kBBkBBBBBkbbk.",
  "..kGGkBBBBBkGGk.",
  "...kkbBBBBBbkk..",
  "....kbbbbbbbk...",
  ".....kPpkPpk....",
  "....kSSSkSSSk...",
];

const SPRITE_W = 16;
const SPRITE_H = BODY.length;

const CLASS: Record<string, string> = {
  k: "wk-line",
  L: "wk-hat-light",
  H: "wk-hat",
  h: "wk-hat-shade",
  F: "wk-void",
  C: "wk-collar",
  c: "wk-collar-shade",
  B: "wk-coat",
  b: "wk-coat-shade",
  P: "wk-pants",
  p: "wk-pants-stripe",
  S: "wk-boot",
  G: "wk-glove",
};

/** Merges runs of one colour along a row, so the body is ~70 rects, not ~200. */
const RUNS = BODY.flatMap((row, y) => {
  const runs: { x: number; y: number; w: number; c: string }[] = [];
  for (let x = 0; x < row.length; x++) {
    const c = row[x];
    if (c === ".") continue;
    const last = runs[runs.length - 1];
    if (last && last.c === c && last.x + last.w === x) last.w++;
    else runs.push({ x, y, w: 1, c });
  }
  return runs;
});

interface Px {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

/** Eyes per mood; `look` shifts them a column toward the cursor. */
function eyes(mood: Mood, blink: boolean, look: -1 | 0 | 1): Px[] {
  if (mood === "sleep") return [{ x: 5, y: 14, w: 2, h: 1 }, { x: 9, y: 14, w: 2, h: 1 }];
  if (blink) return [];
  if (mood === "poked") return [{ x: 5, y: 12, w: 2, h: 2 }, { x: 9, y: 12, w: 2, h: 2 }];
  if (mood === "think") return [{ x: 7, y: 12, h: 2 }, { x: 11, y: 12, h: 2 }];
  if (mood === "cast") return [{ x: 6, y: 13 }, { x: 10, y: 13 }];
  return [{ x: 6 + look, y: 13, h: 2 }, { x: 10 + look, y: 13, h: 2 }];
}

/** The right arm raised for a spell, drawn over the resting one. */
const RAISED: (Px & { c: string })[] = [
  { x: 12, y: 17, w: 2, h: 3, c: "b" },
  { x: 14, y: 14, h: 3, c: "k" },
  { x: 15, y: 13, h: 3, c: "b" },
  { x: 14, y: 13, c: "B" },
  { x: 14, y: 12, w: 2, c: "G" },
];

const Rect = ({ x, y, w = 1, h = 1, className }: Px & { className: string }) => (
  <rect x={x} y={y} width={w} height={h} className={className} />
);

function Mage({ mood, blink, look }: { mood: Mood; blink: boolean; look: -1 | 0 | 1 }) {
  return (
    <svg
      className="wick__sprite"
      viewBox={`-1 -3 ${SPRITE_W + 2} ${SPRITE_H + 3}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {RUNS.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} className={CLASS[r.c]} />
      ))}
      {(mood === "cast" || mood === "talk") &&
        RAISED.map(({ c, ...p }, i) => <Rect key={`a${i}`} {...p} className={CLASS[c]} />)}
      <g className="wick__eyes">
        {eyes(mood, blink, look).map((p, i) => (
          <Rect key={`e${i}`} {...p} className="wk-eye" />
        ))}
      </g>
      {(mood === "cast" || mood === "talk") && (
        <g className="wick__spark">
          <Rect x={15} y={9} className="wk-spark" />
          <Rect x={14} y={9} className="wk-spark-dim" />
          <Rect x={16} y={9} className="wk-spark-dim" />
          <Rect x={15} y={8} className="wk-spark-dim" />
          <Rect x={15} y={10} className="wk-spark-dim" />
        </g>
      )}
    </svg>
  );
}

export default memo(Mage);
