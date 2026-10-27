import { useEffect, useRef, useState } from "react";
import { ACCENTS, EGGS_KEY, SHEET_KEY, readStored, storedSheet, useAccent, writeStored } from "@/theme/accent";
import { isTyping } from "@/theme/keymap";
import { SHEETS, sheetNo } from "@/hero/sheets";
import type { HeroEngine } from "@/hero/engine/hero-engine";
import { createCipherField, type CipherField } from "@/hero/cipher";

/**
 * Cartographic hero — stage, name, tagline, accent initials and hairline
 * strip sit in normal flow and scroll away with the page; the field behind them is
 * the PS1 renderer (cipher / ocean / astral / ruins / drift / dunes / rift / frost / field / matrix / abyss / cliff). three.js is fetched
 * with a dynamic import on mount, so no other route downloads it. Without
 * WebGL the stage falls back to a CSS contour sheet.
 *
 * The engine runs its own render loop and stops it when offscreen, hidden, or
 * paused under reduced motion. The cipher sheet is a black stage in the
 * engine with a 2D glyph canvas over it; the engine's clock stops while it is up.
 */

const NAME = "NICOLAS";

const readFound = (): string[] => {
  try {
    const v = JSON.parse(readStored(EGGS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

const reduceQuery = () =>
  typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

const CartographicHero = () => {
  const accent = useAccent();
  const [sheet, setSheet] = useState(() => storedSheet(SHEETS.length));
  const [noGl, setNoGl] = useState(false);
  const [egg, setEgg] = useState<{ n: number; total: number; fresh: boolean; key: number } | null>(null);
  const found = useRef<Set<string> | null>(null);
  const eggTimer = useRef(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const engineRef = useRef<HeroEngine | null>(null);
  const cipherCanvasRef = useRef<HTMLCanvasElement>(null);
  const cipherRef = useRef<CipherField | null>(null);
  const cipherOn = SHEETS[sheet].id === "cipher";
  const live = useRef({ accent, sheet });
  live.current = { accent, sheet };

  // ── PS1 renderer: lazy-loaded, disposed on unmount ───────────────────
  useEffect(() => {
    let dead = false;
    let engine: HeroEngine | null = null;
    import("@/hero/engine/hero-engine")
      .then(({ createHeroEngine }) => {
        if (dead || !canvasRef.current || !stageRef.current) return;
        const reduced = Boolean(reduceQuery()?.matches);
        engine = createHeroEngine({
          canvas: canvasRef.current,
          host: stageRef.current,
          readKeys: [],
          readVals: [],
          compass: null,
          accent: ACCENTS[live.current.accent],
          sheet: live.current.sheet,
          motion: !reduced && SHEETS[live.current.sheet].id !== "cipher",
          psx: true,
          reducedMotion: reduced,
          onContextLost: () => setNoGl(true),
          onEgg: ({ id, total }) => {
            found.current ??= new Set(readFound());
            const fresh = !found.current.has(id);
            if (fresh) {
              found.current.add(id);
              writeStored(EGGS_KEY, JSON.stringify([...found.current]));
            }
            setEgg({ n: found.current.size, total, fresh, key: Date.now() });
            window.clearTimeout(eggTimer.current);
            eggTimer.current = window.setTimeout(() => setEgg(null), 5000);
          },
        });
        engineRef.current = engine;
      })
      .catch(() => {
        if (!dead) setNoGl(true);
      });
    return () => {
      dead = true;
      window.clearTimeout(eggTimer.current);
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Glyph field: plain 2D canvas, built eagerly so switching to it is instant.
  useEffect(() => {
    if (!cipherCanvasRef.current) return;
    const field = createCipherField(cipherCanvasRef.current, {
      accent: ACCENTS[live.current.accent].hex,
      reducedMotion: Boolean(reduceQuery()?.matches),
    });
    cipherRef.current = field;
    return () => {
      field.dispose();
      cipherRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setAccent(ACCENTS[accent]);
    cipherRef.current?.setAccent(ACCENTS[accent].hex);
  }, [accent]);
  useEffect(() => {
    engineRef.current?.setSheet(sheet);
    writeStored(SHEET_KEY, String(sheet));
  }, [sheet]);
  useEffect(() => {
    cipherRef.current?.setActive(cipherOn);
    engineRef.current?.setMotion(!cipherOn && !reduceQuery()?.matches);
  }, [cipherOn]);

  // The strip wraps to two rows on phones; keep the monogram clear of its hairline.
  useEffect(() => {
    const stage = stageRef.current, strip = footerRef.current;
    if (!stage || !strip) return;
    const sync = () => stage.style.setProperty("--strip-h", `${strip.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(strip);
    return () => ro.disconnect();
  }, []);

  const goSheet = (i: number) => setSheet(((i % SHEETS.length) + SHEETS.length) % SHEETS.length);

  // [ ] cycle scenes; Shift+arrows orbit, + / - dolly, 0 resets the camera
  // (while the stage is on screen).
  useEffect(() => {
    const STEP = 0.18;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || isTyping(e.target)) return;
      if (e.key === "[") return setSheet((s) => (s + SHEETS.length - 1) % SHEETS.length);
      if (e.key === "]") return setSheet((s) => (s + 1) % SHEETS.length);
      const eng = engineRef.current;
      const r = stageRef.current?.getBoundingClientRect();
      if (!eng || !r || r.bottom < window.innerHeight * 0.4 || r.top > window.innerHeight * 0.6) return;
      let used = true;
      if (e.shiftKey && e.key === "ArrowLeft") eng.nudge(-STEP, 0);
      else if (e.shiftKey && e.key === "ArrowRight") eng.nudge(STEP, 0);
      else if (e.shiftKey && e.key === "ArrowUp") eng.nudge(0, -STEP * 0.6);
      else if (e.shiftKey && e.key === "ArrowDown") eng.nudge(0, STEP * 0.6);
      else if (e.key === "+" || e.key === "=") eng.nudge(0, 0, 1.2);
      else if (e.key === "-" || e.key === "_") eng.nudge(0, 0, 1 / 1.2);
      else if (e.key === "0") eng.resetView();
      else used = false;
      if (used) e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={rootRef} className={`hero${noGl ? " hero--no-gl" : ""}`}>
      <div ref={stageRef} className="hero__stage">
        <canvas ref={canvasRef} className="hero__canvas" role="img" aria-label={SHEETS[sheet].aria} />
        <canvas
          ref={cipherCanvasRef}
          className={`hero__cipher${cipherOn ? " is-on" : ""}`}
          data-no-orbit
          aria-hidden="true"
        />
        <div className="hero__vignette" />

        <div className="hero__egg" role="status" aria-live="polite">
          {egg && (
            <p key={egg.key} className={egg.fresh ? "is-new" : undefined}>
              <small>
                {egg.fresh ? "FOUND" : "AGAIN"} {String(egg.n).padStart(2, "0")}/{String(egg.total).padStart(2, "0")}
              </small>
            </p>
          )}
        </div>

        {/* Display name + tagline share one column so their left edge and
            vertical gap hold at every width. */}
        <div className="hero__intro">
          <div className="hero__name">
            <h1 className="hero__name-text">
              {NAME.split("").map((ch, i) => (
                <span key={i} data-letter className="hero__letter">
                  {ch}
                </span>
              ))}
            </h1>
          </div>

          <p className="hero__tagline">
            Software ventures &amp; craft: agentic systems, markets and the open web.
          </p>
        </div>

        {/* Italic accent initials */}
        <div className="hero__mark">
          <div className="hero__mark-text">C.A</div>
        </div>

        {/* Hairline footer strip: scene tabs on the left. */}
        <footer ref={footerRef} className="hero__strip">
          <div className="hero__sheets" role="group" aria-label="Hero scene">
            {SHEETS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className="hero__sheet"
                aria-pressed={i === sheet}
                aria-label={`Scene ${sheetNo(i)}: ${s.name}`}
                onClick={() => goSheet(i)}
              >
                {sheetNo(i)}
              </button>
            ))}
            <span className="hero__sheet-keys" aria-hidden="true">
              <kbd>[</kbd>
              <kbd>]</kbd>
            </span>
            <span className="hero__orbit-hint" aria-hidden="true">
              {SHEETS[sheet].hint ?? "DRAG TO ORBIT \u00b7 CTRL+WHEEL TO ZOOM \u00b7 DOUBLE-CLICK TO RESET"}
            </span>
          </div>
        </footer>
      </div>

    </div>
  );
};

export default CartographicHero;
