/**
 * The palettes and the one switch that applies them. CSS tokens live in
 * index.css under `:root[data-accent=…]` (an inline script in index.html
 * applies the saved one before first paint); the hero reads `hex`/`deep`/`fog`/
 * `zen` for its shader uniforms, so one switch recolours both the page and the
 * scene. `bg`/`ink` only paint the chips in the picker; the page itself reads
 * the CSS tokens.
 *
 * Palettes come in four families (Hearth has four, Tide two). Keys 1–4 pick a family and pressing
 * the same key again steps through it; `t` walks every palette in order.
 */
import { useSyncExternalStore } from "react";
import { playAccentSfx } from "./sfx";

export type FamilyId = "hearth" | "grove" | "tide" | "signal";

export interface Accent {
  id:
    | "manuscript" | "torch" | "madder" | "sunset"
    | "lichen" | "moss" | "jade"
    | "astral" | "iris"
    | "mono" | "phosphor" | "vermilion";
  name: string;
  family: FamilyId;
  /** Accent colour. */
  hex: string;
  deep: string;
  /** Hero horizon fog and zenith. */
  fog: string;
  zen: string;
  /** Page ground and ink, for the picker chips. */
  bg: string;
  ink: string;
}

export interface Family {
  id: FamilyId;
  name: string;
  /** One line on what the family has in common. */
  mood: string;
}

export const FAMILIES: Family[] = [
  { id: "hearth", name: "Hearth", mood: "Warm, lamp-lit" },
  { id: "grove", name: "Grove", mood: "Living green" },
  { id: "tide", name: "Tide", mood: "Cold, after dark" },
  { id: "signal", name: "Signal", mood: "Stark, one colour" },
];

/** Grouped by family, in FAMILIES order. */
export const ACCENTS: Accent[] = [
  // Hearth: every one swaps the whole sheet (see index.css).
  { id: "manuscript", name: "Manuscript", family: "hearth", hex: "#e08a62", deep: "#9a4524", fog: "#4a4038", zen: "#14110e", bg: "#1b1a17", ink: "#ebe6db" },
  { id: "torch", name: "Amber", family: "hearth", hex: "#eaa24c", deep: "#a24e1c", fog: "#4d4046", zen: "#130f16", bg: "#17121a", ink: "#f0e1cd" },
  { id: "madder", name: "Rose", family: "hearth", hex: "#e5787f", deep: "#7e2638", fog: "#4d343c", zen: "#150b10", bg: "#1a0f14", ink: "#f2dfdc" },
  { id: "sunset", name: "Sunset", family: "hearth", hex: "#f4945c", deep: "#b02a6a", fog: "#4a2a3c", zen: "#14060f", bg: "#1a0c18", ink: "#f8e6d6" },
  // Grove
  { id: "lichen", name: "Lichen", family: "grove", hex: "#bcc77c", deep: "#5d7a3a", fog: "#3b4c4b", zen: "#0f171b", bg: "#111617", ink: "#e0d9c8" },
  { id: "moss", name: "Moss", family: "grove", hex: "#7fcf8a", deep: "#2f7a45", fog: "#2e4637", zen: "#07110b", bg: "#0e1611", ink: "#dde8d4" },
  { id: "jade", name: "Jade", family: "grove", hex: "#5ad6ad", deep: "#1d7a63", fog: "#2b4844", zen: "#061110", bg: "#0b1615", ink: "#d6ebe4" },
  // Tide
  { id: "astral", name: "Sky", family: "tide", hex: "#86d3dc", deep: "#2f6f9a", fog: "#2f4562", zen: "#08101e", bg: "#0b1424", ink: "#d6e6f2" },
  { id: "iris", name: "Iris", family: "tide", hex: "#a99cf5", deep: "#5543b0", fog: "#38335c", zen: "#0b0a1c", bg: "#111024", ink: "#e6e2f6" },
  // Signal
  { id: "mono", name: "Graphite", family: "signal", hex: "#d4d4d4", deep: "#6b6b6b", fog: "#3f3f3f", zen: "#0e0e0e", bg: "#121212", ink: "#e2e2e2" },
  { id: "phosphor", name: "Phosphor", family: "signal", hex: "#5cf08a", deep: "#1f8a43", fog: "#1f3a26", zen: "#040805", bg: "#080c09", ink: "#c9f2cf" },
  { id: "vermilion", name: "Vermilion", family: "signal", hex: "#ff5a3c", deep: "#a8261a", fog: "#3a2a26", zen: "#0a0707", bg: "#0d0c0c", ink: "#efe8dd" },
];

/** Palettes of one family, with their index in ACCENTS. */
export const familyAccents = (f: FamilyId) =>
  ACCENTS.map((a, i) => ({ a, i })).filter((x) => x.a.family === f);

/** Key 1–4: the family's first palette, or the next one if a palette of that family is already on. */
export function familyStep(familyIndex: number, current: number): number {
  const fam = FAMILIES[familyIndex];
  if (!fam) return current;
  const members = familyAccents(fam.id).map((x) => x.i);
  const at = members.indexOf(current);
  return at < 0 ? members[0] : members[(at + 1) % members.length];
}

/** Stores the accent id. The pre-spectrum key stored an index into the old order, mapped below. */
export const ACCENT_KEY = "nca-accent-v2";
const LEGACY_ACCENT_KEY = "nca-accent";
const LEGACY_ACCENT_ORDER = ["lichen", "torch", "astral", "madder", "mono", "manuscript"];
const DEFAULT_ACCENT = ACCENTS.findIndex((a) => a.id === "lichen");
export const SHEET_KEY = "nca-sheet-v2";
/** Pre-reorder key: its index counted Cipher last, so it maps to the new order by shifting. */
const LEGACY_SHEET_KEY = "nca-sheet";
export const EGGS_KEY = "nca-eggs";

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the preference just won't persist */
  }
}

export function storedIndex(key: string, length: number): number {
  const n = Number.parseInt(readStored(key) ?? "", 10);
  return Number.isInteger(n) && n >= 0 && n < length ? n : 0;
}

/** Last active scene. A visitor still on the old key keeps their scene across the reorder. */
export function storedSheet(length: number): number {
  if (readStored(SHEET_KEY) === null) {
    const old = Number.parseInt(readStored(LEGACY_SHEET_KEY) ?? "", 10);
    if (Number.isInteger(old) && old >= 0 && old < length) return (old + 1) % length;
  }
  return storedIndex(SHEET_KEY, length);
}

function storedAccent(): number {
  const id =
    readStored(ACCENT_KEY) ??
    LEGACY_ACCENT_ORDER[Number.parseInt(readStored(LEGACY_ACCENT_KEY) ?? "", 10)];
  // Glacier was replaced by Sunset.
  const i = ACCENTS.findIndex((a) => a.id === (id === "glacier" ? "sunset" : id));
  return i >= 0 ? i : DEFAULT_ACCENT;
}

let current = typeof window === "undefined" ? DEFAULT_ACCENT : storedAccent();
const listeners = new Set<() => void>();

/** `from` is a point in the viewport (the chip that was clicked) the new palette spreads out from. */
export function setAccent(i: number, from?: { x: number; y: number }) {
  const n = ((i % ACCENTS.length) + ACCENTS.length) % ACCENTS.length;
  if (n === current) return;
  current = n;
  const a = ACCENTS[n];
  writeStored(ACCENT_KEY, a.id);
  const apply = () => {
    if (a.id === "lichen") document.documentElement.removeAttribute("data-accent");
    else document.documentElement.setAttribute("data-accent", a.id);
    // Mobile browser chrome follows the ground.
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", a.bg);
  };
  // The new palette opens as a circle over the old one (vtReveal in
  // index.css), from the clicked chip or the middle of the screen. One
  // composited snapshot, so it costs no more than the swap itself. Without
  // view transitions, or under reduced motion, it swaps at once.
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (doc.startViewTransition && !still) {
    const root = document.documentElement.style;
    root.setProperty("--vt-x", from ? `${Math.round(from.x)}px` : "50%");
    root.setProperty("--vt-y", from ? `${Math.round(from.y)}px` : "50%");
    doc.startViewTransition(apply);
  } else apply();
  listeners.forEach((l) => l());
  playAccentSfx(a.id);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Index of the active accent; re-renders the caller when it changes. */
export function useAccent(): number {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULT_ACCENT);
}
