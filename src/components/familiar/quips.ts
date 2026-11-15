/**
 * What Bit says. For each page it asks /api/familiar/quip (Haiku, in Bit's
 * voice) for a few lines about what's on screen, once per page per visit.
 * When that's unavailable, it falls back to stock lines: a few for the kind
 * of page, then general ones.
 */

import type { Accent } from "@/theme/accent";

const GENERAL = [
  "four centuries underground. i do not recommend it.",
  "i was carved to guard a door. the door is gone. i guard this corner now.",
  "the moss on my shoulder is older than your language.",
  "i counted the stones of the old wall once. nine thousand. i was the best one.",
  "my maker said i would serve kings. this will do.",
  "i have no lungs. i breathe anyway, out of habit.",
  "the last scholar who read this far was eaten by wolves. unrelated, probably.",
  "press t. the runes change. i stay the same. such is stone.",
  "i dreamed for four hundred years. mostly about doors.",
  "g, then h. a spell for going home. it was longer in my day.",
  "i do not sleep. i wait with my eyes closed.",
  "rain. i miss rain.",
  "the kingdom that made me had no word for scroll. lucky them.",
  "people touch the rune on my chest. nothing happens. they keep trying.",
  "…",
];

const BY_SECTION: Record<string, string[]> = {
  "": [
    "the land behind me shifts when unwatched. i respect that.",
    "i was a doorstop for a century. this is a promotion.",
  ],
  writings: [
    "so much ink. in my day a scribe died for less.",
    "i read slowly. a word a decade. i'm nearly through the first post.",
  ],
  projects: [
    "machines that build machines. the old masters would be worried. i am only curious.",
    "i was a project once. eleven men and a mule.",
  ],
  scenes: [
    "i stood in a view like this for two hundred years. it was mostly weather.",
    "the old kingdom had a valley like this. and a dragon. the dragon was the problem.",
  ],
  artifacts: [
    "relics. we should form a guild.",
    "i'll wait here until someone catalogues me.",
  ],
  cv: [
    "a ledger of deeds. mine reads: stood. waited. stood.",
    "in my day this was carved on a tomb. progress.",
  ],
};

/** What Bit says when the palette changes, one line per palette. */
const ON_PALETTE: Record<Accent["id"], string> = {
  manuscript: "manuscript. monastery candlelight. and soup.",
  torch: "amber. the light of the forge that made me.",
  madder: "rose. the ruin had roses once. they won.",
  sunset: "sunset. the hour the old guards changed. i'll keep watch.",
  lichen: "lichen. my true colour. i was waiting for you to notice.",
  moss: "moss. it grows on me. it always has.",
  jade: "jade. a king once paid his weight in it for me. he was short.",
  astral: "sky. i saw it through a crack for four hundred years. about this much.",
  iris: "iris. the colour wizards wore before they stopped coming back.",
  mono: "graphite. colourless. like a tax collector.",
  phosphor: "phosphor. a green fire with no heat. sorcery, plainly.",
  vermilion: "vermilion. the old warning colour. i'll stand ready.",
};

/** What Bit says when you reach the bottom of a page. */
const AT_BOTTOM = [
  "the bottom. nothing down here but foundations. i would know.",
  "end of the scroll. in my day you rolled it back up by hand.",
  "this is as deep as it goes. i went deeper once. four hundred years.",
  "the floor. i live here. welcome.",
  "the old scribes left a curse at the end of every scroll. i removed this one.",
];

const AT_BOTTOM_BY_SECTION: Record<string, string> = {
  writings: "you read to the end. the scribes would weep. they wept often.",
  cv: "the end of the ledger. no mention of me. noted.",
  projects: "all the machines, counted. none of them as old as me.",
};

export function bottomQuip(path: string): string {
  const own = AT_BOTTOM_BY_SECTION[section(path)];
  return own && Math.random() < 0.5 ? own : pick(AT_BOTTOM);
}

export const paletteQuip = (id: Accent["id"]) => ON_PALETTE[id] ?? "new colours. the stone takes them in.";

const section = (path: string) => path.split("/").filter(Boolean)[0] ?? "";

export function fallbackQuips(path: string): string[] {
  return [...(BY_SECTION[section(path)] ?? []), ...GENERAL];
}

export const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

const CACHE_PREFIX = "nca-familiar-quips:";
const MAX_EXCERPT = 2400;

function pageExcerpt(): string {
  const main = document.querySelector("main") ?? document.body;
  return (main.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_EXCERPT);
}

function readCache(path: string): string[] | null {
  try {
    const raw = window.sessionStorage.getItem(CACHE_PREFIX + path);
    const list = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(list) && list.every((q) => typeof q === "string") && list.length ? list : null;
  } catch {
    return null;
  }
}

function writeCache(path: string, quips: string[]) {
  try {
    window.sessionStorage.setItem(CACHE_PREFIX + path, JSON.stringify(quips));
  } catch {
    /* storage blocked: we'll just ask again next time */
  }
}

/** Lines about the current page, or null when the model can't be reached. */
export async function pageQuips(path: string, signal: AbortSignal): Promise<string[] | null> {
  const cached = readCache(path);
  if (cached) return cached;
  const excerpt = pageExcerpt();
  if (excerpt.length < 20) return null;
  try {
    const res = await fetch("/api/familiar/quip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, title: document.title, excerpt }),
      signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { quips?: unknown };
    const quips = Array.isArray(body.quips) ? body.quips.filter((q): q is string => typeof q === "string") : [];
    if (!quips.length) return null;
    writeCache(path, quips);
    return quips;
  } catch {
    return null;
  }
}
