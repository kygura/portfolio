import { readStored, writeStored } from "@/theme/accent";

/** Set once the hidden route has been visited; never cleared by the site. */
export const FAMILIAR_KEY = "nca-familiar";
export const FAMILIAR_EVENT = "nca-familiar-hatched";
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
