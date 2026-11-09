import type { ReactNode } from "react";
import { ArrowDown } from "lucide-react";

import { cv } from "../../content/cv";

/**
 * CV as a survey sheet: the same header as the other index pages, then
 * numbered sections on a label column, with hairlines instead of chips.
 */

const Section = ({ n, label, children }: { n: number; label: string; children: ReactNode }) => (
  <section className="sheet__section" aria-labelledby={`cv-${n}`}>
    <h2 id={`cv-${n}`} className="sheet__label">
      <span aria-hidden="true">( {String(n).padStart(2, "0")} — </span>
      {label}
      <span aria-hidden="true"> )</span>
    </h2>
    <div className="sheet__content">{children}</div>
  </section>
);

const CV = () => {
  const { contact, summary, education, projects, languages, skills } = cv;

  return (
    <div className="page-shell page-shell--wide animate-fade-in">
      <div className="mb-10 sm:mb-14 pb-6 sm:pb-8 border-b border-[var(--border-muted)]">
        <h1 className="text-5xl md:text-7xl font-display text-foreground tracking-[-0.01em] leading-[0.85] uppercase mb-4">
          Curriculum Vitae
        </h1>
        <p className="text-lg md:text-xl text-foreground max-w-2xl leading-relaxed">
          {contact.name}. {contact.headline}.
        </p>
        <p className="sheet__stamp">
          <span>{contact.location}</span>
          <a href={`mailto:${contact.email}`}>{contact.email}</a>
          <a href={`https://${contact.website}`} target="_blank" rel="noopener noreferrer">
            {contact.website}
          </a>
          <a href={`https://${contact.github}`} target="_blank" rel="noopener noreferrer">
            {contact.github}
          </a>
          <a href={cv.pdf} download="CV_NCA.pdf" className="sheet__pdf">
            PDF <ArrowDown size={12} aria-hidden="true" />
          </a>
        </p>
      </div>

      <div className="sheet">
        <Section n={1} label="About">
          <p className="sheet__lead">{summary}</p>
        </Section>

        <Section n={2} label="Work">
          {projects.map((project) => (
            <article key={project.title} className="sheet__entry">
              <h3 className="sheet__title">{project.title}</h3>
              <p className="sheet__tech">{project.tech}</p>
              <p className="sheet__text">{project.description}</p>
            </article>
          ))}
        </Section>

        <Section n={3} label="Education">
          {education.map((edu) => (
            <article key={edu.degree} className="sheet__entry sheet__entry--dated">
              <div>
                <h3 className="sheet__title">{edu.degree}</h3>
                <p className="sheet__text">{edu.institution}</p>
                {edu.description && <p className="sheet__note">{edu.description}</p>}
              </div>
              <p className="sheet__period">{edu.period}</p>
            </article>
          ))}
        </Section>

        <Section n={4} label="Skills">
          <dl className="sheet__list">
            {Object.entries(skills).map(([category, items]) => (
              <div key={category}>
                <dt>{category}</dt>
                <dd>{items.join(" · ")}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section n={5} label="Languages">
          <dl className="sheet__list">
            {languages.map((lang) => (
              <div key={lang.name}>
                <dt>{lang.name}</dt>
                <dd>{lang.proficiency}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
    </div>
  );
};

export default CV;
