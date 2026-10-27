/**
 * A small black-mage critter fixed to the bottom-left corner. Click it (or
 * wait a moment after changing page) and it reads the page you are on and
 * says one thing about it, written by Claude via /api/mascot. Sound is
 * synthesised and can be switched off; the choice persists. It sits outside
 * the routes like the tape deck.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { readStored, writeStored } from "@/theme/accent";
import { playBlip, playMascotCue } from "@/theme/sfx";
import { BLINK, CLOSED, IDLE, PALETTE } from "./sprite";

const MUTE_KEY = "nca-mascot-mute";
const HIDE_KEY = "nca-mascot-hide";
const PX = 5;
const AUTO_DELAY = 2800;
const MIN_GAP = 25_000;
const AUTO_LIMIT = 10;

type State = "idle" | "thinking" | "talking";

/** What the page says, trimmed: headings first, then body text near the top. */
function readPage() {
  const root = document.querySelector("main") ?? document.body;
  const headings = [...root.querySelectorAll("h1,h2,h3")]
    .map((h) => (h.textContent ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);
  const text = (root as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 3500);
  return { path: location.pathname, title: document.title, headings, text };
}

function sprite(eyes: "open" | "blink" | "closed") {
  const rows = [...IDLE];
  if (eyes !== "open") {
    const [a, b] = eyes === "blink" ? BLINK : CLOSED;
    rows[7] = a;
    rows[8] = b;
  }
  const rects: JSX.Element[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const fill = PALETTE[c];
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    }),
  );
  return rects;
}

export default function Mascot() {
  const { pathname } = useLocation();
  const [hidden, setHidden] = useState(() => readStored(HIDE_KEY) === "1");
  const [muted, setMuted] = useState(() => readStored(MUTE_KEY) === "1");
  const [state, setState] = useState<State>("idle");
  const [blink, setBlink] = useState(false);
  const [line, setLine] = useState("");
  const [shown, setShown] = useState("");
  const lastAsk = useRef(0);
  const autoCount = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const cue = useCallback((c: Parameters<typeof playMascotCue>[0]) => {
    if (!mutedRef.current) playMascotCue(c);
  }, []);

  const ask = useCallback(
    async (manual: boolean) => {
      if (state === "thinking") return;
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      lastAsk.current = Date.now();
      setState("thinking");
      setLine("");
      setShown("");
      cue("think");
      try {
        const res = await fetch("/api/mascot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...readPage(), manual }),
          signal: ctl.signal,
        });
        const data = (await res.json()) as { line?: string };
        if (!res.ok || !data.line) throw new Error("no line");
        setLine(data.line);
        setState("talking");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setLine(manual ? "…my thoughts fizzled. Try me again?" : "");
        setState(manual ? "talking" : "idle");
      }
    },
    [state, cue],
  );

  // Typewriter with a blip per letter.
  useEffect(() => {
    if (state !== "talking" || !line) return;
    let i = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(line);
    } else {
      const id = window.setInterval(() => {
        i += 1;
        setShown(line.slice(0, i));
        if (!mutedRef.current && /\S/.test(line[i - 1] ?? "") && i % 2 === 0) playBlip(line.charCodeAt(i - 1));
        if (i >= line.length) window.clearInterval(id);
      }, 32);
      return () => window.clearInterval(id);
    }
  }, [state, line]);

  // Speech lingers, then fades.
  useEffect(() => {
    if (state !== "talking" || shown.length < line.length) return;
    cue("done");
    const id = window.setTimeout(() => {
      setState("idle");
      setLine("");
      setShown("");
    }, 6000 + line.length * 40);
    return () => window.clearTimeout(id);
  }, [state, shown, line, cue]);

  // Blink now and then.
  useEffect(() => {
    const id = window.setInterval(() => {
      setBlink(true);
      window.setTimeout(() => setBlink(false), 140);
    }, 3600);
    return () => window.clearInterval(id);
  }, []);

  // React to navigation, sparingly.
  useEffect(() => {
    if (hidden) return;
    const id = window.setTimeout(() => {
      if (autoCount.current >= AUTO_LIMIT || Date.now() - lastAsk.current < MIN_GAP) return;
      autoCount.current += 1;
      void ask(false);
    }, AUTO_DELAY);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, hidden]);

  const eyes = state === "thinking" || blink ? (state === "thinking" ? "closed" : "blink") : "open";
  const art = useMemo(() => sprite(eyes), [eyes]);

  if (hidden) {
    return (
      <button
        type="button"
        aria-label="Wake the mascot"
        className="fixed bottom-4 left-4 z-40 h-7 w-7 border border-[color:var(--ink-3)] bg-[color:var(--background)] font-mono text-xs text-[color:var(--accent)]"
        onClick={() => {
          writeStored(HIDE_KEY, "0");
          setHidden(false);
          cue("wake");
        }}
      >
        ✦
      </button>
    );
  }

  const bubble = state === "thinking" ? "…" : shown;

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-40 flex max-w-[min(18rem,calc(100vw-2rem))] flex-col items-start gap-2">
      {bubble && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-auto border border-[color:var(--accent)] bg-[color:var(--background)] px-3 py-2 font-mono text-xs leading-relaxed text-[color:var(--ink)] shadow-[3px_3px_0_var(--accent-deep)]"
        >
          {bubble}
        </div>
      )}
      <div className="pointer-events-auto group relative">
        <button
          type="button"
          aria-label="Ask the mascot about this page"
          onClick={() => {
            if (!mutedRef.current) playMascotCue("wake");
            void ask(true);
          }}
          className={`mascot-body block ${state === "talking" ? "mascot-talk" : "mascot-bob"}`}
        >
          <svg
            width={16 * PX}
            height={16 * PX}
            viewBox="0 0 16 16"
            shapeRendering="crispEdges"
            style={{ imageRendering: "pixelated" }}
            aria-hidden
          >
            {art}
          </svg>
        </button>
        <div className="absolute -right-12 top-0 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            aria-label={muted ? "Unmute mascot" : "Mute mascot"}
            className="h-5 w-5 border border-[color:var(--ink-3)] bg-[color:var(--background)] font-mono text-[10px] text-[color:var(--ink-2)]"
            onClick={() => {
              writeStored(MUTE_KEY, muted ? "0" : "1");
              setMuted(!muted);
            }}
          >
            {muted ? "♪̸" : "♪"}
          </button>
          <button
            type="button"
            aria-label="Send the mascot away"
            className="h-5 w-5 border border-[color:var(--ink-3)] bg-[color:var(--background)] font-mono text-[10px] text-[color:var(--ink-2)]"
            onClick={() => {
              abort.current?.abort();
              cue("bye");
              writeStored(HIDE_KEY, "1");
              setHidden(true);
              setState("idle");
              setLine("");
              setShown("");
            }}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
