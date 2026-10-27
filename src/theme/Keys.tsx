/**
 * Additive keyboard layer: g-chords for the nav routes, `g g` to the top,
 * `n`/`p` for next/previous page, `1`–`6` and `t` for the theme, `j`/`k`/`G` to
 * scroll, `?` for the help sheet. Pages add their own keys
 * (the hero listens for `[` `]`). Nothing fires while typing in a field or
 * with a modifier held, so the terminal's Ctrl+K and the backtick stay put.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ACCENTS, setAccent, useAccent } from "./accent";
import { CHORDS, PAGES, isTyping } from "./keymap";

const K = ({ k }: { k: string }) => <kbd>{k}</kbd>;

function HelpOverlay({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      } else if (e.key === "Tab") {
        // the close button is the only control: keep focus inside the dialog
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="help-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="help" role="dialog" aria-modal="true" aria-labelledby="help-h">
        <div className="help-top">
          <h2 id="help-h">Keys</h2>
          <button ref={closeRef} className="help-close" type="button" onClick={onClose}>
            <kbd>Esc</kbd> Close
          </button>
        </div>
        <div className="help-cols">
          <div>
            <h3>Go to</h3>
            <dl>
              {Object.entries(CHORDS).map(([k, v]) => (
                <div key={k}>
                  <dt><K k="g" /> <K k={k} /></dt>
                  <dd>{v.label}</dd>
                </div>
              ))}
              <div>
                <dt><K k="g" /> <K k="g" /></dt>
                <dd>Top of page</dd>
              </div>
            </dl>
          </div>
          <div>
            <h3>View</h3>
            <dl>
              <div><dt><K k="n" /> <K k="p" /></dt><dd>Next / previous page</dd></div>
              <div><dt><K k="1" />–<K k="6" /></dt><dd>Theme</dd></div>
              <div><dt><K k="t" /></dt><dd>Cycle theme</dd></div>
              <div><dt><K k="j" /> <K k="k" /></dt><dd>Scroll down / up</dd></div>
              <div><dt><K k="G" /></dt><dd>Bottom of page</dd></div>
              <div><dt><K k="←" /> <K k="→" /></dt><dd>Move along the nav (when focused)</dd></div>
              <div><dt><K k="[" /> <K k="]" /></dt><dd>Previous / next hero scene (home)</dd></div>
              <div><dt><K k="A" /> <K k="D" /></dt><dd>Previous / next quote</dd></div>
              <div><dt><K k="m" /></dt><dd>Play / pause music</dd></div>
              <div><dt><K k="b" /></dt><dd>Talk to Mote</dd></div>
              <div><dt><K k="`" /></dt><dd>Terminal</dd></div>
              <div><dt><K k=":" /> <K k="⌘K" /></dt><dd>Commands</dd></div>
              <div><dt><K k="?" /></dt><dd>This sheet</dd></div>
              <div><dt><K k="Esc" /></dt><dd>Close, leave a field</dd></div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Keys() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const accent = useAccent();
  const [help, setHelp] = useState(false);
  const [pending, setPending] = useState(false);
  const live = useRef({ pathname, accent });
  live.current = { pathname, accent };
  const chord = useRef(false);
  const timer = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (isTyping(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (chord.current) {
        chord.current = false;
        setPending(false);
        window.clearTimeout(timer.current);
        if (e.key === "g") {
          e.preventDefault();
          window.scrollTo({ top: 0 });
          return;
        }
        const target = CHORDS[e.key];
        if (target) {
          // Claim the key so other single-key listeners (the footer's
          // quote keys) don't also act on the second half of the chord.
          e.preventDefault();
          navigate(target.to);
        }
        return;
      }
      switch (e.key) {
        case "g":
          chord.current = true;
          setPending(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => {
            chord.current = false;
            setPending(false);
          }, 1400);
          return;
        case "n":
        case "p": {
          const i = Math.max(0, PAGES.indexOf(live.current.pathname));
          navigate(PAGES[(i + (e.key === "n" ? 1 : PAGES.length - 1)) % PAGES.length]);
          return;
        }
        case "t":
          setAccent((live.current.accent + 1) % ACCENTS.length);
          return;
        case "j":
        case "k":
          window.scrollBy({ top: e.key === "j" ? 140 : -140 });
          return;
        case "G":
          window.scrollTo({ top: document.documentElement.scrollHeight });
          return;
        case "?":
          e.preventDefault();
          setHelp(true);
          return;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
          setAccent(Number(e.key) - 1);
          return;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(timer.current);
    };
  }, [navigate]);

  return (
    <>
      {pending && !help && (
        <div className="chord-hint" role="status">
          <K k="g" />
          {Object.entries(CHORDS).map(([k, v]) => (
            <span key={k}><K k={k} /> {v.label}</span>
          ))}
          <span><K k="g" /> Top</span>
        </div>
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </>
  );
}
