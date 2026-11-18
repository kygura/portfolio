import { useEffect, useLayoutEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import PageHead from "@/components/PageHead";
import { EGG_TOTAL, SHEETS, posterUrl } from "@/hero/sheets";
import { preloadScene } from "@/hero/preload";
import { PORTAL, claimPortal, lastPortal } from "./portal";

/**
 * The hall: one window per scene, each showing a still of what is on the
 * other side. Nothing here runs WebGL; pointing at a window fetches its scene,
 * and going through it morphs the window into the live stage.
 */

const pad = (n: number) => String(n).padStart(2, "0");

const Hall = () => {
  const last = lastPortal();
  const grid = useRef<HTMLOListElement>(null);
  const back = Boolean((useLocation().state as { keepScroll?: boolean } | null)?.keepScroll);

  // Coming back from a scene: the window you left through is in view as the stage shrinks into it.
  useLayoutEffect(() => {
    if (!back || !last) return;
    grid.current?.querySelector(`[data-portal="${last}"]`)?.scrollIntoView({ block: "center" });
  }, [back, last]);

  useEffect(() => {
    document.title = "Scenes";
  }, []);

  return (
    <div className="page-shell page-shell--wide hall">
      <PageHead
        no="03"
        label="Scenes"
        title="Scenes"
        lede="Small worlds drawn live in the browser, each behind its own window. Pick one and step through."
      >
        <p className="page-head__facts">
          <span>{SHEETS.length} scenes</span>
          <span>{EGG_TOTAL} hidden things to find</span>
          <span>Esc to come back</span>
        </p>
      </PageHead>

      <ol ref={grid} className="hall__grid">
        {SHEETS.map((s, i) => (
          <li key={s.id} className="hall__item" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
            <Link
              to={`/scenes/${s.id}`}
              viewTransition
              className="window"
              onPointerEnter={() => preloadScene(s.id)}
              onFocus={() => preloadScene(s.id)}
              onClick={(e) => {
                const view = e.currentTarget.querySelector<HTMLElement>("[data-portal]");
                if (view) claimPortal(view, s.id);
              }}
            >
              <span className="window__frame">
                <img
                  className="window__view"
                  data-portal={s.id}
                  src={posterUrl(s.id)}
                  alt=""
                  width={960}
                  height={600}
                  loading={i < 4 ? "eager" : "lazy"}
                  decoding="async"
                  style={s.id === last ? { viewTransitionName: PORTAL } : undefined}
                />
                <span className="window__sill" aria-hidden="true" />
              </span>
              <span className="window__plate">
                <i aria-hidden="true">{pad(i + 1)}</i>
                <b>{s.name}</b>
                <span className="window__go" aria-hidden="true">
                  Enter &rarr;
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default Hall;
