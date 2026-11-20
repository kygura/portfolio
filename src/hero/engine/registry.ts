/**
 * One dynamic import per scene, so each builder ships as its own chunk and a
 * visit only downloads the scenes it shows. Kept free of static three.js
 * imports: the windows page imports this to prefetch a scene on hover.
 */
import type { SheetMeta } from "../sheets";
import type { PsxKit, SceneDef } from "./psx";

export type SceneBuilder = (k: PsxKit) => SceneDef;

const LOADERS: Record<SheetMeta["id"], () => Promise<SceneBuilder>> = {
  cipher: () => import("./void").then((m) => () => m.buildVoid()),
  ocean: () => import("./ocean").then((m) => m.buildOcean),
  relief: () => import("./relief").then((m) => m.buildRelief),
  sea: () => import("./sea").then((m) => m.buildSea),
  astral: () => import("./astral").then((m) => m.buildAstral),
  ruins: () => import("./ruins").then((m) => m.buildRuins),
  drift: () => import("./drift").then((m) => m.buildDrift),
  dunes: () => import("./dunes").then((m) => m.buildDunes),
  rift: () => import("./rift").then((m) => m.buildRift),
  frost: () => import("./frost").then((m) => m.buildFrost),
  field: () => import("./field").then((m) => m.buildField),
  matrix: () => import("./matrix").then((m) => m.buildMatrix),
  survey: () => import("./survey").then((m) => m.buildSurvey),
  beach: () => import("./beach").then((m) => m.buildBeach),
  cliff: () => import("./cliff").then((m) => m.buildCliff),
  orb: () => import("./orb").then((m) => m.buildOrb),
};

const cache = new Map<SheetMeta["id"], Promise<SceneBuilder>>();

/** The builder for a scene. Repeat calls share one request; a failed one can be retried. */
export function loadBuilder(id: SheetMeta["id"]): Promise<SceneBuilder> {
  let p = cache.get(id);
  if (!p) {
    p = LOADERS[id]();
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}
