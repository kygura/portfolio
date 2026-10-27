/**
 * Mote's sounds, synthesised on the spot: square and triangle blips through
 * one quiet gain, like a 16-bit dialogue box. Nothing is downloaded. Browsers
 * only allow audio after a gesture, so the context is opened by `unlock()` on
 * the visitor's first press or key; until then every sound is skipped.
 * Muting is remembered in `localStorage["nca-mote-sfx"]`.
 */
import { readStored, writeStored } from "@/theme/accent";
import type { Mood } from "./api";

const SFX_KEY = "nca-mote-sfx";
const VOLUME = 0.05;

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let muted = readStored(SFX_KEY) === "off";

export const isMuted = () => muted;

export function setMuted(next: boolean) {
  muted = next;
  writeStored(SFX_KEY, next ? "off" : "on");
}

export function unlock() {
  if (muted) return;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      out = ctx.createGain();
      out.gain.value = VOLUME;
      out.connect(ctx.destination);
    } catch {
      return;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
}

/** One note, `at` seconds from now, with a quick decay so blips don't click. */
function note(freq: number, at: number, dur: number, type: OscillatorType = "square", level = 1) {
  if (muted || !ctx || !out || ctx.state !== "running") return;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  env.gain.setValueAtTime(level, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const notes = (freqs: number[], step: number, dur: number, type?: OscillatorType, level?: number) =>
  freqs.forEach((f, i) => note(f, i * step, dur, type, level));

/** The text blip's pitch says the mood. */
const VOICE: Record<Mood, number> = { curious: 880, happy: 1046, thinking: 740, sleepy: 587, surprised: 1175 };

export const sfx = {
  /** One letter of dialogue. */
  blip: (mood: Mood) => note(VOICE[mood] * (0.97 + Math.random() * 0.06), 0, 0.035, "square", 0.6),
  open: () => notes([784, 1175], 0.06, 0.08),
  close: () => notes([1175, 784], 0.06, 0.08),
  send: () => notes([1568], 0, 0.05, "square", 0.7),
  /** Processing: a soft rising run while the lamps flicker. */
  think: () => notes([523, 659, 784, 1046], 0.05, 0.06, "triangle"),
  sleep: () => notes([659, 523, 392], 0.14, 0.18, "triangle"),
  wake: () => notes([392, 659, 988], 0.07, 0.09, "triangle"),
  /** Played when sound is switched back on, so the toggle answers. */
  hello: () => notes([988, 1319], 0.07, 0.07),
};
