/**
 * Ranking for the command palette. Matches on word starts so short queries
 * land where you expect: "sc" finds Scenes, "kotr" finds "King of the Red",
 * "wr ai" finds a writing with both words. A letter buried mid-word ("man"
 * inside "Thaumazein") doesn't count, which keeps the list from filling
 * with noise.
 */

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Can `q` be cut into pieces that each start a word, words in order? */
function acronym(q: string, ws: string[], from = 0): boolean {
  if (!q) return true;
  for (let w = from; w < ws.length; w++) {
    for (let n = Math.min(q.length, ws[w].length); n > 0; n--) {
      if (ws[w].startsWith(q.slice(0, n)) && acronym(q.slice(n), ws, w + 1)) return true;
    }
  }
  return false;
}

function tokenScore(t: string, label: string, extras: string[]): number {
  const l = label.toLowerCase();
  if (l === t) return 1;
  if (l.startsWith(t)) return 0.95;
  const lw = words(label);
  if (lw.some((w) => w.startsWith(t))) return 0.85;
  if (t.length >= 3 && l.includes(t)) return 0.7;
  const ew = extras.flatMap(words);
  if (ew.some((w) => w.startsWith(t))) return 0.55;
  if (t.length >= 2 && acronym(t, lw)) return 0.4;
  return 0;
}

/** 0 hides the item; higher sorts first. */
export function score(query: string, label: string, extras: string[] = []): number {
  const tokens = words(query);
  if (!tokens.length) return 1;
  let total = 0;
  for (const t of tokens) {
    const s = tokenScore(t, label, extras);
    if (!s) return 0;
    total += s;
  }
  return total / tokens.length;
}
