/**
 * What Bit says. For each page it asks /api/familiar/quip (Haiku, in Bit's
 * voice) for a few lines about what's on screen, once per page per visit.
 * When that's unavailable, it falls back to stock lines: a few for the kind
 * of page, then general ones.
 */

const GENERAL = [
  "…",
  "♥",
  "the old ones are sleeping.",
  "i remember the forge.",
  "my maker is dust now.",
  "*grinding stone noises*",
  "try pressing t.",
  "g then h goes home.",
  "a riddle kept me sealed.",
];

const BY_SECTION: Record<string, string[]> = {
  "": ["a strange landscape. i approve.", "the horizon moves when you're not looking."],
  writings: ["so many words. i read them all, once.", "ink lasts longer than stone, sometimes."],
  projects: ["machines building machines. familiar.", "i was a project once."],
  scenes: ["these vistas remind me of home.", "i have seen this light before."],
  artifacts: ["relics. like me, but shinier.", "a fine collection. i'd fit right in."],
  cv: ["a list of deeds. mine would be shorter.", "i have no references. only ruins."],
};

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
