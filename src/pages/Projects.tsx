import { ArrowUpRight, GitBranch, Star } from "lucide-react";
import RepoPreview from "@/components/RepoPreview";
import { timeAgo, useShowcase, type ShowcaseRepo } from "@/lib/showcase";

const RepoMeta = ({ repo }: { repo: ShowcaseRepo }) => (
  <p className="repo-card__meta">
    <span className="repo-card__stars">
      <Star className="w-3.5 h-3.5" aria-hidden="true" />
      {repo.stars}
      <span className="sr-only"> stars</span>
    </span>
    {repo.language && <span>{repo.language}</span>}
    <span>pushed {timeAgo(repo.pushedAt)}</span>
    {repo.archived && <span className="repo-card__flag">archived</span>}
  </p>
);

const RepoLinks = ({ repo }: { repo: ShowcaseRepo }) => (
  <div className="repo-card__links">
    {repo.liveUrl && (
      <a href={repo.liveUrl} target="_blank" rel="noopener noreferrer" className="repo-card__link repo-card__link--live">
        Visit site
        <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
      </a>
    )}
    {repo.private ? (
      <span className="repo-card__link repo-card__link--muted">Private source</span>
    ) : (
      // With no site to visit, the source is the card's main link.
      <a
        href={repo.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`repo-card__link${repo.liveUrl ? "" : " repo-card__link--live"}`}
      >
        <GitBranch className="w-4 h-4" aria-hidden="true" />
        Source
      </a>
    )}
  </div>
);

type RepoCardProps = { repo: ShowcaseRepo; index: number; featured?: boolean; terminal: boolean };

const RepoCard = ({ repo, index, featured, terminal }: RepoCardProps) => (
  <article
    className={`repo-card${featured ? " repo-card--featured" : ""}`}
    style={{ animationDelay: `${index * 80}ms` }}
  >
    <div className="repo-card__preview">
      <RepoPreview repo={repo} terminal={terminal} />
    </div>

    <div className="repo-card__body">
      <p className="repo-card__index">{String(index + 1).padStart(2, "0")}</p>
      <h2 className="repo-card__title">{repo.name}</h2>
      <RepoMeta repo={repo} />
      {repo.description && <p className="repo-card__description">{repo.description}</p>}
      {repo.topics.length > 0 && (
        <ul className="repo-card__topics" aria-label="Topics">
          {repo.topics.slice(0, featured ? 8 : 4).map((topic) => (
            <li key={topic}>{topic}</li>
          ))}
        </ul>
      )}
      <RepoLinks repo={repo} />
    </div>
  </article>
);

const Projects = () => {
  const { data, isPending, error } = useShowcase();
  const [lead, ...rest] = data?.repos ?? [];

  return (
    <div className="page-shell page-shell--wide animate-fade-in">
      <div className="mb-10 sm:mb-14 pb-6 sm:pb-8 border-b border-[var(--border-muted)]">
        <h1 className="text-5xl md:text-7xl font-display text-foreground tracking-[-0.01em] leading-[0.85] uppercase mb-4">
          Software
        </h1>
        <p className="text-lg md:text-xl text-foreground max-w-2xl leading-relaxed">
          My projects, pulled from GitHub. Deployed projects link to the live site; the rest link to the source.
        </p>
        {data && (
          <p className="repo-index__stamp">
            <a href={`https://github.com/${data.user}`} target="_blank" rel="noopener noreferrer">
              github.com/{data.user}
            </a>
            <span aria-hidden="true">/</span>
            <span>synced {timeAgo(data.generatedAt)}</span>
          </p>
        )}
      </div>

      {isPending && (
        <div className="repo-grid" aria-busy="true" aria-label="Loading repositories">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={`repo-skeleton${i === 0 ? " repo-card--featured" : ""}`} />
          ))}
        </div>
      )}

      {error && (
        <div className="border border-dashed border-foreground/30 px-6 py-8 text-sm uppercase tracking-[0.2em] text-muted-foreground">
          Couldn't reach GitHub ({error.message}).{" "}
          <a href="https://github.com/kygura" className="underline text-foreground">
            Browse the repositories there
          </a>
          .
        </div>
      )}

      {lead && (
        <div className="repo-grid">
          <RepoCard repo={lead} index={0} featured terminal={Boolean(data?.terminal)} />
          {rest.map((repo, i) => (
            <RepoCard key={repo.fullName} repo={repo} index={i + 1} terminal={Boolean(data?.terminal)} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Projects;
