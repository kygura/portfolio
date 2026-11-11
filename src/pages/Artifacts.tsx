import { Link } from "react-router-dom";

/** The gallery: small working objects that live on the site. */
const ITEMS = [
  {
    to: "/artifacts/commons",
    name: "Commons",
    blurb: "A shared pixel board. Anyone passing through can paint on it, a few pixels at a time.",
    kind: "Live · multiplayer",
  },
];

const Artifacts = () => {
  return (
    <div className="page-shell page-shell--mid">
      <div className="prose-minimal animate-fade-in">
        <h1>Artifacts</h1>
        <p className="text-xl text-muted-foreground mb-12">
          A collection of digital objects and experiments.
        </p>
      </div>

      <ul className="artifact-list animate-fade-in">
        {ITEMS.map((item) => (
          <li key={item.to}>
            <Link to={item.to} className="artifact-card">
              <span className="artifact-card__kind">{item.kind}</span>
              <span className="artifact-card__name">{item.name}</span>
              <span className="artifact-card__blurb">{item.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Artifacts;
