/**
 * What the visitor can see right now, as plain text for Wick to read: the
 * headings, paragraphs, list items and labels that intersect the viewport,
 * top to bottom. The nav, the footer and the fixed widgets are left out, so
 * he reads the page and not the chrome around it.
 */

export interface PageView {
  path: string;
  title: string;
  heading: string;
  text: string;
}

const TEXT = "h1, h2, h3, h4, p, li, blockquote, figcaption, dt, dd, pre, td";
const CHROME = "nav, footer:not(.hero__strip), .deck, .wick, [aria-hidden='true'], script, style, noscript";
const MAX_CHARS = 2800;

const inView = (r: DOMRect) => r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && r.height > 0;

export function readPage(): PageView {
  const seen = new Set<Element>();
  const parts: string[] = [];
  let length = 0;

  // Pressed toggles carry state the text doesn't: the hero scene, the theme.
  for (const el of document.querySelectorAll<HTMLElement>("[aria-pressed='true'][aria-label]")) {
    if (el.closest(".wick")) continue;
    parts.push(`[${el.getAttribute("aria-label")}]`);
  }

  for (const el of document.querySelectorAll<HTMLElement>(TEXT)) {
    if (length > MAX_CHARS) break;
    if (el.closest(CHROME)) continue;
    // A <p> inside an <li> is read with the <li>.
    const outer = el.parentElement?.closest(TEXT);
    if (outer && seen.has(outer)) continue;
    if (!inView(el.getBoundingClientRect())) continue;
    const text = el.innerText.replace(/\s+/g, " ").trim();
    if (!text) continue;
    seen.add(el);
    const line = /^H\d$/.test(el.tagName) ? `# ${text}` : text;
    parts.push(line);
    length += line.length;
  }

  return {
    path: window.location.pathname,
    title: document.title,
    heading: currentHeading(),
    text: parts.join("\n").slice(0, MAX_CHARS),
  };
}

/** The last heading whose top has passed the upper third of the screen. */
function currentHeading(): string {
  let best = "";
  const line = window.innerHeight / 3;
  for (const el of document.querySelectorAll<HTMLElement>("h1, h2, h3")) {
    if (el.closest(CHROME)) continue;
    const r = el.getBoundingClientRect();
    if (r.height === 0) continue;
    if (r.top <= line) best = el.innerText.trim();
    else {
      if (!best && r.top < window.innerHeight) best = el.innerText.trim();
      break;
    }
  }
  return best.slice(0, 200);
}
