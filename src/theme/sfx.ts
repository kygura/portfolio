/**
 * Synthesised sound effects (no audio files). One short motif per accent,
 * pitched up the spectrum so the order is audible: Rose lowest, Sky highest,
 * Graphite a dry click. Browsers only allow audio after a gesture, and
 * switches always come from one, so the context is created lazily on first use.
 */
import type { Accent } from "./accent";

interface Voice {
  /** Note frequencies in Hz, played as a quick arpeggio. */
  notes: number[];
  wave: OscillatorType;
  /** Seconds between notes. */
  step: number;
  /** Seconds each note rings. */
  decay: number;
}

const VOICES: Record<Accent["id"], Voice> = {
  madder: { notes: [196, 294], wave: "triangle", step: 0.07, decay: 0.45 },
  manuscript: { notes: [247, 311, 370], wave: "triangle", step: 0.06, decay: 0.4 },
  torch: { notes: [294, 370, 440], wave: "sine", step: 0.06, decay: 0.4 },
  lichen: { notes: [349, 440, 523], wave: "sine", step: 0.055, decay: 0.38 },
  astral: { notes: [523, 659, 784, 1047], wave: "sine", step: 0.05, decay: 0.36 },
  mono: { notes: [180], wave: "square", step: 0, decay: 0.06 },
};

const LEVEL = 0.06;

let ctx: AudioContext | null = null;

/** The shared audio context, created on first use. Also used by the companion's sounds. */
export function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function playAccentSfx(id: Accent["id"]) {
  const ac = context();
  if (!ac) return;
  const v = VOICES[id];
  const t0 = ac.currentTime;
  v.notes.forEach((freq, i) => {
    const t = t0 + i * v.step;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = v.wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(LEVEL, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + v.decay);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + v.decay + 0.02);
  });
}
