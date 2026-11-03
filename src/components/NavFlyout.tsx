/**
 * Hover menus for the nav's folder routes (Writings, Scenes, Software).
 * Mouse: hovering the link opens its pages; leaving both closes after a beat.
 * Keyboard: ↓ on the focused link opens it and focuses the first page,
 * ↑/↓ move, Esc returns to the link. Touch screens get no hover, so they
 * keep the plain link and the palette.
 *
 * The panel is portalled: the nav row scrolls sideways on narrow screens
 * and would clip anything positioned inside it.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import * as Popover from "@radix-ui/react-popover";
import { useMarkdownPosts } from "@/hooks/useMarkdownPosts";
import { useShowcase } from "@/lib/showcase";
import { SHEETS } from "@/hero/sheets";
import { scrollToId, type FlyoutId } from "@/theme/keymap";


const OPEN_DELAY = 90;
const CLOSE_DELAY = 160;
const MAX_WRITINGS = 6;
const MAX_REPOS = 8;

function Row({ to, meta, onPick, children }: { to: string; meta?: string; onPick?: () => void; children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <Link to={to} className="fly-row" onClick={onPick} aria-current={pathname === to ? "page" : undefined}>
      <span className="fly-label">{children}</span>
      {meta && <span className="fly-meta">{meta}</span>}
    </Link>
  );
}

function WritingsPanel() {
  const { posts } = useMarkdownPosts();
  const latest = [...posts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_WRITINGS);
  return (
    <>
      <p className="fly-head">Latest</p>
      {latest.map((p) => (
        <Row key={p.slug} to={`/writings/${p.slug}`} meta={`${p.readTime} min`}>
          {p.title}
        </Row>
      ))}
      <Row to="/writings" meta={String(posts.length)}>All writings →</Row>
    </>
  );
}

function ScenesPanel() {
  return (
    <>
      <p className="fly-head">Scenes</p>
      <div className="fly-grid">
        {SHEETS.map((s) => (
          <Row key={s.id} to={`/scenes/${s.id}`}>
            {s.name}
          </Row>
        ))}
      </div>
    </>
  );
}

function SoftwarePanel() {
  // Mounts on first open, so the repo index is only fetched once someone looks.
  const { data, isPending, error } = useShowcase();
  const repos = data?.repos.slice(0, MAX_REPOS) ?? [];
  return (
    <>
      <p className="fly-head">Repositories</p>
      {isPending && <p className="fly-note">Loading…</p>}
      {error && <p className="fly-note">Couldn’t load the list.</p>}
      {repos.map((r) => (
        <Row key={r.name} to="/projects" meta={r.language ?? undefined} onPick={() => scrollToId(`repo-${r.name}`)}>
          {r.name}
        </Row>
      ))}
      <Row to="/projects" meta={data ? String(data.repos.length) : undefined}>All software →</Row>
    </>
  );
}

const PANELS: Record<FlyoutId, () => JSX.Element> = {
  writings: WritingsPanel,
  scenes: ScenesPanel,
  software: SoftwarePanel,
};

/** Wraps a nav <li>'s link; renders the link through `children(handlers)`. */
export function NavFlyout({
  id,
  label,
  children,
}: {
  id: FlyoutId;
  label: string;
  children: (link: {
    onKeyDown: (e: KeyboardEvent<HTMLAnchorElement>) => void;
    "aria-expanded": boolean;
    "aria-haspopup": "true";
  }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const focusFirst = useRef(false);
  const { pathname } = useLocation();

  const later = (fn: () => void, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Any navigation closes it.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const enter = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    later(() => setOpen(true), open ? 0 : OPEN_DELAY);
  };
  const leave = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    later(() => setOpen(false), CLOSE_DELAY);
  };

  const rows = () => Array.from(panelRef.current?.querySelectorAll<HTMLAnchorElement>(".fly-row") ?? []);

  const onLinkKey = (e: KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key !== "ArrowDown" || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    focusFirst.current = true;
    if (open) rows()[0]?.focus();
    else setOpen(true);
  };

  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const list = rows();
    const i = list.indexOf(document.activeElement as HTMLAnchorElement);
    const n = e.key === "ArrowDown" ? i + 1 : i - 1;
    list[(n + list.length) % list.length]?.focus();
  };

  const Panel = PANELS[id];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <span ref={anchorRef} className="fly-anchor" onPointerEnter={enter} onPointerLeave={leave}>
          {children({ onKeyDown: onLinkKey, "aria-expanded": open, "aria-haspopup": "true" })}
        </span>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          ref={panelRef}
          className="fly"
          side="bottom"
          align="start"
          sideOffset={6}
          aria-label={label}
          onPointerEnter={enter}
          onPointerLeave={leave}
          onKeyDown={onPanelKey}
          onOpenAutoFocus={(e) => {
            // Hover shouldn't steal focus; only ↓ from the link moves into the menu.
            e.preventDefault();
            if (focusFirst.current) {
              focusFirst.current = false;
              requestAnimationFrame(() => rows()[0]?.focus());
            }
          }}
          onEscapeKeyDown={() => anchorRef.current?.querySelector("a")?.focus()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          data-lenis-prevent
        >
          <Panel />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
