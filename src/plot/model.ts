/**
 * Client side of the shared sheet on /plot: the palette, the packed-board
 * decoder, and the calls to /api/plot/board. Kept in step with
 * api/plot/board.ts (SIZE, colour count, wire format).
 */

export const SIZE = 256;

/** Index 0 is bare ground: drawn transparent, so the sheet shows through in every theme. */
export const PALETTE: { name: string; hex: string }[] = [
  { name: "Ground", hex: "" },
  { name: "Bone", hex: "#f2ecdf" },
  { name: "Stone", hex: "#a9a294" },
  { name: "Slate", hex: "#5b605c" },
  { name: "Ink", hex: "#1b1f20" },
  { name: "Oxblood", hex: "#7a3b2e" },
  { name: "Vermilion", hex: "#d4553a" },
  { name: "Amber", hex: "#e8913a" },
  { name: "Ochre", hex: "#f1cf5b" },
  { name: "Lichen", hex: "#9fb35a" },
  { name: "Moss", hex: "#3f7d4e" },
  { name: "Jade", hex: "#3aa59a" },
  { name: "Sky", hex: "#5fa8d8" },
  { name: "Ultramarine", hex: "#2f4f9e" },
  { name: "Iris", hex: "#8a6bc4" },
  { name: "Rose", hex: "#e07fa3" },
];

/** Palette as packed RGBA (little-endian, for a Uint32Array over ImageData). */
export const RGBA: Uint32Array = new Uint32Array(
  PALETTE.map(({ hex }) => {
    if (!hex) return 0;
    const n = parseInt(hex.slice(1), 16);
    return (0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff);
  }),
);

/** base64 of packed nibbles (high nibble first) → one palette index per cell. */
export function unpack(base64: string): Uint8Array {
  const bin = atob(base64);
  const cells = new Uint8Array(SIZE * SIZE);
  const n = Math.min(bin.length, cells.length / 2);
  for (let i = 0; i < n; i++) {
    const byte = bin.charCodeAt(i);
    cells[i * 2] = byte >> 4;
    cells[i * 2 + 1] = byte & 0xf;
  }
  return cells;
}

export type Snapshot = { seq: number; board: string };
export type Delta = { seq: number; changes: [number, number][] };

const ENDPOINT = "/api/plot/board";

/** Fetch the board, or what changed since `since`. Throws "offline" when the server has no storage. */
export async function pull(since: number, signal?: AbortSignal): Promise<Snapshot | Delta> {
  const response = await fetch(since > 0 ? `${ENDPOINT}?since=${since}` : ENDPOINT, { signal, cache: "no-store" });
  if (response.status === 503 || response.status === 404) throw new Error("offline");
  if (!response.ok) throw new Error(`plot ${response.status}`);
  return response.json();
}

export type PlaceResult = { ok: true; seq: number; cooldown: number } | { ok: false; wait: number } | { ok: false; offline: true };

export async function place(x: number, y: number, c: number): Promise<PlaceResult> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x, y, c }),
  });
  if (response.status === 503 || response.status === 404) return { ok: false, offline: true };
  const body = await response.json().catch(() => ({}));
  if (response.status === 429) return { ok: false, wait: Number(body.wait) || 5000 };
  if (!response.ok) throw new Error(`plot ${response.status}`);
  return { ok: true, seq: body.seq, cooldown: body.cooldown };
}

// ---- Local sheet (no server storage, e.g. `vite` without the API) ------------------

const LOCAL_KEY = "nca:plot-local";

export function readLocal(): Uint8Array {
  const cells = new Uint8Array(SIZE * SIZE);
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (raw) return unpack(raw);
  } catch {
    /* storage blocked: start bare */
  }
  return cells;
}

export function writeLocal(cells: Uint8Array) {
  try {
    let bin = "";
    for (let i = 0; i < cells.length; i += 2) bin += String.fromCharCode((cells[i] << 4) | cells[i + 1]);
    window.localStorage.setItem(LOCAL_KEY, btoa(bin));
  } catch {
    /* storage blocked: the sheet just won't survive a reload */
  }
}
