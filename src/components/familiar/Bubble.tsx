/**
 * Bit's speech bubble: a small carved tablet with a rune header, the line
 * typed out in step with the voice, and a toggle for the sound. Screen
 * readers get the whole line at once; the typing is visual only.
 */
import { useEffect, useState } from "react";
import { CHAR_MS } from "./voice";

interface Props {
  text: string;
  muted: boolean;
  onToggleMute: () => void;
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Bubble({ text, muted, onToggleMute }: Props) {
  const [shown, setShown] = useState(() => (reducedMotion() ? text.length : 0));
  const typing = shown < text.length;

  useEffect(() => {
    if (!typing) return;
    const id = window.setTimeout(() => setShown((n) => n + 1), CHAR_MS);
    return () => window.clearTimeout(id);
  }, [shown, typing]);

  return (
    <div className="familiar__bubble">
      <div className="familiar__bubble-head">
        <span className="familiar__bubble-name">
          <span aria-hidden="true">◆</span> Bit
        </span>
        <button
          type="button"
          className={muted ? "familiar__bubble-mute familiar__bubble-mute--off" : "familiar__bubble-mute"}
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? "Unmute Bit's voice" : "Mute Bit's voice"}
          title={muted ? "Unmute" : "Mute"}
        >
          ♪
        </button>
      </div>
      <p className="familiar__bubble-text" aria-hidden="true">
        {text.slice(0, shown)}
        {typing && <span className="familiar__caret" />}
        {/* The untyped rest holds the bubble at its final size while it types. */}
        <span className="familiar__ghost">{text.slice(shown)}</span>
      </p>
      <span className="sr-only" role="status">
        {text}
      </span>
    </div>
  );
}
