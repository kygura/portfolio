// Pitch maths and the chord type the tapes are written in. Pure.

/** MIDI note → frequency in Hz (A4 = 69 = 440 Hz). */
export const mtof = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Cents → frequency ratio. */
export const centsToRatio = (cents: number): number => 2 ** (cents / 1200);

/** Frequency ratio → semitones (0.8× is about -3.9). */
export const ratioToSemitones = (ratio: number): number => 12 * Math.log2(ratio);

export interface Chord {
  name: string;
  /** Voicing in the middle register, MIDI notes. */
  pad: readonly number[];
  bass: number;
}

/** Index a looping list with any integer, negatives included. */
export const loopAt = <T>(xs: readonly T[], i: number): T => xs[((i % xs.length) + xs.length) % xs.length] as T;
