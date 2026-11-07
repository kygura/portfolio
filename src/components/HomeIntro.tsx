import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cv } from "../../content/cv";

/**
 * Home intro: the first thing under the hero. A short first-person note on
 * who builds the site and what the work is about, a ledger of plain facts,
 * and the three routes worth reading next.
 */

const FACTS: { label: string; value: string }[] = [
  { label: "Based", value: cv.contact.location },
  { label: "Works in", value: "TypeScript · Python · Solidity" },
  { label: "Trained", value: "Computer Engineering, Spain & Germany" },
];

const ROUTES: { to: string; label: string; note: string }[] = [
  { to: "/projects", label: "Software", note: "code" },
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
          I'm Nicolás. I build software where the model suggests and <em>the system decides</em>.
        </h2>

        <p className="intro__text">
          Agent orchestrators, trading tools, some stablecoin research. Getting a model to answer is easy. Deciding
          what it's allowed to run, and keeping a log you can still read a month later, is the work.
        </p>

        <dl className="intro__facts">
          {FACTS.map((f) => (
            <div key={f.label} className="intro__fact">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>

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
