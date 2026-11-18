import type { SheetMeta } from "./sheets";

/**
 * Warm the network cache for a scene: the engine chunk (three.js) and the
 * scene's own builder. Nothing is built or drawn, so it is safe to call on
 * hover or focus. Errors are left for the viewer to report.
 */
export function preloadScene(id: SheetMeta["id"]) {
  if (id !== "cipher") void import("./engine/hero-engine").catch(() => {});
  void import("./engine/registry").then((r) => r.loadBuilder(id)).catch(() => {});
}
