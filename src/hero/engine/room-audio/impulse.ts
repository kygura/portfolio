// A generated reverb impulse response: a stereo tail of decaying noise that darkens as it fades
// (a one-pole lowpass whose cutoff falls over time), after a short pre-delay. Pure: returns
// sample arrays for an AudioBuffer.

export interface ImpulseOptions {
  sampleRate: number;
  seconds: number;
  /** Larger = faster decay. 3 ≈ a big, soft mall atrium. */
  decay: number;
  preDelay?: number;
  /** Seeded so the room sounds the same every visit. */
  seed?: number;
}

export function impulseResponse(o: ImpulseOptions): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const length = Math.max(1, Math.floor(o.sampleRate * o.seconds));
  const pre = Math.floor(o.sampleRate * (o.preDelay ?? 0.02));
  const channels: [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] = [new Float32Array(length), new Float32Array(length)];
  let state = (o.seed ?? 1995) >>> 0 || 1; // xorshift never leaves 0
  const noise = () => {
    // xorshift32: cheap, deterministic white noise in [-1, 1)
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 4294967296) * 2 - 1;
  };
  for (const ch of channels) {
    let low = 0;
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / (length - pre);
      // Smoothing coefficient goes from bright (0.9) to dark (0.08) along the tail.
      const k = 0.9 - 0.82 * t;
      low += k * (noise() - low);
      ch[i] = low * (1 - t) ** o.decay;
    }
  }
  return channels;
}
