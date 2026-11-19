import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./App.tsx";
import { initAnalytics } from "./lib/analytics";
import "./index.css";

// Consent defaults must be in the dataLayer before gtag.js loads, so this
// runs ahead of the first render. It does nothing without VITE_GA_ID.
initAnalytics();

// Every Notion edit redeploys the site, which renames the hashed chunks. A
// tab opened before the deploy then asks for chunks that no longer exist, and
// the lazy route or post body fails to load until a manual refresh. Do that
// refresh for the visitor; the router has already moved to the new URL. The
// timestamp stops a chunk that is really broken from reloading forever.
const RELOAD_KEY = "stale-chunk-reload";
window.addEventListener("vite:preloadError", (event) => {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY));
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  // One dark world: the survey-sheet theme has no light variant.
  <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" enableSystem={false}>
    <App />
  </ThemeProvider>
);
