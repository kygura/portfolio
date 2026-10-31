/** Hero scene metadata. Kept free of three.js so the tabs can render
 *  before (or without) the lazily loaded engine. */
export interface SheetMeta {
  id: "ocean" | "sea" | "astral" | "ruins" | "drift" | "dunes" | "rift" | "frost" | "field" | "matrix" | "abyss" | "cliff" | "cipher";
  name: string;
  aria: string;
  /** Overrides the default drag/zoom hint under the tabs. */
  hint?: string;
  /** Set false to switch a scene off without deleting it. Disabled scenes are neither listed nor built. */
  enabled?: boolean;
}

const ALL_SHEETS: SheetMeta[] = [
  {
    id: "cipher",
    name: "Cipher",
    aria: "Interactive black field of random characters: the cursor lights and pushes the glyphs aside and rolls them like slot reels until they stop on words, and a click sends a pulse in the accent colour rippling out from where it landed.",
    hint: "HOVER TO DECODE \u00b7 CLICK TO PULSE",
  },
  {
    id: "ocean",
    name: "Ocean",
    aria: "Animated low-poly scene: an endless ocean with overgrown, half-drowned skyscrapers, palm islands and the King of Red Lions, the lion-headed sailboat from The Wind Waker, moored at a pier, under two setting suns, with a ring of sharp mossed spires on the horizon, wreckage in the swell and upside-down islands overhead.",
  },
  {
    id: "sea",
    name: "Sea",
    aria: "Animated low-poly scene: an endless still sea with a city skyline of towers standing in it on the horizon, framed by sharp shard towers and wreckage standing in the shallows, stone hanging over the water and upside-down islands above the skyline, under two suns.",
  },
  {
    id: "astral",
    name: "Astral",
    aria: "Animated night sky: a ringed halo with orbiting glyphs, wireframe polyhedra, a watching eye figure and a moon with a satellite.",
  },
  {
    id: "ruins",
    name: "Ruins",
    aria: "Animated low-poly scene: misty forest ruins, a mossy stone circle around a shrine with a floating glowing crystal, rune lights and drifting wisps.",
  },
  {
    id: "drift",
    name: "Drift",
    aria: "Animated low-poly dream scene, seen side-on: far out on a still, mirror-like sea, a long train with lit windows and shadowy passengers crosses the horizon on rails just under the surface, past sharp shard towers, slant-cut blades and broken stacks standing in the water, half-sunk debris, rings and doorways to nowhere, stones hanging in the air and upside-down islands floating under a low sun.",
  },
  {
    id: "dunes",
    name: "Dunes",
    aria: "Animated low-poly desert wasteland: bleached dunes running to a white horizon, sharp towers half buried at hard leans, a toppled giant shard, a ring the size of a building standing out of the sand, a monument of leaning blades with glowing seams, stone hanging in the heat, upside-down islands overhead and sand streaming in the wind.",
  },
  {
    id: "rift",
    name: "Rift",
    aria: "Animated low-poly forested mountain valley wasteland at dusk: conifers and dead snags filling the floor and climbing the walls to a treeline, spires crowning the ridges and rising out of the canopy, blades as tall as the walls jutting out of them and leaning over the trees, a colossal shard wedged from wall to wall with glowing seams, a river of broken glass down a clearing, mist in the trees, falling ash, hanging stone and upside-down islands against an ember sky, the sun low in the notch at the far end.",
  },
  {
    id: "frost",
    name: "Frost",
    aria: "Animated low-poly frozen wasteland: a sea locked in cracked ice under polar twilight, ice spires pushed up in pressure ridges and splayed clusters, wreckage caught in the freeze, a crown of ice shards round a dark blade with glowing seams, falling snow, hanging stone, upside-down islands, a low moon and an aurora folding across the sky.",
  },
  {
    id: "field",
    name: "Field",
    aria: "Interactive low-poly relief map that behaves like a living field: tap or click to send a pulse rippling out through the contours, drag to pull the contour fabric and survey grid along, and move the cursor to lift a swell and leave a wake.",
    hint: "CLICK TO PULSE \u00b7 DRAG TO ORBIT \u00b7 SHIFT+DRAG TO WARP",
  },
  {
    id: "matrix",
    name: "Matrix",
    aria: "Animated black void: streams of random glyphs rain down in the dark around a slowly turning wireframe tesseract above a ticked ring and survey grid.",
  },
  {
    id: "abyss",
    name: "Abyss",
    aria: "Animated low-poly underground chamber after Hyper Light Drifter: a magenta diamond crystal hangs over a flooded rhombus dais, gripped by black roots that pulse with pink light, ringed by four seal pillars with cyan glyphs and beams, a sunken titan head and arm, ribs, broken columns and stasis tubes, and a small red-cloaked drifter.",
  },
  {
    id: "cliff",
    name: "Cliffs",
    aria: "Animated low-poly mountain valley after Shadow of the Colossus and Hyper Light Drifter: layers of mist over a river, a pale stone tower on a mesa that climbs through the cloud ceiling with a magenta light at its crown, long arched bridges reaching it from the cliffs at different heights, one of them fallen in, a dead titan half-sunk in the valley floor, four seal pillars sending cyan beams into the clouds, birds circling the tower, a small red-cloaked drifter on the near bridge, and clear sky on the distant horizon.",
  },
];

export const SHEETS: SheetMeta[] = ALL_SHEETS.filter((s) => s.enabled !== false);

/** Position of a scene by its id (the /scenes/:id slug), or -1. */
export const sheetIndex = (id: string | undefined) => SHEETS.findIndex((s) => s.id === id);

/** The one scene the home hero shows. */
export const HOME_SCENE = Math.max(0, sheetIndex("cipher"));
