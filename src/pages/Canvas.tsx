import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair } from "lucide-react";
import PageHead from "@/components/PageHead";
import { isTyping } from "@/theme/keymap";

/**
 * Commons: one shared pixel board, 256 × 256 in sixteen colours. Click to
 * place, drag to pan, scroll or pinch to zoom, right-click to pick a colour
 * off the board. Each visitor holds a few pixels that refill over time
 * (enforced by /api/canvas/board); other people's pixels arrive by polling a
 * change log every couple of seconds. With no backend the board still works,
 * but only on this screen.
 */

const API = "/api/canvas/board";
const POLL_MS = 2_000;
const MIN_Z = 0.5;
const MAX_Z = 48;
const DRAG_PX = 4;

// Mirrors api/canvas/board.ts; the server's copy wins when it answers.
const FALLBACK = {
  size: 256,
  cap: 12,
  refillMs: 4_000,
  palette: [
    "#f2ede0", "#c4bdab", "#858074", "#45443f",
    "#1b1c1e", "#7c2f2a", "#d4483c", "#ee8b37",
    "#f1c84b", "#93b94f", "#3e7c4c", "#2c6d78",
    "#5ba8d4", "#3a4d9e", "#8858b6", "#d985ae",
  ],
};

type Mode = "loading" | "live" | "local";
interface View { x: number; y: number; z: number }

const pad3 = (n: number) => String(n).padStart(3, "0");

/** The server's last word on this visitor's pixels, counted forward to `now`. */
interface Bucket { n: number; at: number; nextMs: number }
function estimate(bucket: Bucket | null, now: number, cap: number, refillMs: number) {
  if (!bucket) return { n: cap, waitMs: 0, known: false };
  const ready = bucket.at + bucket.nextMs;
  if (bucket.nextMs <= 0 || now < ready) return { n: bucket.n, waitMs: Math.max(0, ready - now), known: true };
  const gained = 1 + Math.floor((now - ready) / refillMs);
  const n = Math.min(cap, bucket.n + gained);
  return { n, waitMs: n < cap ? refillMs - ((now - ready) % refillMs) : 0, known: true };
}

/** base64 board, two pixels per byte (high nibble first) → one colour index per pixel. */
function unpack(base64: string, size: number): Uint8Array {
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  const out = new Uint8Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = i & 1 ? bytes[i >> 1] & 15 : bytes[i >> 1] >> 4;
  return out;
}

const Canvas = () => {
  const stageRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<Mode>("loading");
  const [palette, setPalette] = useState<string[]>(FALLBACK.palette);
  const [size, setSize] = useState(FALLBACK.size);
  const [colour, setColour] = useState(6);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [limits, setLimits] = useState({ cap: FALLBACK.cap, refillMs: FALLBACK.refillMs });
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState("");

  // Mutable state the pointer handlers and the poll loop read without re-binding.
  const board = useRef<Uint8Array>(new Uint8Array(FALLBACK.size * FALLBACK.size));
  const seq = useRef(0);
  const view = useRef<View>({ x: 0, y: 0, z: 1 });
  const left = estimate(bucket, now, limits.cap, limits.refillMs);
  const live = useRef({ mode, palette, size, colour, left: left.n });
  live.current = { mode, palette, size, colour, left: left.n };

  useEffect(() => {
    document.title = "Commons · Artifacts";
  }, []);

  // ---- Drawing -------------------------------------------------------------------

  const paint = useCallback((index: number, c: number) => {
    const ctx = canvasRef.current?.getContext("2d");
    const { size, palette } = live.current;
    board.current[index] = c;
    if (!ctx) return;
    ctx.fillStyle = palette[c] ?? palette[0];
    ctx.fillRect(index % size, Math.floor(index / size), 1, 1);
  }, []);

  const paintAll = useCallback((pixels: Uint8Array, size: number, palette: string[]) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = size;
    canvas.height = size;
    const image = ctx.createImageData(size, size);
    const rgb = palette.map((hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)));
    for (let i = 0; i < pixels.length; i++) {
      const [r, g, b] = rgb[pixels[i]] ?? rgb[0];
      image.data.set([r, g, b, 255], i * 4);
    }
    ctx.putImageData(image, 0, 0);
  }, []);

  const applyView = useCallback(() => {
    const { x, y, z } = view.current;
    const layer = layerRef.current;
    if (!layer) return;
    layer.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    layer.style.setProperty("--z", String(z));
  }, []);

  const fit = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const { width, height } = stage.getBoundingClientRect();
    const size = live.current.size;
    const z = Math.max(MIN_Z, Math.min(width, height) / size) * 0.92;
    view.current = { z, x: (width - size * z) / 2, y: (height - size * z) / 2 };
    applyView();
  }, [applyView]);

  // ---- Loading and polling -------------------------------------------------------

  const load = useCallback(async () => {
    try {
      const response = await fetch(API, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as {
        size: number;
        palette: string[];
        cap: number;
        refillMs: number;
        seq: number;
        board: string;
      };
      board.current = unpack(body.board, body.size);
      seq.current = body.seq;
      setSize(body.size);
      setPalette(body.palette);
      setLimits({ cap: body.cap, refillMs: body.refillMs });
      live.current = { ...live.current, size: body.size, palette: body.palette };
      paintAll(board.current, body.size, body.palette);
      setMode("live");
      return true;
    } catch {
      return false;
    }
  }, [paintAll]);

  useEffect(() => {
    let alive = true;
    load().then((ok) => {
      if (!alive) return;
      if (!ok) {
        paintAll(board.current, FALLBACK.size, FALLBACK.palette);
        setMode("local");
      }
      fit();
    });
    return () => {
      alive = false;
    };
  }, [load, paintAll, fit]);

  useEffect(() => {
    if (mode !== "live") return;
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch(`${API}?since=${seq.current}`, { cache: "no-store" });
          if (response.ok) {
            const body = (await response.json()) as { seq: number; reset?: boolean; changes?: [number, number][] };
            if (body.reset) await load();
            else {
              for (const [index, c] of body.changes ?? []) paint(index, c);
              seq.current = Math.max(seq.current, body.seq);
            }
          }
        } catch {
          /* a missed poll is caught up by the next one */
        }
      }
      if (!stopped) timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [mode, load, paint]);

  // Notes are short-lived.
  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(""), 3_500);
    return () => window.clearTimeout(id);
  }, [note]);

  // Tick the refill countdown while the bucket isn't full.
  const filling = left.known && left.n < limits.cap;
  useEffect(() => {
    if (!filling) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [filling]);

  // ---- Placing -------------------------------------------------------------------

  const place = useCallback(
    async (x: number, y: number) => {
      const { mode, size, colour, left } = live.current;
      const index = y * size + x;
      const before = board.current[index];
      if (before === colour) return;
      if (mode === "live" && left < 1) return setNote("Out of pixels. One comes back every few seconds.");
      paint(index, colour);
      if (mode !== "live") return;
      try {
        const response = await fetch(API, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ x, y, c: colour }),
        });
        const body = (await response.json().catch(() => ({}))) as { charges?: number; nextMs?: number };
        if (typeof body.charges === "number" && typeof body.nextMs === "number") {
          const at = Date.now();
          setBucket({ n: body.charges, at, nextMs: body.nextMs });
          setNow(at);
        }
        if (!response.ok) {
          paint(index, before);
          setNote(response.status === 429 ? "Out of pixels. One comes back every few seconds." : "That one didn't land. Try again.");
        } else setNote("");
      } catch {
        paint(index, before);
        setNote("That one didn't land. Try again.");
      }
    },
    [paint],
  );

  // ---- Pointer: click to place, drag to pan, wheel or pinch to zoom ---------------

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number; vx: number; vy: number } | null = null;
    let moved = false;
    let pinch: { d: number; z: number; mx: number; my: number; vx: number; vy: number } | null = null;

    const local = (e: { clientX: number; clientY: number }) => {
      const r = stage.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const cellAt = (px: number, py: number): [number, number] | null => {
      const { x, y, z } = view.current;
      const cx = Math.floor((px - x) / z);
      const cy = Math.floor((py - y) / z);
      const size = live.current.size;
      return cx >= 0 && cy >= 0 && cx < size && cy < size ? [cx, cy] : null;
    };
    const zoomAt = (px: number, py: number, z: number) => {
      const v = view.current;
      const next = Math.min(MAX_Z, Math.max(MIN_Z, z));
      view.current = { z: next, x: px - ((px - v.x) * next) / v.z, y: py - ((py - v.y) * next) / v.z };
      applyView();
    };
    const showMark = (cell: [number, number] | null) => {
      const mark = markRef.current;
      if (mark) {
        mark.style.display = cell ? "block" : "none";
        if (cell) mark.style.transform = `translate(${cell[0]}px, ${cell[1]}px)`;
      }
      setHover((prev) => (prev?.[0] === cell?.[0] && prev?.[1] === cell?.[1] ? prev : cell));
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      stage.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        start = { ...p, vx: view.current.x, vy: view.current.y };
        moved = false;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = {
          d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          z: view.current.z,
          mx: (a.x + b.x) / 2,
          my: (a.y + b.y) / 2,
          vx: view.current.x,
          vy: view.current.y,
        };
        moved = true;
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (e.pointerType !== "touch") showMark(cellAt(p.x, p.y));
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, p);
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        view.current = { ...view.current, x: pinch.vx + mx - pinch.mx, y: pinch.vy + my - pinch.my };
        zoomAt(mx, my, (pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d);
        pinch = { ...pinch, z: view.current.z, d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx, my, vx: view.current.x, vy: view.current.y };
        return;
      }
      if (!start) return;
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < DRAG_PX) return;
      moved = true;
      stage.classList.add("is-panning");
      view.current = { ...view.current, x: start.vx + p.x - start.x, y: start.vy + p.y - start.y };
      applyView();
    };
    const onUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e);
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        stage.classList.remove("is-panning");
        if (!moved && e.type === "pointerup") {
          const cell = cellAt(p.x, p.y);
          if (cell) place(cell[0], cell[1]);
        }
        start = null;
        pinch = null;
      } else if (pointers.size === 1) {
        // One finger left after a pinch: carry on panning from where it is.
        const [rest] = [...pointers.values()];
        start = { ...rest, vx: view.current.x, vy: view.current.y };
        pinch = null;
      }
    };
    const onLeave = () => showMark(null);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(p.x, p.y, view.current.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
      showMark(cellAt(p.x, p.y));
    };
    // Right-click picks the colour under the pointer.
    const onContext = (e: MouseEvent) => {
      const p = local(e);
      const cell = cellAt(p.x, p.y);
      if (!cell) return;
      e.preventDefault();
      setColour(board.current[cell[1] * live.current.size + cell[0]]);
    };

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    stage.addEventListener("pointerleave", onLeave);
    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("contextmenu", onContext);
    return () => {
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("pointerleave", onLeave);
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("contextmenu", onContext);
    };
  }, [applyView, place]);

  // Refit when the stage changes size; 0 resets the view, [ and ] step through colours.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(stage);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || isTyping(e.target)) return;
      const n = live.current.palette.length;
      if (e.key === "0") return void (e.preventDefault(), fit());
      if (e.key === "[") return void (e.preventDefault(), setColour((c) => (c - 1 + n) % n));
      if (e.key === "]") return void (e.preventDefault(), setColour((c) => (c + 1) % n));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fit]);

  // ---- Render --------------------------------------------------------------------

  const waitS = Math.ceil(left.waitMs / 1000);
  const status =
    mode === "loading"
      ? "Loading board"
      : mode === "local"
        ? "Offline · marks stay on this screen"
        : left.n > 0
          ? `${left.n} / ${limits.cap} pixels${waitS ? ` · +1 in ${waitS}s` : ""}`
          : `Next pixel in ${waitS}s`;

  return (
    <div className="page-shell page-shell--wide commons">
      <PageHead
        no="0x"
        label="Artifacts"
        title="Commons"
        lede={`A shared board, ${size} by ${size}. Anyone passing through can place a pixel. You hold a handful at a time, and they come back slowly.`}
      />

      <div className="commons__frame">
        <div
          ref={stageRef}
          className="commons__stage"
          data-lenis-prevent
          role="application"
          aria-label="Shared pixel board. Click a square to paint it."
        >
          <div ref={layerRef} className="commons__layer" style={{ width: size, height: size }}>
            <canvas ref={canvasRef} className="commons__canvas" width={size} height={size} />
            <div
              ref={markRef}
              className="commons__mark"
              style={{ display: "none", ["--mark" as string]: palette[colour] }}
            />
          </div>
        </div>

        <div className="commons__bar">
          <div className="commons__palette" role="radiogroup" aria-label="Colour">
            {palette.map((hex, i) => (
              <button
                key={hex}
                type="button"
                role="radio"
                aria-checked={i === colour}
                aria-label={`Colour ${i + 1}`}
                className="commons__swatch"
                style={{ background: hex }}
                onClick={() => setColour(i)}
              />
            ))}
          </div>
          <div className="commons__status">
            <span className={`commons__dot is-${mode}`} aria-hidden="true" />
            <span role="status" aria-live="polite">{note || status}</span>
            <span className="commons__coords" aria-hidden="true">
              {hover ? `${pad3(hover[0])} · ${pad3(hover[1])}` : "––– · –––"}
            </span>
            <button type="button" className="commons__fit" onClick={fit} aria-label="Reset view">
              <Crosshair size={13} strokeWidth={1.5} />
              <kbd>0</kbd>
            </button>
          </div>
        </div>
        <p className="commons__hint">
          Click to paint · drag to move · scroll or pinch to zoom · right-click to pick a colour · [ ] to step colours
        </p>
      </div>
    </div>
  );
};

export default Canvas;
