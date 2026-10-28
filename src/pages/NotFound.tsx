import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { CHORDS } from "@/theme/keymap";

/**
 * 404 — the requested path and the known routes, with the one closest to
 * what was typed (edit distance on the first segment) marked "nearest".
 */

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

const ROUTES = Object.entries(CHORDS).map(([key, { to, label }]) => ({ key, to, label }));

const nearest = (path: string) => {
  const head = "/" + (path.toLowerCase().split("/").filter(Boolean)[0] ?? "");
  return ROUTES.reduce((best, r) => (distance(head, r.to) < distance(head, best.to) ? r : best)).to;
};

const NotFound = () => {
  const { pathname } = useLocation();
  const near = nearest(pathname);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", pathname);
  }, [pathname]);

  return (
    <section className="lost" aria-labelledby="lost-title">
      <p className="font-pixel text-[10.5px] tracking-[0.08em] uppercase text-[var(--accent)]">
        ( 404 &mdash; OFF THE MAP )
      </p>

      <h1 id="lost-title" className="lost__code">
        404
      </h1>

      <p className="lost__line">
        Nothing at <span className="lost__path">{pathname}</span>. Try one of these.
      </p>

      <nav aria-label="Pages">
        <ul className="lost__routes">
          {ROUTES.map((r) => (
            <li key={r.to}>
              <Link to={r.to} className={`lost__link${r.to === near ? " lost__link--near" : ""}`}>
                <span className="lost__route">{r.to}</span>
                <span>
                  {r.label}
                  {r.to === near && <span className="lost__hint">nearest</span>}
                </span>
                <kbd className="lost__key">g {r.key}</kbd>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
};

export default NotFound;
