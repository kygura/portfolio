import {
  Download, MapPin, Mail, Globe, GitBranch
} from "lucide-react";

const CV = () => {

  const contact = {
    name: "Nicolás Cerrato Antón",
    headline: "Software Engineer · Agentic Systems · Markets",
    location: "Málaga, Spain",
    email: "ncerratoanton@gmail.com",
    website: "nca.ink",
    github: "github.com/kygura",
  };

  // The PDF carries the formal summary; here it is written as a short, plainer intro.
  const summary = "I build software where LLMs, markets, and on-chain systems meet, and care most about the boundary between what a model proposes and what a system is willing to execute. Trained in Computer Engineering across Spain and Germany; working day to day in TypeScript, Python, and Solidity.";

  const education = [
    {
      degree: "B.Sc. Computer Engineering",
      institution: "Universidad de Málaga",
      period: "2022 – 2024",
      description: "",
    },
    {
      degree: "B.Sc. Computer Engineering (First Cycle)",
      institution: "Albert-Ludwigs-Universität Freiburg",
      period: "2020 – 2022",
      description: "Coursework: Machine Learning, Smart Contracts, System Programming.",
    },
    {
      degree: "Abitur — Bilingual Diploma",
      institution: "Deutsche Schule Las Palmas",
      period: "2006 – 2018",
      description: "",
    }
  ];

  // Descriptions complement the PDF's bullet points rather than repeating them.
  const projects = [
    {
      title: "Agentic Systems",
      tech: "TypeScript · Bun · WebSocket · SQLite",
      description: "Orchestrators for running many LLM agents at once without losing track of what any of them did. The recurring question is how much autonomy to grant: agents propose, the runtime decides, and every step stays inspectable after the fact.",
    },
    {
      title: "AI Integration & LLM Tooling",
      tech: "OpenAI · Anthropic · FastAPI · Python",
      description: "Product features built on top of language models: writing assistants, semantic search, and tools that surface connections between notes. The focus is on making model output feel native to the interface, so suggestions can be reviewed, accepted, or discarded.",
    },
    {
      title: "Full-Stack Web Applications",
      tech: "React · Hono · Next.js · Tailwind",
      description: "End-to-end products, from data layer to interface, including trading cockpits, maps, and graph-based tools. Shared types across the stack keep client and server honest as the codebase grows.",
    },
    {
      title: "Blockchain & Protocol Design",
      tech: "Solidity · Smart Contracts",
      description: "Research and implementation of monetary primitives on-chain, in the algorithmic stablecoin space. Interested in mechanism design more than tokens: what a protocol should guarantee, and how it behaves when participants stop cooperating.",
    }
  ];

  const languages = [
    { name: "Spanish", proficiency: "Native" },
    { name: "German", proficiency: "Native / Bilingual" },
    { name: "English", proficiency: "C2 · Cambridge Certificate" },
  ];

  const skills = {
    "Languages": ["TypeScript", "Python", "Go", "C", "JavaScript", "Solidity"],
    "Backend": ["Hono", "FastAPI", "Node.js", "Express", "SQLite", "WebSocket"],
    "Frontend": ["React", "Next.js", "Tailwind", "React Flow", "MapLibre GL"],
    "AI / Agents": ["OpenAI API", "Anthropic API", "LLM Agents", "ReAct", "Embeddings"],
    "Blockchain": ["Solidity", "Smart Contracts", "Algo Stablecoins"],
    "Tools": ["Bun", "Git", "Docker", "Linux", "Bash", "Vercel"],
  };

  const downloadPDF = () => {
    // Create a link element and trigger download
    const link = document.createElement('a');
    link.href = '/CV_NCA.pdf';
    link.download = 'CV_NCA.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="px-6 md:px-12 lg:px-16 py-16 md:py-24 max-w-4xl animate-fade-in mx-auto">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-8">
        <div>
          <h1 className="text-5xl md:text-6xl font-display font-light tracking-[-0.01em] leading-[0.9] mb-4">
            Curriculum Vitae
          </h1>
          <p className="text-xl font-display mb-1">{contact.name}</p>
          <p className="font-pixel text-[10.5px] tracking-[0.08em] uppercase text-muted-foreground mb-6">
            {contact.headline}
          </p>
          <div className="text-lg text-muted-foreground space-y-2">
            <p className="flex items-center gap-2">
              <MapPin className="w-4 h-4" /> {contact.location}
            </p>
            <div className="flex flex-wrap gap-4 text-sm md:text-base">
              <a href={`mailto:${contact.email}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                <Mail className="w-4 h-4" /> {contact.email}
              </a>
              <a href={`https://${contact.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-primary transition-colors">
                <Globe className="w-4 h-4" /> {contact.website}
              </a>
              <a href={`https://${contact.github}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-primary transition-colors">
                <GitBranch className="w-4 h-4" /> {contact.github}
              </a>
            </div>
          </div>
        </div>
        <button
          onClick={downloadPDF}
          className="cv-download-btn mt-4 md:mt-0 self-start shrink-0"
        >
          <Download className="w-4 h-4" />
          Download PDF
        </button>
      </div>

      <section className="mb-12">
        <h2 className="text-2xl font-display font-light mb-4 text-foreground/90">About</h2>
        <p className="text-muted-foreground leading-relaxed">
          {summary}
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-3xl font-display font-light mb-8">Technical Projects</h2>
        <div className="space-y-8">
          {projects.map((project, index) => (
            <div key={index} className="border-l border-border pl-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                <h3 className="text-xl font-display">{project.title}</h3>
                <span className="text-sm px-2 py-0.5 border border-foreground/40 text-foreground bg-foreground/5 w-fit">
                  {project.tech}
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed">{project.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-3xl font-display font-light mb-8">Education</h2>
        <div className="space-y-8">
          {education.map((edu, index) => (
            <div key={index} className="border-l border-border pl-6">
              <h3 className="text-xl font-display mb-2">{edu.degree}</h3>
              <p className="text-muted-foreground mb-2">
                {edu.institution} • {edu.period}
              </p>
              {edu.description && <p className="text-muted-foreground italic text-sm">{edu.description}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-3xl font-display font-light mb-8">Technical Skills</h2>
        <div className="space-y-8">
          {Object.entries(skills).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-xl font-display mb-4">{category}</h3>
              <div className="flex flex-wrap gap-2">
                {items.map((skill) => (
                  <span
                    key={skill}
                    className="px-4 py-2 text-sm border border-foreground/40 text-foreground bg-foreground/5"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-3xl font-display font-light mb-8">Languages</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {languages.map((lang, index) => (
            <div key={index} className="border-l border-border pl-6">
              <h3 className="text-xl font-display mb-1">{lang.name}</h3>
              <p className="text-muted-foreground">{lang.proficiency}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default CV;
