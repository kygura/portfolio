/**
 * Command palette: every route, sub-route, theme and keyboard action in one
 * list. Styled as a survey-sheet panel to match the help sheet.
 *
 * Getting around without chords:
 * - Type any part of a name. Matching is on word starts ("sc", "kotr").
 * - Writings, Scenes and Software are folders. Tab (or →) on one opens it
 *   and the list narrows to its pages; Backspace on an empty field leaves.
 * - Paths work too: "writings/", "sc/oc", "/software/".
 * - With an empty field, Recent lists the last pages you visited.
 *
 * Actions owned by other components (help sheet, terminal, hero scenes) are
 * reached by pressing their key, so each keeps a single source of truth.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { useMarkdownPosts } from "@/hooks/useMarkdownPosts";
import { useShowcase } from "@/lib/showcase";
import { SHEETS } from "@/hero/sheets";
import { FAMILIES, familyAccents, setAccent, useAccent } from "@/theme/accent";
import { CHORDS, PAGES, readRecent, scrollToId } from "@/theme/keymap";
import { score } from "@/theme/match";

const pressKey = (key: string) =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

const openTab = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

/** The label is always the first keyword; the rest are extra search terms. */
const filter = (_value: string, search: string, keywords?: string[]) => {
  const [label = "", ...extras] = keywords ?? [];
  return score(search, label, extras);
};

type FolderId = "writings" | "scenes" | "software";

const FOLDERS: Record<FolderId, { label: string; to: string; aliases: string[] }> = {
  writings: { label: "Writings", to: "/writings", aliases: ["writings", "posts", "blog", "notes"] },
  scenes: { label: "Scenes", to: "/scenes", aliases: ["scenes", "hero"] },
  software: { label: "Software", to: "/projects", aliases: ["software", "projects", "repos", "code"] },
};

const FOLDER_FOR_PATH: Record<string, FolderId> = Object.fromEntries(
  (Object.entries(FOLDERS) as [FolderId, (typeof FOLDERS)[FolderId]][]).map(([id, f]) => [f.to, id]),
);

/** "wri", "sc", "projects" → the folder they name, if any. */
function folderFor(prefix: string): FolderId | null {
  const p = prefix.toLowerCase();
  if (!p) return null;
  for (const [id, f] of Object.entries(FOLDERS) as [FolderId, (typeof FOLDERS)[FolderId]][]) {
    if (f.aliases.some((a) => a.startsWith(p))) return id;
  }
  return null;
}

type Entry = {
  value: string;
  label: string;
  keywords?: string[];
  run: () => void;
  keys?: string[];
  meta?: string;
  swatch?: string;
  /** Selecting with Tab or → opens this folder instead of running. */
  opens?: FolderId;
};

function Item({ e, onSelect }: { e: Entry; onSelect: () => void }) {
  return (
    <Command.Item value={e.value} keywords={[e.label, ...(e.keywords ?? [])]} onSelect={onSelect} className="cmd-item">
      {e.swatch && <span className="cmd-swatch" style={{ background: e.swatch }} aria-hidden="true" />}
      <span className="cmd-label">{e.label}</span>
      {e.meta && <span className="cmd-meta">{e.meta}</span>}
      {e.keys && (
        <span className="cmd-keys" aria-hidden="true">
          {e.keys.map((k, i) => (
            <kbd key={i}>{k}</kbd>
          ))}
        </span>
      )}
      {e.opens && <span className="cmd-into" aria-hidden="true">›</span>}
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
  const showcase = useShowcase();
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<FolderId | null>(null);
  const [selected, setSelected] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setRecent(readRecent());
    } else {
      setQuery("");
      setFolder(null);
      setSelected("");
    }
  }, [open]);

  // Back to the top of the list whenever the view changes underneath.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [folder]);

  // Close first, then act on the next frame, so focus has left the dialog
  // before a synthetic key or a scroll lands on the page.
  const run = (fn: () => void) => {
    onOpenChange(false);
    requestAnimationFrame(fn);
  };

  const go = (to: string) => run(() => navigate(to));

  const step = (dir: 1 | -1) => {
    const i = Math.max(0, PAGES.indexOf(pathname));
    navigate(PAGES[(i + dir + PAGES.length) % PAGES.length]);
  };

  const children = useMemo(() => {
    const writings: Entry[] = [...posts]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((p) => ({
        value: `writings/${p.slug}`,
        label: p.title,
        keywords: [p.slug],
        meta: `${p.readTime} min`,
        run: () => navigate(`/writings/${p.slug}`),
      }));
    const scenes: Entry[] = SHEETS.map((s) => ({
      value: `scenes/${s.id}`,
      label: s.name,
      keywords: [s.id],
      run: () => navigate(`/scenes/${s.id}`),
    }));
    const software: Entry[] = (showcase.data?.repos ?? []).map((r) => ({
      value: `software/${r.name}`,
      label: r.name,
      keywords: [r.language ?? "", ...r.topics],
      meta: r.language ?? undefined,
      run: () => {
        navigate("/projects");
        scrollToId(`repo-${r.name}`);
      },
    }));
    return { writings, scenes, software } satisfies Record<FolderId, Entry[]>;
  }, [posts, showcase.data, navigate]);

  const routes: Entry[] = Object.entries(CHORDS).map(([k, c]) => {
    const f = FOLDER_FOR_PATH[c.to];
    const count = f ? children[f].length : 0;
    return {
      value: `go ${c.to}`,
      label: c.label,
      keywords: f ? FOLDERS[f].aliases : undefined,
      run: () => navigate(c.to),
      keys: ["g", k],
      meta: pathname === c.to ? "here" : count ? String(count) : undefined,
      opens: f && count ? f : undefined,
    };
  });

  const labelFor = (path: string): string | null => {
    const route = Object.values(CHORDS).find((c) => c.to === path);
    if (route) return route.label;
    const [, head, slug] = path.split("/");
    if (head === "writings" && slug) return children.writings.find((e) => e.value === `writings/${slug}`)?.label ?? null;
    if (head === "scenes" && slug) {
      const s = SHEETS.find((x) => x.id === slug);
      return s ? `Scenes / ${s.name}` : null;
    }
    return null;
  };

  const recentEntries: Entry[] = recent
    .filter((p) => p !== pathname)
    .flatMap((p) => {
      const label = labelFor(p);
      return label ? [{ value: `recent ${p}`, label, meta: p, run: () => navigate(p) }] : [];
    })
    .slice(0, 4);

  const themeGroups = FAMILIES.map((f, fi) => ({
    heading: `Theme · ${f.name}`,
    entries: familyAccents(f.id).map(({ a, i }): Entry => ({
      value: `theme ${a.id}`,
      label: a.name,
      keywords: [f.name, "theme", "accent", "colour", "color", "palette"],
      run: () => setAccent(i),
      swatch: a.hex,
      keys: [String(fi + 1)],
      meta: i === accent ? "on" : undefined,
    })),
  }));
  const pageActions: Entry[] = [
    { value: "page next", label: "Next page", keywords: ["page"], run: () => step(1), keys: ["n"] },
    { value: "page prev", label: "Previous page", keywords: ["page", "back"], run: () => step(-1), keys: ["p"] },
    { value: "page top", label: "Top of page", keywords: ["scroll", "up"], run: () => window.scrollTo({ top: 0 }), keys: ["g", "g"] },
    {
      value: "page bottom",
      label: "Bottom of page",
      keywords: ["scroll", "down", "end"],
      run: () => window.scrollTo({ top: document.documentElement.scrollHeight }),
      keys: ["G"],
    },
    ...(pathname.startsWith("/scenes")
      ? [{ value: "page next scene", label: "Next scene", keywords: ["hero"], run: () => pressKey("]"), keys: ["]"] }]
      : []),
  ];

  const opens: Entry[] = [
    { value: "open terminal", label: "Terminal", keywords: ["shell", "console"], run: () => pressKey("`"), keys: ["`"] },
    { value: "open plot", label: "Plot", keywords: ["pixel", "canvas", "place", "draw", "artifacts"], run: () => navigate("/plot") },
    { value: "open help", label: "Keyboard shortcuts", keywords: ["help", "keys"], run: () => pressKey("?"), keys: ["?"] },
    { value: "open cv pdf", label: "CV", keywords: ["pdf", "resume"], run: () => openTab("/CV_NCA.pdf"), meta: "PDF ↗" },
    { value: "open github", label: "GitHub", keywords: ["source"], run: () => openTab("https://github.com/kygura"), meta: "↗" },
  ];

  const all = [...routes, ...children.writings, ...children.scenes, ...children.software, ...recentEntries];

  const enter = (f: FolderId) => {
    setFolder(f);
    setQuery("");
  };

  // "writings/", "sc/oc" or "/software/x": a known prefix and a slash opens
  // that folder and keeps whatever follows as the query.
  const onQuery = (q: string) => {
    if (!folder) {
      const m = /^\/?([a-z]+)\/(.*)$/i.exec(q);
      const f = m && folderFor(m[1]);
      if (f) {
        setFolder(f);
        setQuery(m[2]);
        return;
      }
    }
    setQuery(q);
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const atEnd = e.currentTarget.selectionStart === query.length;
    if ((e.key === "Tab" && !e.shiftKey) || (e.key === "ArrowRight" && atEnd)) {
      const hit = all.find((x) => x.value === selected);
      if (hit?.opens) {
        e.preventDefault();
        enter(hit.opens);
      } else if (e.key === "Tab") {
        e.preventDefault();
      }
      return;
    }
    const leave = (e.key === "Backspace" && !query) || (e.key === "Tab" && e.shiftKey) || (e.key === "ArrowLeft" && !query);
    if (folder && leave) {
      e.preventDefault();
      setFolder(null);
    }
  };

  const group = (heading: string, entries: Entry[]) =>
    entries.length > 0 && (
      <Command.Group heading={heading}>
        {entries.map((x) => (
          <Item key={x.value} e={x} onSelect={() => run(x.run)} />
        ))}
      </Command.Group>
    );

  let body: ReactNode;
  if (folder) {
    const f = FOLDERS[folder];
    const index: Entry = {
      value: `go ${f.to}`,
      label: `All ${f.label.toLowerCase()}`,
      keywords: [f.label, "index"],
      run: () => navigate(f.to),
      meta: f.to,
    };
    const loading = folder === "software" && showcase.isPending;
    body = (
      <>
        {group(f.label, [index, ...children[folder]])}
        {loading && <div className="cmd-empty">Loading repositories…</div>}
      </>
    );
  } else if (!query.trim()) {
    body = (
      <>
        {group("Recent", recentEntries)}
        {group("Go to", routes)}
        {themeGroups.map((g) => <Fragment key={g.heading}>{group(g.heading, g.entries)}</Fragment>)}
        {group("Page", pageActions)}
        {group("Open", opens)}
      </>
    );
  } else {
    body = (
      <>
        {group("Go to", routes)}
        {group("Writings", children.writings)}
        {group("Scenes", children.scenes)}
        {group("Software", children.software)}
        {themeGroups.map((g) => <Fragment key={g.heading}>{group(g.heading, g.entries)}</Fragment>)}
        {group("Page", pageActions)}
        {group("Open", opens)}
      </>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="cmd-back" />
        <Dialog.Content className="cmd" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Commands</Dialog.Title>
          <Command label="Commands" loop filter={filter} value={selected} onValueChange={setSelected}>
            <div className="cmd-top">
              <span className="cmd-prompt" aria-hidden="true">:</span>
              {folder && (
                <button type="button" className="cmd-crumb" onClick={() => setFolder(null)} title="Back (Backspace)">
                  {FOLDERS[folder].label.toLowerCase()}
                  <i aria-hidden="true">/</i>
                </button>
              )}
              <Command.Input
                value={query}
                onValueChange={onQuery}
                onKeyDown={onInputKey}
                placeholder={folder ? `Find in ${FOLDERS[folder].label.toLowerCase()}` : "Type a page, a writing, a scene, a theme"}
                className="cmd-input"
              />
            </div>
            <Command.List ref={listRef} className="cmd-list" data-lenis-prevent>
              <Command.Empty className="cmd-empty">Nothing matches “{query}”.</Command.Empty>
              {body}
            </Command.List>
            <div className="cmd-foot" aria-hidden="true">
              <span><kbd>↑</kbd><kbd>↓</kbd> Move</span>
              <span><kbd>↵</kbd> Go</span>
              <span><kbd>Tab</kbd> Open folder</span>
              {folder ? <span><kbd>⌫</kbd> Back</span> : <span><kbd>/</kbd> Path</span>}
              <span><kbd>Esc</kbd> Close</span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
