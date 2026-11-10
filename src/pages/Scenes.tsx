import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { SHEET_KEY, storedSheet, writeStored } from "@/theme/accent";
import { isTyping } from "@/theme/keymap";
import { SHEETS, sheetIndex } from "@/hero/sheets";
import { useHeroStage } from "@/hero/useHeroStage";

/**
 * Scenes: a stage and, under it, a console: counter and steppers, the scene's
 * name, the input hint, camera reset, and a rail of every
 * scene. Each scene has its own URL (/scenes/:id); /scenes alone opens the last
 * one viewed. [ ] and the arrow keys change scene, 0 resets the camera, and F
 * folds the console away so the stage fills the window.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const DEFAULT_HINT = "DRAG TO LOOK · SCROLL TO ZOOM";

const Scenes = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const fromUrl = sheetIndex(id);
  const sheet = fromUrl >= 0 ? fromUrl : storedSheet(SHEETS.length);
  const { canvasRef, cipherCanvasRef, stageRef, engineRef, noGl, egg, cipherOn } = useHeroStage(sheet);
  const railRef = useRef<HTMLElement>(null);
  const [bare, setBare] = useState(false);
  const cur = SHEETS[sheet];
  const at = (step: number) => `/scenes/${SHEETS[(sheet + step + SHEETS.length) % SHEETS.length].id}`;

  useEffect(() => {
    if (fromUrl >= 0) writeStored(SHEET_KEY, String(fromUrl));
  }, [fromUrl]);

  useEffect(() => {
    document.title = `${cur.name} · Scenes`;
  }, [cur.name]);

  // Keep the active name in view when the rail scrolls (narrow screens).
  useEffect(() => {
    railRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [sheet, bare]);

  // Latest values for the key listener, which is bound once.
  const live = useRef({ sheet, navigate });
  live.current = { sheet, navigate };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.defaultPrevented || isTyping(e.target)) return;
      if (e.key === "f") return void (e.preventDefault(), setBare((b) => !b));
      if (e.key === "Escape") return setBare(false);
      if (e.key === "0") return void (e.preventDefault(), engineRef.current?.resetView());
      const onLink = e.target instanceof Element && e.target.closest("a, button");
      const { sheet, navigate } = live.current;
      const step = e.key === "[" || (!onLink && e.key === "ArrowLeft") ? -1 : e.key === "]" || (!onLink && e.key === "ArrowRight") ? 1 : 0;
      if (!step) return;
      e.preventDefault();
      navigate(`/scenes/${SHEETS[(sheet + step + SHEETS.length) % SHEETS.length].id}`, { replace: true });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [engineRef]);

  if (id !== undefined && fromUrl < 0) return <Navigate to="/scenes" replace />;

  return (
    <div className={`scenes${noGl ? " hero--no-gl" : ""}${bare ? " scenes--bare" : ""}`}>
      <div ref={stageRef} className="scenes__stage hero__stage">
        <canvas ref={canvasRef} className="hero__canvas" role="img" aria-label={cur.aria} />
        <canvas
          ref={cipherCanvasRef}
          className={`hero__cipher${cipherOn ? " is-on" : ""}`}
          data-no-orbit
          aria-hidden="true"
        />

        <div className="hero__egg scenes__egg" role="status" aria-live="polite">
          {egg && (
            <p key={egg.key} className={egg.fresh ? "is-new" : undefined}>
              <small>
                {egg.fresh ? "FOUND" : "AGAIN"} {pad(egg.n)}/{pad(egg.total)}
              </small>
            </p>
          )}
        </div>

        {bare && (
          <button type="button" className="scenes__restore" onClick={() => setBare(false)}>
            <kbd>F</kbd> Show panel
          </button>
        )}
      </div>

      {!bare && (
        <div className="scenes__console">
          <div className="scenes__plate">
            <div className="scenes__step">
              <Link to={at(-1)} replace aria-label="Previous scene" title="[">
                <ArrowLeft size={14} aria-hidden="true" />
              </Link>
              <span className="scenes__count" aria-label={`Scene ${sheet + 1} of ${SHEETS.length}`}>
                <b>{pad(sheet + 1)}</b>/{pad(SHEETS.length)}
              </span>
              <Link to={at(1)} replace aria-label="Next scene" title="]">
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>

            <div className="scenes__caption" key={cur.id}>
              <h1 className="scenes__title">{cur.name}</h1>
            </div>

            <p className="scenes__hint">{cur.hint ?? DEFAULT_HINT}</p>

            <div className="scenes__tools">
              {!cipherOn && (
                <button type="button" onClick={() => engineRef.current?.resetView()} title="Reset the camera">
                  <kbd>0</kbd> Reset
                </button>
              )}
              <button type="button" onClick={() => setBare(true)} title="Hide this panel">
                <kbd>F</kbd> Hide
              </button>
            </div>
          </div>

          <nav ref={railRef} className="scenes__rail" aria-label="Scenes">
            {SHEETS.map((s, i) => (
              <Link
                key={s.id}
                to={`/scenes/${s.id}`}
                replace
                className="scenes__name"
                aria-current={i === sheet ? "page" : undefined}
              >
                <i aria-hidden="true">{pad(i + 1)}</i>
                {s.name}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
};

export default Scenes;
