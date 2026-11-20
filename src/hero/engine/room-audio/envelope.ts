// Envelopes as data: a list of automation points, applied to an AudioParam in one place. Pure
// (apart from `applyEnvelope`, which only forwards to the param).

/** Exponential ramps can't reach 0: this is "silent" (-80 dB). */
export const SILENT = 0.0001;

export type EnvPoint =
  | { at: number; set: number }
  | { at: number; linear: number }
  | { at: number; exp: number };

export interface Adsr {
  attack: number;
  decay: number;
  /** Fraction of the peak held after the decay. */
  sustain: number;
  release: number;
  peak: number;
}

/**
 * ADSR from `start`, holding for `hold` seconds after the attack+decay before releasing.
 * Returns the points and when the sound is over (stop the source then).
 */
export function adsr(e: Adsr, start: number, hold: number): { points: EnvPoint[]; end: number } {
  const peakAt = start + e.attack;
  const decayed = peakAt + e.decay;
  const releaseAt = decayed + Math.max(0, hold);
  const level = Math.max(SILENT, e.peak * e.sustain);
  const end = releaseAt + e.release;
  return {
    points: [
      { at: start, set: SILENT },
      { at: peakAt, linear: e.peak },
      { at: decayed, exp: level },
      { at: releaseAt, set: level },
      { at: end, exp: SILENT },
    ],
    end,
  };
}

/** A struck sound: near-instant attack, exponential decay to silence. */
export function pluck(peak: number, start: number, decay: number, attack = 0.005): { points: EnvPoint[]; end: number } {
  const end = start + attack + decay;
  return {
    points: [
      { at: start, set: SILENT },
      { at: start + attack, linear: peak },
      { at: end, exp: SILENT },
    ],
    end,
  };
}

export function applyEnvelope(param: AudioParam, points: readonly EnvPoint[]): void {
  for (const p of points) {
    if ("set" in p) param.setValueAtTime(p.set, p.at);
    else if ("linear" in p) param.linearRampToValueAtTime(p.linear, p.at);
    else param.exponentialRampToValueAtTime(Math.max(SILENT, p.exp), p.at);
  }
}
