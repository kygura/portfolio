/** Hero scene metadata. Kept free of three.js so the tabs can render
 *  before (or without) the lazily loaded engine. */
export interface SheetMeta {
  id: "ocean" | "sea" | "astral" | "ruins" | "drift" | "dunes" | "rift" | "frost" | "field" | "matrix" | "beach" | "cliff" | "orb" | "cipher";
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
    aria: "Animated low-poly scene: an endless ocean with palm islands and the King of Red Lions, the lion-headed sailboat from The Wind Waker, moored at a pier, under two setting suns, with a ring of sharp mossed spires on the horizon, wreckage in the swell and upside-down islands overhead.",
  },
  {
    id: "sea",
    name: "Sea",
    aria: "Animated low-poly scene: an endless still sea with a city skyline of towers standing in it on the horizon, framed by sharp shard towers and wreckage standing in the shallows, stone hanging over the water and upside-down islands above the skyline, under two suns.",
  },
  {
    id: "astral",
    name: "Astral",
    aria: "Animated night scene: a tilted halo ring with orbiting chrome glyphs and a chrome core in gimbal rings, chrome and wireframe polyhedra, a star tetrahedron, a great watching eye and a chrome moon with a satellite, hanging over a mirror sea under an indigo sky sprinkled with stars and fading to lilac haze.",
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
    enabled: false,
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
    enabled: false,
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
    id: "beach",
    name: "Beach",
    aria: "Animated low-poly scene: a quiet white-sand beach at sunset, small waves rolling in and washing up the shore and sliding back over the wet sand, the sun sinking into the sea on the far horizon with a road of glitter across the water, streaks of pink and gold cloud, leaning palms, driftwood and shells, and gulls overhead.",
  },
  {
    id: "cliff",
    name: "Cliffs",
    aria: "Animated low-poly mountain valley after Shadow of the Colossus and Hyper Light Drifter: layers of mist over a river, a pale stone tower on a mesa that climbs through the cloud ceiling with a magenta light at its crown, long arched bridges reaching it from the cliffs at different heights, one of them fallen in, a dead titan half-sunk in the valley floor, four seal pillars sending cyan beams into the clouds, birds circling the tower, a small red-cloaked drifter on the near bridge, and clear sky on the distant horizon.",
  },
  {
    id: "orb",
    name: "Orb",
    aria: "Animated low-poly scene in the style of an early raytraced render: a swirled chrome planet hangs over a lone pyramid standing on a glittering copper mirror sea, a long shadow on the water and both of them doubled in the reflection, small pyramids far out in the gold haze of the horizon, under a sky that runs from magenta overhead to orange and pale gold at the horizon.",
  },
];

export const SHEETS: SheetMeta[] = ALL_SHEETS.filter((s) => s.enabled !== false);

/** Position of a scene by its id (the /scenes/:id slug), or -1. */
export const sheetIndex = (id: string | undefined) => SHEETS.findIndex((s) => s.id === id);

/**
 * Index of a random scene for the home hero, never the same as `last` (the
 * previous visit's pick) when there is a choice.
 */
export function pickHomeScene(last: string | null, rand: () => number = Math.random): number {
  const pool = SHEETS.map((_, i) => i).filter((i) => SHEETS[i].id !== last);
  const from = pool.length ? pool : SHEETS.map((_, i) => i);
  return from[Math.floor(rand() * from.length)] ?? 0;
}
