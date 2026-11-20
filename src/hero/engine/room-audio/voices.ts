// Short-lived voices: pad chords, bass, electric piano, a vocal-ish lead, chopped stabs, a drum
// machine, UI blips. Every voice disconnects itself
// when its last source ends, and all live voices can be cut at once (on stop), so node count
// stays bounded no matter how long the music runs or how often it is toggled.

import type { SfxKind } from "./types";
import { adsr, applyEnvelope, pluck } from "./envelope";
import type { Graph } from "./graph";
import { SFX } from "./sfx";
import { type Chord, mtof } from "./theory";

interface Timed {
  node: AudioScheduledSourceNode;
  start: number;
  end: number;
}

interface Voice {
  sources: Timed[];
  nodes: AudioNode[];
  /** Oscillators listening to wow/flutter: unhooked at the end, or the LFO would keep them alive. */
  wobbled: OscillatorNode[];
}

export class Voices {
  private readonly live = new Set<Voice>();

  /** Playback rate of the tape: every pitch (drums too) follows it, like a tape running slow. */
  rate = 1;

  constructor(private readonly g: Graph) {}

  private f(midi: number): number {
    return mtof(midi) * this.rate;
  }

  /** Starts and stops every source on schedule; cleans up when the last one has ended. */
  private play(v: Voice): void {
    this.live.add(v);
    let pending = v.sources.length;
    for (const { node, start, end } of v.sources) {
      node.onended = () => {
        if (--pending === 0) this.release(v);
      };
      node.start(start);
      node.stop(end);
    }
  }

  private release(v: Voice): void {
    if (!this.live.delete(v)) return;
    for (const osc of v.wobbled) this.g.wobble.disconnect(osc.detune);
    for (const n of v.sources) n.node.disconnect();
    for (const n of v.nodes) n.disconnect();
  }

  /** Sources that share one start and end. */
  private static together(nodes: AudioScheduledSourceNode[], start: number, end: number): Timed[] {
    return nodes.map((node) => ({ node, start, end }));
  }

  /** Pad chord: per note a detuned saw + triangle pair, slow attack, long release into the next bar. */
  pad(chord: Chord, time: number, hold: number): void {
    const { ctx } = this.g;
    const env = adsr({ attack: 1.6, decay: 1.2, sustain: 0.7, release: 2.6, peak: 0.055 }, time, hold);
    const amp = new GainNode(ctx, { gain: 0 });
    applyEnvelope(amp.gain, env.points);
    amp.connect(this.g.pads);
    const v: Voice = { sources: [], nodes: [amp], wobbled: [] };
    for (const midi of chord.pad) {
      for (const [type, detune] of [
        ["sawtooth", -8],
        ["triangle", 7],
      ] as const) {
        const osc = new OscillatorNode(ctx, { type, frequency: this.f(midi), detune });
        osc.connect(amp);
        this.g.wobble.connect(osc.detune);
        v.sources.push({ node: osc, start: time, end: env.end });
        v.wobbled.push(osc);
      }
    }
    this.play(v);
  }

  /** Bass for `dur` seconds: a soft swell when it"s long, a plucked note when it"s short. */
  bass(midi: number, time: number, dur: number): void {
    const { ctx } = this.g;
    const shape =
      dur < 0.5
        ? { attack: 0.005, decay: 0.09, sustain: 0.6, release: 0.05, peak: 0.2 }
        : { attack: 0.35, decay: 0.8, sustain: 0.6, release: 1.4, peak: 0.16 };
    const env = adsr(shape, time, dur - shape.attack - shape.decay);
    const amp = new GainNode(ctx, { gain: 0 });
    applyEnvelope(amp.gain, env.points);
    amp.connect(this.g.pads);
    const osc = new OscillatorNode(ctx, { type: "triangle", frequency: this.f(midi) });
    osc.connect(amp);
    this.g.wobble.connect(osc.detune);
    this.play({ sources: Voices.together([osc], time, env.end), nodes: [amp], wobbled: [osc] });
  }

  /**
   * Electric piano: two-operator FM (1:1, like a tine) whose brightness decays faster than its
   * volume, plus a faint bell partial two octaves up.
   */
  keys(midi: number, velocity: number, time: number): void {
    const { ctx } = this.g;
    const f = this.f(midi);
    const env = pluck(0.07 * velocity, time, 1.3);
    const amp = new GainNode(ctx, { gain: 0 });
    applyEnvelope(amp.gain, env.points);
    amp.connect(this.g.keys);

    const carrier = new OscillatorNode(ctx, { frequency: f });
    const mod = new OscillatorNode(ctx, { frequency: f });
    const index = new GainNode(ctx, { gain: 0 });
    applyEnvelope(index.gain, pluck(f * 1.4 * velocity, time, 0.5).points);
    mod.connect(index).connect(carrier.frequency);
    carrier.connect(amp);

    const bell = new OscillatorNode(ctx, { frequency: f * 4 });
    const bellAmp = new GainNode(ctx, { gain: 0 });
    applyEnvelope(bellAmp.gain, pluck(0.12, time, 0.25).points);
    bell.connect(bellAmp).connect(amp);

    this.play({ sources: Voices.together([carrier, mod, bell], time, env.end), nodes: [amp, index, bellAmp], wobbled: [] });
  }

  /** A sung-sounding line: two detuned saws through a resonant lowpass, with slow vibrato. */
  lead(midi: number, time: number, hold: number): void {
    const { ctx } = this.g;
    const env = adsr({ attack: 0.07, decay: 0.3, sustain: 0.75, release: 0.5, peak: 0.045 }, time, hold);
    const amp = new GainNode(ctx, { gain: 0 });
    applyEnvelope(amp.gain, env.points);
    const filter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 1500, Q: 5 });
    filter.connect(amp).connect(this.g.keys);
    const vibrato = new OscillatorNode(ctx, { frequency: 5.2 });
    const depth = new GainNode(ctx, { gain: 14 });
    vibrato.connect(depth);
    const v: Voice = { sources: [{ node: vibrato, start: time, end: env.end }], nodes: [amp, filter, depth], wobbled: [] };
    for (const detune of [-7, 7]) {
      const osc = new OscillatorNode(ctx, { type: "sawtooth", frequency: this.f(midi), detune });
      depth.connect(osc.detune);
      this.g.wobble.connect(osc.detune);
      osc.connect(filter);
      v.sources.push({ node: osc, start: time, end: env.end });
      v.wobbled.push(osc);
    }
    this.play(v);
  }

  /** A chopped chord: short, bright, through the sidechain like a filtered disco loop. */
  stab(notes: readonly number[], time: number, hold: number): void {
    const { ctx } = this.g;
    const env = adsr({ attack: 0.004, decay: 0.12, sustain: 0.45, release: 0.08, peak: 0.05 }, time, hold);
    const amp = new GainNode(ctx, { gain: 0 });
    applyEnvelope(amp.gain, env.points);
    const filter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 2600, Q: 1.5 });
    filter.connect(amp).connect(this.g.pads);
    const v: Voice = { sources: [], nodes: [amp, filter], wobbled: [] };
    for (const midi of notes) {
      for (const type of ["sawtooth", "square"] as const) {
        const osc = new OscillatorNode(ctx, { type, frequency: this.f(midi), detune: type === "square" ? 5 : -5 });
        osc.connect(filter);
        v.sources.push({ node: osc, start: time, end: env.end });
      }
    }
    this.play(v);
  }

  /** Drum machine kick: a sine dropping from 150 to 45 Hz. Ducks the music by `pump`. */
  kick(time: number, pump: number, hard = false): void {
    const { ctx } = this.g;
    const osc = new OscillatorNode(ctx, { frequency: (hard ? 260 : 150) * this.rate });
    osc.frequency.exponentialRampToValueAtTime((hard ? 52 : 45) * this.rate, time + (hard ? 0.09 : 0.13));
    const env = pluck(hard ? 0.5 : 0.9, time, hard ? 0.3 : 0.42, 0.002);
    const amp = new GainNode(ctx, { gain: 0 });
    applyEnvelope(amp.gain, env.points);
    const nodes: AudioNode[] = [amp];
    if (hard) {
      // A gabber kick: overdriven on its own, before the drum bus, into a square-ish thud.
      this.driveCurve ??= Float32Array.from({ length: 1024 }, (_, i) => Math.tanh(((i / 1023) * 2 - 1) * 8));
      const pre = new GainNode(ctx, { gain: 3 });
      const drive = new WaveShaperNode(ctx, { curve: this.driveCurve, oversample: "2x" });
      osc.connect(pre).connect(drive).connect(amp);
      nodes.push(pre, drive);
    } else osc.connect(amp);
    amp.connect(this.g.drums);
    this.play({ sources: [{ node: osc, start: time, end: env.end }], nodes, wobbled: [] });
    if (pump > 0) {
      const p = this.g.pump.gain;
      p.setValueAtTime(1 - pump, time);
      p.linearRampToValueAtTime(1, time + 0.22 / this.rate);
    }
  }

  /** 808: a sine sub with a quick pitch drop at the start and a long tail, for trap. */
  sub(midi: number, time: number, dur: number): void {
    const { ctx } = this.g;
    const f = this.f(midi);
    const osc = new OscillatorNode(ctx, { frequency: f * 2 });
    osc.frequency.exponentialRampToValueAtTime(f, time + 0.06);
    const env = adsr({ attack: 0.004, decay: 0.25, sustain: 0.7, release: 0.25, peak: 0.42 }, time, Math.max(0, dur - 0.25));
    const amp = new GainNode(ctx, { gain: 0 });
    applyEnvelope(amp.gain, env.points);
    osc.connect(amp).connect(this.g.drums);
    this.play({ sources: [{ node: osc, start: time, end: env.end }], nodes: [amp], wobbled: [] });
  }

  /** tanh drive for the hard kick, built once. */
  private driveCurve: Float32Array<ArrayBuffer> | null = null;

  /** A station-ident beep: a pure sine, short, dry-ish. Given a length, it holds like a test tone. */
  beep(midi: number, time: number, dur?: number): void {
    const { ctx } = this.g;
    const osc = new OscillatorNode(ctx, { frequency: this.f(midi) });
    const env = dur
      ? adsr({ attack: 0.01, decay: 0.01, sustain: 1, release: 0.01, peak: 0.03 }, time, Math.max(0, dur - 0.03))
      : pluck(0.05, time, 0.22, 0.004);
    const amp = new GainNode(ctx, { gain: 0 });
    applyEnvelope(amp.gain, env.points);
    osc.connect(amp).connect(this.g.keys);
    this.play({ sources: [{ node: osc, start: time, end: env.end }], nodes: [amp], wobbled: [] });
  }

  /**
   * A stock MIDI bell, too clean on purpose: FM at 1:3.5 (metallic, inharmonic) that rings out
   * quickly, through the keys bus and its echo.
   */
  bell(midi: number, velocity: number, time: number): void {
    const { ctx } = this.g;
    const f = this.f(midi);
    const env = pluck(0.05 * velocity, time, 0.9, 0.002);
    const amp = new GainNode(ctx, { gain: 0 });
    applyEnvelope(amp.gain, env.points);
    amp.connect(this.g.keys);
    const carrier = new OscillatorNode(ctx, { frequency: f });
    const mod = new OscillatorNode(ctx, { frequency: f * 3.5 });
    const index = new GainNode(ctx, { gain: 0 });
    applyEnvelope(index.gain, pluck(f * 2 * velocity, time, 0.3, 0.002).points);
    mod.connect(index).connect(carrier.frequency);
    carrier.connect(amp);
    this.play({ sources: Voices.together([carrier, mod], time, env.end), nodes: [amp, index], wobbled: [] });
  }

  /** Snow between channels: a band of noise held for `dur` seconds. */
  snow(time: number, dur: number): void {
    const { ctx } = this.g;
    const noise = new AudioBufferSourceNode(ctx, { buffer: this.g.noise, loop: true, playbackRate: this.rate });
    const band = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 2400, Q: 0.5 });
    const env = adsr({ attack: 0.005, decay: 0.05, sustain: 0.7, release: 0.06, peak: 0.12 }, time, Math.max(0, dur - 0.06));
    const amp = new GainNode(ctx, { gain: 0 });
    applyEnvelope(amp.gain, env.points);
    noise.connect(band).connect(amp).connect(this.g.drums);
    this.play({ sources: [{ node: noise, start: time, end: env.end }], nodes: [band, amp], wobbled: [] });
  }

  /** One click of dust on a record: a few milliseconds of high-passed noise. */
  crackle(time: number): void {
    const { ctx } = this.g;
    const noise = new AudioBufferSourceNode(ctx, { buffer: this.g.noise, playbackRate: 1 + ((time * 7919) % 1) });
    const high = new BiquadFilterNode(ctx, { type: "highpass", frequency: 2500 });
    const env = pluck(0.07, time, 0.008, 0.0005);
    const amp = new GainNode(ctx, { gain: 0 });
    applyEnvelope(amp.gain, env.points);
    noise.connect(high).connect(amp).connect(this.g.drums);
    this.play({ sources: [{ node: noise, start: time, end: env.end }], nodes: [high, amp], wobbled: [] });
  }

  /** Snare: a band of noise and a short tone underneath. */
  snare(time: number): void {
    const { ctx } = this.g;
    const noise = new AudioBufferSourceNode(ctx, { buffer: this.g.noise, playbackRate: this.rate });
    const band = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 1800 * this.rate, Q: 0.7 });
    const nEnv = pluck(0.32, time, 0.2, 0.002);
    const nAmp = new GainNode(ctx, { gain: 0 });
    applyEnvelope(nAmp.gain, nEnv.points);
    noise.connect(band).connect(nAmp).connect(this.g.drums);
    nAmp.connect(new GainNode(ctx, { gain: 0.5 })).connect(this.g.reverb);
    const body = new OscillatorNode(ctx, { type: "triangle", frequency: 185 * this.rate });
    const bEnv = pluck(0.25, time, 0.09, 0.002);
    const bAmp = new GainNode(ctx, { gain: 0 });
    applyEnvelope(bAmp.gain, bEnv.points);
    body.connect(bAmp).connect(this.g.drums);
    this.play({
      sources: [
        { node: noise, start: time, end: nEnv.end },
        { node: body, start: time, end: bEnv.end },
      ],
      nodes: [band, nAmp, bAmp],
      wobbled: [],
    });
  }

  /** Hi-hat: high-passed noise, closed or open. */
  hat(open: boolean, time: number, velocity = 1): void {
    const { ctx } = this.g;
    const noise = new AudioBufferSourceNode(ctx, { buffer: this.g.noise, playbackRate: this.rate });
    const high = new BiquadFilterNode(ctx, { type: "highpass", frequency: 7000 * this.rate });
    const env = pluck((open ? 0.05 : 0.06) * velocity, time, open ? 0.24 : 0.04, 0.002);
    const amp = new GainNode(ctx, { gain: 0 });
    applyEnvelope(amp.gain, env.points);
    noise.connect(high).connect(amp).connect(this.g.drums);
    this.play({ sources: [{ node: noise, start: time, end: env.end }], nodes: [high, amp], wobbled: [] });
  }

  sfx(kind: SfxKind, time: number): void {
    const { ctx } = this.g;
    const def = SFX[kind];
    const filter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: def.cutoff });
    filter.connect(this.g.sfx);
    const nodes: AudioNode[] = [filter];
    if (def.wet > 0) {
      const send = new GainNode(ctx, { gain: def.wet });
      filter.connect(send).connect(this.g.reverb);
      nodes.push(send);
    }
    const v: Voice = { sources: [], nodes, wobbled: [] };
    for (const tone of def.tones) {
      const start = time + tone.at;
      const osc = new OscillatorNode(ctx, { type: tone.type, frequency: tone.freq });
      if (tone.toFreq) osc.frequency.exponentialRampToValueAtTime(tone.toFreq, start + tone.dur);
      const amp = new GainNode(ctx, { gain: 0 });
      const env = pluck(tone.gain, start, tone.dur, 0.003);
      applyEnvelope(amp.gain, env.points);
      osc.connect(amp).connect(filter);
      v.sources.push({ node: osc, start, end: env.end });
      v.nodes.push(amp);
    }
    this.play(v);
  }

  /** Cuts every live voice now (after the fade-out, before suspending). */
  stopAll(): void {
    for (const v of [...this.live]) {
      // Stopping is enough for sources already playing; release() also covers ones still waiting
      // for their start time, whose onended would only fire once they had run.
      for (const { node } of v.sources) node.stop();
      this.release(v);
    }
  }
}
