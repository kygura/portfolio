/**
 * CV content, shared by the /cv React page and scripts/build-cv.ts, which
 * renders it to static HTML and markdown so agents can read the CV without
 * running the app's JavaScript.
 */

export interface CvEducation {
  degree: string;
  institution: string;
  period: string;
  description: string;
}

export interface CvProject {
  title: string;
  tech: string;
  description: string;
}

export interface CvLanguage {
  name: string;
  proficiency: string;
}

export interface Cv {
  contact: {
    name: string;
    headline: string;
    location: string;
    email: string;
    website: string;
    github: string;
  };
  summary: string;
  projects: CvProject[];
  education: CvEducation[];
  skills: Record<string, string[]>;
  languages: CvLanguage[];
  pdf: string;
}

export const cv: Cv = {
  contact: {
    name: "Nicolás Cerrato Antón",
    headline: "Software Engineer · Agentic Systems · Markets",
    location: "Málaga, Spain",
    email: "ncerratoanton@gmail.com",
    website: "nca.ink",
    github: "github.com/kygura",
  },

  // The PDF carries the formal summary; here it is written as a short, plainer intro.
  summary:
    "I build software where LLMs, markets, and on-chain systems meet, and care most about the boundary between what a model proposes and what a system is willing to execute. Trained in Computer Engineering across Spain and Germany; working day to day in TypeScript, Python, and Solidity.",

  // Descriptions complement the PDF's bullet points rather than repeating them.
  projects: [
    {
      title: "Agentic Systems",
      tech: "TypeScript · Bun · WebSocket · SQLite",
      description:
        "Orchestrators for running many LLM agents at once without losing track of what any of them did. The recurring question is how much autonomy to grant: agents propose, the runtime decides, and every step stays inspectable after the fact.",
    },
    {
      title: "AI Integration & LLM Tooling",
      tech: "OpenAI · Anthropic · FastAPI · Python",
      description:
        "Product features built on top of language models: writing assistants, semantic search, and tools that surface connections between notes. The focus is on making model output feel native to the interface, so suggestions can be reviewed, accepted, or discarded.",
    },
    {
      title: "Full-Stack Web Applications",
      tech: "React · Hono · Next.js · Tailwind",
      description:
        "End-to-end products, from data layer to interface, including trading cockpits, maps, and graph-based tools. Shared types across the stack keep client and server honest as the codebase grows.",
    },
    {
      title: "Blockchain & Protocol Design",
      tech: "Solidity · Smart Contracts",
      description:
        "Research and implementation of monetary primitives on-chain, in the algorithmic stablecoin space. Interested in mechanism design more than tokens: what a protocol should guarantee, and how it behaves when participants stop cooperating.",
    },
  ],

  education: [
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
      degree: "Abitur (Bilingual Diploma)",
      institution: "Deutsche Schule Las Palmas",
      period: "2006 – 2018",
      description: "",
    },
  ],

  skills: {
    Languages: ["TypeScript", "Python", "Go", "C", "JavaScript", "Solidity"],
    Backend: ["Hono", "FastAPI", "Node.js", "Express", "SQLite", "WebSocket"],
    Frontend: ["React", "Next.js", "Tailwind", "React Flow", "MapLibre GL"],
    "AI / Agents": ["OpenAI API", "Anthropic API", "LLM Agents", "ReAct", "Embeddings"],
    Blockchain: ["Solidity", "Smart Contracts", "Algo Stablecoins"],
    Tools: ["Bun", "Git", "Docker", "Linux", "Bash", "Vercel"],
  },

  languages: [
    { name: "Spanish", proficiency: "Native" },
    { name: "German", proficiency: "Native / Bilingual" },
    { name: "English", proficiency: "C2 · Cambridge Certificate" },
  ],

  pdf: "/CV_NCA.pdf",
};
