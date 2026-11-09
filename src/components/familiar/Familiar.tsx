/**
 * Bit: a small stone automaton, woken from a ruin, that keeps to the
 * bottom-left corner of the page. It reads whatever page you open and says
 * something about it (see quips.ts), mutters now and then while you read,
 * dozes when nothing moves for a while, and hops when pressed. With reduced
 * motion it doesn't hover or hop, but it still talks.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Sprite, type FrameName } from "./sprite";
import { addPet } from "./store";
import { fallbackQuips, pageQuips, pick } from "./quips";
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

type Mode = "idle" | "sleep" | "hop";

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

  const pet = () => {
    lastActive.current = Date.now();
    const n = addPet();
    chirp("touch");
    say(n % 25 === 0 ? `${n} touches. the stone grows warm.` : nextLine());
    hopLeft.current = 4;
    setMode("hop");
    setFrame("happy");
  };

  return (
    <div className="familiar" data-mode={mode}>
      {bubble && (
        <Bubble key={bubble.id} text={bubble.text} voiceMode={voiceSetting} onCycleVoice={cycleVoice} />
      )}
      <button
        type="button"
        className="familiar__body"
        onClick={pet}
        aria-label="Bit, an old automaton. Press to touch it."
      >
        <Sprite frame={frame} />
      </button>
    </div>
  );
}
