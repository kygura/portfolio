import { Link } from "react-router-dom";
import { ArrowUpRight, GitBranch, MessageSquare, Star } from "lucide-react";
import RepoPreview from "@/components/RepoPreview";
import { timeAgo, useShowcase, type ShowcaseRepo } from "@/lib/showcase";
import PageHead from "../components/PageHead";

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
    {repo.preview.kind === "map" && !repo.private && (
      <Link to={`/projects/${repo.name}`} className="repo-card__link repo-card__link--live">
        <MessageSquare className="w-4 h-4" aria-hidden="true" />
        Talk to the codebase
      </Link>
    )}
    {repo.liveUrl && (
      <a href={repo.liveUrl} target="_blank" rel="noopener noreferrer" className="repo-card__link repo-card__link--live">
        Visit site
        <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
      </a>
    )}
    {repo.private ? (
      <span className="repo-card__link repo-card__link--muted">Private source</span>
    ) : (
      <a
        href={repo.url}
        target="_blank"
        rel="noopener noreferrer"
        className="repo-card__link"
      >
        <GitBranch className="w-4 h-4" aria-hidden="true" />
        Source
      </a>
    )}
  </div>
);

type RepoCardProps = { repo: ShowcaseRepo; index: number; featured?: boolean };

const RepoCard = ({ repo, index, featured }: RepoCardProps) => (
  <article
    id={`repo-${repo.name}`}
    className={`repo-card${featured ? " repo-card--featured" : ""}`}
    style={{ animationDelay: `${index * 80}ms` }}
  >
    <div className="repo-card__preview">
      <RepoPreview repo={repo} />
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
      <PageHead
        no="02"
        label="Software"
        title="Software"
        lede="My projects, pulled from GitHub. Deployed ones link to the live site; the rest open onto their source, which you can browse and ask questions about."
      >
        {data && (
          <p className="page-head__facts">
            <a href={`https://github.com/${data.user}`} target="_blank" rel="noopener noreferrer">
              github.com/{data.user}
            </a>
            <span>synced {timeAgo(data.generatedAt)}</span>
          </p>
        )}
      </PageHead>

      {isPending && (
        <div className="repo-grid" aria-busy="true" aria-label="Loading repositories">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={`repo-skeleton${i === 0 ? " repo-card--featured" : ""}`} />
          ))}
        </div>
      )}

      {error && (
        <div className="notice">
          Couldn't reach GitHub ({error.message}).{" "}
          <a href="https://github.com/kygura">
            Browse the repositories there
          </a>
          .
        </div>
      )}

      {lead && (
        <div className="repo-grid">
          <RepoCard repo={lead} index={0} featured />
          {rest.map((repo, i) => (
            <RepoCard key={repo.fullName} repo={repo} index={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Projects;
