/**
 * Bit's speech bubble: a small carved tablet with a rune header, the line
 * typed out in step with the voice, and a toggle for the sound. Screen
 * readers get the whole line at once; the typing is visual only.
 */
import { useEffect, useState } from "react";
import { CHAR_MS, type VoiceMode } from "./voice";

interface Props {
  text: string;
  voiceMode: VoiceMode;
  onCycleVoice: () => void;
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const MODE_LABEL: Record<VoiceMode, string> = { babble: "babble", speech: "voice", off: "mute" };
const MODE_HINT: Record<VoiceMode, string> = {
  babble: "Bit babbles in bitcrushed blips. Press for a spoken voice.",
  speech: "Bit speaks with a robotic voice. Press to mute.",
  off: "Bit is silent. Press for the babble.",
};

export function Bubble({ text, voiceMode, onCycleVoice }: Props) {
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
          className={`familiar__bubble-voice familiar__bubble-voice--${voiceMode}`}
          onClick={onCycleVoice}
          aria-label={`Voice: ${MODE_LABEL[voiceMode]}. ${MODE_HINT[voiceMode]}`}
          title={MODE_HINT[voiceMode]}
        >
          <span aria-hidden="true">{voiceMode === "off" ? "♪̶" : "♪"}</span> {MODE_LABEL[voiceMode]}
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
