// The fixed part of the audio graph, built once per AudioContext:
//
//   pads, bass, stabs ─ lowpass (slow swell) ─┐
//   keys, lead ───────────────────────────────┴─ chorus ─ pump ─┐
//   drums ──────────────────────────────────────────────────────┴─ music ─ tone ─┬───── fader ─ master ─ limiter ─ out
//                                                      reverb send ─ convolver ──┤                  └─ analyser
//                                                      echo send ─ tape delay ───┘
//   hiss (looped filtered noise) ─────────────────────────────────────── fader
//   sfx ─────────────────────────────────────────────────────────────────────── master
//
// `pump` is the sidechain: it ducks everything but the drums on each kick. `tone` is the tape's
// own lowpass, set per tape. `wobble` is wow + flutter (two slow LFOs, in cents) that the
// sustained voices' detune listens to: they drift together like a stretched tape.

import { impulseResponse } from "./impulse";

export interface Graph {
  ctx: AudioContext;
  /** Pad, bass and stab voices connect here. */
  pads: AudioNode;
  /** Electric piano and lead voices connect here. */
  keys: AudioNode;
  /** Drum voices: past the sidechain, so they don't duck themselves. */
  drums: AudioNode;
  /** Send to the tape echo. */
  echo: AudioNode;
  /** The sidechain gain: drop it on a kick and let it recover. */
  pump: GainNode;
  /** One second of white noise, for drums. */
  noise: AudioBuffer;
  /** Watches the music on its way out, for the visuals. */
  analyser: AnalyserNode;
  /** Point the mix at a tape: room, echo, tone. */
  setMix(m: { reverb: number; delay: number; delayTime: number; feedback: number; tone: number; drive: number }): void;
  /** UI sounds (dry). */
  sfx: AudioNode;
  /** Reverb send, for voices that want more room than the music bus gives. */
  reverb: AudioNode;
  /** Wow and flutter, in cents: connect to an oscillator's detune. */
  wobble: AudioNode;
  /** Music fade in/out (0..1). */
  fader: GainNode;
  /** User volume. */
  master: GainNode;
}

/** A sine LFO of `depth` around the target's own value. Runs for the life of the context. */
function lfo(ctx: AudioContext, hz: number, depth: number, target: AudioParam | AudioNode): void {
  const osc = new OscillatorNode(ctx, { frequency: hz });
  const amount = new GainNode(ctx, { gain: depth });
  osc.connect(amount);
  // connect() is overloaded per target type, so the union has to be split.
  if (target instanceof AudioNode) amount.connect(target);
  else amount.connect(target);
  osc.start();
}

/** Two short modulated delays panned apart: a cheap stereo chorus. */
function chorus(ctx: AudioContext, out: AudioNode): AudioNode {
  const input = new GainNode(ctx);
  input.connect(new GainNode(ctx, { gain: 0.75 })).connect(out);
  for (const [ms, hz, pan] of [
    [14, 0.23, -0.7],
    [21, 0.31, 0.7],
  ] as const) {
    const delay = new DelayNode(ctx, { delayTime: ms / 1000, maxDelayTime: 0.05 });
    lfo(ctx, hz, 0.004, delay.delayTime);
    input.connect(delay).connect(new StereoPannerNode(ctx, { pan })).connect(new GainNode(ctx, { gain: 0.45 })).connect(out);
  }
  return input;
}

function hiss(ctx: AudioContext, out: AudioNode): void {
  const seconds = 2;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = seed / 2147483648 - 1;
  }
  const src = new AudioBufferSourceNode(ctx, { buffer, loop: true });
  src
    .connect(new BiquadFilterNode(ctx, { type: "highpass", frequency: 3000 }))
    .connect(new BiquadFilterNode(ctx, { type: "lowpass", frequency: 9000 }))
    .connect(new GainNode(ctx, { gain: 0.007 }))
    .connect(out);
  src.start();
}

/** A soft-clip curve: a straight line at 0, tanh saturation (and a little gain) toward 1. */
export function driveCurve(drive: number, size = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  const k = 1 + Math.max(0, Math.min(1, drive)) * 12;
  const norm = Math.tanh(k);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 99;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = seed / 2147483648 - 1;
  }
  return buffer;
}

export function buildGraph(ctx: AudioContext, volume: number): Graph {
  // Output: user volume, then a limiter so stacked voices never clip.
  const limiter = new DynamicsCompressorNode(ctx, { threshold: -14, knee: 8, ratio: 12, attack: 0.004, release: 0.25 });
  limiter.connect(ctx.destination);
  const master = new GainNode(ctx, { gain: volume });
  master.connect(limiter);
  const fader = new GainNode(ctx, { gain: 0 });
  fader.connect(master);
  const analyser = new AnalyserNode(ctx, { fftSize: 512, smoothingTimeConstant: 0.6 });
  fader.connect(analyser);

  // Tape tone, then the room and the echo hang off it.
  const tone = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 6000, Q: 0.5 });
  tone.connect(fader);

  const [left, right] = impulseResponse({ sampleRate: ctx.sampleRate, seconds: 3.4, decay: 3, preDelay: 0.03 });
  const ir = ctx.createBuffer(2, left.length, ctx.sampleRate);
  ir.copyToChannel(left, 0);
  ir.copyToChannel(right, 1);
  const reverb = new GainNode(ctx, { gain: 1 });
  reverb.connect(new ConvolverNode(ctx, { buffer: ir })).connect(new GainNode(ctx, { gain: 0.6 })).connect(fader);
  const roomSend = new GainNode(ctx, { gain: 0.55 });
  tone.connect(roomSend).connect(reverb);

  // Tape echo: a delay whose repeats come back darker each time.
  const echo = new GainNode(ctx, { gain: 0 });
  const delay = new DelayNode(ctx, { delayTime: 0.3, maxDelayTime: 2 });
  const feedback = new GainNode(ctx, { gain: 0.4 });
  const darken = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 2400 });
  echo.connect(delay);
  delay.connect(darken).connect(feedback).connect(delay);
  darken.connect(fader);
  darken.connect(new GainNode(ctx, { gain: 0.4 })).connect(reverb);

  const music = new GainNode(ctx, { gain: 1.1 });
  music.connect(tone);
  const pump = new GainNode(ctx, { gain: 1 });
  pump.connect(music);
  const chorusIn = chorus(ctx, pump);

  const pads = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 1300, Q: 0.6 });
  pads.connect(chorusIn);
  // The swell: the pad filter opens and closes over ~20 s.
  lfo(ctx, 0.05, 550, pads.frequency);

  const keys = new GainNode(ctx, { gain: 1 });
  keys.connect(chorusIn);
  keys.connect(echo);

  // Drums go through a waveshaper: clean at drive 0, clipped and crunchy toward 1 (hardvapour).
  const drums = new GainNode(ctx, { gain: 1 });
  const crunch = new WaveShaperNode(ctx, { curve: driveCurve(0), oversample: "2x" });
  drums.connect(crunch).connect(music);
  let drive = 0;

  const wobble = new GainNode(ctx, { gain: 1 });
  lfo(ctx, 0.45, 9, wobble);
  lfo(ctx, 5.8, 2.5, wobble);

  hiss(ctx, fader);

  const sfx = new GainNode(ctx, { gain: 1 });
  sfx.connect(master);

  const glide = (p: AudioParam, v: number) => p.setTargetAtTime(v, ctx.currentTime, 0.08);
  return {
    ctx,
    pads,
    keys,
    drums,
    echo,
    pump,
    noise: noiseBuffer(ctx),
    analyser,
    sfx,
    reverb,
    wobble,
    fader,
    master,
    setMix(m) {
      glide(roomSend.gain, m.reverb * 0.7);
      glide(echo.gain, m.delay);
      glide(delay.delayTime, m.delayTime);
      glide(feedback.gain, Math.min(0.85, m.feedback));
      glide(tone.frequency, m.tone);
      if (m.drive !== drive) {
        drive = m.drive;
        crunch.curve = driveCurve(drive);
      }
    },
  };
}
