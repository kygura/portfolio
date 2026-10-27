/**
 * Wick's sounds, synthesised like the theme motifs (no audio files): square
 * and triangle chirps in the spirit of a 16-bit menu. Silent until the page
 * has had a gesture, since browsers hold audio back before one, and while
 * the visitor has muted him.
 */
import { context } from "@/theme/sfx";

let muted = false;
export const setMuted = (value: boolean) => {
  muted = value;
};

const LEVEL = 0.05;

interface Tone {
  freq: number;
  /** Glides to this pitch over the note. */
  to?: number;
  wave: OscillatorType;
  /** Start, in seconds from now. */
  at: number;
  dur: number;
  level?: number;
}

function ready(): AudioContext | null {
  if (muted) return null;
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (activation && !activation.hasBeenActive) return null;
  return context();
}

function play(tones: Tone[]) {
  const ac = ready();
  if (!ac) return;
  const t0 = ac.currentTime;
  for (const tone of tones) {
    const t = t0 + tone.at;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = tone.wave;
    osc.frequency.setValueAtTime(tone.freq, t);
    if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, t + tone.dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(tone.level ?? LEVEL, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + tone.dur + 0.02);
  }
}

/** A short burst of filtered noise: the hiss under a spell. */
function hiss(at: number, dur: number, level: number, from: number) {
  const ac = ready();
  if (!ac) return;
  const t = ac.currentTime + at;
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(from * 3, t + dur);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(level, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
}

export const sfx = {
  /** One letter of speech: a soft, slightly wandering square blip. */
  blip() {
    play([{ freq: 300 + Math.random() * 60, wave: "square", at: 0, dur: 0.04, level: 0.022 }]);
  },
  /** Poked: a squeak up. */
  poke() {
    play([{ freq: 420, to: 980, wave: "square", at: 0, dur: 0.09, level: 0.035 }]);
  },
  /** Thinking: two soft, questioning notes. */
  think() {
    play([
      { freq: 392, wave: "triangle", at: 0, dur: 0.12 },
      { freq: 494, wave: "triangle", at: 0.11, dur: 0.16 },
    ]);
  },
  /** A small spell before he speaks: rising sparkle over a hiss. */
  cast() {
    [784, 988, 1175, 1568, 1976].forEach((freq, i) =>
      play([{ freq, wave: "triangle", at: i * 0.045, dur: 0.22, level: 0.03 }]),
    );
    hiss(0, 0.28, 0.025, 1800);
  },
  /** Dozing off: a slow fall. */
  sleep() {
    play([{ freq: 330, to: 196, wave: "triangle", at: 0, dur: 0.5, level: 0.03 }]);
  },
  /** Woken with a start. */
  wake() {
    play([
      { freq: 262, to: 784, wave: "square", at: 0, dur: 0.07, level: 0.03 },
      { freq: 784, wave: "triangle", at: 0.08, dur: 0.12, level: 0.03 },
    ]);
  },
  /** Nothing came to mind: a little deflating fall. */
  fizzle() {
    play([{ freq: 440, to: 220, wave: "square", at: 0, dur: 0.18, level: 0.025 }]);
    hiss(0.02, 0.15, 0.015, 600);
  },
};
