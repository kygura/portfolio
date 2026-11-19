import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, MessageSquare, Minus, Plus, RotateCcw } from "lucide-react";
import { formatBytes, type CodeMap, type ShowcaseRepo } from "@/lib/showcase";
import { squarify, type Rect } from "@/lib/treemap";

/** Group headers get this much of a plot when it is tall enough to spare it. */
const HEADER_PX = 16;
/** Below this a plot shows no label; its title still names it on hover. */
const LABEL_MIN = { w: 44, h: 16 };
/** Languages past the third share the plain sheet. */
const TONES = 3;
/** How far in the map zooms. */
const MAX_ZOOM = 8;
/** Zoom factor for one button press, key press or double-click. */
const ZOOM_STEP = 2;
/** Share of the plot an arrow key pans. */
const PAN_STEP = 0.15;

/**
 * Where the plot looks: zoom `k`, and the offset of the map's top-left corner
 * as a fraction of the plot (so a resize keeps the same view). At k = 1 the
 * map fills the plot and the offset is 0.
 */
type View = { k: number; fx: number; fy: number };
const HOME: View = { k: 1, fx: 0, fy: 0 };

const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Keeps the map covering the whole plot: no empty margin past any edge. */
const clampView = ({ k, fx, fy }: View): View => {
  const z = clampNum(k, 1, MAX_ZOOM);
  return { k: z, fx: clampNum(fx, 1 - z, 0), fy: clampNum(fy, 1 - z, 0) };
};
/** Scales the view by `factor`, holding the point (px, py), in plot fractions, still. */
const zoomAt = (view: View, factor: number, px: number, py: number): View => {
  const k = clampNum(view.k * factor, 1, MAX_ZOOM);
  const r = k / view.k;
  return clampView({ k, fx: px - (px - view.fx) * r, fy: py - (py - view.fy) * r });
};

type Cell = Rect & {
  key: string;
  label: string;
  title: string;
  tone: number;
  group: boolean;
  delay: number;
};

const describe = (path: string, files: number, bytes: number) =>
  `${path} · ${files} ${files === 1 ? "file" : "files"} · ${formatBytes(bytes)}`;

/**
 * Lays the map out in pixels: top-level plots squarified over the whole area,
 * then each directory's children squarified inside it, under a header strip.
 */
function layout(map: CodeMap, size: { w: number; h: number }): Cell[] {
  const rank = new Map(map.languages.map((lang, i) => [lang.name, i]));
  const tone = (lang: string | null) => Math.min(lang === null ? TONES : (rank.get(lang) ?? TONES), TONES);
  const cells: Cell[] = [];
  const groups = squarify(
    map.nodes.map((node) => node.bytes),
    { x: 0, y: 0, ...size },
  );

  map.nodes.forEach((node, i) => {
    const rect = groups[i];
    const path = `${map.base}${node.name}`;
    const delay = i * 40;
    if (!node.children?.length) {
      cells.push({ ...rect, key: node.name, label: node.name, title: describe(path, node.files, node.bytes), tone: tone(node.lang), group: false, delay });
      return;
    }
    const header = rect.h > HEADER_PX * 2.5 ? HEADER_PX : 0;
    cells.push({ ...rect, key: node.name, label: node.name, title: describe(path, node.files, node.bytes), tone: tone(node.lang), group: true, delay });
    const inner = squarify(
      node.children.map((child) => child.bytes),
      { x: rect.x, y: rect.y + header, w: rect.w, h: rect.h - header },
    );
    node.children.forEach((child, j) => {
      cells.push({
        ...inner[j],
        key: `${node.name}${child.name}`,
        label: child.name,
        title: describe(`${path}${child.name}`, child.files, child.bytes),
        tone: tone(child.lang),
        group: false,
        delay: delay + 60 + j * 25,
      });
    });
  });
  return cells;
}

/**
 * The source tree as a survey plat: one plot per directory or file, sized by
 * bytes. It pans and zooms: drag to pan, pinch or ctrl+scroll to zoom,
 * double-click to zoom in, or the buttons and keys (+, -, 0, arrows). The
 * layout is redone at the zoomed size rather than scaled, so text stays sharp
 * and small plots gain labels as they grow.
 */
const CodeMapView = ({ map }: { map: CodeMap }) => {
  const plotRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setViewState] = useState<View>(HOME);
  // Buttons, keys and double-clicks glide; drags, pinches and wheels track the input.
  const [smooth, setSmooth] = useState(false);
  const [dragging, setDragging] = useState(false);
  const viewRef = useRef(view);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const setView = useCallback((next: View | ((v: View) => View), glide = false) => {
    const resolved = clampView(typeof next === "function" ? next(viewRef.current) : next);
    viewRef.current = resolved;
    setSmooth(glide);
    setViewState(resolved);
  }, []);

  useLayoutEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** A client point as a fraction of the plot. */
  const toPlot = useCallback((clientX: number, clientY: number) => {
    const rect = plotRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  }, []);

  // React registers wheel listeners as passive, and zoom has to stop the page scrolling.
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinches arrive as ctrl+wheel.
        e.preventDefault();
        const p = toPlot(e.clientX, e.clientY);
        setView(zoomAt(v, Math.exp(-e.deltaY * unit * 0.01), p.x, p.y));
        return;
      }
      if (v.k === 1) return;
      const next = clampView({
        k: v.k,
        fx: v.fx - (e.deltaX * unit) / el.clientWidth,
        fy: v.fy - (e.deltaY * unit) / el.clientHeight,
      });
      // At an edge the wheel goes back to scrolling the page.
      if (next.fx === v.fx && next.fy === v.fy) return;
      e.preventDefault();
      setView(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setView, toPlot]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.current.set(e.pointerId, toPlot(e.clientX, e.clientY));
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 1 && viewRef.current.k > 1) setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const point = toPlot(e.clientX, e.clientY);
    const all = [...pointers.current.entries()];
    if (all.length === 1) {
      pointers.current.set(e.pointerId, point);
      if (viewRef.current.k === 1) return;
      setView((v) => ({ k: v.k, fx: v.fx + point.x - prev.x, fy: v.fy + point.y - prev.y }));
      return;
    }
    // Two fingers: scale by the change in their spread, pan by the move of their midpoint.
    const other = all.find(([id]) => id !== e.pointerId)![1];
    const before = { mx: (prev.x + other.x) / 2, my: (prev.y + other.y) / 2, d: Math.hypot(prev.x - other.x, prev.y - other.y) };
    pointers.current.set(e.pointerId, point);
    const after = { mx: (point.x + other.x) / 2, my: (point.y + other.y) / 2, d: Math.hypot(point.x - other.x, point.y - other.y) };
    if (!before.d) return;
    setView((v) => {
      const zoomed = zoomAt(v, after.d / before.d, before.mx, before.my);
      return { k: zoomed.k, fx: zoomed.fx + after.mx - before.mx, fy: zoomed.fy + after.my - before.my };
    });
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setDragging(false);
  };

  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const p = toPlot(e.clientX, e.clientY);
    setView((v) => (v.k >= MAX_ZOOM ? HOME : zoomAt(v, ZOOM_STEP, p.x, p.y)), true);
  };

  const zoomCentre = (factor: number) => setView((v) => zoomAt(v, factor, 0.5, 0.5), true);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const pan = (dx: number, dy: number) =>
      setView((v) => ({ k: v.k, fx: v.fx + dx * PAN_STEP, fy: v.fy + dy * PAN_STEP }), true);
    const actions: Record<string, () => void> = {
      "+": () => zoomCentre(ZOOM_STEP),
      "=": () => zoomCentre(ZOOM_STEP),
      "-": () => zoomCentre(1 / ZOOM_STEP),
      _: () => zoomCentre(1 / ZOOM_STEP),
      "0": () => setView(HOME, true),
      ArrowLeft: () => pan(1, 0),
      ArrowRight: () => pan(-1, 0),
      ArrowUp: () => pan(0, 1),
      ArrowDown: () => pan(0, -1),
    };
    const action = actions[e.key];
    if (!action || e.ctrlKey || e.metaKey || e.altKey) return;
    // Arrows only claim the key once there is somewhere to pan.
    if (e.key.startsWith("Arrow") && viewRef.current.k === 1) return;
    e.preventDefault();
    action();
  };

  const cells = useMemo(
    () => (size.w && size.h ? layout(map, { w: size.w * view.k, h: size.h * view.k }) : []),
    [map, size, view.k],
  );
  const offset = { x: view.fx * size.w, y: view.fy * size.h };
  const zoomed = view.k > 1;
  const key = map.languages.slice(0, 4).map((lang, i) => ({
    ...lang,
    tone: Math.min(i, TONES),
    share: Math.max(1, Math.round((lang.bytes / map.bytes) * 100)),
  }));

  return (
    <div className="code-map">
      <div className="code-map__stage">
        <div
          ref={plotRef}
          className="code-map__plot"
          role="application"
          aria-roledescription="zoomable map"
          aria-label={`Source map: ${map.files} files${map.base ? ` under ${map.base}` : ""}. Plus and minus zoom, arrows pan, 0 resets.`}
          tabIndex={0}
          data-zoomed={zoomed}
          data-dragging={dragging}
          data-smooth={smooth}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          onKeyDown={onKeyDown}
        >
          {cells.map((cell) => {
            const left = cell.x + offset.x;
            const top = cell.y + offset.y;
            // Plots wholly outside the plot are skipped; at 8x most of them are.
            if (left > size.w || top > size.h || left + cell.w < 0 || top + cell.h < 0) return null;
            // Group names go in the header layer below, so they can pin above the children.
            const labelled = !cell.group && cell.w >= LABEL_MIN.w && cell.h >= LABEL_MIN.h;
            return (
              <div
                key={cell.key}
                className={cell.group ? "code-map__group" : "code-map__cell"}
                data-tone={cell.tone}
                title={cell.title}
                style={{
                  left,
                  top,
                  width: cell.w,
                  height: cell.h,
                  animationDelay: `${cell.delay}ms`,
                }}
              >
                {labelled && <span>{cell.label}</span>}
              </div>
            );
          })}
          {cells.map((cell) => {
            if (!cell.group || cell.h <= HEADER_PX * 2.5) return null;
            const left = cell.x + offset.x;
            const top = cell.y + offset.y;
            // The header holds to the plot's top and left edges while any of its
            // group is in view, and rides up with the group's bottom edge as it leaves.
            const pinnedTop = Math.min(Math.max(top, 0), top + cell.h - HEADER_PX);
            const pinnedLeft = Math.max(left, 0);
            const width = Math.min(left + cell.w, size.w) - pinnedLeft;
            if (width < LABEL_MIN.w || pinnedTop > size.h || pinnedTop + HEADER_PX < 0) return null;
            return (
              <div
                key={`${cell.key}#header`}
                className="code-map__header"
                data-pinned={pinnedTop !== top || pinnedLeft !== left}
                aria-hidden="true"
                style={{ left: pinnedLeft, top: pinnedTop, width, animationDelay: `${cell.delay}ms` }}
              >
                {cell.label}
              </div>
            );
          })}
        </div>
        <div className="code-map__zoom" data-zoomed={zoomed}>
          <button type="button" aria-label="Zoom in" title="Zoom in" disabled={view.k >= MAX_ZOOM} onClick={() => zoomCentre(ZOOM_STEP)}>
            <Plus className="w-3 h-3" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Zoom out" title="Zoom out" disabled={!zoomed} onClick={() => zoomCentre(1 / ZOOM_STEP)}>
            <Minus className="w-3 h-3" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Reset view" title="Reset view" disabled={!zoomed} onClick={() => setView(HOME, true)}>
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
          </button>
          {zoomed && <span className="code-map__level" aria-live="polite">{view.k.toFixed(1)}x</span>}
        </div>
      </div>
      <div className="code-map__key">
        {key.map((lang) => (
          <span key={lang.name}>
            <i data-tone={lang.tone} aria-hidden="true" />
            {lang.name} {lang.share}%
          </span>
        ))}
        <span className="code-map__count">
          {map.base && `${map.base} · `}
          {map.files} files{map.truncated && "+"}
        </span>
      </div>
    </div>
  );
};

/** The same folded tree as the map, drawn as a listing: top plots, then their largest children. */
const CodeTreeView = ({ map }: { map: CodeMap }) => (
  <div className="code-tree">
    <ul className="code-tree__list" aria-label={`Files${map.base ? ` under ${map.base}` : ""}`}>
      {map.base && <li className="code-tree__base">{map.base}</li>}
      {map.nodes.map((node) => (
        <li key={node.name}>
          <span className="code-tree__row" data-dir={Boolean(node.children)}>
            <span className="code-tree__name">{node.name}</span>
            <span className="code-tree__size">{formatBytes(node.bytes)}</span>
          </span>
          {node.children && node.children.length > 0 && (
            <ul>
              {node.children.map((child, i) => (
                <li key={child.name}>
                  <span className="code-tree__row" data-dir={child.name.endsWith("/")}>
                    <span className="code-tree__branch" aria-hidden="true">
                      {i === node.children!.length - 1 ? "└─" : "├─"}
                    </span>
                    <span className="code-tree__name">{child.name}</span>
                    <span className="code-tree__size">{formatBytes(child.bytes)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  </div>
);

type Tab = "tree" | "map";
const TABS: Tab[] = ["tree", "map"];

/**
 * The window for a repo with no site to frame: its source as a file tree or a
 * map, and a way into the codebase page where visitors can ask about it.
 */
const CodeWindow = ({ repo, map }: { repo: ShowcaseRepo; map: CodeMap }) => {
  const [tab, setTab] = useState<Tab>("tree");

  return (
    <div className="repo-window repo-window--code">
      <div className="repo-window__bar">
        <span className="repo-window__address">{repo.name}</span>
        <span className="repo-window__tabs" role="tablist" aria-label={`${repo.name} views`}>
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              className="repo-window__tab"
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </span>
        {!repo.private && (
          <a
            href={repo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="repo-window__open"
            aria-label={`Open ${repo.name}'s source in a new tab`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        )}
      </div>

      <div className="repo-window__viewport" role="tabpanel">
        {tab === "tree" ? (
          <>
            <CodeTreeView map={map} />
            {/* Private source stays private: no page to open. */}
            {!repo.private && (
              <Link to={`/projects/${repo.name}`} className="code-window__ask">
                <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                Ask the codebase
              </Link>
            )}
          </>
        ) : (
          <CodeMapView map={map} />
        )}
      </div>
    </div>
  );
};

export default CodeWindow;
