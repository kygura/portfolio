import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/**
 * Home intro: the first thing under the hero. One plain line on what the
 * site holds (stack and credentials live on /cv), then the three routes.
 */

const ROUTES: { to: string; label: string; note: string }[] = [
  { to: "/projects", label: "Software", note: "projects" },
  { to: "/writings", label: "Writings", note: "essays" },
  { to: "/cv", label: "CV", note: "the formal version" },
];

const HomeIntro = () => (
  <section className="intro" aria-labelledby="intro-title">
    <div className="intro__inner">
      <p className="intro__eyebrow" aria-hidden="true">
        ( 00 — INTRO )
      </p>

      <div className="intro__body">
        <h2 id="intro-title" className="intro__lead">
          Things I build and <em>things I think about</em>.
        </h2>

        <p className="intro__text">That's all this site is. Start with whichever you came for.</p>

        <nav className="intro__routes" aria-label="Start here">
          {ROUTES.map((r) => (
            <Link key={r.to} to={r.to} className="intro__route">
              <span className="intro__route-label">{r.label}</span>
              <span className="intro__route-note">{r.note}</span>
              <ArrowRight className="intro__route-arrow" size={14} aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </div>
    </div>
  </section>
);

export default HomeIntro;
