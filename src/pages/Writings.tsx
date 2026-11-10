import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import PageHead from "../components/PageHead";
import { useMarkdownPosts } from "../hooks/useMarkdownPosts";
import type { PostSummary } from "../../content/posts";

const MAX_TICKS = 12;

const pad = (n: number) => String(n).padStart(2, "0");

const parseDate = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const dayLabel = (date: Date | null) =>
  date ? `${pad(date.getUTCDate())} ${date.toLocaleString("en", { month: "short", timeZone: "UTC" })}` : "—";

const monthLabel = (date: Date | null) =>
  date ? date.toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" }) : "Undated";

// Posts arrive newest first; consecutive posts from the same month share a group.
const groupByMonth = (posts: PostSummary[]) =>
  posts.reduce<{ label: string; posts: PostSummary[] }[]>((groups, post) => {
    const label = monthLabel(parseDate(post.date));
    const last = groups[groups.length - 1];
    if (last?.label === label) last.posts.push(post);
    else groups.push({ label, posts: [post] });
    return groups;
  }, []);

const Writings = () => {
  const { posts, loading, error } = useMarkdownPosts();

  // Entry numbers count up from the oldest post.
  const entryNumber = new Map(posts.map((post, i) => [post.slug, posts.length - i]));
  const totalMinutes = posts.reduce((sum, post) => sum + post.readTime, 0);

  let row = 0;

  return (
    <div className="page-shell page-shell--wide animate-fade-in">
      <PageHead no="01" label="Writings" title="Writings" lede="Thoughts on the arts, engineering, the esoteric and the existential.">
        {posts.length > 0 && (
          <p className="page-head__facts">
            <span>{pad(posts.length)} entries</span>
            <span>{totalMinutes} min of reading</span>
          </p>
        )}
      </PageHead>

      {loading && (
        <div className="notice">
          Loading writings...
        </div>
      )}

      {error && !loading && (
        <div className="notice notice--error">
          {error}
        </div>
      )}

      <div className="ledger">
        {groupByMonth(posts).map((group) => (
          <section key={group.label} className="ledger__group">
            <h2 className="ledger__month">
              <span>{group.label}</span>
            </h2>

            {group.posts.map((post) => {
              const ticks = Math.min(post.readTime, MAX_TICKS);
              return (
                <article key={post.slug} className="ledger__row" style={{ animationDelay: `${row++ * 60}ms` }}>
                  <Link to={`/writings/${post.slug}`} className="ledger__link">
                    <span className="ledger__num">№{pad(entryNumber.get(post.slug) ?? 0)}</span>

                    <div className="ledger__body">
                      <h3 className="ledger__title">{post.title}</h3>
                      {post.excerpt && <p className="ledger__excerpt">{post.excerpt}</p>}
                    </div>

                    <div className="ledger__meta">
                      <time dateTime={post.date}>{dayLabel(parseDate(post.date))}</time>
                      <span className="ledger__ticks" aria-label={`${post.readTime} minute read`}>
                        {Array.from({ length: ticks }, (_, i) => (
                          <i key={i} style={{ transitionDelay: `${i * 25}ms` }} />
                        ))}
                        <span>{post.readTime}′</span>
                      </span>
                    </div>

                    <ArrowRight className="ledger__arrow" aria-hidden="true" />
                  </Link>
                </article>
              );
            })}
          </section>
        ))}

        {!loading && !error && posts.length === 0 && (
          <div className="notice">
            No writings found.
          </div>
        )}
      </div>
    </div>
  );
};

export default Writings;
