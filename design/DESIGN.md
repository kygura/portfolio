# NCA Ventures · design brief

Source of truth for the look: `design/mock/ruins-mock.html` (approved). This file records what was carried into the site and what was left out, so later changes can be checked against it.

## World and tokens

One dark world, no light theme. A survey sheet: slate ground with a green-blue bias, bone-coloured ink, hairline rules, square corners everywhere, a faint 48px grid behind content.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` / `--bg-2` / `--sheet` / `--code` | `#111617` / `#161d1f` / `#1a2224` / `#0c1112` | ground, bars, selected rows, code and status line |
| `--ink` / `--ink-2` / `--ink-3` | `#e0d9c8` / `#aab1a7` / `#75817b` | text, secondary text, labels |
| `--rule` / `--rule-2` | `#2b3739` / `#3d4b4d` | hairlines |
| `--accent` / `--accent-deep` / `--on-accent` | per variant | links, keys, selection, fills |

The only fills are the accent and the sheet. Corners are square and shadows flat everywhere: `--radius: 0`, and `tailwind.config.ts` overrides every `rounded-*`/`shadow-*` step to 0/none. Tokens live in `src/index.css`. The names the existing components already read (`--bg-primary`, `--text-primary`, `--accent-amber`, `--border-muted`, …) are aliases onto the palette, and the shadcn HSL tokens are remapped too (the kit's accent is `--ui-accent`, fed by `--accent-h`, so `bg-accent/50` style modifiers follow the accent switch). `next-themes` is forced to dark; there is no light theme. Accent state: `src/theme/accent.ts`.

### Accent variants

Keys `1`–`6`, or `t` to cycle, or the row of six squares at the right of the nav bar. Stored in `localStorage["nca-accent"]` (guarded with try/catch; an inline script in `index.html` applies it before first paint). One switch rewrites the CSS tokens and the hero's shader uniforms (accent, deep accent, fog, zenith).

1. Lichen `#bcc77c` (default)
2. Amber `#eaa24c`: plum-black dusk (`:root[data-accent="torch"]`). Swaps ground, ink, rules, danger and kit tokens; the lattice is replaced by a faint lamp-glow falling from the top edge.
3. Sky `#86d3dc`: navy blueprint (`:root[data-accent="astral"]`). Cold ground, pale ice ink, and a drafting-paper grid (24px minor lines, a heavier line every 120px).
4. Rose `#e5787f`: oxblood wine (`:root[data-accent="madder"]`). Wine ground, blush ink, and a dotted lattice (a pinprick every 32px) in place of lines.

The surface texture is two tokens, `--tex` and `--tex-size`, which `body` reads; a variant that sets both changes the page's texture. Fonts and layout stay as they are in every variant.
5. Graphite `#d4d4d4`: the monochrome option. Also swaps the ground, ink, rules, danger and shadcn kit tokens for pure grays (`:root[data-accent="mono"]` in `src/index.css`), so the sheet carries no hue. Errors read as the brightest ink rather than red.
6. Manuscript `#e08a62`: the brown lamp-lit sheet from the Manuscript mock (`design/mock/prose-mock.html` on the `theme/manuscript` branch). Like Graphite it swaps the ground, ink, rules and kit tokens (`:root[data-accent="manuscript"]`): warm brown ground, paper-coloured ink, clay accent. Fonts stay as they are.

## Type

- **Literata** (opsz 7–72, 400/600, italic 400): body and every heading that used Instrument Serif or Newsreader (Tailwind `font-display`/`font-serif`/`font-body`/`font-sans` all map to it). Post body 19px / 1.68 with a 66ch cap; 17px under 560px.
- **Fragment Mono**: code, data, nav links, buttons, terminal, labels (`font-mono`).
- **Silkscreen** (`font-pixel`): page eyebrows `( 0x — … )`, the hero strip and runway marker, help-sheet headings, and the "NCA" of the wordmark. Nowhere else.

Wordmark (nav, where master printed "N.CA"): "NCA" in Silkscreen + "Ventures" in Literata italic in the accent. Under 800px the bar keeps only "NCA" (and from 640px to 1023px drops "©2026" and tightens link tracking) so the links fit unscrolled at every width. The space between links grows with the bar (from about 12px on a phone to 48px on a wide screen), sized per range from the room left once all four fit. Under 1024px the six accent squares fold into one swatch that opens the themes as a vertical list, and a `:` button beside it opens the command palette for touch screens.

## Layout

Layout: unchanged from master. Same routes, component tree, section order, nav/footer/hero placement, grids, gutters, content and interactions (custom cursor, Lenis smooth scroll, page transitions, scroll progress, terminal on `` ` ``/Ctrl+K, footer quote carousel on A/D). Only colour, type, shape and the hero's background changed. Before/after captures at 1360px: `design/qa/before-*.png`, `design/qa/after-*.png` (element x/width identical; heights move only where Literata sets wider than the old faces and lines rewrap).

Per-project accent hues on `/projects` were dropped for the site accent (they sat outside the palette).

## Hero

Master's `CartographicHero` keeps its sticky stage, scroll runway, name, tagline, "C.A" accent initials, hairline strip and scroll parallax. Only the field behind them changed: the canvas-2D contour field is replaced by the PS1 five-scene renderer in `src/hero/` (`sheets.ts` metadata, `engine/` three.js r160: `psx.ts` shared materials and helpers, `ocean.ts`, `astral.ts`, `ruins.ts`, `drift.ts`, `dunes.ts`, `rift.ts`, `frost.ts`, `wasteland.ts`, `field.ts`, `hero-engine.ts` loop + post). The engine is a dynamic import, so only `/` downloads three.

- **01 Ocean** (replaced the mock's Ruins sheet): endless swell, overgrown half-drowned towers with lit bands, palm islands, the King of Red Lions, the lion-headed sailboat from The Wind Waker, moored at a pier, twin suns with glitter on the water, gulls.
- **02 Astral**: halo with glyphs, cored polyhedra, the watcher, moon with satellite.
- **03 Ruins**: misty forest ruins: an outer ring of mixed pieces (capped and broken fluted columns, a leaning column, monoliths, an obelisk, a fallen column) and a small inner ring of free-standing low columns around the shrine (no lintels or beams across the centre); the camera drifts between the two rings so nothing crosses the centrepiece. Floating ward crystal with a rune ring, collapsed arch, an old tree gripping a fallen column, glowing mushrooms, drifting mist layers, light shafts, wisps.
- **04 Drift**: a dream, seen side-on. Far out on a still sea (the line runs 174 m from the eye), an eight-car train (cab leading right, lit windows, shadow passengers) crosses the horizon on rails a hand's breadth under the surface, wrapping out of sight at both ends. The sea is a mirror: everything above the waterline is drawn again flipped through y = 0 (static geometry is cut at the waterline so nothing pokes back up), under a thin murk with ripple streaks, sun glitter, the train's foam and V wake and the headlamp's pool. In front of the line and beyond it, the wasteland: shard towers, splayed clusters, slant-cut blades, broken stacks and obelisks with accent seams, half-sunk slabs, beams, rings, door frames and stairs to nowhere, stone hanging in the air, upside-down islands under a low sun. Standing camera (drag turns the head, zoom is the lens). Fixed lilac and peach palette; only the seams and motes take the accent. Eggs: the cab (horn), a middle car (lights out, empty seats), the tail lamp (swings), the sun (flares).
- **Wasteland** (`wasteland.ts`): the shared vocabulary of the dream scenes. `createWaste(kit, { debris, rust, seam })` gives the shapes (shard, blade, broken, obelisk, island, cloud), placement (`spire` picks a tower kind with optional lean and a shards-only `sharp` mode; `cluster`; `junk` for debris), a merging `batch(floor)` that can press geometry up onto a waterline, and `hanging` for turning, bobbing stone. Ocean and Sea use it too: Ocean is ringed by mossed spires on the horizon with wreckage in the swell and islands overhead; in Sea, towers stand in the shallows off the line of sight so they frame the city, with wreckage, hanging stone and islands above the skyline.
- **Dunes**: the wasteland in a desert. Bleached dunes to a white heat-haze horizon, towers half buried at hard leans, a toppled giant shard across a crest, a ring the size of a building standing out of the sand, a central monument of leaning blades with lit seams, hanging stone, upside-down islands, sand streaming downwind. Orbit camera. Eggs: the monument (seams wake), the ring (turns), the sun.
- **Rift**: the wasteland in a forested mountain valley at dusk. Conifers (merged per material) fill the floor between steep walls and climb them to a treeline, with dead snags among them; spires crown the ridges and rise out of the canopy, blades as tall as the walls jut out of them and lean in over the trees, a colossal shard lies wedged wall to wall, a river of broken glass runs down a clearing; mist lies in the trees, ash falls, stone hangs, islands float against an ember sky with the sun in the far notch. Standing camera above the canopy. Eggs: the wedge, the glass river, the sun.
- **Frost**: the wasteland frozen over. A sea locked in cracked ice under polar twilight; ice spires in pressure ridges and clusters, wreckage caught in the freeze, a crown of ice shards round a dark blade with lit seams; snow, hanging stone, islands, a low moon and a folding aurora. Orbit camera. Eggs: the crown, the aurora (surges), the moon.
- **05 Field**: the interactive sheet, a living relief on one shared height field (ambient drift + wave simulation + cursor swell). Click or tap sends a pulse out from that point (the wave equation carries it through the contours, with a dashed accent ring marking the front). Dragging pulls the contours and draped grid along and they relax back; moving the cursor lifts a soft swell with a reticle and leaves a wake. Scenes opt into input through `SceneDef.pointer`; such a scene takes taps (pulse) and Shift+drag (warp) while plain drag orbits like every other scene; its pitch floor and zoom-out limit are set so the frame never shows past the edge of the map.

Scene tabs (`01 02 03 04 05` + `[` `]` hint) sit at the left end of the existing bottom strip, opposite the scroll cue. Tabs show only a sequential number taken from the scene's position in `SHEETS` (the name stays in the button's aria-label), so adding a scene renumbers the rest. No pinned labels float in the stage; the mock's readouts, map key and compass are not shown (master's hero has no slot for them).

Easter eggs: every scene hides one to four tap targets (`SceneDef.eggs` in `psx.ts`: a world position, a screen-pixel radius and a `fire` that starts a one-shot reaction and returns a caption). A tap (under 8px of travel) on or near one fires the nearest; drags, orbit and the Field's pulse are untouched, and a hit on the Field's benchmark suppresses that tap's pulse. The caption shows as a hairline readout above the strip (`FOUND 03/15` the first time, `AGAIN` after). Found ids persist in `localStorage["nca-eggs"]`. Nothing marks the targets.

Below the hero sits a new Manifesto (`src/components/Manifesto.tsx`): a `( 00 — NOTES )` eyebrow, an italic opening line that resolves word by word out of a slight blur, six numbered theses along a hairline survey rail that fills with scroll (each numeral takes the accent as its thesis enters), and a closing line with an idle accent caret and links to /writings and /projects. Under reduced motion it renders still. The old "02 — On software craft" marker stays gone. The name, tagline and C.A are back to master's big type on the bare scene (no panels, no typing), about 25% smaller: name and tagline in the top-left corner, C.A in the bottom-right. Pointer: a 20px square ring and 6px dot; over links and buttons the ring grows to 38px and takes the accent; a press squeezes it and a click leaves an expanding accent square.

PS1 pipeline: render to ~¼ width target, vertex snap, affine UVs, Gouraud light, fog, 15-bit quantize with 4×4 Bayer dither, vignette, nearest upscale. Switching scenes dissolves through the dither matrix (hard cut under reduced motion). Last scene stored in `localStorage["nca-sheet"]`. The mock's scrims (top and lower half) keep the type legible over every scene.

Colour: three's colour management is off and output is linear, matching the r128 mock. The render loop runs only while needed (stops offscreen and in hidden tabs). Reduced motion starts paused on a still frame. Everything is disposed on unmount. Without WebGL the stage shows a CSS contour sheet.

## Keyboard

Additive to master's keys (terminal `` ` ``/Ctrl+K, quotes A/D). Ignored while typing in a field or with a modifier held. Code: `src/theme/Keys.tsx`, tables in `src/theme/keymap.ts`. Nav links carry their chord in `title`/`aria-keyshortcuts`; no visible hints were added to the bar (no room without changing it), and there is no status line.

| Keys | Action |
| --- | --- |
| `g h` / `g w` / `g s` / `g c` | Home / Writings / Software / CV |
| `g g` | Top of page (a hint strip lists the second keys while `g` is pending) |
| `1`–`6` / `t` | Theme / cycle theme |
| `:` / `⌘K` | Command palette (Ctrl+K stays with the terminal) |
| `n` / `p` | Next / previous page (nav order, wraps) |
| `j` / `k` / `G` | Scroll down / up / bottom |
| `←` `→` `Home` `End` | Move along the nav links when one is focused |
| `[` `]` | Previous / next hero scene (home) |
| `m` | Play / pause the tape deck |
| `b` | Talk to Mote |
| `?` | Help sheet (focus held on its close button) |
| `Esc` | Close help, leave a field |

## Command palette

`:` (vim's command line) or `⌘K` opens a filterable list of every route, writing, theme and page action (`src/components/CommandPalette.tsx`, lazy-loaded by `CommandHost.tsx` like the terminal). Same panel as the help sheet: `--bg-2` ground, accent hairline, Fragment Mono, Silkscreen group headings in the accent, a `:` prompt. The selected row takes the sheet fill and an accent left rule; each row shows its own shortcut. Actions that belong to other components (help sheet, terminal, hero scenes) are run by pressing their key. Under 1024px a `:` button in the nav opens it (`openCommands` in `src/theme/keymap.ts`), for touch screens that can't press `:`.

## Tape deck

A minimal tape recorder fixed to the bottom-right corner (`src/components/player/`), mounted beside the routes so playback carries across pages. Drawn after Kentucky Route Zero: a near-black box of plain Fragment Mono, flat hairline shapes, lots of dark, and one lit thing. Collapsed it is a cassette outline; while anything plays its window lights in the accent and its reels turn. Open, `tapes` / `radio` switch like dialogue choices (`>` marks the current one). Tapes shows the cassette (`Cassette.tsx`) as hairlines with its window glowing in the accent while playing, the reels trading tape with progress and turning; then the title and credit, the seek line drawn as a road with an accent square travelling along it, the clock, and `rew play ff` as plain words. Radio lists the stations as numbered choices. Everything reads the theme tokens, so it follows the 1 to 6 switch; reduced motion stops the reels. The hero strip pads its right end so the scroll cue clears it.

- **Tapes**: files the site serves from `public/lofi/`, listed in `public/lofi/playlist.json` and fetched on first open. `bun scripts/fetch-lofi.ts` fills it with Holizna's CC0 collections from OpenGameArt, re-encoded to 112k MP3. Only CC0 or CC-BY music belongs here, since serving a file is redistributing it (Pixabay's licence rules its tracks out).
- **Radio**: curated official Spotify and YouTube (`youtube-nocookie.com`) embeds in `stations.ts`. The platform streams and licenses the audio; the iframe loads only after a click, and stays mounted when the panel closes so it keeps playing. Spotify plays 30-second previews to visitors not signed in to Spotify.

## Mote
A 16×16 pixel critter in the bottom-left corner, opposite the tape deck (`src/components/critter/`), mounted beside the routes like the deck. One body, an antenna bulb that glows, and faces laid over it per expression (`sprite.ts`: idle, blink, talk, happy, look, sleep, surprised). Every pixel slot is a theme token: body in the accent, shade in the deep accent, bulb and cheeks in the variant's `--danger`, outline near-black, so it changes colour with the 1 to 6 switch. It bobs a pixel at a time, hops when pressed, looks up at its flickering bulb while it thinks and dozes (a drifting `z`) after 90 seconds with no input. Reduced motion stops all of it and types lines out at once.

It reads the page (`glance.ts`): the route, the title, the heading nearest the top of the viewport (or the hero scene on `/`) and the text on screen, skipping the nav, the deck and itself. `POST /api/critter` (`api/critter.ts`) hands that to Haiku with Mote's persona and returns one short line and a mood, shown in the deck's black box with a pixel tail and typed out with a moving mouth. It speaks unprompted once when a page opens (once per page per visit) and when a new section or hero scene holds the top of the screen for six seconds (40 s apart, twelve per visit). Pressing it, or `b`, opens a prompt to talk back; the last six lines go along as context. `hush` stops the unprompted lines (`localStorage["nca-mote-hush"]`). On narrow screens the deck's open panel hides Mote's box. The hero strip pads its left end so the scene tabs clear Mote. Without `ANTHROPIC_API_KEY`, or when the model fails, it greets pages with a few canned lines (`lines.ts`) and stays quiet otherwise. Unprompted remarks are cached by what was on screen; requests are limited per visitor.

## Also fixed

Post markdown: fenced code is detected from its `<pre>` (react-markdown no longer passes `inline`, so every inline code span rendered as a block); a markdown `h1` renders as `h2` under the page title; the hast `node` prop is no longer forwarded to the DOM. Code blocks use a token-driven Prism theme (comments ink-3, keywords accent, literals ink-2). Footer quote keys ignore typing and claimed chord keys.
