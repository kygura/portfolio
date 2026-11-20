// UI sounds as data: each is a few short tones. Played by the engine in index.ts. Pure.

import type { SfxKind } from "./types";
import { mtof } from "./theory";

export interface SfxTone {
  /** Seconds after the trigger. */
  at: number;
  freq: number;
  /** Glide to this frequency over the tone (a pitch drop gives a click its "tick"). */
  toFreq?: number;
  dur: number;
  type: OscillatorType;
  gain: number;
}

export interface Sfx {
  tones: SfxTone[];
  /** Lowpass cutoff, Hz: tames square waves. */
  cutoff: number;
  /** Reverb send, 0..1. */
  wet: number;
}

const chime = (notes: number[], gap: number, dur: number, gain: number): SfxTone[] =>
  notes.map((n, i) => ({ at: i * gap, freq: mtof(n), dur, type: "sine", gain }));

export const SFX: Record<SfxKind, Sfx> = {
  click: { tones: [{ at: 0, freq: 1900, toFreq: 1100, dur: 0.035, type: "triangle", gain: 0.16 }], cutoff: 6000, wet: 0.05 },
  hover: { tones: [{ at: 0, freq: 2600, dur: 0.02, type: "sine", gain: 0.025 }], cutoff: 8000, wet: 0 },
  toggle: {
    tones: [
      { at: 0, freq: 950, toFreq: 900, dur: 0.03, type: "square", gain: 0.07 },
      { at: 0.055, freq: 1400, toFreq: 1350, dur: 0.035, type: "square", gain: 0.07 },
    ],
    cutoff: 3500,
    wet: 0.05,
  },
  // A rising fifth (C6 → G6) and its mirror.
  open: { tones: chime([84, 91], 0.075, 0.32, 0.12), cutoff: 9000, wet: 0.3 },
  close: { tones: chime([91, 84], 0.075, 0.28, 0.1), cutoff: 9000, wet: 0.25 },
  // Two detuned low squares beating against each other: a buzz, not a beep.
  error: {
    tones: [
      { at: 0, freq: 98, dur: 0.28, type: "square", gain: 0.1 },
      { at: 0, freq: 103.5, dur: 0.28, type: "square", gain: 0.1 },
    ],
    cutoff: 900,
    wet: 0.1,
  },
  // Original boot chime: an Fmaj9 spread upward (F4 C5 E5 A5), each note left to ring.
  startup: { tones: chime([65, 72, 76, 81], 0.14, 1.9, 0.11), cutoff: 7000, wet: 0.55 },
};
