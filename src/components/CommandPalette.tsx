/**
 * Command palette: every route, writing, theme and keyboard action in one
 * filterable list. Styled as a survey-sheet panel to match the help sheet.
 * Actions owned by other components (help sheet, terminal, hero scenes) are
 * reached by pressing their key, so each keeps a single source of truth.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { useMarkdownPosts } from "@/hooks/useMarkdownPosts";
import { ACCENTS, setAccent, useAccent } from "@/theme/accent";
import { CHORDS, PAGES } from "@/theme/keymap";

const pressKey = (key: string) =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

const openTab = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

// Plain substring match on the label and keywords: cmdk's default fuzzy
// match lets "man" hit "Thaumazein", which reads as noise in a short list.
const filter = (value: string, search: string, keywords?: string[]) =>
  [value, ...(keywords ?? [])].join(" ").toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0;

function Item({
  value,
  keywords,
  onSelect,
  keys,
  meta,
  swatch,
  children,
}: {
  value: string;
  keywords?: string[];
  onSelect: () => void;
  keys?: string[];
  meta?: string;
  swatch?: string;
  children: ReactNode;
}) {
  return (
    <Command.Item value={value} keywords={keywords} onSelect={onSelect} className="cmd-item">
      {swatch && <span className="cmd-swatch" style={{ background: swatch }} aria-hidden="true" />}
      <span className="cmd-label">{children}</span>
      {meta && <span className="cmd-meta">{meta}</span>}
      {keys && (
        <span className="cmd-keys" aria-hidden="true">
          {keys.map((k, i) => (
            <kbd key={i}>{k}</kbd>
          ))}
        </span>
      )}
    </Command.Item>
  );
}

export default function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const accent = useAccent();
  const { posts } = useMarkdownPosts();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Close first, then act on the next frame, so focus has left the dialog
  // before a synthetic key or a scroll lands on the page.
  const run = (fn: () => void) => {
    onOpenChange(false);
    requestAnimationFrame(fn);
  };

  const step = (dir: 1 | -1) => {
    const i = Math.max(0, PAGES.indexOf(pathname));
    navigate(PAGES[(i + dir + PAGES.length) % PAGES.length]);
  };

  const writings = [...posts].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="cmd-back" />
        <Dialog.Content className="cmd" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Commands</Dialog.Title>
          <Command label="Commands" loop filter={filter}>
            <div className="cmd-top">
              <span className="cmd-prompt" aria-hidden="true">:</span>
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Go to a page, open a writing, change the theme"
                className="cmd-input"
              />
            </div>
            <Command.List className="cmd-list" data-lenis-prevent>
              <Command.Empty className="cmd-empty">Nothing matches “{query}”.</Command.Empty>

              <Command.Group heading="Go to">
                {Object.entries(CHORDS).map(([k, c]) => (
                  <Item
                    key={c.to}
                    value={`go ${c.label}`}
                    onSelect={() => run(() => navigate(c.to))}
                    keys={["g", k]}
                    meta={pathname === c.to ? "here" : undefined}
                  >
                    {c.label}
                  </Item>
                ))}
              </Command.Group>

              {writings.length > 0 && (
                <Command.Group heading="Writings">
                  {writings.map((p) => (
                    <Item
                      key={p.slug}
                      value={`writing ${p.slug} ${p.title}`}
                      keywords={p.tags}
                      onSelect={() => run(() => navigate(`/writings/${p.slug}`))}
                      meta={`${p.readTime} min`}
                    >
                      {p.title}
                    </Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group heading="Theme">
                {ACCENTS.map((a, i) => (
                  <Item
                    key={a.id}
                    value={`theme ${a.name}`}
                    keywords={["accent", "colour", "color"]}
                    onSelect={() => run(() => setAccent(i))}
                    swatch={a.hex}
                    keys={[String(i + 1)]}
                    meta={i === accent ? "on" : undefined}
                  >
                    {a.name}
                  </Item>
                ))}
              </Command.Group>

              <Command.Group heading="Page">
                <Item value="page next" onSelect={() => run(() => step(1))} keys={["n"]}>Next page</Item>
                <Item value="page previous" onSelect={() => run(() => step(-1))} keys={["p"]}>Previous page</Item>
                <Item value="page top" onSelect={() => run(() => window.scrollTo({ top: 0 }))} keys={["g", "g"]}>
                  Top of page
                </Item>
                <Item
                  value="page bottom"
                  onSelect={() => run(() => window.scrollTo({ top: document.documentElement.scrollHeight }))}
                  keys={["G"]}
                >
                  Bottom of page
                </Item>
                {(pathname === "/" || pathname.startsWith("/scenes")) && (
                  <Item value="page next hero scene" onSelect={() => run(() => pressKey("]"))} keys={["]"]}>
                    Next scene
                  </Item>
                )}
              </Command.Group>

              <Command.Group heading="Open">
                <Item value="open terminal" onSelect={() => run(() => pressKey("`"))} keys={["`"]}>Terminal</Item>
                <Item value="open keyboard shortcuts help" onSelect={() => run(() => pressKey("?"))} keys={["?"]}>
                  Keyboard shortcuts
                </Item>
                <Item value="open cv pdf" onSelect={() => run(() => openTab("/CV_NCA.pdf"))} meta="PDF ↗">
                  CV
                </Item>
                <Item value="open github" onSelect={() => run(() => openTab("https://github.com/kygura"))} meta="↗">
                  GitHub
                </Item>
              </Command.Group>
            </Command.List>
            <div className="cmd-foot" aria-hidden="true">
              <span><kbd>↑</kbd><kbd>↓</kbd> Move</span>
              <span><kbd>↵</kbd> Run</span>
              <span><kbd>Esc</kbd> Close</span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
