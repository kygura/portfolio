import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { SHEET_KEY, storedSheet, writeStored } from "@/theme/accent";
import { isTyping } from "@/theme/keymap";
import { ORBIT_HINT, SHEETS, sheetIndex, sheetNo } from "@/hero/sheets";
import { useHeroStage } from "@/hero/useHeroStage";

/**
 * Scene viewer: one stage the height of the viewport with a control bar,
 * and an index of every scene under it. Each scene has its own URL
 * (/scenes/:id); /scenes alone opens the last one viewed.
 */

const STEP = 0.18;

const Scenes = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const fromUrl = sheetIndex(id);
  const sheet = fromUrl >= 0 ? fromUrl : storedSheet(SHEETS.length);
  const [paused, setPaused] = useState(false);
  const [psx, setPsx] = useState(true);
  const [full, setFull] = useState(false);
  const { canvasRef, cipherCanvasRef, stageRef, engineRef, noGl, egg, cipherOn } = useHeroStage(sheet, { paused, psx });
  const shellRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const cur = SHEETS[sheet];

  useEffect(() => {
    if (fromUrl >= 0) writeStored(SHEET_KEY, String(fromUrl));
  }, [fromUrl]);

  useEffect(() => {
    document.title = `${cur.name} · Scenes`;
  }, [cur.name]);

  // The bar wraps on phones; the stage gives up exactly what the bar takes.
  useEffect(() => {
    const shell = shellRef.current, bar = barRef.current;
    if (!shell || !bar) return;
    const sync = () => shell.style.setProperty("--scenes-bar", `${bar.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const go = (i: number) => navigate(`/scenes/${SHEETS[((i % SHEETS.length) + SHEETS.length) % SHEETS.length].id}`, { replace: true });
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shellRef.current?.requestFullscreen?.();
  };
  const fsSupported = typeof document !== "undefined" && Boolean(document.fullscreenEnabled);

  // Latest handlers for the key listener, which is bound once.
  const live = useRef({ go, sheet, toggleFull });
  live.current = { go, sheet, toggleFull };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || isTyping(e.target)) return;
      const eng = engineRef.current;
      const onControl = e.target instanceof Element && e.target.closest("button, a");
      const { go, sheet, toggleFull } = live.current;
      let used = true;
      if (e.key === "[" || (!e.shiftKey && !onControl && e.key === "ArrowLeft")) go(sheet - 1);
      else if (e.key === "]" || (!e.shiftKey && !onControl && e.key === "ArrowRight")) go(sheet + 1);
      else if (e.key === " " && !onControl) setPaused((p) => !p);
      else if (e.key === "f" || e.key === "F") toggleFull();
      else if (e.key === "x" || e.key === "X") setPsx((p) => !p);
      else if (eng && e.shiftKey && e.key === "ArrowLeft") eng.nudge(-STEP, 0);
      else if (eng && e.shiftKey && e.key === "ArrowRight") eng.nudge(STEP, 0);
      else if (eng && e.shiftKey && e.key === "ArrowUp") eng.nudge(0, -STEP * 0.6);
      else if (eng && e.shiftKey && e.key === "ArrowDown") eng.nudge(0, STEP * 0.6);
      else if (eng && (e.key === "+" || e.key === "=")) eng.nudge(0, 0, 1.2);
      else if (eng && (e.key === "-" || e.key === "_")) eng.nudge(0, 0, 1 / 1.2);
      else if (eng && e.key === "0") eng.resetView();
      else used = false;
      if (used) e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [engineRef]);

  if (id !== undefined && fromUrl < 0) return <Navigate to="/scenes" replace />;

  const eng = () => engineRef.current;

  return (
    <div className={`scenes${noGl ? " hero--no-gl" : ""}`}>
      <div ref={shellRef} className={`scenes__shell${full ? " is-full" : ""}`}>
        <div ref={stageRef} className="scenes__stage hero__stage">
          <canvas ref={canvasRef} className="hero__canvas" role="img" aria-label={cur.aria} />
          <canvas
            ref={cipherCanvasRef}
            className={`hero__cipher${cipherOn ? " is-on" : ""}`}
            data-no-orbit
            aria-hidden="true"
          />

          <header className="scenes__title" aria-live="polite">
            <span className="scenes__no">{sheetNo(sheet)}/{sheetNo(SHEETS.length - 1)}</span>
            <h1 className="scenes__name">{cur.name}</h1>
          </header>

          <div className="hero__egg scenes__egg" role="status" aria-live="polite">
            {egg && (
              <p key={egg.key} className={egg.fresh ? "is-new" : undefined}>
                <small>
                  {egg.fresh ? "FOUND" : "AGAIN"} {String(egg.n).padStart(2, "0")}/{String(egg.total).padStart(2, "0")}
                </small>
              </p>
            )}
          </div>
        </div>

        <div ref={barRef} className="scenes__bar" role="toolbar" aria-label="Scene controls">
          <div className="scenes__group">
            <button type="button" className="scenes__btn" onClick={() => go(sheet - 1)} aria-label="Previous scene" aria-keyshortcuts="[">
              &larr; <span className="scenes__btn-label">Prev</span>
            </button>
            <button type="button" className="scenes__btn" onClick={() => go(sheet + 1)} aria-label="Next scene" aria-keyshortcuts="]">
              <span className="scenes__btn-label">Next</span> &rarr;
            </button>
          </div>

          <div className="scenes__group">
            <button
              type="button"
              className="scenes__btn"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
              aria-keyshortcuts="Space"
              disabled={cipherOn}
            >
              {paused ? "Play" : "Pause"}
            </button>
            <button type="button" className="scenes__btn" onClick={() => setPsx((p) => !p)} aria-pressed={psx} aria-keyshortcuts="x">
              Dither
            </button>
          </div>

          <div className="scenes__group">
            <button type="button" className="scenes__btn" onClick={() => eng()?.nudge(0, 0, 1 / 1.2)} aria-label="Zoom out" aria-keyshortcuts="-" disabled={cipherOn}>
              &minus;
            </button>
            <button type="button" className="scenes__btn" onClick={() => eng()?.nudge(0, 0, 1.2)} aria-label="Zoom in" aria-keyshortcuts="+" disabled={cipherOn}>
              +
            </button>
            <button type="button" className="scenes__btn" onClick={() => eng()?.resetView()} aria-keyshortcuts="0" disabled={cipherOn}>
              Reset
            </button>
            {fsSupported && (
              <button type="button" className="scenes__btn" onClick={toggleFull} aria-pressed={full} aria-keyshortcuts="f">
                {full ? "Exit full" : "Full"}
              </button>
            )}
          </div>

          <span className="scenes__hint" aria-hidden="true">{cur.hint ?? ORBIT_HINT}</span>
        </div>
      </div>

      <section className="scenes__index page-shell page-shell--wide" aria-labelledby="scenes-index-h">
        <p className="scenes__about">{cur.aria}</p>
        <h2 id="scenes-index-h" className="scenes__index-h">All scenes</h2>
        <ol className="scenes__list">
          {SHEETS.map((s, i) => (
            <li key={s.id}>
              <Link
                to={`/scenes/${s.id}`}
                replace
                className="scenes__item"
                aria-current={i === sheet ? "page" : undefined}
                onClick={() => window.scrollTo({ top: 0 })}
              >
                <span className="scenes__item-no">{sheetNo(i)}</span>
                <span className="scenes__item-name">{s.name}</span>
                {s.hint && <span className="scenes__item-tag">Interactive</span>}
              </Link>
            </li>
          ))}
        </ol>
        <p className="scenes__keys" aria-hidden="true">
          <span><kbd>[</kbd><kbd>]</kbd> scene</span>
          <span><kbd>Space</kbd> pause</span>
          <span><kbd>X</kbd> dither</span>
          <span><kbd>F</kbd> full screen</span>
          <span><kbd>Shift</kbd>+<kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> orbit</span>
          <span><kbd>+</kbd><kbd>−</kbd> zoom</span>
          <span><kbd>0</kbd> reset</span>
        </p>
      </section>
    </div>
  );
};

export default Scenes;
