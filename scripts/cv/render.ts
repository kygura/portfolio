/**
 * Static renderings of the CV for clients that don't run JavaScript:
 * plain semantic HTML (injected into the built index.html) and markdown.
 */
import type { Cv } from "../../content/cv.ts";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function cvDescription(cv: Cv): string {
  return `CV of ${cv.contact.name}: ${cv.contact.headline}. ${cv.contact.location}.`;
}

export function renderCvMarkdown(cv: Cv, origin = ""): string {
  const { contact } = cv;
  const lines = [
    `# ${contact.name}: Curriculum Vitae`,
    "",
    `**${contact.headline}**`,
    "",
    `- Location: ${contact.location}`,
    `- Email: <${contact.email}>`,
    `- Website: <https://${contact.website}>`,
    `- GitHub: <https://${contact.github}>`,
    `- PDF: <${origin}${cv.pdf}>`,
    "",
    "## About",
    "",
    cv.summary,
    "",
    "## Technical Projects",
    "",
  ];
  for (const project of cv.projects) {
    lines.push(`### ${project.title}`, "", `*${project.tech}*`, "", project.description, "");
  }
  lines.push("## Education", "");
  for (const edu of cv.education) {
    lines.push(`### ${edu.degree}`, "", `${edu.institution} · ${edu.period}`, "");
    if (edu.description) lines.push(edu.description, "");
  }
  lines.push("## Technical Skills", "");
  for (const [category, items] of Object.entries(cv.skills)) {
    lines.push(`- **${category}:** ${items.join(", ")}`);
  }
  lines.push("", "## Languages", "");
  for (const lang of cv.languages) {
    lines.push(`- **${lang.name}:** ${lang.proficiency}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderCvHtml(cv: Cv): string {
  const e = escapeHtml;
  const { contact } = cv;
  const out: string[] = [
    `<article id="cv-static" itemscope itemtype="https://schema.org/Person">`,
    `<header>`,
    `<h1>Curriculum Vitae</h1>`,
    `<p><strong itemprop="name">${e(contact.name)}</strong></p>`,
    `<p itemprop="jobTitle">${e(contact.headline)}</p>`,
    `<ul>`,
    `<li>Location: <span itemprop="address">${e(contact.location)}</span></li>`,
    `<li>Email: <a href="mailto:${e(contact.email)}" itemprop="email">${e(contact.email)}</a></li>`,
    `<li>Website: <a href="https://${e(contact.website)}" itemprop="url">${e(contact.website)}</a></li>`,
    `<li>GitHub: <a href="https://${e(contact.github)}" itemprop="sameAs">${e(contact.github)}</a></li>`,
    `<li><a href="${e(cv.pdf)}">Download PDF</a> · <a href="/cv.md">Markdown</a></li>`,
    `</ul>`,
    `</header>`,
    `<section><h2>About</h2><p itemprop="description">${e(cv.summary)}</p></section>`,
    `<section><h2>Technical Projects</h2>`,
  ];
  for (const project of cv.projects) {
    out.push(
      `<h3>${e(project.title)}</h3>`,
      `<p><em>${e(project.tech)}</em></p>`,
      `<p>${e(project.description)}</p>`,
    );
  }
  out.push(`</section>`, `<section><h2>Education</h2>`);
  for (const edu of cv.education) {
    out.push(`<h3>${e(edu.degree)}</h3>`, `<p>${e(edu.institution)} · ${e(edu.period)}</p>`);
    if (edu.description) out.push(`<p>${e(edu.description)}</p>`);
  }
  out.push(`</section>`, `<section><h2>Technical Skills</h2><dl>`);
  for (const [category, items] of Object.entries(cv.skills)) {
    out.push(`<dt>${e(category)}</dt><dd>${items.map(e).join(", ")}</dd>`);
  }
  out.push(`</dl></section>`, `<section><h2>Languages</h2><dl>`);
  for (const lang of cv.languages) {
    out.push(`<dt>${e(lang.name)}</dt><dd>${e(lang.proficiency)}</dd>`);
  }
  out.push(`</dl></section>`, `</article>`);
  return out.join("\n");
}

/**
 * Turns the built SPA shell into a /cv page whose #root already holds the CV.
 * React's createRoot replaces that markup on mount, so browsers still get the
 * interactive page while crawlers and agents read the content directly.
 */
export function injectCvIntoShell(shell: string, cv: Cv, origin = ""): string {
  const title = `${cv.contact.name} | Curriculum Vitae`;
  const description = cvDescription(cv);
  const head = [
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${origin}/cv" />`,
    `<link rel="alternate" type="text/markdown" href="${origin}/cv.md" title="CV (markdown)" />`,
    `<style>#cv-static{max-width:48rem;margin:0 auto;padding:4rem 1.5rem;line-height:1.6}</style>`,
  ].join("\n    ");

  const replaced = shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /(<meta property="og:title" content=")[^"]*(")/,
      `$1${escapeHtml(title)}$2`,
    )
    .replace(
      /(<meta property="og:description" content=")[^"]*(")/,
      `$1${escapeHtml(description)}$2`,
    )
    .replace("</head>", `    ${head}\n  </head>`)
    .replace(/<div id="root"><\/div>/, `<div id="root">\n${renderCvHtml(cv)}\n</div>`);

  if (!replaced.includes('id="cv-static"')) {
    throw new Error('index.html has no empty <div id="root"></div> to fill');
  }
  return replaced;
}
