import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { isTyping } from "@/theme/keymap";
import { pickHomeScene, SHEETS } from "@/hero/sheets";
import { readStored, writeStored } from "@/theme/accent";
import { useHeroStage } from "@/hero/useHeroStage";

/**
 * Cartographic hero — stage, name, tagline, accent initials and hairline
 * strip sit in normal flow and scroll away with the page; the field behind
 * them is the PS1 renderer (see useHeroStage). Without WebGL the stage falls
 * back to a CSS contour sheet. Each page load shows a random scene (never
 * the previous visit's); all of them live on /scenes.
 */

const NAME = "NICOLAS";
const HOME_SCENE_KEY = "nca-home-scene";

/** Picked once per page load, so in-app navigation back home keeps the same scene. */
let homeScene: number | null = null;
const homeSceneForVisit = () => {
  if (homeScene === null) {
    homeScene = pickHomeScene(readStored(HOME_SCENE_KEY));
    writeStored(HOME_SCENE_KEY, SHEETS[homeScene].id);
  }
  return homeScene;
};

const CartographicHero = () => {
  const [sheet] = useState(homeSceneForVisit);
  const { canvasRef, cipherCanvasRef, stageRef, engineRef, noGl, egg, cipherOn } = useHeroStage(sheet);
  const footerRef = useRef<HTMLElement>(null);

  // The strip wraps to two rows on phones; keep the monogram clear of its hairline.
  useEffect(() => {
    const stage = stageRef.current, strip = footerRef.current;
    if (!stage || !strip) return;
    const sync = () => stage.style.setProperty("--strip-h", `${strip.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [stageRef]);

  // Shift+arrows orbit, + / - dolly, 0 resets the camera (while the stage is on screen).
  useEffect(() => {
    const STEP = 0.18;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || isTyping(e.target)) return;
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
  }, [engineRef, stageRef]);

  return (
    <div className={`hero${noGl ? " hero--no-gl" : ""}`}>
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

        {/* Hairline footer strip: which scene this is (and the way to the
            rest) on the left, the scroll cue on the right. */}
        <footer ref={footerRef} className="hero__strip">
          <Link to={`/scenes/${SHEETS[sheet].id}`} className="hero__scene" data-no-orbit>
            <span className="hero__scene-no">
              {String(sheet + 1).padStart(2, "0")}/{String(SHEETS.length).padStart(2, "0")}
            </span>
            <span className="hero__scene-name">{SHEETS[sheet].name}</span>
            <span className="hero__scene-go">All scenes &rarr;</span>
          </Link>
          <span className="hero__cue" aria-hidden="true">
            Scroll <i>&darr;</i>
          </span>
        </footer>
      </div>

    </div>
  );
};

export default CartographicHero;
