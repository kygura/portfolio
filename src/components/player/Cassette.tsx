/**
 * The cassette, drawn flat and played by hand: a hairline shell, a label
 * written with what's loaded, the window lit in the accent like the one lamp
 * in a dark scene, and two reels whose tape packs trade size with progress.
 *
 * It is the deck's main control. Pressing the cassette plays or pauses;
 * grabbing a reel and winding it scrubs the tape (a turn is 30 s), when the
 * source can be scrubbed at all (a live stream can't). The hubs spin from
 * CSS while the deck is live (`.deck[data-live]`) and follow the pointer
 * while wound.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const SECONDS_PER_TURN = 30;

interface Props {
  progress: number;
  label: string;
  playing: boolean;
  onToggle: () => void;
  /** Move the tape by this many seconds; absent when the source can't seek. */
  onScrub?: (seconds: number) => void;
}

function Reel({
  cx,
  fill,
  turn,
  onGrab,
}: {
  cx: number;
  fill: number;
  turn: number | null;
  onGrab?: (e: ReactPointerEvent<SVGGElement>) => void;
}) {
  // Tape pack radius: an empty hub is 9, a full reel 25 (viewBox units).
  const pack = 9 + 16 * Math.min(1, Math.max(0, fill));
  return (
    <g className="cassette__reel" data-grab={onGrab ? "" : undefined} onPointerDown={onGrab}>
      {/* A full reel's worth of grip, so a nearly empty reel is still easy to catch. */}
      <circle className="cassette__grip" cx={cx} cy={50} r={25} />
      <circle className="cassette__pack" cx={cx} cy={50} r={pack} />
      <g
        className="cassette__hub"
        style={{
          transformOrigin: `${cx}px 50px`,
          transform: turn === null ? undefined : `rotate(${turn}rad)`,
        }}
      >
        <circle cx={cx} cy={50} r={7} />
        <path d={`M${cx} 43v14M${cx - 6.1} 46.5l12.2 7M${cx - 6.1} 53.5l12.2-7`} />
      </g>
    </g>
  );
}

export default function Cassette({ progress, label, playing, onToggle, onScrub }: Props) {
  // Accumulated hand rotation while a reel is held; null when let go.
  const [turn, setTurn] = useState<number | null>(null);
  const wound = useRef(false);

  const grab = (e: ReactPointerEvent<SVGGElement>) => {
    if (!onScrub) return;
    e.preventDefault();
    const box = e.currentTarget.querySelector(".cassette__hub")!.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    let last = Math.atan2(e.clientY - cy, e.clientX - cx);
    let total = 0;
    wound.current = false;
    setTurn(0);

    const move = (ev: PointerEvent) => {
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      // Shortest way round, so crossing ±π doesn't jump a whole turn.
      let d = a - last;
      if (d > Math.PI) d -= 2 * Math.PI;
      else if (d < -Math.PI) d += 2 * Math.PI;
      last = a;
      total += d;
      if (Math.abs(total) > 0.05) wound.current = true;
      setTurn(total);
      // Clockwise winds forward.
      onScrub((d / (2 * Math.PI)) * SECONDS_PER_TURN);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setTurn(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <button
      type="button"
      className="cassette"
      data-wound={turn !== null || undefined}
      aria-label={playing ? "Pause" : "Play"}
      aria-pressed={playing}
      aria-keyshortcuts="m"
      title={onScrub ? "Press to play / pause, wind a reel to scrub" : "Press to play / pause"}
      onClick={() => {
        // A wind that ends over the cassette isn't a press.
        if (wound.current) wound.current = false;
        else onToggle();
      }}
    >
      <svg viewBox="0 0 200 110" aria-hidden="true">
        <rect className="cassette__shell" x="0.5" y="0.5" width="199" height="109" />
        <rect className="cassette__label" x="12" y="8" width="176" height="15" />
        <text className="cassette__text" x="18" y="18.5">
          {label}
        </text>
        <clipPath id="deck-window">
          <rect x="40" y="30" width="120" height="40" />
        </clipPath>
        <rect className="cassette__window" x="40" y="30" width="120" height="40" />
        <g clipPath="url(#deck-window)">
          <Reel cx={64} fill={1 - progress} turn={turn} onGrab={onScrub ? grab : undefined} />
          <Reel cx={136} fill={progress} turn={turn} onGrab={onScrub ? grab : undefined} />
        </g>
        <path className="cassette__shell" d="M50 109.5 58 90h84l8 19.5" />
        {/* Play / pause glyph pressed into the shell's foot. */}
        <g className="cassette__glyph">
          {playing ? <path d="M95 96v8M105 96v8" /> : <path d="M96 95.5v9l8-4.5z" />}
        </g>
      </svg>
    </button>
  );
}
