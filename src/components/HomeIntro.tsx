import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/**
 * Home intro: the first thing under the hero. A short personal note drawn
 * from the essays (no stack, no credentials: those live on /cv), then the
 * three routes worth reading next.
 */

const ROUTES: { to: string; label: string; note: string }[] = [
  { to: "/projects", label: "Software", note: "what I've built" },
  { to: "/writings", label: "Writings", note: "what I think about" },
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
          I chose <em>surface area over depth</em>.
        </h2>

        <p className="intro__text">
          I was a fast kid who quit sprinting the moment training got dull. The pattern stuck: go wide, move on, keep
          the options open. It's why I can live anywhere and work across too many fields. It has also cost me every
          future I didn't commit to.
        </p>

        <p className="intro__text">
          Most of what I write circles one idea: anything built to set people free becomes the next thing they need
          freeing from. I build software anyway, knowing mine will go the same way. Lately I'm trying to chase less
          and look around more.
        </p>

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
