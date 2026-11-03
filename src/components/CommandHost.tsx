import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { COMMANDS_EVENT, isTyping, pushRecent } from "@/theme/keymap";

const CommandPalette = lazy(() => import("./CommandPalette"));

/**
 * Keeps the command palette out of the initial bundle, like TerminalHost.
 * `/`, `:` (vim's command line) or ⌘K opens it; Ctrl+K stays with the
 * terminal. Under 1024px the nav carries a button for touch screens
 * (`openCommands`). Also records each visited path for the Recent group.
 */
export default function CommandHost() {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    pushRecent(pathname);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const cmdK = e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "k";
      const bare = !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target);
      const key = bare && (e.key === ":" || e.key === "/");
      if (!cmdK && !key) return;
      e.preventDefault();
      setArmed(true);
      setOpen((o) => (cmdK ? !o : true));
    };
    const onOpen = () => {
      setArmed(true);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(COMMANDS_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(COMMANDS_EVENT, onOpen);
    };
  }, []);

  if (!armed) return null;

  return (
    <Suspense fallback={null}>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}
