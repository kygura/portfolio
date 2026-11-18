import { useEffect, useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { SHEET_KEY, writeStored } from "@/theme/accent";
import { isTyping } from "@/theme/keymap";
import { SHEETS, posterUrl, sheetIndex } from "@/hero/sheets";
import { useHeroStage } from "@/hero/useHeroStage";
import { PORTAL, setLastPortal } from "./portal";

/**
 * One scene, full bleed. Until the live scene has drawn its first frame the
 * stage shows the same still the hall's window did, so arriving is never a
 * blank wait. There is no next or previous: the hall is the only way between
 * scenes, and the way back to it sits top left. A plate in the lower left
 * names the scene; the camera controls sit in the lower right. 0 resets the
 * camera, F hides the overlay and Esc goes back to the hall.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const DEFAULT_HINT = "DRAG TO LOOK · SCROLL TO ZOOM";

const Viewer = ({ id }: { id: string }) => {
  const navigate = useNavigate();
  const fromUrl = sheetIndex(id);
  const sheet = Math.max(0, fromUrl);
  const { canvasRef, cipherCanvasRef, stageRef, engineRef, noGl, egg, cipherOn, shown } = useHeroStage(sheet);
  const [bare, setBare] = useState(false);
  const cur = SHEETS[sheet];
  // The still stays up until the live scene is on the canvas (or for good, without WebGL).
  const live = cipherOn || shown === sheet;

  useEffect(() => {
    if (fromUrl < 0) return;
    writeStored(SHEET_KEY, String(fromUrl));
    setLastPortal(SHEETS[fromUrl].id);
  }, [fromUrl]);

  useEffect(() => {
    document.title = `${cur.name} · Scenes`;
  }, [cur.name]);

  // Latest values for the key listener, which is bound once.
  const keys = useRef({ navigate, bare });
  keys.current = { navigate, bare };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.defaultPrevented || isTyping(e.target)) return;
      const { navigate, bare } = keys.current;
      if (e.key === "f") return void (e.preventDefault(), setBare((b) => !b));
      if (e.key === "Escape") {
        e.preventDefault();
        if (bare) setBare(false);
        else navigate("/scenes", { viewTransition: true, state: { keepScroll: true } });
        return;
      }
      if (e.key === "0") return void (e.preventDefault(), engineRef.current?.resetView());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [engineRef]);

  if (fromUrl < 0) return <Navigate to="/scenes" replace />;

  return (
    <div className={`scenes${noGl ? " hero--no-gl" : ""}${bare ? " scenes--bare" : ""}`}>
      <div ref={stageRef} className="scenes__stage hero__stage" style={{ viewTransitionName: PORTAL }}>
        <canvas ref={canvasRef} className="hero__canvas" role="img" aria-label={cur.aria} />
        <canvas
          ref={cipherCanvasRef}
          className={`hero__cipher${cipherOn ? " is-on" : ""}`}
          data-no-orbit
          aria-hidden="true"
        />
        {!cipherOn && (
          <img
            key={cur.id}
            className={`scenes__still${live ? " is-gone" : ""}`}
            src={posterUrl(cur.id)}
            alt=""
            aria-hidden="true"
            decoding="sync"
          />
        )}

        <div className="hero__egg scenes__egg" role="status" aria-live="polite">
          {egg && (
            <p key={egg.key} className={egg.fresh ? "is-new" : undefined}>
              <small>
                {egg.fresh ? "FOUND" : "AGAIN"} {pad(egg.n)}/{pad(egg.total)}
              </small>
            </p>
          )}
        </div>

        {bare ? (
          <button type="button" className="scenes__restore" onClick={() => setBare(false)}>
            <kbd>F</kbd> Show
          </button>
        ) : (
          <>
            <Link to="/scenes" state={{ keepScroll: true }} viewTransition className="scenes__back" title="Esc">
              <LayoutGrid size={13} aria-hidden="true" />
              All scenes
            </Link>

            <div className="scenes__plate" key={cur.id}>
              <p className="scenes__count">
                <b>{pad(sheet + 1)}</b>
                {!live && !noGl && <span className="scenes__loading">Arriving</span>}
              </p>
              <h1 className="scenes__title">{cur.name}</h1>
              <p className="scenes__hint">{noGl ? "STILL FRAME · WEBGL UNAVAILABLE" : (cur.hint ?? DEFAULT_HINT)}</p>
            </div>

            <div className="scenes__tools">
              {!cipherOn && (
                <button type="button" className="scenes__btn scenes__btn--wide" onClick={() => engineRef.current?.resetView()} title="Reset the camera">
                  <kbd>0</kbd> Reset
                </button>
              )}
              <button type="button" className="scenes__btn scenes__btn--wide" onClick={() => setBare(true)} title="Hide the overlay">
                <kbd>F</kbd> Hide
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Viewer;
