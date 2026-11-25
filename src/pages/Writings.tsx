import * as Dialog from "@radix-ui/react-dialog";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, X } from "lucide-react";
import PageHead from "../components/PageHead";
import MeaningMap from "../components/MeaningMap";
import { useMarkdownPosts } from "../hooks/useMarkdownPosts";
import { useIsMobile } from "../hooks/use-mobile";

// The map opens over the page at /writings#map, so Back closes it and the link can be shared.
const MAP_HASH = "#map";

const MAX_TICKS = 12;

const pad = (n: number) => String(n).padStart(2, "0");


const Writings = () => {
  const { posts, clusters, loading, error } = useMarkdownPosts();
  const bySlug = new Map(posts.map((post) => [post.slug, post]));
  const totalMinutes = posts.reduce((sum, post) => sum + post.readTime, 0);

  const location = useLocation();
  const navigate = useNavigate();
  const mapOpen = location.hash === MAP_HASH;
  const openMap = () => navigate({ hash: MAP_HASH });
  const closeMap = () => {
    // Opened from this page: step back. Arrived on the link: drop the hash.
    if (location.key !== "default") navigate(-1);
    else navigate({ hash: "" }, { replace: true });
  };
  // Phones get the list only: the map needs more room than a phone has.
  const isMobile = useIsMobile();
  const linked = !isMobile && posts.some((post) => post.topics.length > 0 || post.tags.length > 0);

  let row = 0;

  return (
    <div className="page-shell page-shell--wide animate-fade-in">
      <PageHead no="01" label="Writings" title="Writings" lede="Thoughts on the arts, engineering, the esoteric and the existential.">
        {posts.length > 0 && (
          <p className="page-head__facts">
            <span>{pad(posts.length)} entries</span>
            {clusters.length > 0 && <span>{pad(clusters.length)} clusters</span>}
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

      {clusters.length > 0 && (
        <div className="ledger__bar">
          <p className="ledger__note">
            Clusters and topics are assigned by a language model. Keywords set on an essay in Notion count as topics too. The essays are written by the author.
          </p>
          {linked && (
            <div className="ledger__views">
              <button type="button" aria-haspopup="dialog" onClick={openMap}>Open map</button>
            </div>
          )}
        </div>
      )}

      {linked && (
        <Dialog.Root open={mapOpen} onOpenChange={(open) => (open ? openMap() : closeMap())}>
          <Dialog.Portal>
            <Dialog.Content
              className="mmap-dialog"
              aria-describedby={undefined}
              // Focus the dialog itself, not the close button, so nothing is ringed on open.
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                (event.currentTarget as HTMLElement).focus();
              }}
            >
              <MeaningMap
                posts={posts}
                clusters={clusters}
                header={
                  <div className="mmap__head">
                    <Dialog.Title className="mmap__heading">Map of the writings</Dialog.Title>
                    <Dialog.Close className="mmap__close" aria-label="Close the map">
                      <X aria-hidden="true" />
                      <kbd>Esc</kbd>
                    </Dialog.Close>
                  </div>
                }
              />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      <div className="ledger">
        {clusters.map((cluster) => {
          const entries = cluster.slugs.flatMap((slug) => bySlug.get(slug) ?? []);
          const minutes = entries.reduce((sum, post) => sum + post.readTime, 0);
          return (
            <section key={cluster.id} className="ledger__group" aria-labelledby={`cluster-${cluster.id}`}>
              <header className="ledger__cluster">
                <h2 id={`cluster-${cluster.id}`} className="ledger__cluster-name">
                  <span className="ledger__cluster-numeral">{cluster.numeral}</span>
                  <span>{cluster.name}</span>
                </h2>
                <p className="ledger__cluster-facts">
                  {entries.length} {entries.length === 1 ? "essay" : "essays"} · {minutes} min
                </p>
                {cluster.thesis && <p className="ledger__cluster-thesis">{cluster.thesis}</p>}
              </header>

              {entries.map((post) => {
                const ticks = Math.min(post.readTime, MAX_TICKS);
                return (
                  <article key={post.slug} className="ledger__row" style={{ animationDelay: `${row++ * 60}ms` }}>
                    <Link to={`/writings/${post.slug}`} className="ledger__link">
                      <div className="ledger__body">
                        {post.slug === cluster.index && <p className="ledger__index">Index of the cluster</p>}
                        <h3 className="ledger__title">{post.title}</h3>
                        {post.excerpt && <p className="ledger__excerpt">{post.excerpt}</p>}
                      </div>

                      <div className="ledger__meta">
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
          );
        })}

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
