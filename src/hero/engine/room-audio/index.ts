// The tape deck's engine: four generated tapes (src/audio/tapes.ts) and UI blips, all Web Audio,
// no samples.
//
// play() must come from a user gesture: it creates the AudioContext on first use (browsers refuse
// to start audio otherwise) and resumes it. pause() fades out and suspends the context, so nothing
// runs while the deck is stopped; play() carries on from the same step. Without Web Audio, all of
// it no-ops.

import type { AudioApi, SfxKind } from "./types";
import { buildGraph, type Graph } from "./graph";
import { type Clock, dueSteps } from "./schedule";
import { type Hit, STEPS_PER_BAR, stepSeconds, TAPE_SOUNDS, type TapeSound } from "./tapes";
import { Voices } from "./voices";

export { TAPE_SOUNDS };

const DEFAULT_VOLUME = 0.4;
/** A deck starts fast and stops fast. */
const FADE_IN = 0.25;
const FADE_OUT = 0.25;
/** How far ahead notes are booked, and how often the timer tops that up. Generous, because a
 * background tab may only run timers once a second. */
const LOOKAHEAD = 1.5;
const TICK_MS = 200;

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | undefined {
  const w = globalThis as typeof globalThis & { webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext;
}

/** Books one hit on the voices. Durations come from step counts at the tape's speed. */
function playHit(v: Voices, tape: TapeSound, hit: Hit, time: number, stepDur: number): void {
  switch (hit.kind) {
    case "pad":
      v.pad(hit.chord, time, hit.bars * STEPS_PER_BAR * stepDur - 2.8);
      break;
    case "bass":
      v.bass(hit.midi, time, hit.steps * stepDur);
      break;
    case "keys":
      v.keys(hit.midi, hit.velocity, time);
      break;
    case "lead":
      v.lead(hit.midi, time, Math.max(0, hit.steps * stepDur - 0.37));
      break;
    case "stab":
      v.stab(hit.notes, time, Math.max(0, hit.steps * stepDur - 0.124));
      break;
    case "kick":
      v.kick(time, tape.mix.pump, hit.hard);
      break;
    case "snare":
      v.snare(time);
      break;
    case "hat":
      v.hat(hit.open, time, hit.velocity ?? 1);
      break;
    case "sub":
      v.sub(hit.midi, time, hit.steps * stepDur);
      break;
    case "beep":
      v.beep(hit.midi, time, hit.steps ? hit.steps * stepDur : undefined);
      break;
    case "bell":
      v.bell(hit.midi, hit.velocity, time);
      break;
    case "static":
      v.snow(time, hit.steps * stepDur);
      break;
    case "crackle":
      v.crackle(time);
      break;
  }
}

export function createAudio(): AudioApi {
  const Ctor = audioContextCtor();
  let graph: Graph | null = null;
  let voices: Voices | null = null;
  let playing = false;
  let volume = DEFAULT_VOLUME;
  let tapeIndex = 0;
  let loaded = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let suspendTimer: ReturnType<typeof setTimeout> | undefined;
  let clock: Clock = { origin: 0, stepDur: stepSeconds(TAPE_SOUNDS[0]!) };
  let nextStep = 0;
  /** Where the tape is parked while stopped. */
  let parkedStep = 0;
  // Bumped by every play/pause: a play() still awaiting resume() checks it to learn whether a
  // pause (or a newer play) came in meanwhile.
  let generation = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of listeners) l();
  };
  let wave: Float32Array<ArrayBuffer> | null = null;

  const tape = () => TAPE_SOUNDS[tapeIndex] ?? TAPE_SOUNDS[0]!;

  const applyTape = () => {
    const t = tape();
    clock = { ...clock, stepDur: stepSeconds(t) };
    if (!graph || !voices) return;
    voices.rate = t.screw;
    graph.setMix({ reverb: t.mix.reverb, delay: t.mix.delay, delayTime: t.mix.delaySteps * clock.stepDur, feedback: t.mix.feedback, tone: t.mix.tone, drive: t.mix.drive ?? 0 });
  };

  const tick = () => {
    if (!graph || !voices) return;
    const now = graph.ctx.currentTime;
    const { due, next } = dueSteps(clock, nextStep, now, now + LOOKAHEAD);
    nextStep = next;
    const t = tape();
    const swing = (t.swing ?? 0) * clock.stepDur;
    for (const { step, time } of due) for (const hit of t.hits(step)) playHit(voices, t, hit, step % 2 ? time + swing : time, clock.stepDur);
  };

  /** Start the clock so that `fromStep` lands just ahead of now. */
  const roll = (fromStep: number) => {
    if (!graph) return;
    clock = { origin: graph.ctx.currentTime + 0.08 - fromStep * clock.stepDur, stepDur: clock.stepDur };
    nextStep = fromStep;
    tick();
    clearInterval(timer);
    timer = setInterval(tick, TICK_MS);
  };

  const currentStep = (): number => {
    if (!graph || !playing) return parkedStep;
    return Math.max(0, Math.floor((graph.ctx.currentTime - clock.origin) / clock.stepDur));
  };

  const fadeTo = (g: Graph, value: number, seconds: number) => {
    const p = g.fader.gain;
    const now = g.ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(value, now + seconds);
  };

  const halt = (rewind: boolean) => {
    generation++;
    const step = currentStep();
    if (playing && graph) {
      playing = false;
      clearInterval(timer);
      fadeTo(graph, 0, FADE_OUT);
      const g = graph;
      suspendTimer = setTimeout(() => {
        // Cut the tails (and anything booked ahead), then let the audio thread sleep.
        voices?.stopAll();
        void g.ctx.suspend();
      }, FADE_OUT * 1000 + 60);
    }
    parkedStep = rewind ? 0 : step;
    notify();
  };

  const api: AudioApi = {
    get playing() {
      return playing;
    },
    get tape() {
      return tapeIndex;
    },
    get loaded() {
      return loaded;
    },
    tapeCount: TAPE_SOUNDS.length,

    load(index) {
      const i = ((Math.floor(index) % TAPE_SOUNDS.length) + TAPE_SOUNDS.length) % TAPE_SOUNDS.length;
      if (i === tapeIndex && loaded && parkedStep === 0 && !playing) return;
      tapeIndex = i;
      loaded = true;
      parkedStep = 0;
      applyTape();
      if (playing && graph && voices) {
        // A new tape in a running deck: cut the old one and roll the new one from the top.
        voices.stopAll();
        roll(0);
      }
      notify();
    },

    async play() {
      if (!loaded) {
        loaded = true;
        notify();
      }
      if (!Ctor || playing) return;
      if (!graph) {
        const ctx = new Ctor({ latencyHint: "playback" });
        graph = buildGraph(ctx, volume);
        voices = new Voices(graph);
      }
      applyTape();
      const gen = ++generation;
      clearTimeout(suspendTimer);
      await graph.ctx.resume();
      if (gen !== generation || playing) return;
      playing = true;
      fadeTo(graph, 1, FADE_IN);
      roll(parkedStep);
      notify();
    },

    pause() {
      halt(false);
    },

    stop() {
      halt(true);
    },

    eject() {
      if (!loaded) return;
      loaded = false;
      halt(true);
    },

    position() {
      return currentStep() * clock.stepDur;
    },

    level() {
      if (!graph || !playing) return 0;
      const a = graph.analyser;
      if (!wave || wave.length !== a.fftSize) wave = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(wave);
      let sum = 0;
      for (const x of wave) sum += x * x;
      return Math.min(1, Math.sqrt(sum / wave.length) * 4);
    },

    onChange(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },

    blip(kind: SfxKind) {
      if (!playing || !graph || !voices) return;
      voices.sfx(kind, graph.ctx.currentTime + 0.005);
    },

    dispose() {
      generation++;
      playing = false;
      clearInterval(timer);
      clearTimeout(suspendTimer);
      voices?.stopAll();
      void graph?.ctx.close();
      graph = null;
      voices = null;
      listeners.clear();
    },

    setVolume(v: number) {
      volume = Math.min(1, Math.max(0, Number.isFinite(v) ? v : DEFAULT_VOLUME));
      if (graph) graph.master.gain.setTargetAtTime(volume, graph.ctx.currentTime, 0.05);
    },
  };
  return api;
}
