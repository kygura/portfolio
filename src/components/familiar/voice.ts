/**
 * Bit's voice: no speech, just a bitcrushed babble. Each syllable is a short
 * low square-wave blip roughed up with LFSR noise, sample-and-held down to
 * ~4 kHz and quantised to 3 bits, so it sounds like grit in an old machine. The pitch of each blip comes from
 * the letters it stands for, so a line always "sounds" the same way, and the
 * blips land in step with the bubble's typewriter.
 *
 * There's also a spoken mode: the browser's own text-to-speech, pitched
 * right down and slowed, for a flat machine voice. The bubble's header
 * cycles babble → voice → off, and the choice is remembered.
 *
 * Audio only plays once the browser allows it (after any click or key).
 */
import { readStored, writeStored } from "@/theme/accent";
import { context } from "@/theme/sfx";

/** Milliseconds per character in the bubble's typewriter. */
export const CHAR_MS = 32;
/** One blip per this many characters. */
const CHARS_PER_BLIP = 2;
const BASE_HZ = 95;
const LEVEL = 0.05;
const HOLD = 12; // sample-and-hold factor: 48 kHz → 4 kHz
const LEVELS = 8; // 3-bit amplitude
const NOISE = 0.45; // share of the blip that is noise
const MODE_KEY = "nca-familiar-voice";
/** Before the voice modes there was only a mute switch. */
const LEGACY_MUTE_KEY = "nca-familiar-mute";

export type VoiceMode = "babble" | "speech" | "off";
export const VOICE_MODES: VoiceMode[] = ["babble", "speech", "off"];

export const speechAvailable = () => typeof window !== "undefined" && "speechSynthesis" in window;

export function voiceMode(): VoiceMode {
  const stored = readStored(MODE_KEY);
  if (stored === "babble" || stored === "off") return stored;
  if (stored === "speech") return speechAvailable() ? "speech" : "babble";
  return readStored(LEGACY_MUTE_KEY) === "1" ? "off" : "babble";
}

export const setVoiceMode = (mode: VoiceMode) => writeStored(MODE_KEY, mode);

/** The next mode for the toggle, skipping speech where the browser has none. */
export function nextVoiceMode(mode: VoiceMode): VoiceMode {
  const modes = speechAvailable() ? VOICE_MODES : VOICE_MODES.filter((m) => m !== "speech");
  return modes[(modes.indexOf(mode) + 1) % modes.length];
}

const isMuted = () => voiceMode() === "off";

const crush = (v: number) => Math.round(v * (LEVELS / 2)) / (LEVELS / 2);

/** A single crushed blip: a noisy square wave with a pitch dip and a stepped decay. */
function blip(ac: AudioContext, hz: number, seconds: number): AudioBuffer {
  const rate = ac.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ac.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let phase = 0;
  let held = 0;
  // 15-bit LFSR, the old console noise channel. Seeded from the pitch so a
  // given blip always crackles the same way.
  let lfsr = (hz * 2654435761) & 0x7fff || 1;
  for (let i = 0; i < length; i++) {
    const t = i / length;
    // A little downward bend, like stone settling.
    phase += (hz * (1 - 0.18 * t)) / rate;
    if (i % HOLD === 0) {
      const square = phase % 1 < 0.5 ? 1 : -1;
      const bit = (lfsr ^ (lfsr >> 1)) & 1;
      lfsr = (lfsr >> 1) | (bit << 14);
      const noise = lfsr & 1 ? 1 : -1;
      const env = t < 0.06 ? t / 0.06 : 1 - (t - 0.06) / 0.94;
      held = crush((square * (1 - NOISE) + noise * NOISE) * env);
    }
    data[i] = held;
  }
  return buffer;
}

const cache = new Map<string, AudioBuffer>();

function cachedBlip(ac: AudioContext, hz: number, seconds: number) {
  const key = `${hz}:${seconds}`;
  let buffer = cache.get(key);
  if (!buffer) {
    buffer = blip(ac, hz, seconds);
    cache.set(key, buffer);
  }
  return buffer;
}

/** The pitch for a chunk of text: a step on a dark, narrow scale. */
const SCALE = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 8 / 5];
function pitchOf(chunk: string) {
  let h = 0;
  for (const c of chunk) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Math.round(BASE_HZ * SCALE[h % SCALE.length]);
}

/**
 * Run `play` once audio is allowed. After a gesture a suspended context
 * resumes; before one, resume() never settles and nothing plays.
 */
function withAudio(play: (ac: AudioContext) => void) {
  if (isMuted()) return;
  const ac = context();
  if (!ac) return;
  if (ac.state === "running") return play(ac);
  // Only play if the resume comes right away (this call was a gesture), not
  // much later when some other click finally unlocks audio.
  const asked = performance.now();
  void ac.resume().then(
    () => ac.state === "running" && performance.now() - asked < 300 && play(ac),
    () => {}
  );
}

/** Say `text` in the chosen voice. Silent when off or before audio is allowed. */
export function voice(text: string) {
  const mode = voiceMode();
  if (mode === "babble") withAudio((ac) => speak(ac, text));
  else if (mode === "speech") say(text);
}

// ---- Spoken mode --------------------------------------------------------------

/** Prefer a plain English voice; robotic comes from pitch and rate, not the voice. */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /^en(-|_)/i.test(v.lang) && /google|daniel|alex|fred|zarvox|robot/i.test(v.name)) ??
    voices.find((v) => /^en(-|_)/i.test(v.lang)) ??
    null
  );
}

function say(text: string) {
  if (!speechAvailable()) return;
  // Words only: skip stage directions like *grinding stone noises* and lone punctuation.
  const words = text.replace(/\*[^*]*\*/g, " ").replace(/[♥…]/g, " ").trim();
  if (!/[a-z0-9]/i.test(words)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const line = new SpeechSynthesisUtterance(words);
  const v = pickVoice();
  if (v) line.voice = v;
  line.pitch = 0.1;
  line.rate = 0.82;
  line.volume = 0.7;
  synth.speak(line);
}

/** Stop anything Bit is saying (used when switching modes). */
export function hush() {
  if (speechAvailable()) window.speechSynthesis.cancel();
}

function speak(ac: AudioContext, text: string) {
  const out = ac.createGain();
  out.gain.value = LEVEL;
  out.connect(ac.destination);

  const t0 = ac.currentTime + 0.02;
  for (let i = 0; i < text.length; i += CHARS_PER_BLIP) {
    const chunk = text.slice(i, i + CHARS_PER_BLIP);
    // Spaces and punctuation are rests.
    if (!/[a-z0-9]/i.test(chunk)) continue;
    const src = ac.createBufferSource();
    src.buffer = cachedBlip(ac, pitchOf(chunk), 0.055);
    src.connect(out);
    src.start(t0 + (i * CHAR_MS) / 1000);
  }
  // Let the gain node go once the line is done.
  window.setTimeout(() => out.disconnect(), text.length * CHAR_MS + 500);
}

/** A low crunch for a touch, and a rising chirp for waking up. */
export function chirp(kind: "touch" | "wake") {
  withAudio((ac) => chirpNow(ac, kind));
}

function chirpNow(ac: AudioContext, kind: "touch" | "wake") {
  const out = ac.createGain();
  out.gain.value = LEVEL;
  out.connect(ac.destination);
  const notes = kind === "touch" ? [BASE_HZ * 0.75, BASE_HZ] : [BASE_HZ, BASE_HZ * 1.33, BASE_HZ * 2];
  notes.forEach((hz, i) => {
    const src = ac.createBufferSource();
    src.buffer = cachedBlip(ac, Math.round(hz), 0.07);
    src.connect(out);
    src.start(ac.currentTime + 0.02 + i * 0.06);
  });
  window.setTimeout(() => out.disconnect(), 600);
}
