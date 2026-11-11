import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, Scan } from "lucide-react";
import { PALETTE, RGBA, SIZE, place, pull, readLocal, unpack, writeLocal } from "@/plot/model";

/**
 * Plot: one shared 256 × 256 sheet anyone can mark, a cell at a time, with a
 * short wait between marks. Drag to pan, scroll or pinch to zoom, tap to place.
 * With the stage focused: arrows move the cursor, Enter or Space places,
 * [ ] change colour, + − zoom, 0 fits the sheet. The board polls for other
 * people's marks every few seconds while the tab is visible. When the server
 * has no storage the sheet is kept in this browser only.
 */

const POLL_MS = 2500;
const TAP_SLOP = 6;
const MIN_SCALE = 0.75;
const MAX_SCALE = 64;
const GRID_FROM = 10;

type View = { scale: number; ox: number; oy: number };
type Mode = "loading" | "live" | "local";

const pad3 = (n: number) => String(n).padStart(3, "0");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const Plot = () => {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const cells = useRef<Uint8Array>(new Uint8Array(SIZE * SIZE));
  const image = useRef<{ canvas: HTMLCanvasElement; data: ImageData; px: Uint32Array } | null>(null);
  const view = useRef<View>({ scale: 1, ox: 0, oy: 0 });
  const hover = useRef<{ x: number; y: number } | null>(null);
  const seq = useRef(0);
  const frame = useRef(0);

  const [mode, setMode] = useState<Mode>("loading");
  const [colour, setColour] = useState(6);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [coolUntil, setCoolUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState(0);
  const [marks, setMarks] = useState(0);

  const live = useRef({ colour, coolUntil, mode });
  live.current = { colour, coolUntil, mode };

  // ---- Drawing --------------------------------------------------------------------

  const paintAll = useCallback(() => {
    const img = image.current;
    if (!img) return;
    const c = cells.current;
    for (let i = 0; i < c.length; i++) img.px[i] = RGBA[c[i]];
    img.canvas.getContext("2d")!.putImageData(img.data, 0, 0);
  }, []);

  const paintCell = useCallback((cell: number) => {
    const img = image.current;
    if (!img) return;
    img.px[cell] = RGBA[cells.current[cell]];
    img.canvas.getContext("2d")!.putImageData(img.data, 0, 0, cell % SIZE, Math.floor(cell / SIZE), 1, 1);
  }, []);

  const draw = useCallback(() => {
    frame.current = 0;
    const canvas = canvasRef.current;
    const img = image.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const { scale, ox, oy } = view.current;
    const span = SIZE * scale;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = token("--sheet") || "#1a2224";
    ctx.fillRect(ox, oy, span, span);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img.canvas, ox, oy, span, span);

    if (scale >= GRID_FROM) {
      const x0 = clamp(Math.floor(-ox / scale), 0, SIZE);
      const x1 = clamp(Math.ceil((w - ox) / scale), 0, SIZE);
      const y0 = clamp(Math.floor(-oy / scale), 0, SIZE);
      const y1 = clamp(Math.ceil((h - oy) / scale), 0, SIZE);
      ctx.globalAlpha = clamp((scale - GRID_FROM) / 12, 0.15, 0.5);
      ctx.strokeStyle = token("--rule-2") || "#3d4b4d";
      ctx.lineWidth = 1 / dpr;
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) {
        const sx = Math.round((ox + x * scale) * dpr) / dpr;
        ctx.moveTo(sx, oy + y0 * scale);
        ctx.lineTo(sx, oy + y1 * scale);
      }
      for (let y = y0; y <= y1; y++) {
        const sy = Math.round((oy + y * scale) * dpr) / dpr;
        ctx.moveTo(ox + x0 * scale, sy);
        ctx.lineTo(ox + x1 * scale, sy);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = token("--rule-2") || "#3d4b4d";
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(ox) - 0.5, Math.round(oy) - 0.5, Math.round(span) + 1, Math.round(span) + 1);

    const at = hover.current;
    if (at) {
      const sx = ox + at.x * scale;
      const sy = oy + at.y * scale;
      const s = Math.max(scale, 3);
      const hex = PALETTE[live.current.colour].hex;
      if (hex && scale >= 2) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = hex;
        ctx.fillRect(sx, sy, scale, scale);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = token("--accent") || "#bcc77c";
      ctx.lineWidth = scale >= 6 ? 2 : 1;
      ctx.strokeRect(sx - 1, sy - 1, s + 2, s + 2);
    }
  }, []);

  const redraw = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  }, [draw]);

  const fit = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const { width, height } = stage.getBoundingClientRect();
    const fitted = Math.max(MIN_SCALE, (Math.min(width, height) - 48) / SIZE);
    const scale = fitted >= 1 ? Math.floor(fitted) : fitted;
    view.current = { scale, ox: (width - SIZE * scale) / 2, oy: (height - SIZE * scale) / 2 };
    redraw();
  }, [redraw]);

  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      const v = view.current;
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = scale / v.scale;
      view.current = { scale, ox: px - (px - v.ox) * k, oy: py - (py - v.oy) * k };
      redraw();
    },
    [redraw],
  );

  const cellAt = (px: number, py: number) => {
    const { scale, ox, oy } = view.current;
    const x = Math.floor((px - ox) / scale);
    const y = Math.floor((py - oy) / scale);
    return x >= 0 && y >= 0 && x < SIZE && y < SIZE ? { x, y } : null;
  };

  const setHover = useCallback(
    (at: { x: number; y: number } | null) => {
      hover.current = at;
      setCursor(at);
      redraw();
    },
    [redraw],
  );

  // ---- Setup: offscreen image, canvas size, theme changes ---------------------------

  useEffect(() => {
    const off = document.createElement("canvas");
    off.width = off.height = SIZE;
    const data = off.getContext("2d")!.createImageData(SIZE, SIZE);
    image.current = { canvas: off, data, px: new Uint32Array(data.data.buffer) };
    paintAll();

    const stage = stageRef.current!;
    const canvas = canvasRef.current!;
    let size: { width: number; height: number } | null = null;
    const resize = () => {
      const { width, height } = stage.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      if (!size) fit();
      else {
        // Keep whatever was in the middle of the stage in the middle.
        const v = view.current;
        view.current = { ...v, ox: v.ox + (width - size.width) / 2, oy: v.oy + (height - size.height) / 2 };
        redraw();
      }
      size = { width, height };
    };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    resize();

    const mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-accent"] });

    document.title = "Plot";
    return () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [fit, paintAll, redraw]);

  // ---- Sync with the server -----------------------------------------------------------

  const countMarks = useCallback(() => {
    let n = 0;
    for (const c of cells.current) if (c) n++;
    setMarks(n);
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const ctrl = new AbortController();

    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const got = await pull(seq.current, ctrl.signal);
          if ("board" in got) {
            cells.current = unpack(got.board);
            paintAll();
          } else {
            for (const [cell, c] of got.changes) {
              cells.current[cell] = c;
              paintCell(cell);
            }
          }
          seq.current = got.seq;
          setMode("live");
          countMarks();
          redraw();
        } catch (error) {
          if (stopped) return;
          if ((error as Error).message === "offline" && live.current.mode !== "live") {
            cells.current = readLocal();
            paintAll();
            countMarks();
            redraw();
            setMode("local");
            return; // no server: stop polling
          }
        }
      }
      timer = window.setTimeout(tick, POLL_MS);
    };
    tick();

    const onVisible = () => {
      if (document.visibilityState === "visible" && live.current.mode === "live") {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      ctrl.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [countMarks, paintAll, paintCell, redraw]);

  // Cooldown clock, only while one is running.
  useEffect(() => {
    if (coolUntil <= Date.now()) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= coolUntil) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [coolUntil]);

  const mark = useCallback(
    async (x: number, y: number) => {
      const { colour, coolUntil, mode } = live.current;
      if (mode === "loading") return;
      if (Date.now() < coolUntil) return setFlash((f) => f + 1);
      const cell = y * SIZE + x;
      const before = cells.current[cell];
      if (before === colour) return;
      cells.current[cell] = colour;
      paintCell(cell);
      countMarks();
      redraw();

      if (mode === "local") return writeLocal(cells.current);

      setCoolUntil(Date.now() + 5000);
      setNow(Date.now());
      try {
        const result = await place(x, y, colour);
        if (result.ok) {
          setCoolUntil(Date.now() + result.cooldown);
          return;
        }
        cells.current[cell] = before;
        paintCell(cell);
        countMarks();
        redraw();
        if ("wait" in result) {
          setCoolUntil(Date.now() + result.wait);
          setFlash((f) => f + 1);
        } else setCoolUntil(0);
      } catch {
        cells.current[cell] = before;
        paintCell(cell);
        countMarks();
        redraw();
        setCoolUntil(0);
      }
    },
    [countMarks, paintCell, redraw],
  );

  // ---- Pointer: tap to place, drag to pan, wheel / pinch to zoom ------------------------

  useEffect(() => {
    const stage = stageRef.current!;
    const pointers = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number; moved: boolean } | null = null;
    let pinch: { dist: number; mx: number; my: number } | null = null;

    const local = (e: { clientX: number; clientY: number }) => {
      const r = stage.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const pair = () => {
      const [a, b] = [...pointers.values()];
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };

    const down = (e: PointerEvent) => {
      if (e.button === 2) return;
      stage.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) start = { ...p, moved: false };
      else {
        start = null;
        pinch = pair();
      }
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === "mouse") setHover(cellAt(p.x, p.y));
        return;
      }
      pointers.set(e.pointerId, p);
      const v = view.current;
      if (pointers.size >= 2 && pinch) {
        const now = pair();
        view.current = { ...v, ox: v.ox + now.mx - pinch.mx, oy: v.oy + now.my - pinch.my };
        if (pinch.dist > 0) zoomAt(now.dist / pinch.dist, now.mx, now.my);
        pinch = now;
        redraw();
        return;
      }
      if (start && !start.moved && Math.hypot(p.x - start.x, p.y - start.y) > TAP_SLOP) start.moved = true;
      if (start?.moved) {
        view.current = { ...v, ox: v.ox + p.x - prev.x, oy: v.oy + p.y - prev.y };
        if (e.pointerType === "mouse") hover.current = cellAt(p.x, p.y);
        redraw();
      } else if (e.pointerType === "mouse") setHover(cellAt(p.x, p.y));
    };
    const up = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size < 2) pinch = null;
      if (start && !start.moved && pointers.size === 0) {
        const p = local(e);
        const at = cellAt(p.x, p.y);
        if (at) {
          if (e.pointerType !== "mouse") setHover(at);
          void mark(at.x, at.y);
        }
      }
      if (pointers.size === 0) start = null;
    };
    const cancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch = null;
      start = null;
    };
    const leave = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && pointers.size === 0) setHover(null);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      zoomAt(Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0018)), p.x, p.y);
    };
    const menu = (e: Event) => e.preventDefault();

    stage.addEventListener("pointerdown", down);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", cancel);
    stage.addEventListener("pointerleave", leave);
    stage.addEventListener("wheel", wheel, { passive: false });
    stage.addEventListener("contextmenu", menu);
    return () => {
      stage.removeEventListener("pointerdown", down);
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerup", up);
      stage.removeEventListener("pointercancel", cancel);
      stage.removeEventListener("pointerleave", leave);
      stage.removeEventListener("wheel", wheel);
      stage.removeEventListener("contextmenu", menu);
    };
  }, [mark, redraw, setHover, zoomAt]);

  // ---- Keyboard, while the stage has focus ------------------------------------------------

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const stage = stageRef.current!;
    const { width, height } = stage.getBoundingClientRect();
    const at = hover.current ?? { x: SIZE / 2, y: SIZE / 2 };
    const step = e.shiftKey ? 8 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      const [dx, dy] = moves[e.key];
      const next = { x: clamp(at.x + dx, 0, SIZE - 1), y: clamp(at.y + dy, 0, SIZE - 1) };
      // Keep the cursor on screen.
      const v = view.current;
      const sx = v.ox + (next.x + 0.5) * v.scale;
      const sy = v.oy + (next.y + 0.5) * v.scale;
      const margin = 40;
      if (sx < margin) v.ox += margin - sx;
      if (sx > width - margin) v.ox -= sx - (width - margin);
      if (sy < margin) v.oy += margin - sy;
      if (sy > height - margin) v.oy -= sy - (height - margin);
      setHover(next);
    } else if (e.key === "Enter" || e.key === " ") {
      void mark(at.x, at.y);
      if (!hover.current) setHover(at);
    } else if (e.key === "[" || e.key === "]") {
      setColour((c) => (c + (e.key === "]" ? 1 : PALETTE.length - 1)) % PALETTE.length);
      redraw();
    } else if (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_") {
      zoomAt(e.key === "+" || e.key === "=" ? 1.5 : 1 / 1.5, width / 2, height / 2);
    } else if (e.key === "0") {
      fit();
    } else return;
    e.preventDefault();
  };

  const zoomButton = (factor: number) => () => {
    const r = stageRef.current!.getBoundingClientRect();
    zoomAt(factor, r.width / 2, r.height / 2);
  };

  useEffect(redraw, [colour, redraw]);

  const wait = Math.max(0, coolUntil - now);
  const ready = wait === 0;
  const status =
    mode === "loading" ? "Connecting" : mode === "local" ? "Local · this browser only" : ready ? "Ready" : `Wait ${(wait / 1000).toFixed(1)}s`;

  return (
    <div className="plot">
      <div
        ref={stageRef}
        className="plot__stage"
        tabIndex={0}
        role="application"
        aria-label={`Shared pixel sheet, ${SIZE} by ${SIZE}. Arrows move, Enter places, brackets change colour.`}
        aria-describedby="plot-help"
        onKeyDown={onKeyDown}
        data-lenis-prevent
        data-no-orbit
      >
        <canvas ref={canvasRef} className="plot__canvas" aria-hidden="true" />
      </div>

      <div className="plot__console">
        <div className="plot__plate">
          <div className="plot__caption">
            <h1 className="plot__title">Plot</h1>
            <p className="plot__readout" aria-live="off">
              {cursor ? (
                <>
                  X <b>{pad3(cursor.x)}</b> · Y <b>{pad3(cursor.y)}</b>
                </>
              ) : (
                <>
                  {SIZE}×{SIZE} · <b>{marks.toLocaleString()}</b> marked
                </>
              )}
            </p>
          </div>

          <div className="plot__swatches" role="radiogroup" aria-label="Colour">
            {PALETTE.map((p, i) => (
              <button
                key={p.name}
                type="button"
                role="radio"
                aria-checked={colour === i}
                aria-label={p.name}
                title={p.name}
                className={`plot__swatch${i === 0 ? " plot__swatch--ground" : ""}`}
                style={p.hex ? { background: p.hex } : undefined}
                onClick={() => setColour(i)}
              />
            ))}
          </div>

          <div className="plot__tools">
            <p
              key={flash}
              className={`plot__status${ready ? "" : " is-waiting"}${flash ? " is-flash" : ""}${mode === "local" ? " is-local" : ""}`}
              role="status"
            >
              <span className="plot__meter" style={{ transform: `scaleX(${ready || mode !== "live" ? 1 : 1 - wait / 5000})` }} />
              <span className="plot__status-text">{status}</span>
            </p>
            <button type="button" onClick={zoomButton(1 / 1.5)} aria-label="Zoom out">
              <Minus size={14} />
            </button>
            <button type="button" onClick={zoomButton(1.5)} aria-label="Zoom in">
              <Plus size={14} />
            </button>
            <button type="button" onClick={fit} aria-label="Fit sheet">
              <Scan size={14} />
            </button>
          </div>
        </div>
        <p id="plot-help" className="plot__help">
          Tap to place · drag to pan · scroll or pinch to zoom · one mark every 5s · keys: arrows, enter, [ ], + −, 0
        </p>
      </div>
    </div>
  );
};

export default Plot;
