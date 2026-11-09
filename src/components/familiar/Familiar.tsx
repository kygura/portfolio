/**
 * Bit: a small robot that lives along the bottom edge of the page.
 * It wanders, drifts toward the pointer when it comes near the floor, dozes
 * off when nothing moves for a while, and hops when pressed. Movement is
 * stepped on a slow tick on purpose, to match the pixel art. With reduced
 * motion it stays put and only reacts to presses.
 */
import { useEffect, useRef, useState } from "react";
import { Sprite, type FrameName } from "./sprite";
import { addPet } from "./store";

const TICK = 160;
const STEP = 4;
const SLEEP_AFTER = 40_000;
const NEAR_FLOOR = 180;
// Keep clear of the tape deck in the bottom-right corner.
const RIGHT_CLEARANCE = 150;
const WIDTH = 42;

const QUIPS = [
  "beep.",
  "♥",
  "you found me.",
  "try pressing t.",
  "0 bugs found. (lie)",
  "battery: 100%",
  "g then h goes home.",
  "don't tell anyone about the hollow.",
  "boop?",
];

type Mode = "idle" | "walk" | "sleep" | "hop";

const maxX = () => Math.max(12, window.innerWidth - RIGHT_CLEARANCE - WIDTH);
const clamp = (x: number) => Math.min(maxX(), Math.max(12, x));

export default function Familiar() {
  const reduced = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ).current;

  const [x, setX] = useState(() => clamp(window.innerWidth * 0.2));
  const [mode, setMode] = useState<Mode>("idle");
  const [frame, setFrame] = useState<FrameName>("idle");
  const [facing, setFacing] = useState<1 | -1>(1);
  const [bubble, setBubble] = useState<string | null>(null);

  const target = useRef(x);
  const lastActive = useRef(Date.now());
  const hopLeft = useRef(0);
  const tick = useRef(0);
  const bubbleTimer = useRef<number>();
  const xRef = useRef(x);
  const modeRef = useRef(mode);
  xRef.current = x;
  modeRef.current = mode;

  const say = (text: string, ms = 2600) => {
    setBubble(text);
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  };

  // Pointer activity keeps Bit awake; near the floor it comes over to look.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      lastActive.current = Date.now();
      if (modeRef.current === "sleep") {
        setMode("idle");
        say("!", 900);
      }
      if (reduced || modeRef.current === "hop") return;
      if (window.innerHeight - e.clientY < NEAR_FLOOR) {
        const dx = e.clientX - (xRef.current + WIDTH / 2);
        if (Math.abs(dx) > 30) {
          target.current = clamp(e.clientX - WIDTH / 2 - Math.sign(dx) * 36);
          setMode("walk");
        } else {
          setFacing(dx < 0 ? -1 : 1);
        }
      }
    };
    const onResize = () => setX((v) => clamp(v));
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(bubbleTimer.current);
    };
  }, [reduced]);

  useEffect(() => {
    const id = window.setInterval(() => {
      tick.current++;
      const m = modeRef.current;

      if (m === "hop") {
        hopLeft.current--;
        setFrame("happy");
        if (hopLeft.current <= 0) setMode("idle");
        return;
      }

      if (m !== "sleep" && Date.now() - lastActive.current > SLEEP_AFTER) {
        setMode("sleep");
        setFrame("sleep");
        return;
      }

      if (m === "sleep") {
        setFrame("sleep");
        if (tick.current % 25 === 0) say("z", 1400);
        return;
      }

      if (m === "walk" && !reduced) {
        const dx = target.current - xRef.current;
        if (Math.abs(dx) <= STEP) {
          setX(target.current);
          setMode("idle");
          setFrame("idle");
        } else {
          setFacing(dx < 0 ? -1 : 1);
          setX((v) => clamp(v + Math.sign(dx) * STEP));
          setFrame(tick.current % 2 ? "step" : "idle");
        }
        return;
      }

      // Idle: blink now and then, sometimes wander off.
      setFrame(tick.current % 30 === 0 ? "blink" : "idle");
      if (!reduced && Math.random() < 0.012) {
        target.current = clamp(12 + Math.random() * maxX());
        setMode("walk");
      }
    }, TICK);
    return () => window.clearInterval(id);
  }, [reduced]);

  const pet = () => {
    lastActive.current = Date.now();
    const n = addPet();
    const line = n % 25 === 0 ? `${n} pats. affection.exe running.` : QUIPS[Math.floor(Math.random() * QUIPS.length)];
    say(line);
    hopLeft.current = 4;
    setMode("hop");
    setFrame("happy");
  };

  return (
    <div className="familiar" style={{ transform: `translateX(${x}px)` }} data-mode={mode}>
      {bubble && (
        <span className="familiar__bubble" role="status">
          {bubble}
        </span>
      )}
      <button
        type="button"
        className="familiar__body"
        onClick={pet}
        aria-label="Bit, your robot. Press to pat."
        style={{ transform: `scaleX(${facing})` }}
      >
        <Sprite frame={frame} />
      </button>
    </div>
  );
}
