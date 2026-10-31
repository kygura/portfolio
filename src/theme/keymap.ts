/** Shared key tables and helpers for the keyboard layer (see Keys.tsx). */

export const CHORDS: Record<string, { to: string; label: string }> = {
  h: { to: "/", label: "Home" },
  w: { to: "/writings", label: "Writings" },
  s: { to: "/projects", label: "Software" },
  v: { to: "/scenes", label: "Scenes" },
  c: { to: "/cv", label: "CV" },
};

/** Pages in nav order, for `n` / `p`. */
export const PAGES = Object.values(CHORDS).map((c) => c.to);

/** Nav path → chord letter, for printing hints next to nav links. */
export const CHORD_FOR: Record<string, string> = Object.fromEntries(
  Object.entries(CHORDS).map(([k, v]) => [v.to, k]),
);

export const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");

/** Event the command palette host listens for; lets a control open it. */
export const COMMANDS_EVENT = "nca:commands";

/** Opens the palette from a control (the nav button) rather than a key. */
export const openCommands = () => window.dispatchEvent(new Event(COMMANDS_EVENT));
