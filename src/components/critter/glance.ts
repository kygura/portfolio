/**
 * What Mote can see: the route, the title, the heading nearest the top of the
 * viewport and the text on screen right now. Read from the DOM on demand, so
 * it works on every page without the pages knowing about it.
 */

export interface Sight {
  path: string;
  title: string;
  section: string;
  text: string;
}

/** Elements whose text is worth reading, in document order. */
const READABLE = "h1, h2, h3, h4, p, li, blockquote, figcaption, td, dt, dd, pre, [role='img'][aria-label]";

/** Chrome that is always on screen and says nothing about the page. */
const SKIP = ".mote, .deck, nav, .help-back, .cmd-back, [aria-hidden='true']";

const MAX_TEXT = 2400;

const inView = (r: DOMRect, h: number) => r.bottom > 0 && r.top < h && r.width > 0 && r.height > 0;

function heroScene(): string {
  const tab = document.querySelector<HTMLElement>(".hero__sheet[aria-pressed='true']");
  const stage = document.querySelector(".hero__stage");
  if (!tab || !stage || !inView(stage.getBoundingClientRect(), window.innerHeight)) return "";
  return tab.getAttribute("aria-label") ?? "";
}

function currentSection(h: number): string {
  let best = "";
  for (const el of document.querySelectorAll<HTMLElement>("h1, h2, h3")) {
    if (el.closest(SKIP)) continue;
    const r = el.getBoundingClientRect();
    if (r.height === 0) continue;
    if (r.top < h * 0.45) best = el.innerText.trim();
    else break;
  }
  return best;
}

/** Just the section, cheap enough to poll while the visitor scrolls. */
export const where = () => heroScene() || currentSection(window.innerHeight);

export function look(): Sight {
  const h = window.innerHeight;
  const read = new Set<Element>();
  const lines = new Set<string>();
  let text = "";
  for (const el of document.querySelectorAll<HTMLElement>(READABLE)) {
    if (text.length >= MAX_TEXT) break;
    if (el.closest(SKIP) || !inView(el.getBoundingClientRect(), h)) continue;
    // A paragraph inside a list item, a list inside a quote: the outer one already said it.
    const outer = el.parentElement?.closest(READABLE);
    if (outer && read.has(outer)) {
      read.add(el);
      continue;
    }
    const line = (el.getAttribute("role") === "img" ? el.getAttribute("aria-label") : el.innerText)
      ?.replace(/\s+/g, " ")
      .trim();
    if (!line || lines.has(line)) continue;
    read.add(el);
    lines.add(line);
    text += `${line}\n`;
  }
  return {
    path: window.location.pathname,
    title: document.title,
    section: where(),
    text: text.slice(0, MAX_TEXT).trim(),
  };
}
