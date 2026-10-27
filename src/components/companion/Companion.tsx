/**
 * Wick, a tiny black mage who lives in the bottom-left corner. He reads what the
 * visitor can see (readPage.ts) and says one short line about it, written by
 * Haiku at /api/companion: once when a page opens, now and then when the
 * visitor stops scrolling to read, and whenever he's poked. Lines type out
 * with a blip per letter. He dozes after a while with nothing happening.
 *
 * Model calls are budgeted per session (and rate limited on the server); past
 * the budget, or with no API, he falls back to a few lines of his own. Sound
 * and chatter (the unprompted lines) can each be turned off from his bubble.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { readStored, writeStored } from "@/theme/accent";
import Mage, { type Mood } from "./Mage";
import { readPage, type PageView } from "./readPage";
import { setMuted, sfx } from "./sfx";

type Trigger = "arrive" | "linger" | "poke";

const STORE_KEY = "nca-wick";
const SPOKEN_KEY = "nca-wick-pages";

/** Unprompted lines per session, and poked ones, before he stops asking the model. */
const AUTO_BUDGET = 8;
const POKE_BUDGET = 30;
const ARRIVE_DELAY = 2600;
/** Scroll must rest this long, and this long after his last unprompted line. */
const LINGER_REST = 2400;
const LINGER_GAP = 45_000;
const SLEEP_AFTER = 50_000;
const TYPE_MS = 30;

interface Saved {
  muted: boolean;
  quiet: boolean;
}

function loadSaved(): Saved {
  try {
    return { muted: false, quiet: false, ...JSON.parse(readStored(STORE_KEY) ?? "{}") };
  } catch {
    return { muted: false, quiet: false };
  }
}

function loadSpoken(): Set<string> {
  try {
    return new Set(JSON.parse(window.sessionStorage.getItem(SPOKEN_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveSpoken(paths: Set<string>) {
  try {
    window.sessionStorage.setItem(SPOKEN_KEY, JSON.stringify([...paths]));
  } catch {
    /* private mode: he may greet a page twice */
  }
}

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/** His own lines, for when the model can't be reached or the budget is spent. */
function ownLine(view: PageView, trigger: Trigger): string {
  if (trigger === "poke" && Math.random() < 0.5) {
    return pick([
      "Oh! You startled me. I was reading.",
      "M-my hat! Careful, it's the only one I have.",
      "That tickles. Do you need a spell? I only know small ones.",
    ]);
  }
  const heading = view.heading.length > 2 && view.heading.length < 60 ? view.heading : null;
  return pick([
    heading ? `"${heading}"… it sounds like a spell I haven't learned yet.` : "The words here hum a little. I like this part.",
    "I-I'm still learning to read this fast. Go on, I'll catch up.",
    "If I read it twice, maybe it'll stick. Embers help me think.",
    heading ? `I'll remember "${heading}". Probably.` : "I'll remember this page. Probably.",
  ]);
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function Companion() {
  const { pathname } = useLocation();
  const saved = useRef(loadSaved()).current;
  const rootRef = useRef<HTMLDivElement>(null);

  const [mood, setMood] = useState<Mood>("idle");
  const [line, setLine] = useState<string | null>(null);
  const [shown, setShown] = useState(0);
  const [open, setOpen] = useState(false);
  const [blink, setBlink] = useState(false);
  const [look, setLook] = useState<-1 | 0 | 1>(0);
  const [muted, setMutedState] = useState(saved.muted);
  const [quiet, setQuiet] = useState(saved.quiet);
  // The home hero's strip is on screen: on phones he stands on top of it.
  const [lift, setLift] = useState(false);

  const busy = useRef(false);
  const recent = useRef<string[]>([]);
  const spoken = useRef<Set<string>>(loadSpoken());
  const autoCount = useRef(0);
  const pokeCount = useRef(0);
  const lastAuto = useRef(0);
  const lastHeading = useRef("");
  const timers = useRef<{ type?: number; hide?: number; cast?: number }>({});
  const live = useRef({ quiet, mood });
  live.current = { quiet, mood };

  useEffect(() => setMuted(muted), [muted]);
  useEffect(() => writeStored(STORE_KEY, JSON.stringify({ muted, quiet })), [muted, quiet]);

  const clearTimers = () => {
    window.clearInterval(timers.current.type);
    window.clearTimeout(timers.current.hide);
    window.clearTimeout(timers.current.cast);
  };
  useEffect(() => clearTimers, []);

  /** Casts, then types the line out with a blip per letter. */
  const say = useCallback((text: string) => {
    clearTimers();
    recent.current = [...recent.current, text].slice(-3);
    setLine(text);
    setOpen(true);

    const finish = () => {
      window.clearInterval(timers.current.type);
      setShown(text.length);
      setMood("idle");
      busy.current = false;
      timers.current.hide = window.setTimeout(() => setOpen(false), 5000 + text.length * 45);
    };

    if (reducedMotion()) {
      sfx.blip();
      finish();
      return;
    }

    setShown(0);
    setMood("cast");
    sfx.cast();
    timers.current.cast = window.setTimeout(() => {
      setMood("talk");
      let i = 0;
      timers.current.type = window.setInterval(() => {
        i++;
        setShown(i);
        if (i % 2 === 0 && /\S/.test(text[i - 1] ?? "")) sfx.blip();
        if (i >= text.length) finish();
      }, TYPE_MS);
    }, 420);
  }, []);

  const speak = useCallback(
    async (trigger: Trigger) => {
      if (busy.current) return;
      if (trigger !== "poke" && (live.current.quiet || document.hidden || autoCount.current >= AUTO_BUDGET)) return;
      busy.current = true;
      clearTimers();

      const view = readPage();
      lastHeading.current = view.heading;
      if (trigger === "poke") pokeCount.current++;
      else {
        autoCount.current++;
        lastAuto.current = Date.now();
      }

      let text: string | null = null;
      if (trigger !== "poke" || pokeCount.current <= POKE_BUDGET) {
        setMood("think");
        setLine(null);
        setOpen(true);
        sfx.think();
        try {
          const res = await fetch("/api/companion", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...view, trigger, recent: recent.current }),
            signal: AbortSignal.timeout(9000),
          });
          if (res.ok) text = ((await res.json()) as { line?: string }).line ?? null;
        } catch {
          /* falls back to his own line */
        }
      }
      // A page change while he was thinking: the line is about a page that's gone.
      if (view.path !== window.location.pathname) {
        busy.current = false;
        setMood("idle");
        setOpen(false);
        return;
      }
      say(text ?? ownLine(view, trigger));
    },
    [say],
  );

  // Arriving on a page: one line, once per page per session.
  useEffect(() => {
    if (spoken.current.has(pathname)) return;
    const timer = window.setTimeout(() => {
      if (live.current.quiet) return;
      spoken.current.add(pathname);
      saveSpoken(spoken.current);
      void speak("arrive");
    }, ARRIVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [pathname, speak]);

  // Lingering: scroll comes to rest on a new section, long after his last line.
  useEffect(() => {
    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (Date.now() - lastAuto.current < LINGER_GAP) return;
        const { heading } = readPage();
        if (!heading || heading === lastHeading.current) return;
        void speak("linger");
      }, LINGER_REST);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
  }, [speak]);

  // Dozing: nothing for a while puts him to sleep; anything wakes him quietly.
  useEffect(() => {
    let timer = 0;
    const doze = () => {
      if (busy.current) return arm();
      setOpen(false);
      setMood("sleep");
      sfx.sleep();
    };
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(doze, SLEEP_AFTER);
    };
    const stir = () => {
      if (live.current.mood === "sleep") setMood("idle");
      arm();
    };
    arm();
    const events = ["pointermove", "pointerdown", "keydown", "scroll", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, stir, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, stir));
    };
  }, []);

  useEffect(() => {
    setLift(false);
    let observer: IntersectionObserver | null = null;
    // The page renders after the route changes; look for the strip a beat later.
    const timer = window.setTimeout(() => {
      const strip = document.querySelector(".hero__strip");
      if (!strip) return;
      observer = new IntersectionObserver(([entry]) => setLift(entry.isIntersecting));
      observer.observe(strip);
    }, 300);
    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [pathname]);

  // Blinking, at uneven intervals.
  useEffect(() => {
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(() => {
        setBlink(true);
        timer = window.setTimeout(() => {
          setBlink(false);
          next();
        }, 130);
      }, 2400 + Math.random() * 3600);
    };
    next();
    return () => window.clearTimeout(timer);
  }, []);

  // His eyes follow the cursor left and right.
  useEffect(() => {
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = rootRef.current?.querySelector(".wick__body")?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2);
        setLook(dx < -60 ? -1 : dx > 60 ? 1 : 0);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  const poke = () => {
    // Mid-sentence, a poke finishes the line instead.
    if (busy.current && mood === "talk" && line) {
      clearTimers();
      setShown(line.length);
      setMood("idle");
      busy.current = false;
      timers.current.hide = window.setTimeout(() => setOpen(false), 5000 + line.length * 45);
      return;
    }
    if (busy.current) return;
    if (mood === "sleep") sfx.wake();
    else sfx.poke();
    setMood("poked");
    busy.current = true;
    timers.current.cast = window.setTimeout(() => {
      busy.current = false;
      void speak("poke");
    }, 380);
  };

  const typed = line ? line.slice(0, shown) : "";

  return (
    <div ref={rootRef} className="wick" data-mood={mood} data-lift={lift || undefined}>
      {open && (
        <div className="wick__bubble" role="status">
          <span className="wick__name" aria-hidden="true">Wick</span>
          {line ? (
            <p className="wick__line">
              <span aria-hidden="true">{typed}</span>
              <span className="sr-only">Wick says: {line}</span>
            </p>
          ) : (
            <p className="wick__line wick__dots" aria-label="Wick is thinking" />
          )}
          <div className="wick__controls">
            <button type="button" onClick={() => setMutedState((m) => !m)} aria-pressed={!muted}>
              sound {muted ? "off" : "on"}
            </button>
            <button type="button" onClick={() => setQuiet((q) => !q)} aria-pressed={!quiet} title="Unprompted remarks">
              chatter {quiet ? "off" : "on"}
            </button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        className="wick__body"
        onClick={poke}
        aria-label="Wick, the site's little mage. Ask what he makes of this page."
      >
        <Mage mood={mood} blink={blink} look={look} />
        {mood === "sleep" && (
          <span className="wick__z" aria-hidden="true">
            z
          </span>
        )}
      </button>
    </div>
  );
}
