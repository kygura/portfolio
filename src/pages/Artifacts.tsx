import { Link } from "react-router-dom";


const Artifacts = () => {
  return (
    <div className="page-shell page-shell--mid">
      <div className="prose-minimal animate-fade-in">
        <h1>Artifacts</h1>
        <p className="text-xl text-muted-foreground mb-12">
          A collection of digital objects and experiments.
        </p>

        <Link to="/plot" className="artifact-card not-prose">
          <span className="artifact-card__no">01</span>
          <span className="artifact-card__body">
            <span className="artifact-card__title">Plot</span>
            <span className="artifact-card__text">
              One shared 256 × 256 sheet. Anyone can mark one cell every five seconds.
            </span>
          </span>
          <span className="artifact-card__go" aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
};

export default Artifacts;
