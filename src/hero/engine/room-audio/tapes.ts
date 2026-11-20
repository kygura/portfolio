// The tapes, as music: tempo, playback speed, mix, and what starts on each sixteenth-note
// step. Every one is an original loop written in the manner of a classic vaporwave style; none of
// them samples or quotes a real record. Pure, so the patterns can be tested without Web Audio.
//
// `screw` is the playback rate. Like a tape on a deck running slow (or fast), it moves tempo and
// pitch together: 0.8× is a fifth of the speed gone and about four semitones down.

import { type Chord, loopAt } from "./theory";

export const STEPS_PER_BAR = 16;

export type Hit =
  | { kind: "pad"; chord: Chord; bars: number }
  | { kind: "bass"; midi: number; steps: number }
  | { kind: "keys"; midi: number; velocity: number }
  | { kind: "lead"; midi: number; steps: number }
  | { kind: "stab"; notes: readonly number[]; steps: number }
  | { kind: "kick"; hard?: boolean }
  | { kind: "snare" }
  | { kind: "hat"; open: boolean; velocity?: number }
  | { kind: "sub"; midi: number; steps: number }
  | { kind: "beep"; midi: number; steps?: number }
  | { kind: "bell"; midi: number; velocity: number }
  | { kind: "static"; steps: number }
  | { kind: "crackle" };

export interface TapeMix {
  /** Send to the long room, 0..1. */
  reverb: number;
  /** Send to the tape echo, 0..1, its time in steps, and how much of each repeat comes back. */
  delay: number;
  delaySteps: number;
  feedback: number;
  /** Tape tone: a lowpass over the whole music bus, Hz. Lower is more worn. */
  tone: number;
  /** Sidechain: how far the music ducks on each kick, 0..1. */
  pump: number;
  /** Distortion on the drum bus, 0..1. */
  drive?: number;
}

export interface TapeSound {
  id: string;
  /** As written. */
  bpm: number;
  /** Playback rate: tempo and pitch together. */
  screw: number;
  /** Bars before the pattern repeats. */
  bars: number;
  /** Swing: how late the off-beat sixteenths land, as a fraction of a step (0 is straight). */
  swing?: number;
  mix: TapeMix;
  /** Everything that starts on a step (0-based, counting from the start of the tape). */
  hits(step: number): Hit[];
}

/** Seconds per sixteenth note at playback speed. */
export const stepSeconds = (t: Pick<TapeSound, "bpm" | "screw">): number => 60 / (t.bpm * t.screw) / 4;

const pos = (step: number) => {
  const bar = Math.floor(step / STEPS_PER_BAR);
  return { bar, at: step - bar * STEPS_PER_BAR };
};

// --- A · mallsoft: an empty food court at 3pm ----------------------------------------------------

const MALL: readonly Chord[] = [
  { name: "Fmaj9", pad: [53, 57, 60, 64, 67], bass: 41 },
  { name: "Em7", pad: [52, 55, 59, 62, 67], bass: 40 },
  { name: "Dm9", pad: [50, 53, 57, 60, 64], bass: 38 },
  { name: "Cmaj7/G", pad: [55, 59, 60, 64, 67], bass: 43 },
];
/** Electric piano over the chord, an octave up, on eighth notes, with a breath at the end. */
const MALL_ARP: readonly (number | null)[] = [0, 2, 4, 3, 1, 3, 2, null];

const mallsoft: TapeSound = {
  id: "plaza-after-hours",
  bpm: 70,
  screw: 0.8,
  bars: 8,
  mix: { reverb: 0.9, delay: 0.15, delaySteps: 6, feedback: 0.35, tone: 5200, pump: 0 },
  hits(step) {
    const { bar, at } = pos(step);
    const chord = loopAt(MALL, bar);
    const out: Hit[] = [];
    if (at === 0) out.push({ kind: "pad", chord, bars: 1 }, { kind: "bass", midi: chord.bass, steps: 14 });
    if (bar % 2 === 1 && at % 2 === 0) {
      const i = MALL_ARP[at / 2];
      if (i != null) out.push({ kind: "keys", midi: (chord.pad[i] ?? chord.pad[0] ?? 60) + 12, velocity: at % 4 === 0 ? 1 : 0.7 });
    }
    return out;
  },
};

// --- B · eccojam: two bars of a slow jam, caught on a loop -------------------------------------

const ECCO: readonly Chord[] = [
  { name: "Abmaj7", pad: [56, 60, 63, 67], bass: 44 },
  { name: "Gm7", pad: [55, 58, 62, 65], bass: 43 },
];
/** The "vocal": [step in the two-bar phrase, note, length in steps]. */
const ECCO_PHRASE: readonly (readonly [number, number, number])[] = [
  [0, 75, 3],
  [4, 72, 2],
  [6, 70, 4],
  [12, 68, 6],
  [20, 67, 4],
  [26, 70, 6],
];

const eccojam: TapeSound = {
  id: "ecco-lobby",
  bpm: 96,
  screw: 0.72,
  bars: 8,
  mix: { reverb: 0.75, delay: 0.55, delaySteps: 3, feedback: 0.55, tone: 2600, pump: 0 },
  hits(step) {
    const { bar, at } = pos(step);
    const inPhrase = (bar % 2) * STEPS_PER_BAR + at;
    const chord = loopAt(ECCO, bar);
    const out: Hit[] = [];
    if (at === 0) out.push({ kind: "pad", chord, bars: 1 }, { kind: "bass", midi: chord.bass, steps: 12 });
    if (at === 4 || at === 12) out.push({ kind: "keys", midi: (chord.pad[1] ?? 60) + 12, velocity: 0.6 });
    // Bars 6–7 of every eight: the tape catches and the first syllable stutters.
    if (bar % 8 >= 6) {
      if (at % 2 === 0) out.push({ kind: "lead", midi: 75, steps: 1 });
      return out;
    }
    for (const [s, midi, len] of ECCO_PHRASE) if (s === inPhrase) out.push({ kind: "lead", midi, steps: len });
    return out;
  },
};

// --- C · slowed '80s R&B, the Floral Shoppe way: half-time drum machine, pitched down -----------

const FLORAL: readonly Chord[] = [
  { name: "Dbmaj9", pad: [56, 60, 61, 65, 68], bass: 37 },
  { name: "Cm7", pad: [55, 58, 60, 63, 67], bass: 36 },
  { name: "Bbm9", pad: [53, 56, 60, 61, 65], bass: 34 },
  { name: "Eb9sus", pad: [55, 58, 61, 63, 65], bass: 39 },
];
/** A slow melody over the four bars: [bar, step, note, length]. */
const FLORAL_LEAD: readonly (readonly [number, number, number, number])[] = [
  [0, 4, 72, 4],
  [0, 10, 70, 6],
  [1, 2, 67, 8],
  [1, 12, 68, 4],
  [2, 4, 65, 6],
  [2, 12, 68, 4],
  [3, 0, 70, 12],
];

const floral: TapeSound = {
  id: "floral-mall-mix",
  bpm: 90,
  screw: 0.75,
  bars: 4,
  mix: { reverb: 0.7, delay: 0.3, delaySteps: 4, feedback: 0.4, tone: 4200, pump: 0 },
  hits(step) {
    const { bar, at } = pos(step);
    const chord = loopAt(FLORAL, bar);
    const out: Hit[] = [];
    if (at === 0) out.push({ kind: "pad", chord, bars: 1 }, { kind: "bass", midi: chord.bass, steps: 6 });
    if (at === 10) out.push({ kind: "bass", midi: chord.bass, steps: 4 });
    // Half time: kick on one and the "and" of three, snare on three.
    if (at === 0 || at === 10) out.push({ kind: "kick" });
    if (at === 8) out.push({ kind: "snare" });
    if (at % 2 === 0) out.push({ kind: "hat", open: at === 14 });
    if (at === 6 || at === 14) out.push({ kind: "keys", midi: (chord.pad[2] ?? 60) + 12, velocity: 0.5 });
    for (const [b, s, midi, len] of FLORAL_LEAD) if (b === bar % 4 && s === at) out.push({ kind: "lead", midi, steps: len });
    return out;
  },
};

// --- D · future funk: disco chops, four on the floor, sped up instead of down -------------------

const FUNK: readonly Chord[] = [
  { name: "Fmaj7", pad: [57, 60, 64, 65], bass: 41 },
  { name: "Em7", pad: [55, 59, 62, 64], bass: 40 },
  { name: "Am7", pad: [55, 57, 60, 64], bass: 45 },
  { name: "D9", pad: [54, 57, 60, 64], bass: 38 },
];
/** Where the chopped chord lands in the bar: syncopated, like a filtered disco loop. */
const CHOPS: readonly number[] = [0, 3, 6, 10, 12];
/** Octave bass on the eighths: root, octave, root, octave… with a pickup. */
const FUNK_BASS: readonly (number | null)[] = [0, 12, 0, 12, 0, 12, 7, 12];

const futureFunk: TapeSound = {
  id: "night-drive-82",
  bpm: 118,
  screw: 1.06,
  bars: 4,
  mix: { reverb: 0.25, delay: 0.18, delaySteps: 3, feedback: 0.3, tone: 9500, pump: 0.6 },
  hits(step) {
    const { bar, at } = pos(step);
    const chord = loopAt(FUNK, bar);
    const out: Hit[] = [];
    if (at % 4 === 0) out.push({ kind: "kick" });
    if (at === 4 || at === 12) out.push({ kind: "snare" });
    if (at % 2 === 0) out.push({ kind: "hat", open: at % 4 === 2 });
    if (CHOPS.includes(at)) out.push({ kind: "stab", notes: chord.pad, steps: at === 12 ? 3 : 2 });
    if (at % 2 === 0) {
      const off = FUNK_BASS[at / 2];
      if (off != null) out.push({ kind: "bass", midi: chord.bass + off, steps: 1 });
    }
    return out;
  },
};

// --- E · vaportrap: trap drums and an 808, a vocal chop answered by bells -------------------------

const TRAP: readonly Chord[] = [
  { name: "Cm9", pad: [55, 58, 62, 63, 67], bass: 36 },
  { name: "Abmaj7", pad: [56, 60, 63, 67], bass: 32 },
  { name: "Fm9", pad: [53, 56, 60, 63, 67], bass: 41 },
  { name: "G7sus", pad: [55, 60, 62, 65], bass: 31 },
];

/** The vocal chop, on the first and third bars: [bar, step, note, length]. Syncopated, never on the one. */
const TRAP_CALL: readonly (readonly [number, number, number, number])[] = [
  [0, 2, 79, 2],
  [0, 4, 82, 2],
  [0, 6, 79, 1],
  [0, 7, 77, 3],
  [0, 12, 75, 4],
  [2, 2, 80, 2],
  [2, 4, 84, 2],
  [2, 6, 80, 1],
  [2, 7, 79, 3],
  [2, 12, 77, 3],
  // A pickup back into the top of the loop.
  [3, 14, 79, 2],
];
/** The bells' answer on the second and fourth bars, in dotted eighths against the hats: [bar, step, note]. */
const TRAP_ANSWER: readonly (readonly [number, number, number])[] = [
  [1, 0, 84],
  [1, 3, 82],
  [1, 6, 79],
  [1, 9, 75],
  [1, 12, 79],
  [3, 0, 86],
  [3, 3, 84],
  [3, 6, 82],
  [3, 9, 77],
];

const vaportrap: TapeSound = {
  id: "marble-trap",
  bpm: 140,
  screw: 0.85,
  bars: 4,
  mix: { reverb: 0.5, delay: 0.25, delaySteps: 3, feedback: 0.35, tone: 6000, pump: 0.2, drive: 0.15 },
  hits(step) {
    const { bar, at } = pos(step);
    const chord = loopAt(TRAP, bar);
    const out: Hit[] = [];
    if (at === 0) out.push({ kind: "pad", chord, bars: 1 }, { kind: "kick" });
    // The 808 carries the low end: on the one, a pickup, and the "and" of three.
    if (at === 0) out.push({ kind: "sub", midi: chord.bass, steps: 6 });
    if (at === 7) out.push({ kind: "sub", midi: chord.bass, steps: 2 });
    if (at === 10) out.push({ kind: "sub", midi: chord.bass + 12, steps: 5 });
    if (at === 8) out.push({ kind: "snare" });
    // Hats on the eighths, rolling into sixteenths at the end of the bar.
    if (at < 12 ? at % 2 === 0 : true) out.push({ kind: "hat", open: at === 14 && bar % 2 === 1, velocity: at >= 12 ? 0.45 + (at - 12) * 0.12 : 0.6 });
    // Call and response: a pitched-down "vocal" chop asks, the bells answer an octave up.
    for (const [b, s, midi, len] of TRAP_CALL) if (b === bar % 4 && s === at) out.push({ kind: "lead", midi, steps: len });
    for (const [b, s, midi] of TRAP_ANSWER) if (b === bar % 4 && s === at) out.push({ kind: "bell", midi, velocity: s % 4 === 0 ? 0.9 : 0.6 });
    return out;
  },
};

// --- F · hardvapour: gabber kicks through a clipped bus, minor stabs, a siren on top ----------

const BLOC: readonly Chord[] = [
  { name: "Am", pad: [57, 60, 64], bass: 45 },
  { name: "F", pad: [57, 60, 65], bass: 41 },
  { name: "Dm", pad: [57, 62, 65], bass: 38 },
  { name: "E", pad: [56, 59, 64], bass: 40 },
];

const hardvapour: TapeSound = {
  id: "grey-block",
  bpm: 165,
  screw: 0.95,
  bars: 4,
  mix: { reverb: 0.35, delay: 0.15, delaySteps: 3, feedback: 0.3, tone: 8000, pump: 0.5, drive: 0.75 },
  hits(step) {
    const { bar, at } = pos(step);
    const chord = loopAt(BLOC, bar);
    const out: Hit[] = [];
    if (at % 4 === 0) out.push({ kind: "kick" });
    if (at === 4 || at === 12) out.push({ kind: "snare" });
    if (at % 4 === 2) out.push({ kind: "hat", open: true, velocity: 0.8 }, { kind: "bass", midi: chord.bass + 12, steps: 1 });
    if (at === 0 || at === 6 || at === 8 || at === 14) out.push({ kind: "stab", notes: chord.pad, steps: 1 });
    if (bar % 4 === 0 && at === 0) out.push({ kind: "lead", midi: 81, steps: 28 });
    if (bar % 4 === 2 && at === 0) out.push({ kind: "lead", midi: 79, steps: 28 });
    return out;
  },
};

// --- G · slushwave: two chords and an electric piano, smeared in reverb until the edges go -----

const SLUSH: readonly Chord[] = [
  { name: "Ebmaj9", pad: [55, 58, 62, 63, 65], bass: 39 },
  { name: "Dbmaj9", pad: [53, 56, 60, 61, 63], bass: 37 },
];

const slushwave: TapeSound = {
  id: "slush-fountain",
  bpm: 80,
  screw: 0.7,
  bars: 4,
  mix: { reverb: 1, delay: 0.5, delaySteps: 6, feedback: 0.6, tone: 2200, pump: 0 },
  hits(step) {
    const { bar, at } = pos(step);
    const chord = loopAt(SLUSH, Math.floor(bar / 2));
    const out: Hit[] = [];
    if (at === 0 && bar % 2 === 0) out.push({ kind: "pad", chord, bars: 2 }, { kind: "bass", midi: chord.bass, steps: 28 });
    if (at === 0) out.push({ kind: "kick" });
    if (at % 4 === 2) out.push({ kind: "hat", open: false, velocity: 0.35 });
    const arp = [0, 4, 6, 10].indexOf(at);
    if (arp >= 0) out.push({ kind: "keys", midi: (chord.pad[(arp + (bar % 4)) % chord.pad.length] ?? 60) + 12, velocity: 0.55 });
    return out;
  },
};

// --- H · late-night lo-fi: jazz chords, a dusty boom-bap kit, the lowpass never opens ----------

const LOFI: readonly Chord[] = [
  { name: "Dm9", pad: [53, 57, 60, 64], bass: 38 },
  { name: "G13", pad: [53, 59, 64, 67], bass: 43 },
  { name: "Cmaj9", pad: [52, 55, 59, 62], bass: 36 },
  { name: "A7b13", pad: [55, 61, 65], bass: 45 },
];

/** Dust on the record: a few clicks per bar, in the same places every time round. */
const crackles = (step: number, loop: number): boolean => (((step % loop) * 2654435761) >>> 0) % 5 === 0;

const lofi: TapeSound = {
  id: "room-service",
  bpm: 84,
  screw: 0.9,
  bars: 4,
  swing: 0.3,
  mix: { reverb: 0.4, delay: 0.2, delaySteps: 3, feedback: 0.3, tone: 3200, pump: 0 },
  hits(step) {
    const { bar, at } = pos(step);
    const chord = loopAt(LOFI, bar);
    const out: Hit[] = [];
    if (at === 0) out.push({ kind: "bass", midi: chord.bass, steps: 6 });
    if (at === 10) out.push({ kind: "bass", midi: chord.bass + 7, steps: 4 });
    if (at === 0 || at === 7 || at === 10) out.push({ kind: "kick" });
    if (at === 4 || at === 12) out.push({ kind: "snare" });
    if (at % 2 === 0) out.push({ kind: "hat", open: false, velocity: at % 4 === 0 ? 0.8 : 0.5 });
    // Comping: the chord struck on the "and" of one and just behind three.
    if (at === 2 || at === 9) for (const n of chord.pad) out.push({ kind: "keys", midi: n + 12, velocity: at === 2 ? 0.55 : 0.4 });
    if (crackles(step, 4 * STEPS_PER_BAR)) out.push({ kind: "crackle" });
    return out;
  },
};

// --- I · signalwave: smooth jazz from the forecast, cut by dropouts and station idents ---------

const FORECAST: readonly Chord[] = [
  { name: "Bbmaj9", pad: [57, 60, 62, 65], bass: 34 },
  { name: "Am7", pad: [55, 57, 60, 64], bass: 33 },
  { name: "Gm9", pad: [53, 57, 58, 62], bass: 31 },
  { name: "C9sus", pad: [55, 58, 62, 65], bass: 36 },
];
/** The "sax" over four bars: [bar, step, note, length]. */
const FORECAST_LEAD: readonly (readonly [number, number, number, number])[] = [
  [0, 2, 74, 4],
  [0, 8, 72, 2],
  [0, 10, 69, 6],
  [1, 4, 67, 4],
  [1, 10, 69, 2],
  [1, 12, 72, 4],
  [2, 0, 74, 6],
  [2, 8, 77, 4],
  [3, 0, 76, 12],
];

const signalwave: TapeSound = {
  id: "local-forecast",
  bpm: 100,
  screw: 0.9,
  bars: 8,
  mix: { reverb: 0.45, delay: 0.25, delaySteps: 3, feedback: 0.35, tone: 5000, pump: 0 },
  hits(step) {
    const { bar, at } = pos(step);
    // Bar 7 of every eight: the signal drops out halfway through, into snow.
    if (bar % 8 === 6 && at >= 8) return at === 8 ? [{ kind: "static", steps: 8 }] : [];
    const chord = loopAt(FORECAST, bar);
    const out: Hit[] = [];
    if (at === 0) out.push({ kind: "pad", chord, bars: 1 }, { kind: "bass", midi: chord.bass + 12, steps: 7 });
    if (at === 8) out.push({ kind: "bass", midi: chord.bass + 19, steps: 6 });
    if (at === 0 || at === 8) out.push({ kind: "kick" });
    if (at === 4 || at === 12) out.push({ kind: "snare" });
    if (at % 2 === 0) out.push({ kind: "hat", open: false, velocity: 0.5 });
    for (const [b, s, midi, len] of FORECAST_LEAD) if (b === bar % 4 && s === at) out.push({ kind: "lead", midi, steps: len });
    // The station ident: three beeps at the end of every eight bars.
    if (bar % 8 === 7 && (at === 0 || at === 4 || at === 8)) out.push({ kind: "beep", midi: 93 });
    return out;
  },
};

// --- J · utopian virtual: bright pads, stock FM bells on the sixteenths, a clean future -------------

const AERO: readonly Chord[] = [
  { name: "Cmaj9", pad: [55, 59, 62, 64, 67], bass: 36 },
  { name: "Fmaj9/C", pad: [57, 60, 64, 67], bass: 41 },
  { name: "Am11", pad: [55, 57, 60, 62, 64], bass: 45 },
  { name: "Gsus", pad: [55, 60, 62, 67], bass: 43 },
];
const AERO_ARP: readonly number[] = [0, 1, 2, 3, 4, 3, 2, 1];

const utopian: TapeSound = {
  id: "aero-garden",
  bpm: 100,
  screw: 1,
  bars: 4,
  mix: { reverb: 0.7, delay: 0.35, delaySteps: 3, feedback: 0.4, tone: 9000, pump: 0 },
  hits(step) {
    const { bar, at } = pos(step);
    const chord = loopAt(AERO, bar);
    const out: Hit[] = [];
    if (at === 0) out.push({ kind: "pad", chord, bars: 1 }, { kind: "bass", midi: chord.bass, steps: 14 }, { kind: "kick" });
    if (at % 2 === 1) out.push({ kind: "hat", open: false, velocity: 0.3 });
    const i = AERO_ARP[at % AERO_ARP.length] ?? 0;
    out.push({ kind: "bell", midi: (chord.pad[i % chord.pad.length] ?? 60) + 24, velocity: at % 2 === 0 ? 0.8 : 0.5 });
    return out;
  },
};

// --- J2 · utopian virtual, B-side: a clean atrium, stock MIDI bells, no dust on anything -----------------

const ATRIUM: readonly Chord[] = [
  { name: "Emaj9", pad: [56, 59, 63, 66], bass: 40 },
  { name: "C#m9", pad: [52, 56, 59, 63], bass: 37 },
  { name: "Amaj7", pad: [56, 57, 61, 64], bass: 45 },
  { name: "B6/9", pad: [54, 56, 59, 61], bass: 35 },
];
/** Bell arpeggio over the chord, an octave up, on sixteenths: index into the pad, or a rest. */
const ATRIUM_BELLS: readonly (number | null)[] = [0, 2, 3, 1, 2, 3, 0, 2, 3, 1, 2, null, 3, 2, 1, null];

const utopianB: TapeSound = {
  id: "glass-atrium",
  bpm: 104,
  screw: 1,
  bars: 4,
  mix: { reverb: 0.5, delay: 0.25, delaySteps: 3, feedback: 0.3, tone: 11000, pump: 0 },
  hits(step) {
    const { bar, at } = pos(step);
    const chord = loopAt(ATRIUM, bar);
    const out: Hit[] = [];
    if (at === 0) out.push({ kind: "pad", chord, bars: 1 }, { kind: "bass", midi: chord.bass, steps: 7 });
    if (at === 8) out.push({ kind: "bass", midi: chord.bass + 12, steps: 6 });
    const i = ATRIUM_BELLS[at];
    // The top of the arpeggio climbs an octave on the last bar, like a product reveal.
    if (i != null) out.push({ kind: "bell", midi: (chord.pad[i] ?? 60) + (bar % 4 === 3 && at >= 8 ? 24 : 12), velocity: at % 4 === 0 ? 1 : 0.6 });
    if (at % 4 === 2) out.push({ kind: "hat", open: false });
    return out;
  },
};

// --- H2 · late-night lo-fi, B-side: a swung drum machine, Rhodes and a sax-ish line, 1am in the penthouse --

const LOUNGE: readonly Chord[] = [
  { name: "Fm9", pad: [56, 60, 63, 67], bass: 41 },
  { name: "Bb13", pad: [56, 60, 62, 67], bass: 34 },
  { name: "Ebmaj9", pad: [55, 58, 62, 65], bass: 39 },
  { name: "C7b9", pad: [58, 61, 64, 67], bass: 36 },
];
/** The horn line, every other bar: [bar, step, note, length]. */
const LOUNGE_LEAD: readonly (readonly [number, number, number, number])[] = [
  [1, 2, 77, 3],
  [1, 6, 75, 2],
  [1, 9, 74, 7],
  [3, 2, 72, 3],
  [3, 6, 73, 2],
  [3, 10, 76, 6],
];

const lofiB: TapeSound = {
  id: "penthouse-1am",
  bpm: 84,
  screw: 0.9,
  bars: 4,
  swing: 0.3,
  mix: { reverb: 0.45, delay: 0.2, delaySteps: 6, feedback: 0.3, tone: 3400, pump: 0.15 },
  hits(step) {
    const { bar, at } = pos(step);
    const chord = loopAt(LOUNGE, bar);
    const out: Hit[] = [];
    if (at === 0) out.push({ kind: "pad", chord, bars: 1 }, { kind: "bass", midi: chord.bass, steps: 5 });
    if (at === 7) out.push({ kind: "bass", midi: chord.bass + 7, steps: 2 });
    if (at === 10) out.push({ kind: "bass", midi: chord.bass, steps: 4 });
    // Boom-bap: kick on one, the "and" of two and three-and; snare on two and four.
    if (at === 0 || at === 7 || at === 10) out.push({ kind: "kick" });
    if (at === 4 || at === 12) out.push({ kind: "snare" });
    if (at % 2 === 0) out.push({ kind: "hat", open: false });
    // Rhodes comping, pushed off the beat (the swing drags these).
    if (at === 3 || at === 11) for (const midi of chord.pad.slice(1)) out.push({ kind: "keys", midi: midi + 12, velocity: at === 3 ? 0.55 : 0.4 });
    for (const [b, s, midi, len] of LOUNGE_LEAD) if (b === bar % 4 && s === at) out.push({ kind: "lead", midi, steps: len });
    if (crackles(step, 4 * STEPS_PER_BAR)) out.push({ kind: "crackle" });
    return out;
  },
};

// --- I2 · signalwave, B-side: a station ident and a weather-channel loop, cutting in and out --------------

const CHANNEL: readonly Chord[] = [
  { name: "Dbmaj9", pad: [53, 56, 60, 63], bass: 37 },
  { name: "Cm7", pad: [55, 58, 60, 63], bass: 36 },
  { name: "Bbm9", pad: [53, 56, 60, 61], bass: 34 },
  { name: "Ebsus", pad: [56, 58, 63, 65], bass: 39 },
];
/** The station ident: four notes on the electric piano, [step, note]. */
const IDENT: readonly (readonly [number, number])[] = [
  [0, 73],
  [2, 77],
  [4, 80],
  [8, 85],
];

const signalwaveB: TapeSound = {
  id: "channel-31",
  bpm: 100,
  screw: 0.85,
  bars: 8,
  mix: { reverb: 0.6, delay: 0.4, delaySteps: 4, feedback: 0.45, tone: 3000, pump: 0 },
  hits(step) {
    const { bar, at } = pos(step);
    const chord = loopAt(CHANNEL, Math.floor(bar / 2));
    const out: Hit[] = [];
    const b = bar % 8;
    if (b === 0) for (const [s, midi] of IDENT) if (s === at) out.push({ kind: "keys", midi, velocity: 0.9 });
    if (b === 7) {
      // Sign-off: the test tone, then snow.
      if (at === 0) out.push({ kind: "beep", midi: 83, steps: 10 });
      if (at === 11) out.push({ kind: "static", steps: 5 });
      return out;
    }
    if (b % 2 === 0) {
      if (at === 0) out.push({ kind: "pad", chord, bars: 2 }, { kind: "bass", midi: chord.bass, steps: 14 });
    } else {
      // The signal drops: the loop stutters, a burst of snow, then it comes back.
      if (at === 0 || at === 3) out.push({ kind: "stab", notes: chord.pad, steps: 2 });
      if (at === 6) out.push({ kind: "static", steps: 2 });
      if (at === 9) out.push({ kind: "stab", notes: chord.pad, steps: 5 });
    }
    return out;
  },
};

// --- F2 · hardvapour, B-side: the mall at the end of the world, gabber kicks under minor stabs ------------

const RIOT: readonly Chord[] = [
  { name: "Em", pad: [55, 59, 64], bass: 40 },
  { name: "C", pad: [55, 60, 64], bass: 36 },
  { name: "Am", pad: [57, 60, 64], bass: 45 },
  { name: "B", pad: [54, 59, 63], bass: 35 },
];
/** A siren-ish lead over the last bar of four: [step, note, length]. */
const SIREN: readonly (readonly [number, number, number])[] = [
  [0, 79, 4],
  [4, 78, 4],
  [8, 74, 4],
  [12, 75, 4],
];

const hardvapourB: TapeSound = {
  id: "hard-reset-plaza",
  bpm: 150,
  screw: 1,
  bars: 4,
  mix: { reverb: 0.2, delay: 0.15, delaySteps: 3, feedback: 0.25, tone: 8000, pump: 0.7 },
  hits(step) {
    const { bar, at } = pos(step);
    const chord = loopAt(RIOT, bar);
    const out: Hit[] = [];
    if (at % 4 === 0) out.push({ kind: "kick", hard: true });
    if (at % 4 === 2) out.push({ kind: "hat", open: true }, { kind: "stab", notes: chord.pad, steps: 1 }, { kind: "bass", midi: chord.bass, steps: 1 });
    if (at === 4 || at === 12) out.push({ kind: "snare" });
    // A snare roll into the top of the loop.
    if (bar % 4 === 3 && at >= 12) out.push({ kind: "snare" });
    if (bar % 4 === 3) for (const [s, midi, len] of SIREN) if (s === at) out.push({ kind: "lead", midi, steps: len });
    return out;
  },
};

export const TAPE_SOUNDS: readonly TapeSound[] = [
  mallsoft,
  eccojam,
  floral,
  futureFunk,
  vaportrap,
  hardvapour,
  hardvapourB,
  slushwave,
  lofi,
  lofiB,
  signalwave,
  signalwaveB,
  utopian,
  utopianB,
];
