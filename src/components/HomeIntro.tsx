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
          I build agentic systems, market tooling and <em>small tools for the open web</em>.
        </h2>

        <p className="intro__text">
          Most of my work sits where language models meet systems that act on what they say: trading desks, many
          agents running side by side. The part I care about is the line between what a model proposes and what a
          system is willing to execute.
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
