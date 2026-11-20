// Types shared by the tape synth, ported from vape.wave's contracts.

export type SfxKind = "click" | "open" | "close" | "error" | "startup" | "toggle" | "hover";

export interface AudioApi {
  /** Tapes the synth has music for. */
  readonly tapeCount: number;
  /** The tape in the deck, or the last one in it once ejected. */
  readonly tape: number;
  /** Whether there is a tape in the deck at all. It starts empty. */
  readonly loaded: boolean;
  readonly playing: boolean;
  /** Put a tape in the deck. Rewinds it; a running deck carries straight on with the new tape. */
  load(index: number): void;
  /** Must be called from a user gesture: browsers only start audio inside one. */
  play(): Promise<void>;
  /** Stop where it is; play() carries on from there. */
  pause(): void;
  /** Stop and rewind. */
  stop(): void;
  /** Stop and take the tape out. */
  eject(): void;
  /** Seconds of tape played since the last rewind, at playback speed. */
  position(): number;
  /** How loud the music is right now, 0..1. 0 when stopped. */
  level(): number;
  /** Called after every change of tape or play state. Returns an unsubscribe function. */
  onChange(listener: () => void): () => void;
  /** Short UI sound. Silent unless the deck is playing. */
  blip(kind: SfxKind): void;
  /** Stop everything and close the audio context. */
  dispose(): void;
  /** Master volume 0..1. */
  setVolume(v: number): void;
}
