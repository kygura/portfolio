import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { NavLink } from "@/components/NavLink";
import { ACCENTS, FAMILIES, familyAccents, setAccent, useAccent } from "@/theme/accent";
import { CHORD_FOR, openCommands } from "@/theme/keymap";

const CLOCK_FORMAT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/Madrid",
});

const NAV_ITEMS: { path: string; label: string; wide?: boolean }[] = [
  { path: "/", label: "Home" },
  { path: "/writings", label: "Writings" },
  { path: "/projects", label: "Software" },
  // Below 1024px the bar has room for four links; Scenes stays reachable from the hero strip, g v and the palette.
  { path: "/scenes", label: "Scenes", wide: true },
  { path: "/cv", label: "CV" },
];

function NavItem({ path, label, end, wide }: { path: string; label: string; end?: boolean; wide?: boolean }) {
  return (
    <li className={wide ? "nav-item--wide" : undefined}>
      <NavLink
        to={path}
        end={end}
        className="nav-link uppercase whitespace-nowrap font-mono tracking-[0.08em] sm:tracking-[0.16em]"
        activeClassName="nav-link--active"
        title={CHORD_FOR[path] ? `g ${CHORD_FOR[path]}` : undefined}
        aria-keyshortcuts={CHORD_FOR[path] ? `g ${CHORD_FOR[path]}` : undefined}
      >
        <span className="nav-br" aria-hidden="true">[</span>
        <span className="nav-cur" aria-hidden="true">&gt;</span>
        <span className="nav-label">{label}</span>
        <span className="nav-br" aria-hidden="true">]</span>
      </NavLink>
    </li>
  );
}

/**
 * From 1024px: every palette as a square in one strip, clustered by family
 * (three squares each, a gap between families). Hovering or focusing a square
 * names it under the strip; arrows move along it. Narrower bars use
 * ThemePicker instead.
 */
function SwatchStrip() {
  const accent = useAccent();
  const [peek, setPeek] = useState<number | null>(null);
  const shown = ACCENTS[peek ?? accent];
  const family = FAMILIES.find((f) => f.id === shown.family);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    e.stopPropagation();
    btns[(i + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length].focus();
  };
  return (
    <div
      className="swatch-strip"
      role="group"
      aria-label="Theme"
      onKeyDown={onKey}
      onMouseLeave={() => setPeek(null)}
      data-peek={peek !== null || undefined}
    >
      {FAMILIES.map((f, fi) => (
        <div key={f.id} className="swatch-strip__fam" data-on={f.id === ACCENTS[accent].family || undefined}>
          {familyAccents(f.id).map(({ a, i }) => (
            <button
              key={a.id}
              type="button"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setAccent(i, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
              }}
              onMouseEnter={() => setPeek(i)}
              onFocus={() => setPeek(i)}
              onBlur={() => setPeek(null)}
              aria-pressed={i === accent}
              aria-label={`${f.name}: ${a.name}`}
              aria-keyshortcuts={String(fi + 1)}
              style={chipVars(a)}
            />
          ))}
        </div>
      ))}
      <span className="swatch-strip__tag" aria-hidden="true">
        {family?.name} / <b>{shown.name}</b>
      </span>
    </div>
  );
}

/**
 * Theme picker: one swatch in the nav (with the palette's name from 1024px)
 * that opens the palettes grouped by family, each as a paint chip showing
 * its own ground, ink and accent. The panel stays open on a pick so palettes
 * can be compared against the live page behind it.
 */
function ThemePicker() {
  const accent = useAccent();
  const current = ACCENTS[accent];
  return (
    <Popover.Root>
      <Popover.Trigger
        className="theme-trigger"
        aria-label={`Theme: ${current.name}`}
        title={`Theme: ${current.name} (1–4, t)`}
        style={chipVars(current)}
      >
        <i aria-hidden="true" />
        <span>{current.name}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="theme-panel" align="end" sideOffset={10} collisionPadding={12} aria-label="Theme">
          <div className="theme-panel__head">
            <span>Palette</span>
            <span className="theme-panel__now">
              {FAMILIES.find((f) => f.id === current.family)?.name} / <b>{current.name}</b>
            </span>
          </div>
          {FAMILIES.map((f, fi) => (
            <section key={f.id} className="theme-fam" aria-label={f.name}>
              <div className="theme-fam__label">
                <kbd aria-hidden="true">{fi + 1}</kbd>
                <span>{f.name}</span>
                <small>{f.mood}</small>
              </div>
              <div className="theme-fam__chips">
                {familyAccents(f.id).map(({ a, i }) => (
                  <button
                    key={a.id}
                    type="button"
                    className="theme-chip"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setAccent(i, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
                    }}
                    aria-pressed={i === accent}
                    aria-label={`${f.name}: ${a.name}`}
                    style={chipVars(a)}
                  >
                    <span className="theme-chip__card" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="theme-chip__name">{a.name}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          <div className="theme-panel__foot" aria-hidden="true">
            <span><kbd>1</kbd>–<kbd>4</kbd> family, again to step</span>
            <span><kbd>t</kbd> cycle all</span>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const chipVars = (a: (typeof ACCENTS)[number]) =>
  ({ "--c-bg": a.bg, "--c-ink": a.ink, "--c-acc": a.hex }) as React.CSSProperties;

/** Left/Right/Home/End move focus along the links, like a toolbar. */
function arrowNav(e: React.KeyboardEvent<HTMLUListElement>) {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
  const links = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>("a"));
  const i = links.indexOf(document.activeElement as HTMLAnchorElement);
  if (i < 0) return;
  e.preventDefault();
  const n = e.key === "Home" ? 0 : e.key === "End" ? links.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + links.length) % links.length;
  links[n].focus();
}

const Navigation = () => {
  const [scrolled, setScrolled] = useState(false);
  const [clock, setClock] = useState("--:--");
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const tick = () => {
      try {
        setClock(CLOCK_FORMAT.format(new Date()));
      } catch {
        setClock("--:--");
      }
    };
    tick();
    const interval = setInterval(tick, 20000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav
      className={`nav-bar sticky top-0 z-50 border-b transition-[background-color,border-color] duration-300 ${
        scrolled ? "border-[var(--border-subtle)]" : "border-transparent"
      }`}
      style={{
        // No backdrop-blur: re-blurring the animating hero canvas every
        // frame was the main scroll-jank source. Near-opaque bg instead.
        backgroundColor: scrolled
          ? "color-mix(in srgb, var(--bg-primary) 96%, transparent)"
          : "transparent",
      }}
    >
      <div className="flex h-full justify-between items-center gap-2 sm:gap-6">
        <div className="nav-micro flex items-baseline gap-1.5 sm:gap-2.5 font-mono tracking-[0.16em] font-medium whitespace-nowrap">
          <span className="wordmark text-foreground">
            <b>nca.ink</b>
            <i aria-hidden="true">//</i>
            <em>Ventures</em>
          </span>
        </div>

        <ul onKeyDown={arrowNav} className="nav-items flex flex-nowrap min-w-0 gap-0 sm:gap-4 md:gap-7 items-center">
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.path}
              path={item.path}
              label={item.label}
              end={item.path === "/"}
              wide={item.wide}
            />
          ))}
        </ul>

        <div className="flex items-center gap-2 md:gap-5 flex-shrink-0">
          <span className="nav-micro hidden lg:inline font-mono tracking-[0.16em] text-[var(--text-secondary)] whitespace-nowrap">
            {clock}
          </span>
          <SwatchStrip />
          <ThemePicker />
          {/* Touch screens have no `:` or ⌘K; this is their way in (shown under 1024px). */}
          <button
            type="button"
            className="cmd-open"
            onClick={openCommands}
            aria-label="Commands"
            aria-haspopup="dialog"
            aria-keyshortcuts=": Meta+K"
            title="Commands (: or ⌘K)"
          >
            :
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
