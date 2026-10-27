/**
 * Mote: a little pixel robot in the bottom-left corner. He reads the page the
 * visitor is on (route, the section in view, the text on screen) and says
 * something about it through /api/critter: once when a page opens, and again
 * when the visitor stops on a new section for a while. Pressing him, or `b`,
 * opens a line to talk back. He blips as he types (sfx.ts, mutable), dozes
 * when nobody moves, can be hushed, and falls back to a few canned lines when
 * the model can't be reached. Colours are theme tokens, so he follows the 1–6
 * switch like the deck does.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { isTyping } from "@/theme/keymap";
import { readStored, writeStored } from "@/theme/accent";
import { ask, type Mode, type Remark, type Turn } from "./api";
import { look, where } from "./glance";
import { BREATHER, offlineLine } from "./lines";
import { SIZE, frame, type Face } from "./sprite";
import { isMuted, setMuted, sfx, unlock } from "./sfx";

const HUSH_KEY = "nca-mote-hush";
const SEEN_KEY = "nca-mote-seen";

/** Wait after a page opens before reading it, so it has rendered and settled. */
const ARRIVE_DELAY = 2600;
/** How long a section has to stay in view before Mote remarks on it. */
const LINGER = 6000;
/** Least time between two unprompted remarks. */
const COOLDOWN = 40_000;
/** Unprompted remarks per visit, so a long read stays cheap. */
const MAX_AUTO = 12;
const DOZE_AFTER = 90_000;

const FALTER: Remark = { say: "my lamps are flickering. ask me again in a bit?", mood: "sleepy" };

const MOOD_FACE: Record<Remark["mood"], Face> = {
  curious: "idle",
  happy: "happy",
  thinking: "look",
  sleepy: "sleep",
  surprised: "surprised",
};

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function seenPaths(): Set<string> {
  try {
    return new Set(JSON.parse(window.sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function markSeen(path: string) {
  try {
    const seen = seenPaths();
    seen.add(path);
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* storage blocked: Mote may greet a page twice */
  }
}

export default function Mote() {
  const { pathname } = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLButtonElement>(null);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<Remark | null>(null);
  const [shown, setShown] = useState(0);
  const [heard, setHeard] = useState("");
  const [draft, setDraft] = useState("");
  const [blink, setBlink] = useState(false);
  const [pet, setPet] = useState(false);
  const [asleep, setAsleep] = useState(false);
  const [hushed, setHushed] = useState(() => readStored(HUSH_KEY) === "1");
  const [quiet, setQuiet] = useState(isMuted);

  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<Turn[]>([]);
  const lastRemark = useRef(0);
  const autoCount = useRef(0);
  const remarked = useRef(new Set<string>());
  // Mirrors of state the timers read, so they don't re-arm on every change.
  const live = useRef({ open, busy, asleep, hushed });
  live.current = { open, busy, asleep, hushed };

  const speak = useCallback(async (mode: Mode, question = "") => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const sight = look();
    if (mode !== "ask") {
      autoCount.current += 1;
      if (sight.section) remarked.current.add(sight.section);
    }
    lastRemark.current = Date.now();
    setBusy(true);
    sfx.think();
    try {
      const result = await ask(
        mode,
        sight,
        mode === "ask" ? { question, history: historyRef.current } : {},
        ac.signal,
      );
      let remark: Remark;
      if (typeof result !== "number") remark = result;
      else if (result === 429) remark = BREATHER;
      else if (mode === "ask") remark = FALTER;
      // Canned lines would repeat on every section; offline, Mote only greets.
      else if (mode === "arrive") remark = offlineLine(sight.path);
      else return;
      if (mode === "ask") {
        historyRef.current = [...historyRef.current, { who: "visitor" as const, text: question }, { who: "mote" as const, text: remark.say }].slice(-6);
      }
      setLine(remark);
    } catch {
      /* aborted by a newer remark */
    } finally {
      if (abortRef.current === ac) setBusy(false);
    }
  }, []);

  // A page opens: drop what was said about the last one and, once it has
  // settled, greet it (once per page per visit).
  useEffect(() => {
    remarked.current = new Set();
    if (!live.current.open) setLine(null);
    const t = window.setTimeout(() => {
      const { open, busy, asleep, hushed } = live.current;
      if (hushed || asleep || open || busy || autoCount.current >= MAX_AUTO) return;
      if (seenPaths().has(pathname)) return;
      markSeen(pathname);
      void speak("arrive");
    }, ARRIVE_DELAY);
    return () => window.clearTimeout(t);
  }, [pathname, speak]);

  // Reading along: when a new section (or hero scene) has held the top of
  // the viewport for a while, say something about it.
  useEffect(() => {
    let section = "";
    let since = Date.now();
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      const here = where();
      if (here !== section) {
        section = here;
        since = now;
        return;
      }
      const { open, busy, asleep, hushed } = live.current;
      if (!here || hushed || asleep || open || busy) return;
      if (now - since < LINGER || now - lastRemark.current < COOLDOWN || autoCount.current >= MAX_AUTO) return;
      if (remarked.current.has(here)) return;
      void speak("linger");
    }, 1500);
    return () => window.clearInterval(id);
  }, [speak]);

  // Dozing: no pointer, key or scroll for a while and Mote falls asleep;
  // anything wakes it.
  useEffect(() => {
    let last = Date.now();
    const stir = () => {
      last = Date.now();
      if (live.current.asleep) setAsleep(false);
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, stir, { passive: true }));
    const id = window.setInterval(() => {
      if (!live.current.asleep && !live.current.open && Date.now() - last > DOZE_AFTER) setAsleep(true);
    }, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, stir));
      window.clearInterval(id);
    };
  }, []);

  // Blinking, at uneven intervals.
  useEffect(() => {
    let t: number;
    const next = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        t = window.setTimeout(() => {
          setBlink(false);
          next();
        }, 140);
      }, 2400 + Math.random() * 3600);
    };
    next();
    return () => window.clearTimeout(t);
  }, []);

  // Typing the line out, then letting it fade unless the panel is open.
  useEffect(() => {
    if (!line) return;
    if (still()) {
      setShown(line.say.length);
      return;
    }
    setShown(0);
    const id = window.setInterval(() => {
      setShown((n) => {
        if (n >= line.say.length) window.clearInterval(id);
        return Math.min(n + 1, line.say.length);
      });
    }, 32);
    return () => window.clearInterval(id);
  }, [line]);

  const typing = line !== null && shown < line.say.length;

  // A blip every other letter, skipping spaces, like a 16-bit text box.
  useEffect(() => {
    if (!line || shown === 0 || shown > line.say.length || shown % 2) return;
    if (line.say[shown - 1] !== " ") sfx.blip(line.mood);
  }, [line, shown]);

  const wasAsleep = useRef(false);
  useEffect(() => {
    if (asleep !== wasAsleep.current) (asleep ? sfx.sleep : sfx.wake)();
    wasAsleep.current = asleep;
  }, [asleep]);

  // Audio may only start after a gesture; the first press or key opens it.
  useEffect(() => {
    const open = () => unlock();
    window.addEventListener("pointerdown", open, { once: true });
    window.addEventListener("keydown", open, { once: true });
    return () => {
      window.removeEventListener("pointerdown", open);
      window.removeEventListener("keydown", open);
    };
  }, []);

  useEffect(() => {
    if (!line || typing || open) return;
    const t = window.setTimeout(() => setLine(null), Math.max(6000, line.say.length * 90));
    return () => window.clearTimeout(t);
  }, [line, typing, open]);

  const close = useCallback(() => {
    setOpen(false);
    sfx.close();
    bodyRef.current?.focus();
  }, []);

  const toggle = useCallback(() => {
    unlock();
    setAsleep(false);
    const next = !live.current.open;
    (next ? sfx.open : sfx.close)();
    setOpen(next);
    if (!still()) {
      setPet(true);
      window.setTimeout(() => setPet(false), 600);
    }
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // `b` to talk to Mote, `Esc` to stop, with the site's usual key guards.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && live.current.open) {
        close();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || isTyping(e.target)) return;
      if (e.key === "b") {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle, close]);

  // Clicking anywhere else closes the panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      sfx.close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const question = draft.trim();
    if (!question || busy) return;
    setDraft("");
    setHeard(question);
    sfx.send();
    void speak("ask", question);
  };

  const hush = () => {
    const next = !hushed;
    setHushed(next);
    writeStored(HUSH_KEY, next ? "1" : "0");
    if (next) setLine({ say: "okay. i'll only talk when you ask.", mood: "sleepy" });
    else setLine({ say: "oh good. i had things to say.", mood: "happy" });
  };

  const toggleSound = () => {
    const next = !quiet;
    setQuiet(next);
    setMuted(next);
    if (!next) {
      unlock();
      sfx.hello();
    }
  };

  let face: Face;
  if (asleep) face = "sleep";
  else if (pet) face = "happy";
  else if (busy) face = "look";
  else if (typing) face = Math.floor(shown / 3) % 2 ? "talk" : "idle";
  else if (blink) face = "blink";
  else if (line) face = MOOD_FACE[line.mood];
  else face = "idle";

  const runs = useMemo(() => frame(face), [face]);
  const bubble = open || busy || line !== null;

  return (
    <div
      ref={rootRef}
      className="mote"
      data-open={open || undefined}
      data-busy={busy || undefined}
      data-asleep={asleep || undefined}
      data-pet={pet || undefined}
    >
      <div className="mote__panel" hidden={!bubble}>
        {open && heard && <p className="mote__heard">&gt; {heard}</p>}
        <p className="mote__line">
          {busy ? (
            <span className="mote__dots" aria-label="Mote is thinking" />
          ) : line ? (
            <>
              <span aria-hidden="true">{line.say.slice(0, shown)}</span>
              <span className="mote__unsaid" aria-hidden="true">{line.say.slice(shown)}</span>
            </>
          ) : (
            <span className="mote__hint">say something. i'm listening.</span>
          )}
        </p>
        {open && (
          <form className="mote__ask" onSubmit={submit}>
            <label className="sr-only" htmlFor="mote-ask">Say something to Mote</label>
            <span aria-hidden="true">&gt;</span>
            <input
              ref={inputRef}
              id="mote-ask"
              value={draft}
              maxLength={300}
              autoComplete="off"
              placeholder="ask about this page"
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" disabled={busy || !draft.trim()}>say</button>
          </form>
        )}
        {open && (
          <div className="mote__opts">
            <button type="button" onClick={hush} aria-pressed={hushed} title="Only talk when asked">
              {hushed ? "wake" : "hush"}
            </button>
            <button type="button" onClick={toggleSound} aria-pressed={!quiet} title="Sound effects">
              {quiet ? "sfx off" : "sfx on"}
            </button>
          </div>
        )}
      </div>
      {/* Screen readers get the whole line once, not every typed letter. */}
      <p className="sr-only" role="status" aria-live="polite">
        {line && !busy ? `Mote: ${line.say}` : ""}
      </p>

      <button
        ref={bodyRef}
        type="button"
        className="mote__body"
        aria-expanded={open}
        aria-keyshortcuts="b"
        aria-label={open ? "Stop talking to Mote" : "Talk to Mote, the site's little robot"}
        title="Mote (b to talk)"
        onClick={toggle}
      >
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} shapeRendering="crispEdges" aria-hidden="true">
          {runs.map((r) => (
            <rect key={`${r.x}-${r.y}`} className={`mote__px--${r.slot}`} x={r.x} y={r.y} width={r.w} height={1} />
          ))}
        </svg>
        <span className="mote__z" aria-hidden="true">z</span>
      </button>
    </div>
  );
}
