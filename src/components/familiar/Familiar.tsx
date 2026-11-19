/**
 * Bit: a small stone automaton, woken from a ruin, that keeps to the
 * bottom-left corner of the page until you drag it somewhere else (or nudge
 * it with the arrow keys; Home sends it back). The spot is remembered. It reads whatever page you open and says
 * something about it (see quips.ts), mutters now and then while you read,
 * dozes when nothing moves for a while, hops when pressed, and has an
 * opinion on every colour palette you switch to. With reduced
 * motion it doesn't hover or hop, but it still talks.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useLocation } from "react-router-dom";
import { Sprite, type FrameName } from "./sprite";
import { addPet, readSpot, writeSpot, type Spot } from "./store";
import { fallbackQuips, pageQuips, paletteQuip, pick } from "./quips";
import { ACCENTS, useAccent } from "@/theme/accent";
import { Bubble } from "./Bubble";
import { CHAR_MS, chirp, hush, nextVoiceMode, setVoiceMode, voice, voiceMode, type VoiceMode } from "./voice";

const TICK = 160;
const SLEEP_AFTER = 40_000;
/** Let the new page render before reading it. */
const READ_DELAY = 1400;
/** How often Bit mutters on its own while you're on a page. */
const CHATTER_EVERY = 45_000;
/** How long a line stays up once it has finished typing. */
const LINGER_MS = 5000;
/** Palette switches in quick succession (holding `t`) get one reaction, to the last. */
const PALETTE_SETTLE = 450;

/** Movement before a press counts as a drag rather than a touch. */
const DRAG_SLOP = 5;
/** Gap kept between Bit and the viewport edge. */
const EDGE = 4;
/** Arrow-key step in px; Shift moves further. */
const NUDGE = 16;
const NUDGE_FAR = 64;
/** Space the bubble needs above Bit before it flips below instead. */
const BUBBLE_ROOM = 160;

type Mode = "idle" | "sleep" | "hop";

/** Room left for Bit's top-left corner once its own size and the edge gap are taken out. */
function room(el: HTMLElement) {
  const { width, height } = el.getBoundingClientRect();
  return {
    w: Math.max(0, window.innerWidth - width - 2 * EDGE),
    h: Math.max(0, window.innerHeight - height - 2 * EDGE),
    width,
  };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function spotAt(el: HTMLElement, left: number, top: number): Spot {
  const r = room(el);
  return { x: r.w ? clamp01((left - EDGE) / r.w) : 0, y: r.h ? clamp01((top - EDGE) / r.h) : 0 };
}

/** Put Bit at a spot (or back in its CSS corner) and turn the bubble toward open space. */
function placeAt(el: HTMLElement, spot: Spot | null) {
  if (!spot) {
    el.style.removeProperty("left");
    el.style.removeProperty("top");
    el.style.removeProperty("bottom");
    el.removeAttribute("data-bubble-x");
    el.removeAttribute("data-bubble-y");
    return;
  }
  const r = room(el);
  const left = EDGE + spot.x * r.w;
  const top = EDGE + spot.y * r.h;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.bottom = "auto";
  el.toggleAttribute("data-bubble-x", left + r.width / 2 > window.innerWidth / 2);
  el.toggleAttribute("data-bubble-y", top < BUBBLE_ROOM);
}

export default function Familiar() {
  const { pathname } = useLocation();
  const [mode, setMode] = useState<Mode>("idle");
  const [frame, setFrame] = useState<FrameName>("idle");
  const [bubble, setBubble] = useState<{ text: string; id: number } | null>(null);
  const [voiceSetting, setVoiceSetting] = useState<VoiceMode>(voiceMode);

  const lastActive = useRef(Date.now());
  const hopLeft = useRef(0);
  const tick = useRef(0);
  const bubbleTimer = useRef<number>();
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Where Bit stands. Dragging moves the element directly and saves on release.
  const rootRef = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<Spot | null>(readSpot);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; dx: number; dy: number; sx: number; sy: number; spot: Spot | null } | null>(null);
  const noClickUntil = useRef(0);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    placeAt(el, spot);
    const onResize = () => placeAt(el, spot);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [spot]);

  const setDown = (next: Spot | null) => {
    setSpot(next);
    writeSpot(next);
  };

  // Lines for the current page: the model's when it answered, then stock ones.
  const lines = useRef<string[]>(fallbackQuips(pathname));
  const said = useRef(new Set<string>());

  const say = useCallback((text: string, linger = LINGER_MS, silent = false) => {
    setBubble({ text, id: Date.now() });
    if (!silent) voice(text);
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), text.length * CHAR_MS + linger);
  }, []);

  const cycleVoice = () => {
    const next = nextVoiceMode(voiceSetting);
    hush();
    setVoiceMode(next);
    setVoiceSetting(next);
  };

  /** Next line not yet said on this page; stock lines once the page's run out. */
  const nextLine = useCallback(() => {
    const fresh = lines.current.filter((l) => !said.current.has(l));
    const line = fresh.length ? fresh[0] : pick(fallbackQuips(pathname));
    said.current.add(line);
    return line;
  }, [pathname]);

  // A new page: read it, then remark on it.
  useEffect(() => {
    const ctrl = new AbortController();
    lines.current = fallbackQuips(pathname);
    said.current = new Set();
    const id = window.setTimeout(async () => {
      const fromModel = await pageQuips(pathname, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (fromModel) lines.current = [...fromModel, ...lines.current];
      // Stock lines start at a random point so the fallback doesn't always open the same way.
      else lines.current = [pick(lines.current), ...lines.current];
      if (modeRef.current !== "sleep") say(nextLine());
    }, READ_DELAY);
    return () => {
      ctrl.abort();
      window.clearTimeout(id);
    };
  }, [pathname, say, nextLine]);

  // Mutter now and then while the visitor reads.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (modeRef.current === "idle" && !document.hidden) say(nextLine());
    }, CHATTER_EVERY);
    return () => window.clearInterval(id);
  }, [say, nextLine]);

  // Any pointer movement keeps Bit awake.
  useEffect(() => {
    const onMove = () => {
      lastActive.current = Date.now();
      if (modeRef.current === "sleep") {
        setMode("idle");
        chirp("wake");
        say("!", 900);
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.clearTimeout(bubbleTimer.current);
    };
  }, [say]);

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
        if (tick.current % 25 === 0) say("z", 1400, true);
        return;
      }

      setFrame(tick.current % 30 === 0 ? "blink" : tick.current % 2 ? "step" : "idle");
    }, TICK);
    return () => window.clearInterval(id);
  }, [say]);

  // A new palette: wake, flicker the runes, hop, and say what Bit thinks of it.
  const accent = useAccent();
  const seenAccent = useRef(accent);
  const [shifting, setShifting] = useState(false);
  useEffect(() => {
    if (accent === seenAccent.current) return;
    seenAccent.current = accent;
    const id = window.setTimeout(() => {
      lastActive.current = Date.now();
      chirp("wake");
      say(paletteQuip(ACCENTS[accent].id));
      hopLeft.current = 4;
      setMode("hop");
      setFrame("happy");
      setShifting(true);
    }, PALETTE_SETTLE);
    return () => window.clearTimeout(id);
  }, [accent, say]);

  useEffect(() => {
    if (!shifting) return;
    const id = window.setTimeout(() => setShifting(false), 900);
    return () => window.clearTimeout(id);
  }, [shifting]);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    const el = rootRef.current;
    if (!el || (e.pointerType === "mouse" && e.button !== 0)) return;
    const r = el.getBoundingClientRect();
    drag.current = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, spot: null };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const el = rootRef.current;
    if (!d || !el || d.id !== e.pointerId) return;
    if (!d.spot && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_SLOP) return;
    if (!d.spot) setDragging(true);
    d.spot = spotAt(el, e.clientX - d.dx, e.clientY - d.dy);
    placeAt(el, d.spot);
  };

  const endDrag = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.spot) return;
    // The release of a drag also fires a click; that one isn't a touch.
    noClickUntil.current = performance.now() + 300;
    setDragging(false);
    setDown(d.spot);
    chirp("touch");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const el = rootRef.current;
    if (!el) return;
    if (e.key === "Home") {
      e.preventDefault();
      setDown(null);
      return;
    }
    const step = e.shiftKey ? NUDGE_FAR : NUDGE;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = delta[e.key];
    if (!move) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    setDown(spotAt(el, r.left + move[0], r.top + move[1]));
  };

  const pet = () => {
    if (performance.now() < noClickUntil.current) return;
    lastActive.current = Date.now();
    const n = addPet();
    chirp("touch");
    say(n % 25 === 0 ? `${n} touches. stone remembers every one.` : nextLine());
    hopLeft.current = 4;
    setMode("hop");
    setFrame("happy");
  };

  return (
    <div ref={rootRef} className="familiar" data-mode={mode} data-shift={shifting || undefined} data-drag={dragging || undefined}>
      {bubble && (
        <Bubble key={bubble.id} text={bubble.text} voiceMode={voiceSetting} onCycleVoice={cycleVoice} />
      )}
      <button
        type="button"
        className="familiar__body"
        onClick={pet}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        aria-label="Bit, an old automaton. Press to touch it. Drag it, or use the arrow keys, to move it; Home returns it to the corner."
      >
        <Sprite frame={frame} />
      </button>
    </div>
  );
}
