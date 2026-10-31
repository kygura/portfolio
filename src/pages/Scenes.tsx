import { useEffect, useRef } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { SHEET_KEY, storedSheet, writeStored } from "@/theme/accent";
import { isTyping } from "@/theme/keymap";
import { SHEETS, sheetIndex } from "@/hero/sheets";
import { useHeroStage } from "@/hero/useHeroStage";

/**
 * Scenes: one full-bleed stage and a rail of scene names under it. Each scene
 * has its own URL (/scenes/:id); /scenes alone opens the last one viewed.
 * Dragging the stage orbits it; [ ] and the arrow keys change scene.
 */

const Scenes = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const fromUrl = sheetIndex(id);
  const sheet = fromUrl >= 0 ? fromUrl : storedSheet(SHEETS.length);
  const { canvasRef, cipherCanvasRef, stageRef, noGl, egg, cipherOn } = useHeroStage(sheet);
  const railRef = useRef<HTMLElement>(null);
  const cur = SHEETS[sheet];

  useEffect(() => {
    if (fromUrl >= 0) writeStored(SHEET_KEY, String(fromUrl));
  }, [fromUrl]);

  useEffect(() => {
    document.title = `${cur.name} · Scenes`;
  }, [cur.name]);

  // Keep the active name in view when the rail scrolls (narrow screens).
  useEffect(() => {
    railRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [sheet]);

  // Latest values for the key listener, which is bound once.
  const live = useRef({ sheet, navigate });
  live.current = { sheet, navigate };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.defaultPrevented || isTyping(e.target)) return;
      const onLink = e.target instanceof Element && e.target.closest("a, button");
      const { sheet, navigate } = live.current;
      const step = e.key === "[" || (!onLink && e.key === "ArrowLeft") ? -1 : e.key === "]" || (!onLink && e.key === "ArrowRight") ? 1 : 0;
      if (!step) return;
      e.preventDefault();
      navigate(`/scenes/${SHEETS[(sheet + step + SHEETS.length) % SHEETS.length].id}`, { replace: true });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (id !== undefined && fromUrl < 0) return <Navigate to="/scenes" replace />;

  return (
    <div className={`scenes${noGl ? " hero--no-gl" : ""}`}>
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
                {egg.fresh ? "FOUND" : "AGAIN"} {String(egg.n).padStart(2, "0")}/{String(egg.total).padStart(2, "0")}
              </small>
            </p>
          )}
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
              {s.name}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default Scenes;
