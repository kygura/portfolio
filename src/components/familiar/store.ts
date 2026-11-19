import { readStored, writeStored } from "@/theme/accent";

/** Set once the hidden route has been visited; never cleared by the site. */
export const FAMILIAR_KEY = "nca-familiar";
export const FAMILIAR_EVENT = "nca-familiar-booted";
export const PETS_KEY = "nca-familiar-pets";

export const isUnlocked = () => readStored(FAMILIAR_KEY) === "1";

export function unlock() {
  writeStored(FAMILIAR_KEY, "1");
  window.dispatchEvent(new Event(FAMILIAR_EVENT));
}

export function addPet(): number {
  const n = (Number.parseInt(readStored(PETS_KEY) ?? "0", 10) || 0) + 1;
  writeStored(PETS_KEY, String(n));
  return n;
}

/**
 * Where Bit was last set down, as fractions (0..1) of the room the viewport
 * leaves around it, so the spot survives a resize. Null means the default
 * corner.
 */
export const SPOT_KEY = "nca-familiar-spot";

export interface Spot {
  x: number;
  y: number;
}

const unit = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

export function readSpot(): Spot | null {
  try {
    const v = JSON.parse(readStored(SPOT_KEY) ?? "null");
    return v && unit(v.x) && unit(v.y) ? { x: v.x, y: v.y } : null;
  } catch {
    return null;
  }
}

/** Null sends Bit back to its corner. */
export function writeSpot(spot: Spot | null) {
  writeStored(SPOT_KEY, JSON.stringify(spot));
}
