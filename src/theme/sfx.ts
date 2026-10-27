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

function context(): AudioContext | null {
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

function tone(ac: AudioContext, freq: number, t: number, dur: number, wave: OscillatorType, level: number, glideTo?: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, t);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** One speech blip of the mascot: a tiny square chirp, pitch jittered per letter. */
export function playBlip(seed = 0) {
  const ac = context();
  if (!ac) return;
  const base = 520 + (seed % 7) * 38;
  tone(ac, base, ac.currentTime, 0.045, "square", 0.025);
}

type MascotCue = "wake" | "think" | "done" | "bye";

const CUES: Record<MascotCue, { notes: number[]; step: number; wave: OscillatorType; dur: number }> = {
  wake: { notes: [392, 523, 784], step: 0.06, wave: "square", dur: 0.12 },
  think: { notes: [330, 294], step: 0.08, wave: "triangle", dur: 0.14 },
  done: { notes: [659, 880], step: 0.07, wave: "triangle", dur: 0.18 },
  bye: { notes: [523, 392, 262], step: 0.06, wave: "triangle", dur: 0.14 },
};

/** Short chiptune cues for the mascot waking, pondering, finishing and leaving. */
export function playMascotCue(cue: MascotCue) {
  const ac = context();
  if (!ac) return;
  const c = CUES[cue];
  const t0 = ac.currentTime;
  c.notes.forEach((f, i) => tone(ac, f, t0 + i * c.step, c.dur, c.wave, 0.04));
}
