/**
 * GA4 behind Consent Mode v2.
 *
 * Order matters, so all of it runs from main.tsx before React renders:
 *   1. the dataLayer and gtag() stub exist,
 *   2. consent defaults go in as denied (nothing is stored before a choice),
 *   3. a choice saved on an earlier visit is replayed as an update,
 *   4. only then does gtag.js load and the property get configured.
 * If gtag.js loaded before step 2, its first hits would carry no consent
 * state and GA would treat them as granted.
 *
 * Nothing loads without VITE_GA_ID, so local dev and preview builds stay
 * silent unless the variable is set for them.
 *
 * Page views are sent by hand on route changes (see RouteTracker), so the
 * web stream's "page changes based on browser history events" should be off
 * to avoid counting each SPA navigation twice.
 */
import { readStored, writeStored } from "@/theme/accent";

export const GA_ID: string | undefined = import.meta.env.VITE_GA_ID || undefined;

const CONSENT_KEY = "nca-consent";
/** Ask again after a year, as most EU guidance expects. */
const CONSENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
/** Fired on window when the visitor asks to see the banner again. */
export const OPEN_CONSENT_EVENT = "nca:consent-open";

export type ConsentChoice = "granted" | "denied";

type GtagArgs = [string, ...unknown[]];

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: GtagArgs) => void;
  }
}

let started = false;

function gtag(...args: GtagArgs) {
  if (!GA_ID) return;
  // gtag.js reads the `arguments` object, not an array, from the dataLayer.
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
}

export function readConsent(): ConsentChoice | null {
  const raw = readStored(CONSENT_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as { choice?: ConsentChoice; at?: number };
    if (saved.choice !== "granted" && saved.choice !== "denied") return null;
    if (!saved.at || Date.now() - saved.at > CONSENT_TTL_MS) return null;
    return saved.choice;
  } catch {
    return null;
  }
}

/**
 * The banner offers analytics only. The site runs no ads, so the three ad
 * signals stay denied whatever the visitor picks.
 */
function consentState(choice: ConsentChoice) {
  return {
    analytics_storage: choice,
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  };
}

export function initAnalytics() {
  if (!GA_ID || started || typeof window === "undefined") return;
  started = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = gtag;

  gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    // Gives the banner's update a moment to land before the first hit when
    // a choice is replayed or made immediately.
    wait_for_update: 500,
  });
  // Strip ad click identifiers from cookieless pings sent while denied.
  gtag("set", "ads_data_redaction", true);

  const saved = readConsent();
  if (saved) gtag("consent", "update", consentState(saved));

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);

  gtag("js", new Date());
  gtag("config", GA_ID, { send_page_view: false });
}

export function setConsent(choice: ConsentChoice) {
  writeStored(CONSENT_KEY, JSON.stringify({ choice, at: Date.now() }));
  gtag("consent", "update", consentState(choice));
}

export function trackPageView(path: string) {
  gtag("event", "page_view", {
    page_location: window.location.origin + path,
    page_path: path,
  });
}

export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  gtag("event", name, params);
}

export function openConsentBanner() {
  window.dispatchEvent(new Event(OPEN_CONSENT_EVENT));
}
