import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { GA_ID, trackPageView } from "@/lib/analytics";

/**
 * One page_view per route change. The SPA never reloads, so without this GA
 * would only see the first page of each visit.
 */
const RouteTracker = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (!GA_ID) return;
    trackPageView(pathname + search);
  }, [pathname, search]);

  return null;
};

export default RouteTracker;
