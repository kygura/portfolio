import type { ReactNode } from "react";
import { Download } from "lucide-react";
import PageHead from "../components/PageHead";
import { cv } from "../../content/cv";

/**
 * CV as a ledger: each section is a row with its label in a left margin
 * column and its content beside it, on the same measure as the other index
 * pages. Skills are set as plain lines of text, not a wall of chips.
 */

const Section = ({ no, label, children }: { no: string; label: string; children: ReactNode }) => (
  <section className="cv-sec" aria-labelledby={`cv-${no}`}>
    <h2 id={`cv-${no}`} className="cv-sec__label">
      <i aria-hidden="true">{no}</i>
      {label}
    </h2>
    <div className="cv-sec__body">{children}</div>
  </section>
);

const CV = () => {
  const { contact, summary, education, projects, languages, skills } = cv;

  return (
    <div className="page-shell page-shell--wide animate-fade-in">
      <PageHead
        no="04"
        label="CV"
        title="Curriculum Vitae"
        lede={
          <>
            {contact.name}. <span className="cv-headline">{contact.headline}</span>
          </>
        }
      >
        <div className="cv-contact">
          <p className="page-head__facts">
            <span>{contact.location}</span>
            <a href={`mailto:${contact.email}`}>{contact.email}</a>
            <a href={`https://${contact.website}`} target="_blank" rel="noopener noreferrer">
              {contact.website}
            </a>
            <a href={`https://${contact.github}`} target="_blank" rel="noopener noreferrer">
              {contact.github}
            </a>
          </p>
          <a href={cv.pdf} download="CV_NCA.pdf" className="cv-download-btn">
            <Download size={14} aria-hidden="true" />
            Download PDF
          </a>
        </div>
      </PageHead>

      <Section no="01" label="About">
        <p className="cv-summary">{summary}</p>
      </Section>

      <Section no="02" label="Projects">
        {projects.map((project) => (
          <article key={project.title} className="cv-item">
            <h3 className="cv-item__title">{project.title}</h3>
            <p className="cv-item__meta">{project.tech}</p>
            <p className="cv-item__text">{project.description}</p>
          </article>
        ))}
      </Section>

      <Section no="03" label="Education">
        {education.map((edu) => (
          <article key={edu.degree} className="cv-item cv-item--dated">
            <h3 className="cv-item__title">{edu.degree}</h3>
            <p className="cv-item__when">{edu.period}</p>
            <p className="cv-item__text">{edu.institution}</p>
            {edu.description && <p className="cv-item__aside">{edu.description}</p>}
          </article>
        ))}
      </Section>

      <Section no="04" label="Skills">
        <dl className="cv-skills">
          {Object.entries(skills).map(([category, items]) => (
            <div key={category}>
              <dt>{category}</dt>
              <dd>
                {items.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section no="05" label="Languages">
        <dl className="cv-langs">
          {languages.map((lang) => (
            <div key={lang.name}>
              <dt>{lang.name}</dt>
              <dd>{lang.proficiency}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
};

export default CV;
