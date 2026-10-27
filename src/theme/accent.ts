/**
 * The six accent variants and the one switch that applies them. CSS tokens
 * live in index.css under `:root[data-accent=…]` (an inline script in
 * index.html applies the saved one before first paint); the hero reads
 * `hex`/`deep`/`fog`/`zen` for its shader uniforms, so one switch recolours
 * both the page and the scene.
 */
import { useSyncExternalStore } from "react";
import { playAccentSfx } from "./sfx";

export interface Accent {
  id: "lichen" | "torch" | "astral" | "madder" | "mono" | "manuscript";
  name: string;
  hex: string;
  deep: string;
  fog: string;
  zen: string;
}

/** Ordered as a colour spectrum by hue (red to blue), with neutral Graphite last. */
export const ACCENTS: Accent[] = [
  // Amber, Sky and Rose also swap the ground, ink and surface texture (see index.css); fog and zenith follow the ground.
  { id: "madder", name: "Rose", hex: "#e5787f", deep: "#7e2638", fog: "#4d343c", zen: "#150b10" },
  // Manuscript swaps the whole sheet too: warm brown ground, paper ink, clay accent.
  { id: "manuscript", name: "Manuscript", hex: "#e08a62", deep: "#9a4524", fog: "#4a4038", zen: "#14110e" },
  { id: "torch", name: "Amber", hex: "#eaa24c", deep: "#a24e1c", fog: "#4d4046", zen: "#130f16" },
  { id: "lichen", name: "Lichen", hex: "#bcc77c", deep: "#5d7a3a", fog: "#3b4c4b", zen: "#0f171b" },
  { id: "astral", name: "Sky", hex: "#86d3dc", deep: "#2f6f9a", fog: "#2f4562", zen: "#08101e" },
  // Graphite also neutralises the ground and ink (see index.css), so the whole sheet goes grayscale.
  { id: "mono", name: "Graphite", hex: "#d4d4d4", deep: "#6b6b6b", fog: "#3f3f3f", zen: "#0e0e0e" },
];

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
  const i = ACCENTS.findIndex((a) => a.id === id);
  return i >= 0 ? i : DEFAULT_ACCENT;
}

let current = typeof window === "undefined" ? DEFAULT_ACCENT : storedAccent();
const listeners = new Set<() => void>();

export function setAccent(i: number) {
  const n = ((i % ACCENTS.length) + ACCENTS.length) % ACCENTS.length;
  current = n;
  const a = ACCENTS[n];
  writeStored(ACCENT_KEY, a.id);
  if (a.id === "lichen") document.documentElement.removeAttribute("data-accent");
  else document.documentElement.setAttribute("data-accent", a.id);
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
