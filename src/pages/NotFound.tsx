import { useEffect, useMemo, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAccent } from "@/theme/accent";
import { CHORDS } from "@/theme/keymap";

/**
 * 404 — the unsurveyed sheet. A canvas-2D contour field (marching squares
 * over a drifting sum of sines) that swells under the pointer, a hashed grid
 * reference for the path that isn't here, a compass that can't settle, and
 * the known routes as landmarks with the nearest one called out. Under
 * reduced motion the field draws one still frame.
 */

const CELL = 14;
const LEVELS = 16;

/** FNV-1a, so the same missing path always lands on the same spot. */
const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

const dms = (deg: number, pos: string, neg: string) => {
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const s = Math.floor(((a - d) * 60 - m) * 60);
  return `${String(d).padStart(3, "0")}°${String(m).padStart(2, "0")}′${String(s).padStart(2, "0")}″ ${deg >= 0 ? pos : neg}`;
};

const distance = (a: string, b: string) => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
};

const LANDMARKS = Object.entries(CHORDS).map(([key, { to, label }]) => ({ key, to, label }));

const nearest = (path: string) => {
  const head = "/" + (path.toLowerCase().split("/").filter(Boolean)[0] ?? "");
  return LANDMARKS.map((l) => ({ ...l, d: distance(head, l.to) })).sort((a, b) => a.d - b.d)[0];
};

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const NotFound = () => {
  const { pathname } = useLocation();
  const accent = useAccent();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointer = useRef({ x: -1e4, y: -1e4, k: 0 });

  const survey = useMemo(() => {
    const h = hash(pathname);
    const lat = ((h % 18000) / 100 - 90) * 0.98;
    const lon = (((h >>> 8) % 36000) / 100 - 180) * 0.98;
    return {
      lat: dms(lat, "N", "S"),
      lon: dms(lon, "E", "W"),
      sheet: `${String.fromCharCode(65 + (h % 26))}${String.fromCharCode(65 + ((h >>> 5) % 26))}-${String(h % 1000).padStart(3, "0")}`,
      // Where the page "should" be, as a fraction of the stage.
      mark: { x: 0.55 + ((h >>> 12) % 300) / 1000, y: 0.2 + ((h >>> 20) % 500) / 1000 },
      near: nearest(pathname),
    };
  }, [pathname]);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", pathname);
  }, [pathname]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const colors = { rule: cssVar("--rule-2"), ink: cssVar("--ink-3"), accent: cssVar("--accent") };
    let w = 0;
    let h = 0;
    let cols = 0;
    let rows = 0;
    let field = new Float32Array(0);
    let raf = 0;
    let visible = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / CELL) + 1;
      rows = Math.ceil(h / CELL) + 1;
      field = new Float32Array(cols * rows);
    };

    const sample = (t: number) => {
      const p = pointer.current;
      const mx = survey.mark.x * w;
      const my = survey.mark.y * h;
      for (let j = 0; j < rows; j++) {
        const y = j * CELL;
        for (let i = 0; i < cols; i++) {
          const x = i * CELL;
          let v =
            Math.sin(x * 0.006 + t * 0.11) * Math.cos(y * 0.008 - t * 0.07) +
            0.6 * Math.sin((x + y) * 0.011 + t * 0.05) +
            0.35 * Math.cos(x * 0.019 - y * 0.013 - t * 0.09);
          // A sink where the page should have been.
          if (w >= 720) v -= 1.6 * Math.exp(-((x - mx) ** 2 + (y - my) ** 2) / 9000);
          // The pointer raises a hill as it moves.
          const dp = (x - p.x) ** 2 + (y - p.y) ** 2;
          v += 1.4 * p.k * Math.exp(-dp / 6000);
          field[j * cols + i] = v;
        }
      }
    };

    const edge = (a: number, b: number, l: number) => (l - a) / (b - a || 1e-6);

    const draw = (t: number) => {
      sample(t);
      ctx.clearRect(0, 0, w, h);
      for (let n = 0; n < LEVELS; n++) {
        const level = -2.6 + (n * 5) / LEVELS;
        const index = n % 4 === 0;
        ctx.beginPath();
        for (let j = 0; j < rows - 1; j++) {
          for (let i = 0; i < cols - 1; i++) {
            const a = field[j * cols + i];
            const b = field[j * cols + i + 1];
            const c = field[(j + 1) * cols + i + 1];
            const d = field[(j + 1) * cols + i];
            const code = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
            if (code === 0 || code === 15) continue;
            const x = i * CELL;
            const y = j * CELL;
            const top: [number, number] = [x + CELL * edge(a, b, level), y];
            const right: [number, number] = [x + CELL, y + CELL * edge(b, c, level)];
            const bottom: [number, number] = [x + CELL * edge(d, c, level), y + CELL];
            const left: [number, number] = [x, y + CELL * edge(a, d, level)];
            const seg = (p: [number, number], q: [number, number]) => {
              ctx.moveTo(p[0], p[1]);
              ctx.lineTo(q[0], q[1]);
            };
            switch (code) {
              case 1: case 14: seg(left, bottom); break;
              case 2: case 13: seg(bottom, right); break;
              case 3: case 12: seg(left, right); break;
              case 4: case 11: seg(top, right); break;
              case 6: case 9: seg(top, bottom); break;
              case 7: case 8: seg(left, top); break;
              case 5: seg(left, top); seg(bottom, right); break;
              case 10: seg(top, right); seg(left, bottom); break;
            }
          }
        }
        ctx.strokeStyle = index ? colors.ink : colors.rule;
        ctx.lineWidth = index ? 1 : 0.7;
        ctx.globalAlpha = index ? 0.55 : 0.6;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // The mark: a dashed survey ring round an X where the page should be.
      // On narrow screens the type covers the whole stage, so it stays off.
      if (w < 720) return;
      const mx = survey.mark.x * w;
      const my = survey.mark.y * h;
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(mx - 7, my - 7);
      ctx.lineTo(mx + 7, my + 7);
      ctx.moveTo(mx + 7, my - 7);
      ctx.lineTo(mx - 7, my + 7);
      ctx.stroke();
      ctx.setLineDash([3, 5]);
      ctx.lineDashOffset = reduced ? 0 : -t * 6;
      ctx.beginPath();
      ctx.arc(mx, my, 26 + (reduced ? 0 : Math.sin(t * 1.4) * 3), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "10px 'Fragment Mono', monospace";
      ctx.fillStyle = colors.accent;
      ctx.fillText("?  NO SURVEY", mx + 36, my + 4);
    };

    const start = performance.now();
    const loop = (now: number) => {
      const p = pointer.current;
      p.k += ((p.x > -1e3 ? 1 : 0) - p.k) * 0.06;
      draw((now - start) / 1000);
      raf = visible ? requestAnimationFrame(loop) : 0;
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.current.x = e.clientX - r.left;
      pointer.current.y = e.clientY - r.top;
    };
    const onLeave = () => {
      pointer.current.x = -1e4;
    };
    const onVisibility = () => {
      visible = !document.hidden;
      if (visible && !raf && !reduced) raf = requestAnimationFrame(loop);
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(0);
    });
    ro.observe(canvas);

    if (reduced) {
      draw(0);
    } else {
      raf = requestAnimationFrame(loop);
      window.addEventListener("pointermove", onMove);
      document.documentElement.addEventListener("pointerleave", onLeave);
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // The accent swap rewrites the CSS tokens, so the effect re-reads them.
  }, [survey, accent]);

  return (
    <section className="lost" aria-labelledby="lost-title">
      <canvas ref={canvasRef} className="lost__field" aria-hidden="true" />

      <div className="lost__sheet">
        <p className="font-pixel text-[10.5px] tracking-[0.08em] uppercase text-[var(--accent)]">
          ( 404 &mdash; OFF THE MAP )
        </p>

        <h1 id="lost-title" className="lost__code">
          4<span className="lost__zero">0</span>4
        </h1>

        <p className="lost__line">
          This sheet was never surveyed. The road you took runs out somewhere past the last contour.
        </p>

        <dl className="lost__readout">
          <div>
            <dt>Requested</dt>
            <dd className="lost__path">{pathname}</dd>
          </div>
          <div>
            <dt>Sheet</dt>
            <dd>{survey.sheet}</dd>
          </div>
          <div>
            <dt>Grid ref</dt>
            <dd>
              {survey.lat} · {survey.lon}
            </dd>
          </div>
          <div>
            <dt>Bearing</dt>
            <dd className="lost__bearing">
              <span className="lost__compass" aria-hidden="true">
                <i />
              </span>
              unknown
            </dd>
          </div>
        </dl>

        <nav className="lost__landmarks" aria-label="Known landmarks">
          <p className="lost__label">Known landmarks</p>
          <ul>
            {LANDMARKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className={`lost__link${l.to === survey.near.to ? " lost__link--near" : ""}`}>
                  <span className="lost__route">{l.to}</span>
                  <span className="lost__name">
                    {l.label}
                    {l.to === survey.near.to && <span className="lost__hint">nearest</span>}
                  </span>
                  <kbd className="lost__key">g {l.key}</kbd>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
};

export default NotFound;
