/** Hero scene metadata. Kept free of three.js so the tabs can render
 *  before (or without) the lazily loaded engine. */
export interface SheetMeta {
  id: "ocean" | "sea" | "astral" | "ruins" | "drift" | "dunes" | "rift" | "frost" | "field" | "matrix" | "abyss" | "cliff" | "orb" | "cipher";
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
    aria: "Animated low-poly scene in the style of an early raytracer: a glittering mirror sea under a teal sky with a chrome spire and flat slab towers standing drowned in it, palm islands, a red lion-prowed sailboat moored at a pier and two gold suns setting, with a ring of thin spires on the horizon and islands floating upside down overhead, all reflected in the water.",
  },
  {
    id: "sea",
    name: "Sea",
    aria: "Animated low-poly scene in the style of an early raytracer: a glittering mirror sea at dusk under a violet-to-peach sky, with a skyline of chrome and flat slab towers standing in the water on the horizon, framed by sharp shard towers in the shallows, stones hanging over the water and upside-down islands above the skyline, under two suns, all reflected in the sea.",
  },
  {
    id: "astral",
    name: "Astral",
    aria: "Animated night scene: a tilted halo ring with orbiting chrome glyphs and a chrome core in gimbal rings, chrome and wireframe polyhedra, a star tetrahedron, a great watching eye and a chrome moon with a satellite, hanging over a mirror sea under an indigo sky sprinkled with stars and fading to lilac haze.",
  },
  {
    id: "ruins",
    name: "Ruins",
    aria: "Animated raytraced scene: a ring of pale monoliths, columns and an obelisk on a jade checker plaza around a stepped round shrine, a glowing green crystal floating over it inside a ring of rune lights, wisps circling, cone and ball trees standing back toward a mint-white horizon under a deep green sky, everything mirrored in the tiles.",
  },
  {
    id: "drift",
    name: "Drift",
    aria: "Animated low-poly dream scene in the style of an early raytracer, seen side-on: far out on a glittering mirror sea under a plum-to-lilac sky, a long train with lit windows and shadowy passengers crosses the horizon on rails just under the surface, past sharp shard towers, slant-cut blades and broken stacks, chrome rings rising half out of the water and doorways to nowhere, with stones hanging in the air and upside-down islands floating under a low sun, all reflected in the sea.",
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
    aria: "Animated raytraced mountain valley at dusk: walls of big faceted slabs crowned with spires and leaning blades, stacked-cone conifers on the banks, a winding mirror river of glass down the middle, a colossal chrome shard wedged from wall to wall with glowing gold seams, hanging stones and upside-down islands, falling ash, and a low sun in the notch under a crimson-to-gold sky.",
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
    aria: "Interactive relief rendered like an early raytrace: a glossy, hard-lit terrain in cream and apricot contour bands rises out of a checker mirror under an amber sky, with chrome spheres on its peaks; tap or click to send a pulse rippling out through the bands, Shift+drag to pull the relief along, and move the cursor to lift a swell and leave a wake.",
    hint: "CLICK TO PULSE \u00b7 DRAG TO ORBIT \u00b7 SHIFT+DRAG TO WARP",
  },
  {
    id: "matrix",
    name: "Matrix",
    aria: "Animated phosphor-green raytrace: streams of random glyphs rain down around a slowly turning, edge-lit tesseract over a black and green checker mirror that reflects them, with a ticked ring and survey grid drawn on the floor under a sky that fades from black to a pale mint horizon.",
  },
  {
    id: "abyss",
    name: "Abyss",
    aria: "Animated underground chamber in a mirror-floored vault: a faceted rose-chrome crystal hangs over a stepped rhombus dais on flooded checker paving, gripped by black roots that pulse with pink light, ringed by four seal pillars with cyan glyphs and beams, with a sunken titan head and arm, ribs, broken columns, stasis tubes and a small red-cloaked figure, under a vault that runs from black-violet through magenta to a pale pink glow.",
  },
  {
    id: "cliff",
    name: "Cliffs",
    aria: "Animated raytraced flooded valley: a pale tower on a round mesa climbing out of a mirror river through a cloud ceiling, a magenta light at its crown, long arched bridges reaching it from slab cliffs at different heights with one fallen into the water, a dead titan half-sunk below, four seal pillars sending cyan beams into the clouds, birds circling the tower, a small red-cloaked figure on the near bridge, and a clear white horizon past the valley's mouth under a deep teal sky.",
  },
  {
    id: "orb",
    name: "Orb",
    aria: "Animated low-poly scene in the style of an early raytraced render: a swirled chrome planet hangs over a lone pyramid standing on a glittering mirror sea, a long shadow on the water and both of them doubled in the reflection, small pyramids far out in the white haze of the horizon, under a deep ultramarine sky.",
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
