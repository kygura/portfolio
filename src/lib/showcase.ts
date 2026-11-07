import { useQuery } from "@tanstack/react-query";
import type { Showcase } from "../../api/github/repos";

export type { CodeMap, CodeMapNode, Showcase, ShowcaseRepo, RepoPreview } from "../../api/github/repos";

async function fetchShowcase(): Promise<Showcase> {
  const response = await fetch("/api/github/repos");
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `The repository index responded ${response.status}`);
  }
  return response.json();
}

export function useShowcase() {
  return useQuery({
    queryKey: ["github-showcase"],
    queryFn: fetchShowcase,
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "3 days ago", "last week" — coarse on purpose. */
export function timeAgo(iso: string, now = Date.now()): string {
  const delta = Date.parse(iso) - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(delta) >= ms) return relative.format(Math.round(delta / ms), unit);
  }
  return "just now";
}

/** Hostname without "www.", for the frame's address bar. */
export function displayHost(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const path = pathname === "/" ? "" : pathname.replace(/\/$/, "");
    return hostname.replace(/^www\./, "") + path;
  } catch {
    return url;
  }
}

/** "12.4 KB", "1.2 MB": sizes for the map's labels. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
