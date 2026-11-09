import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useMarkdownPosts } from "../hooks/useMarkdownPosts";

/**
 * Home intro: the first thing under the hero. One plain line on what the
 * site holds (stack and credentials live on /cv), the three routes, then
 * the newest writings so the page has something to read on it.
 */

const ROUTES: { to: string; label: string; note: string }[] = [
  { to: "/projects", label: "Software", note: "projects" },
  { to: "/writings", label: "Writings", note: "essays" },
  { to: "/cv", label: "CV", note: "the formal version" },
];

const LATEST = 4;

const dayLabel = (value: string) => {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${String(d.getUTCDate()).padStart(2, "0")} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
};

const HomeIntro = () => {
  const { posts } = useMarkdownPosts();
  const latest = posts.slice(0, LATEST);

  return (
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

      {latest.length > 0 && (
        <div className="intro__inner intro__inner--latest">
          <p className="intro__eyebrow" aria-hidden="true">
            ( 01 — LATEST )
          </p>

          <div className="intro__body">
            <h2 className="sr-only">Latest writings</h2>
            <ol className="latest">
              {latest.map((post) => (
                <li key={post.slug}>
                  <Link to={`/writings/${post.slug}`} className="latest__row">
                    <time dateTime={post.date}>{dayLabel(post.date)}</time>
                    <span className="latest__title">{post.title}</span>
                    <span className="latest__read">{post.readTime}′</span>
                  </Link>
                </li>
              ))}
            </ol>
            <Link to="/writings" className="latest__all">
              All {posts.length} writings <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
};

export default HomeIntro;
