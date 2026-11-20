/** Sheet · Study: a room at three in the morning, the one interior on the site.
 *  A desk under a rain-streaked window: a beige computer with its CRT typing out a
 *  terminal in the accent, a table lamp with a drum shade, a portable tape deck,
 *  a mug, books and a plant. Cassettes lie around, on the desk and on the rug. To
 *  the left a bookshelf with Bit asleep on top; to the right a low cabinet with a
 *  CRT television, a games console and a controller trailing its cable across the floor.
 *  Outside, rain falls in front of a city of lit windows.
 *
 *  Pick a cassette up and drop it in the deck: it plays through the site's own tape
 *  deck (the player in the corner), so it carries on across pages. A tap on a tape
 *  plays it too; a tap on the deck plays or pauses; drag the tape back out to eject.
 *  The deck's state comes back over the player bus, so the reels here turn with it.
 *
 *  The room keeps its own warm tones; the lamp, the screens and Bit's eye take the accent.
 *  Eggs: the lamp switches off and on, the TV changes channel, Bit wakes. */
import * as THREE from "three";
import { onDeckState, requestDeck } from "@/components/player/bus";
import { PLAYLIST_URL, STATIONS, type Playlist } from "@/components/player/stations";
import { pulse, type PsxKit, type SceneDef } from "./psx";

const PLAIN_V = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const HASH = `float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`;

// The computer's screen: lines of blocky text scroll up one at a time while the last line types out.
const CRT_F = `
uniform float uTime; uniform vec3 uAccent; uniform float uBoot; varying vec2 vUv; ${HASH}
void main(){
  vec2 uv = (vUv - 0.07) / 0.86;
  vec3 c = uAccent * 0.05 + vec3(0.012, 0.016, 0.014);
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
    float rows = 13.0, cols = 30.0;
    float s = uTime * 1.4 + uBoot;
    float r = floor((1.0 - uv.y) * rows), col = floor(uv.x * cols);
    float L = r + floor(s);
    float ind = floor(h(vec2(L, 2.0)) * 3.0) * 2.0;
    float len = ind + 3.0 + floor(h(vec2(L, 1.0)) * (cols - 8.0));
    float typed = r == rows - 1.0 ? ind + floor(fract(s) * (len - ind + 1.0)) : len;
    float on = step(ind, col) * step(col, min(len, typed) - 1.0) * step(0.16, h(vec2(L * 3.1, col)));
    vec2 f = fract(vec2(uv.x * cols, (1.0 - uv.y) * rows));
    float px = floor(f.x * 4.0), py = floor(f.y * 6.0);
    float glyph = step(px, 2.0) * step(py, 4.0) * step(0.42, h(vec2(L * 31.0 + col, px * 7.0 + py)));
    c += uAccent * on * glyph * (0.75 + 0.5 * step(0.86, h(vec2(L, 5.0))));
    float cur = step(rows - 1.0, r) * step(typed, col) * step(col, typed) * step(0.5, fract(uTime * 1.8)) * step(py, 4.0);
    c += uAccent * cur;
  }
  c *= 0.82 + 0.18 * sin(vUv.y * 13.0 * 6.0 * 3.14159);
  vec2 e = vUv - 0.5;
  gl_FragColor = vec4(c * (1.0 - dot(e, e) * 1.6), 1.0);
}`;

// The television: a little side-scroller on channel 0, a title screen on channel 1, static between.
const TV_F = `
uniform float uTime; uniform vec3 uAccent; uniform float uChan; uniform float uStatic; varying vec2 vUv; ${HASH}
void main(){
  vec2 px = floor(vUv * vec2(64.0, 48.0)) / vec2(64.0, 48.0);
  vec3 c;
  if (uChan < 0.5) {
    float x = px.x + uTime * 0.05;
    c = mix(vec3(0.04, 0.05, 0.1), uAccent * 0.3 + vec3(0.04), px.y);
    c += step(0.985, h(floor(vec2(x * 64.0, px.y * 48.0)))) * step(0.55, px.y) * 0.7;
    float hill = 0.36 + 0.08 * sin(x * 9.0) + 0.04 * sin(x * 23.0 + 1.0);
    if (px.y < hill) c = vec3(0.07, 0.11, 0.1) + uAccent * 0.08;
    float gx = px.x + uTime * 0.16;
    if (px.y < 0.21) {
      vec2 b = fract(vec2(gx * 8.0, px.y * 16.0));
      c = vec3(0.36, 0.23, 0.13) * (0.65 + 0.35 * step(0.12, b.x) * step(0.12, b.y));
      if (px.y > 0.17) c = vec3(0.24, 0.5, 0.27);
    }
    float coin = step(0.6, h(vec2(floor(gx * 5.0), 3.0)));
    float cx = fract(gx * 5.0) - 0.5;
    if (coin > 0.5 && abs(cx) < 0.06 && abs(px.y - 0.42) < 0.03) c = vec3(0.95, 0.8, 0.3) * (0.7 + 0.3 * step(0.5, fract(uTime * 2.0)));
    float jump = abs(sin(uTime * 2.4)) * 0.2;
    vec2 sp = px - vec2(0.28, 0.21 + jump);
    if (sp.x > 0.0 && sp.x < 0.06 && sp.y > 0.0 && sp.y < 0.1) c = uAccent * (sp.y > 0.065 ? 1.0 : 0.7);
  } else {
    c = vec3(0.025) + uAccent * 0.06;
    float logo = step(0.55, px.y) * step(px.y, 0.76) * step(0.18, px.x) * step(px.x, 0.82);
    float glyph = step(0.38, h(vec2(floor(px.x * 16.0), floor(px.y * 10.0))));
    c = mix(c, uAccent, logo * glyph);
    float blink = step(0.5, fract(uTime * 1.1));
    if (abs(px.y - 0.3) < 0.025 && abs(px.x - 0.5) < 0.17) c = mix(c, vec3(0.88, 0.85, 0.78), blink);
  }
  float n = h(floor(vUv * vec2(96.0, 72.0)) + floor(uTime * 30.0));
  c = mix(c, vec3(n * 0.8), uStatic);
  c *= 0.84 + 0.16 * sin(vUv.y * 48.0 * 6.28318);
  vec2 e = vUv - 0.5;
  gl_FragColor = vec4(c * (1.0 - dot(e, e) * 1.3), 1.0);
}`;

// Rain beyond the glass: short streaks that fall and wrap, drawn faint and additive.
const RAIN_V = `
uniform float uTime; uniform vec2 uSnap; attribute float aSeed; attribute float aEnd; varying float vEnd; varying float vDepth;
void main(){
  float y = 6.0 - mod(uTime * (9.0 + aSeed * 5.0) + aSeed * 97.0, 13.0) + aEnd * 0.5;
  vec4 mv = modelViewMatrix * vec4(position.x - aEnd * 0.06, y, position.z, 1.0);
  vec4 p = projectionMatrix * mv;
  p.xy = floor(p.xy / p.w * uSnap + 0.5) / uSnap * p.w;
  gl_Position = p; vEnd = aEnd; vDepth = -mv.z;
}`;
const RAIN_F = `uniform vec3 uFogColor; varying float vEnd; varying float vDepth;
void main(){ vec3 c = mix(vec3(0.42, 0.48, 0.54), uFogColor, 0.3) * (0.35 + 0.5 * vEnd) * (1.0 - smoothstep(4.0, 16.0, vDepth) * 0.6); gl_FragColor = vec4(c, 1.0); }`;

// Lamp light: a soft disc, additive. On the wall it leaves the window opening dark.
const GLOW_V = `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`;
const GLOW_F = `uniform vec3 uAccent; uniform float uLevel; uniform float uGain; uniform vec4 uHole; varying vec2 vUv; varying vec3 vW;
void main(){
  if (vW.x > uHole.x && vW.x < uHole.y && vW.y > uHole.z && vW.y < uHole.w) discard;
  float r = length(vUv - 0.5) * 2.0; float k = pow(1.0 - smoothstep(0.0, 1.0, r), 2.0);
  gl_FragColor = vec4(mix(vec3(1.0, 0.84, 0.6), uAccent, 0.35) * k * uGain * uLevel, 1.0);
}`;

/** A cassette in the room: a station from the deck's radio, or a track of the site's own tapes. */
interface TapeObj {
  g: THREE.Group;
  title: string;
  station: string | null;
  track: number | null;
  reels: THREE.Object3D[];
  /** Where it rests out of the deck, and its turn there. */
  rest: THREE.Vector3;
  restYaw: number;
  tgt: THREE.Vector3;
  yaw: number;
}

const TAPE_W = 0.17, TAPE_D = 0.108, TAPE_T = 0.022;

export function buildStudy(k: PsxKit): SceneDef {
  const { U, rnd, facet, wallUV, psx, view, tex } = k;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 420);
  scene.add(k.skyDome(0, 0.35, 0.9, 0.55));
  const { add, flush } = k.batcher();

  /* ---- materials: the room is lit by its own light, which the lamp dims ---- */
  const LDIR = { value: new THREE.Vector3(0.45, 0.8, 0.4).normalize() };
  const lit: { m: THREE.ShaderMaterial; amb: THREE.Color; sun: THREE.Color }[] = [];
  const warm = { amb: "#4a4038", sun: "#c9b08c" };
  const mk = (o: Parameters<typeof psx>[0]) => {
    const m = psx({ ...warm, ...o });
    m.uniforms.uLightDir = LDIR;
    lit.push({ m, amb: m.uniforms.uAmbient.value.clone(), sun: m.uniforms.uSun.value.clone() });
    return m;
  };
  const glowMat = (emit: number) => psx({ map: tex.tPlain, tint: "#000000", emit, fogAmt: 0 });
  const mWall = mk({ map: tex.tPlain, tint: "#5c544a", uv: 2 });
  const mWall2 = mk({ map: tex.tPlain, tint: "#4a443d", uv: 2 });
  const mFloor = mk({ map: tex.tBark, tint: "#8a6e54", uv: 2 });
  const mRug = mk({ map: tex.tPlain, tint: "#5a3a34", uv: 3 });
  const mRugEdge = mk({ map: tex.tPlain, tint: "#b49a6a", uv: 6 });
  const mWood = mk({ map: tex.tBark, tint: "#a07e5e", uv: 3 });
  const mWoodDark = mk({ map: tex.tBark, tint: "#6a5040", uv: 3 });
  const mDark = mk({ map: tex.tPlain, tint: "#2a2826" });
  const mBlack = mk({ map: tex.tPlain, tint: "#141414" });
  const mBeige = mk({ map: tex.tPlain, tint: "#d4ccb6", uv: 4 });
  const mGrey = mk({ map: tex.tPlain, tint: "#8e8c88", uv: 4 });
  const mMetal = mk({ map: tex.tPlain, tint: "#3c3e3c" });
  const mBrass = mk({ map: tex.tPlain, tint: "#b0905a" });
  const mStone = mk({ map: tex.tStone, tint: "#b4ae9c", uv: 3 });
  const mMoss = mk({ map: tex.tMoss, tint: "#ffffff", uv: 3 });
  const mLeaf = mk({ map: tex.tLeaf, tint: "#7f9a6a", uv: 2, side: THREE.DoubleSide });
  const mPot = mk({ map: tex.tPlain, tint: "#a0583c" });
  const books = ["#7a3e34", "#3e5a52", "#b49a6a", "#4a4a62", "#8c7a5a", "#5e3a4a", "#c8bea4", "#3a4a3a"].map((tint) => mk({ map: tex.tPlain, tint, uv: 4 }));
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, ry = 0) =>
    add(facet(new THREE.BoxGeometry(w, h, d)), m, x, y, z, 0, ry, 0);
  const cyl = (rt: number, rb: number, h: number, n: number, m: THREE.Material, x: number, y: number, z: number) =>
    add(facet(new THREE.CylinderGeometry(rt, rb, h, n)), m, x, y, z);
  const plane = (w: number, h: number) => facet(new THREE.PlaneGeometry(w, h));

  /* ---- the room: 8 wide, 3.2 high, a window in the back wall over the desk ---- */
  const W = 4, HT = 3.2, BACK = -3, FRONT = 3.2;
  const WX = 1.25, WY0 = 1.3, WY1 = 2.65;
  add(plane(W * 2, FRONT - BACK).rotateX(-Math.PI / 2), mFloor, 0, 0, (BACK + FRONT) / 2);
  add(plane(W * 2, FRONT - BACK).rotateX(Math.PI / 2), mWall2, 0, HT, (BACK + FRONT) / 2);
  add(plane(W - WX, HT), mWall, -(W + WX) / 2, HT / 2, BACK);
  add(plane(W - WX, HT), mWall, (W + WX) / 2, HT / 2, BACK);
  add(plane(WX * 2, WY0), mWall, 0, WY0 / 2, BACK);
  add(plane(WX * 2, HT - WY1), mWall, 0, (HT + WY1) / 2, BACK);
  add(plane(FRONT - BACK, HT).rotateY(Math.PI / 2), mWall2, -W, HT / 2, (BACK + FRONT) / 2);
  add(plane(FRONT - BACK, HT).rotateY(-Math.PI / 2), mWall2, W, HT / 2, (BACK + FRONT) / 2);
  add(plane(W * 2, HT).rotateY(Math.PI), mWall2, 0, HT / 2, FRONT);
  box(W * 2, 0.12, 0.03, mWood, 0, 0.06, BACK + 0.02);
  box(0.03, 0.12, FRONT - BACK, mWood, -W + 0.02, 0.06, (BACK + FRONT) / 2);
  box(0.03, 0.12, FRONT - BACK, mWood, W - 0.02, 0.06, (BACK + FRONT) / 2);
  // Window frame, sill and a cross of glazing bars, a plant on the sill.
  box(WX * 2 + 0.2, 0.06, 0.26, mWood, 0, WY0 - 0.03, BACK + 0.06);
  box(WX * 2 + 0.2, 0.08, 0.1, mWood, 0, WY1 + 0.04, BACK);
  box(0.08, WY1 - WY0, 0.1, mWood, -WX - 0.04, (WY0 + WY1) / 2, BACK);
  box(0.08, WY1 - WY0, 0.1, mWood, WX + 0.04, (WY0 + WY1) / 2, BACK);
  box(0.04, WY1 - WY0, 0.05, mWood, 0, (WY0 + WY1) / 2, BACK);
  box(WX * 2, 0.04, 0.05, mWood, 0, (WY0 + WY1) / 2, BACK);
  cyl(0.07, 0.055, 0.12, 8, mPot, -0.85, WY0 + 0.06, BACK + 0.08);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    add(plane(0.07, 0.2), mLeaf, -0.85 + Math.cos(a) * 0.04, WY0 + 0.2, BACK + 0.08 + Math.sin(a) * 0.04, -0.35 * Math.sin(a), -a, 0.35 * Math.cos(a));
  }
  // Rug, with a pale border.
  add(plane(3.4, 2.3).rotateX(-Math.PI / 2), mRugEdge, 0.2, 0.004, -0.95);
  add(plane(3.2, 2.1).rotateX(-Math.PI / 2), mRug, 0.2, 0.006, -0.95);

  /* ---- the desk ---- */
  const DY = 0.76, DZ = -2.45, TOP = DY + 0.03;
  box(2.4, 0.06, 0.9, mWood, 0, DY, DZ);
  for (const z of [DZ - 0.38, DZ + 0.38]) box(0.06, DY, 0.06, mWood, 1.14, DY / 2, z);
  // A pedestal of drawers on the left, with brass pulls.
  box(0.5, DY - 0.03, 0.84, mWood, -0.92, (DY - 0.03) / 2, DZ);
  for (let i = 0; i < 3; i++) {
    const y = 0.14 + i * 0.23;
    box(0.44, 0.19, 0.01, mWoodDark, -0.92, y, DZ + 0.425);
    box(0.08, 0.015, 0.02, mBrass, -0.92, y + 0.03, DZ + 0.435);
  }
  box(0.46, 0.38, 0.03, mWood, 0.86, DY - 0.22, DZ - 0.42);

  // The computer: a flat beige desktop case with the monitor on top, keyboard and mouse in front.
  const CX = -0.42, CZ = DZ - 0.08;
  box(0.56, 0.13, 0.44, mBeige, CX, TOP + 0.065, CZ);
  box(0.2, 0.012, 0.005, mBlack, CX - 0.12, TOP + 0.07, CZ + 0.222);
  box(0.12, 0.03, 0.005, mGrey, CX + 0.15, TOP + 0.065, CZ + 0.222);
  for (let i = 0; i < 6; i++) box(0.006, 0.05, 0.004, mGrey, CX + 0.02 + i * 0.012, TOP + 0.065, CZ + 0.222);
  const pcLed = glowMat(0.9);
  k.mesh(new THREE.BoxGeometry(0.012, 0.008, 0.004), pcLed, scene, CX + 0.24, TOP + 0.04, CZ + 0.223);
  const MY = TOP + 0.13;
  box(0.24, 0.03, 0.22, mBeige, CX, MY + 0.015, CZ);
  box(0.54, 0.44, 0.42, mBeige, CX, MY + 0.25, CZ - 0.01);
  box(0.34, 0.3, 0.12, mBeige, CX, MY + 0.24, CZ - 0.26);
  box(0.47, 0.37, 0.01, mDark, CX, MY + 0.26, CZ + 0.2);
  const crtU = { uTime: U.uTime, uAccent: U.uAccent, uBoot: { value: rnd() * 40 } };
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.43, 0.33), new THREE.ShaderMaterial({ vertexShader: PLAIN_V, fragmentShader: CRT_F, uniforms: crtU }));
  screen.position.set(CX, MY + 0.26, CZ + 0.207);
  scene.add(screen);
  box(0.52, 0.025, 0.17, mBeige, CX + 0.02, TOP + 0.0125, DZ + 0.3);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 13; c++)
    box(0.028, 0.012, 0.028, r === 3 && c > 3 && c < 9 ? mGrey : mBeige, CX + 0.02 - 0.22 + c * 0.0365 + r * 0.008, TOP + 0.03, DZ + 0.245 + r * 0.036);
  box(0.2, 0.004, 0.17, mDark, CX + 0.42, TOP + 0.002, DZ + 0.3);
  box(0.05, 0.022, 0.08, mBeige, CX + 0.42, TOP + 0.015, DZ + 0.3);
  // Books, a mug, a stack of cassette cases.
  [[0.3, 0.05, 0.22, 0], [0.28, 0.04, 0.2, 0.15], [0.32, 0.06, 0.23, -0.1], [0.26, 0.04, 0.19, 0.3]].reduce((y, [w, h, d, r], i) => {
    box(w, h, d, books[i], -0.98, y + h / 2, DZ - 0.12, r);
    return y + h;
  }, TOP);
  cyl(0.045, 0.04, 0.1, 8, mBeige, -0.98, TOP + 0.05, DZ + 0.28);
  add(facet(new THREE.TorusGeometry(0.028, 0.008, 4, 8)), mBeige, -0.93, TOP + 0.055, DZ + 0.28);
  for (let i = 0; i < 4; i++) box(0.18, 0.026, 0.115, books[(i * 3 + 1) % books.length], 0.86, TOP + 0.013 + i * 0.027, DZ - 0.25, (i - 1.5) * 0.08);

  /* ---- the tape deck: a portable top-loader, the tape lies flat in its well ---- */
  const DKX = 0.36, DKZ = DZ + 0.06, DKH = 0.1;
  const deck = new THREE.Group();
  deck.position.set(DKX, TOP, DKZ);
  scene.add(deck);
  k.mesh(facet(new THREE.BoxGeometry(0.5, DKH, 0.3)), mMetal, deck, 0, DKH / 2, 0);
  k.mesh(new THREE.BoxGeometry(0.2, 0.004, 0.136), mBlack, deck, -0.1, DKH + 0.002, -0.01);
  // The speaker, the keys and two VU bars on the right of the lid; a carry handle behind.
  k.mesh(facet(new THREE.CylinderGeometry(0.062, 0.062, 0.006, 12)), mDark, deck, 0.15, DKH + 0.003, -0.04);
  const keys = Array.from({ length: 5 }, (_, i) =>
    k.mesh(facet(new THREE.BoxGeometry(0.034, 0.018, 0.04)), i === 1 ? mGrey : mBeige, deck, 0.05 + i * 0.04, DKH + 0.009, 0.11));
  const vuMat = glowMat(0.2);
  const vu = [0, 1].map((i) => k.mesh(new THREE.BoxGeometry(0.012, 0.004, 0.05), vuMat, deck, 0.235 + i * 0.018, DKH + 0.004, -0.06));
  const deckLed = glowMat(0.3);
  k.mesh(new THREE.BoxGeometry(0.014, 0.006, 0.006), deckLed, deck, -0.22, DKH * 0.6, 0.151);
  k.mesh(facet(new THREE.BoxGeometry(0.3, 0.04, 0.02)), mBlack, deck, 0, DKH + 0.08, -0.14);
  for (const x of [-0.15, 0.15]) k.mesh(new THREE.BoxGeometry(0.02, 0.08, 0.02), mBlack, deck, x, DKH + 0.04, -0.14);
  const WELL = new THREE.Vector3(DKX - 0.1, TOP + DKH + TAPE_T / 2 + 0.004, DKZ - 0.01);
  // The well's outline lights in the accent while a tape is carried, brighter over it.
  const wellMat = new THREE.LineBasicMaterial({ color: new THREE.Color(), transparent: true, opacity: 0, depthTest: false });
  const wellLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.105, 0, -0.072), new THREE.Vector3(0.105, 0, -0.072), new THREE.Vector3(0.105, 0, 0.072), new THREE.Vector3(-0.105, 0, 0.072),
  ]), wellMat);
  wellLine.position.set(WELL.x, TOP + DKH + 0.006, WELL.z);
  wellLine.renderOrder = 5;
  scene.add(wellLine);

  /* ---- the table lamp: round base, brass stem, a drum shade glowing from inside ---- */
  const LX = 1.0, LZ = DZ - 0.12;
  cyl(0.08, 0.09, 0.03, 10, mBrass, LX, TOP + 0.015, LZ);
  cyl(0.012, 0.012, 0.3, 6, mBrass, LX, TOP + 0.18, LZ);
  const shadeMat = psx({ map: tex.tPlain, tint: "#3a2e24", emit: 1, fogAmt: 0, side: THREE.DoubleSide });
  const shadeOff = new THREE.Color("#3a2e24"), shadeOn = new THREE.Color("#e8c890");
  const shade = k.mesh(facet(new THREE.CylinderGeometry(0.12, 0.16, 0.2, 12, 1, true)), shadeMat, scene, LX, TOP + 0.4, LZ);
  const bulbMat = glowMat(1);
  k.mesh(new THREE.IcosahedronGeometry(0.035, 0), bulbMat, scene, LX, TOP + 0.36, LZ);
  const level = { value: 1 };
  const glow = (gain: number, hole = new THREE.Vector4(9, 9, 9, 9)) => new THREE.ShaderMaterial({
    vertexShader: GLOW_V, fragmentShader: GLOW_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uAccent: U.uAccent, uLevel: level, uGain: { value: gain }, uHole: { value: hole } },
  });
  k.mesh(new THREE.CircleGeometry(0.75, 24).rotateX(-Math.PI / 2), glow(0.42), scene, LX - 0.1, TOP + 0.004, LZ + 0.05);
  k.mesh(new THREE.CircleGeometry(1.1, 24), glow(0.28, new THREE.Vector4(-WX, WX, WY0, WY1)), scene, LX, TOP + 0.45, BACK + 0.012);

  // Chair, pulled out a little.
  const chair = new THREE.Group();
  chair.position.set(-0.55, 0, -1.55);
  chair.rotation.y = 0.35;
  scene.add(chair);
  k.mesh(facet(new THREE.BoxGeometry(0.46, 0.06, 0.44)), mDark, chair, 0, 0.46, 0);
  k.mesh(facet(new THREE.BoxGeometry(0.44, 0.42, 0.05)), mDark, chair, 0, 0.74, 0.22);
  k.mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), mMetal, chair, 0, 0.22, 0);
  k.mesh(new THREE.BoxGeometry(0.5, 0.03, 0.05), mMetal, chair, 0, 0.02, 0);
  k.mesh(new THREE.BoxGeometry(0.05, 0.03, 0.5), mMetal, chair, 0, 0.02, 0);

  /* ---- bookshelf left of the window, Bit asleep on top ---- */
  const SX = -2.75, SZ = BACK + 0.2, SW = 1.4, SH = 2.2;
  box(0.04, SH, 0.34, mWood, SX - SW / 2, SH / 2, SZ);
  box(0.04, SH, 0.34, mWood, SX + SW / 2, SH / 2, SZ);
  box(SW, 0.02, 0.34, mWood, SX, SH, SZ);
  box(SW, SH, 0.02, mWoodDark, SX, SH / 2, SZ - 0.16);
  for (let s = 0; s < 4; s++) {
    const y = 0.08 + s * 0.53;
    box(SW, 0.03, 0.34, mWood, SX, y, SZ);
    let x = SX - SW / 2 + 0.05;
    // One shelf keeps a row of cassette cases and a little plant in place of some books.
    const tapesShelf = s === 2;
    while (x < SX + SW / 2 - 0.12) {
      if (tapesShelf && x > SX - 0.1 && x < SX + 0.4) {
        for (let i = 0; i < 9; i++) box(0.026, 0.11, 0.07, books[(i * 5) % books.length], x + i * 0.03, y + 0.07, SZ + 0.06);
        x += 0.3;
        cyl(0.05, 0.04, 0.08, 8, mPot, x + 0.06, y + 0.055, SZ + 0.02);
        for (let i = 0; i < 4; i++) add(plane(0.05, 0.12), mLeaf, x + 0.06, y + 0.15, SZ + 0.02, 0, (i * Math.PI) / 4, 0.3);
        x += 0.16;
        continue;
      }
      const w = 0.035 + rnd() * 0.04, h = 0.26 + rnd() * 0.16, lean = rnd() > 0.92 ? 0.25 : 0;
      if (rnd() > 0.9) { x += 0.12; continue; }
      add(facet(new THREE.BoxGeometry(w, h, 0.22)), books[Math.floor(rnd() * books.length)], x + w / 2, y + 0.015 + h / 2, SZ + 0.02, 0, 0, lean);
      x += w + 0.004 + (lean ? 0.06 : 0);
    }
  }
  const bit = new THREE.Group();
  bit.position.set(SX + 0.3, SH + 0.01, SZ + 0.04);
  bit.rotation.y = 0.35;
  scene.add(bit);
  const eyeMat = glowMat(0.2);
  const runeMat = psx({ map: tex.tPlain, tint: "#1a1a18", emit: 0.1, fogAmt: 0 });
  const body = new THREE.Group(), headG = new THREE.Group();
  bit.add(body, headG);
  k.mesh(facet(new THREE.BoxGeometry(0.13, 0.12, 0.11)), mStone, body, 0, 0.06, 0);
  k.mesh(facet(new THREE.BoxGeometry(0.05, 0.05, 0.005)), runeMat, body, 0, 0.065, 0.056);
  headG.position.y = 0.15;
  k.mesh(facet(new THREE.BoxGeometry(0.22, 0.16, 0.17)), mStone, headG, 0, 0.08, 0);
  k.mesh(facet(new THREE.BoxGeometry(0.15, 0.05, 0.01)), mDark, headG, 0, 0.075, 0.086);
  k.mesh(facet(new THREE.BoxGeometry(0.05, 0.03, 0.01)), eyeMat, headG, 0, 0.075, 0.09);
  k.mesh(facet(new THREE.BoxGeometry(0.1, 0.02, 0.12)), mMoss, headG, -0.05, 0.165, -0.01);
  const ears = [-0.16, 0.16].map((x) => k.mesh(facet(new THREE.BoxGeometry(0.04, 0.05, 0.04)), mStone, headG, x, 0.08, 0));
  const hands = [-0.11, 0.11].map((x) => k.mesh(facet(new THREE.BoxGeometry(0.035, 0.035, 0.035)), mStone, bit, x, 0.05, 0.02));

  /* ---- right of the window: a low cabinet, a CRT television, a console and its controller ---- */
  const TVX = 2.75, TVZ = BACK + 0.32, CABH = 0.5;
  box(1.4, CABH, 0.56, mWoodDark, TVX, CABH / 2, TVZ);
  box(1.44, 0.03, 0.6, mWood, TVX, CABH + 0.015, TVZ);
  box(0.6, CABH - 0.08, 0.01, mWood, TVX + 0.36, CABH / 2, TVZ + 0.281);
  box(0.06, 0.015, 0.02, mBrass, TVX + 0.12, CABH / 2, TVZ + 0.29);
  // The open half of the cabinet keeps games standing in a row.
  box(0.66, CABH - 0.08, 0.01, mBlack, TVX - 0.33, CABH / 2, TVZ - 0.2);
  for (let i = 0; i < 12; i++) box(0.03, 0.18, 0.13, books[(i * 3) % books.length], TVX - 0.6 + i * 0.045, 0.14, TVZ + 0.02);
  const TY = CABH + 0.03;
  box(0.78, 0.6, 0.56, mGrey, TVX - 0.15, TY + 0.3, TVZ - 0.02);
  box(0.5, 0.42, 0.2, mGrey, TVX - 0.15, TY + 0.3, TVZ - 0.36);
  box(0.64, 0.48, 0.012, mBlack, TVX - 0.15, TY + 0.32, TVZ + 0.26);
  for (let i = 0; i < 3; i++) box(0.04, 0.025, 0.01, mDark, TVX + 0.05 + i * 0.06, TY + 0.05, TVZ + 0.265);
  const tvU = { uTime: U.uTime, uAccent: U.uAccent, uChan: { value: 0 }, uStatic: { value: 0 } };
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.43), new THREE.ShaderMaterial({ vertexShader: PLAIN_V, fragmentShader: TV_F, uniforms: tvU }));
  tvScreen.position.set(TVX - 0.15, TY + 0.33, TVZ + 0.268);
  scene.add(tvScreen);
  // An aerial on top.
  box(0.1, 0.03, 0.08, mDark, TVX - 0.15, TY + 0.615, TVZ - 0.05);
  add(facet(new THREE.CylinderGeometry(0.004, 0.004, 0.42, 4)), mMetal, TVX - 0.25, TY + 0.78, TVZ - 0.05, 0, 0, 0.5);
  add(facet(new THREE.CylinderGeometry(0.004, 0.004, 0.42, 4)), mMetal, TVX - 0.05, TY + 0.78, TVZ - 0.05, 0, 0, -0.5);
  // The console beside it, a cartridge in its slot.
  const GX = TVX + 0.46, GZ = TVZ + 0.05;
  box(0.32, 0.07, 0.24, mGrey, GX, TY + 0.035, GZ);
  box(0.12, 0.02, 0.1, mDark, GX - 0.05, TY + 0.075, GZ - 0.03);
  box(0.09, 0.05, 0.02, books[0], GX - 0.05, TY + 0.1, GZ - 0.03);
  for (const x of [0.06, 0.11]) box(0.03, 0.012, 0.02, mBeige, GX + x, TY + 0.074, GZ + 0.06);
  const consoleLed = glowMat(0.9);
  k.mesh(new THREE.BoxGeometry(0.012, 0.008, 0.004), consoleLed, scene, GX - 0.13, TY + 0.03, GZ + 0.121);
  // The controller on the rug, its cable back up to the console.
  const PAD = new THREE.Vector3(1.85, 0.03, -1.15);
  const pad = new THREE.Group();
  pad.position.copy(PAD);
  pad.rotation.y = -0.5;
  scene.add(pad);
  k.mesh(facet(new THREE.BoxGeometry(0.16, 0.03, 0.07)), mGrey, pad, 0, 0, 0);
  for (const x of [-0.07, 0.07]) k.mesh(facet(new THREE.BoxGeometry(0.05, 0.03, 0.09)), mGrey, pad, x, 0, 0.025);
  k.mesh(new THREE.BoxGeometry(0.035, 0.006, 0.01), mBlack, pad, -0.05, 0.017, 0);
  k.mesh(new THREE.BoxGeometry(0.01, 0.006, 0.035), mBlack, pad, -0.05, 0.017, 0);
  for (const [x, z] of [[0.04, 0.008], [0.065, -0.008]]) k.mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.008, 6), books[0], pad, x, 0.017, z);
  const cable: THREE.Vector3[] = [];
  const cEnd = new THREE.Vector3(GX - 0.08, TY + 0.03, GZ + 0.12);
  const cStart = PAD.clone().add(new THREE.Vector3(0.03, 0, -0.06));
  for (let i = 0; i <= 14; i++) {
    const s = i / 14;
    const p = cStart.clone().lerp(cEnd, s);
    p.y = s < 0.75 ? 0.012 : 0.012 + Math.pow((s - 0.75) / 0.25, 2) * (TY + 0.02);
    p.x += Math.sin(s * 7) * 0.12 * (1 - s);
    cable.push(p);
  }
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cable), new THREE.LineBasicMaterial({ color: "#151514" })));
  // A framed contour print above the television.
  const pc = document.createElement("canvas");
  pc.width = pc.height = 64;
  const p2 = pc.getContext("2d");
  if (!p2) throw new Error("2d canvas unavailable");
  p2.fillStyle = "#1a2224";
  p2.fillRect(0, 0, 64, 64);
  p2.strokeStyle = "#cfc8b4";
  for (let r = 4; r < 34; r += 4) {
    p2.beginPath();
    p2.ellipse(30 + r * 0.15, 34 - r * 0.1, r, r * 0.8, 0.4, 0, Math.PI * 2);
    p2.stroke();
  }
  const pt = new THREE.CanvasTexture(pc);
  pt.magFilter = pt.minFilter = THREE.NearestFilter;
  pt.generateMipmaps = false;
  box(0.62, 0.78, 0.03, mWood, TVX - 0.15, 2.05, BACK + 0.02);
  k.mesh(new THREE.PlaneGeometry(0.52, 0.68), mk({ map: pt, tint: "#ffffff" }), scene, TVX - 0.15, 2.05, BACK + 0.04);

  /* ---- outside: rain in front of a city of lit windows ---- */
  const N = 420;
  const rp = new Float32Array(N * 6), seed = new Float32Array(N * 2), end = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = (rnd() - 0.5) * 16, z = BACK - 0.6 - rnd() * 12, s = rnd();
    rp.set([x, 0, z, x, 0, z], i * 6);
    seed.set([s, s], i * 2);
    end.set([0, 1], i * 2);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute("position", new THREE.BufferAttribute(rp, 3));
  rg.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  rg.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
  const rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({
    vertexShader: RAIN_V, fragmentShader: RAIN_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.uTime, uSnap: U.uSnap, uFogColor: U.uFogColor },
  }));
  rain.frustumCulled = false;
  scene.add(rain);
  const mCity = psx({ map: tex.tGlass, tint: "#8a909a", amb: "#4a5260", sun: "#4a5260", emit: 0.04, fogAmt: 0.7 });
  const beacons: THREE.Mesh[] = [];
  const beaconMat = psx({ map: tex.tPlain, tint: "#000000", emit: 1, fogAmt: 0.3 });
  for (let i = 0; i < 26; i++) {
    const x = (rnd() - 0.5) * 120, z = -45 - rnd() * 60, w = 4 + rnd() * 8, d = 4 + rnd() * 6;
    const top = -4 + rnd() * (Math.abs(x) < 25 ? 12 : 8), h = top + 40;
    add(wallUV(facet(new THREE.BoxGeometry(w, h, d)), 0.25), mCity, x, top - h / 2, z, 0, rnd() * 0.4, 0);
    if (top > 4 && beacons.length < 4) beacons.push(k.mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), beaconMat, scene, x, top + 0.4, z));
  }
  flush(scene);

  /* ---- the cassettes ---- */
  const shellGeo = facet(new THREE.BoxGeometry(TAPE_W, TAPE_T, TAPE_D));
  const labelGeo = new THREE.PlaneGeometry(TAPE_W * 0.94, TAPE_D * 0.9).rotateX(-Math.PI / 2);
  const reelGeo = facet(new THREE.CylinderGeometry(0.016, 0.016, 0.003, 8));
  const hubGeo = new THREE.BoxGeometry(0.026, 0.004, 0.005);
  const SHELLS = ["#2a2826", "#d4ccb6", "#3e4a52", "#5e3a34", "#8e8c88", "#1a2224"];
  const BANDS = ["#c8a25a", "#5a8a7a", "#b05a4a", "#6a6aa0", "#c8bea4", "#7a9a5a"];
  const labelTex = (title: string, sub: string, band: string) => {
    const c = document.createElement("canvas");
    c.width = 96;
    c.height = 60;
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = "#e0d9c8";
      g.fillRect(0, 0, 96, 60);
      g.fillStyle = band;
      g.fillRect(0, 0, 96, 15);
      g.fillStyle = "#1a1a18";
      g.font = "bold 10px monospace";
      g.textBaseline = "middle";
      g.fillText(title.toUpperCase().slice(0, 13), 4, 8);
      g.font = "8px monospace";
      g.fillText(sub.slice(0, 18), 4, 53);
      g.fillStyle = "#26231f";
      g.fillRect(24, 22, 48, 20);
      g.fillStyle = "#4a443c";
      g.fillRect(28, 26, 12, 12);
      g.fillRect(56, 26, 12, 12);
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  };
  // Resting spots: on the desk in front of the deck, then on the rug.
  const SPOTS: [number, number, number][] = [
    [0.72, DZ + 0.3, 0.3], [0.08, DZ + 0.36, -0.2], [0.55, -1.35, 0.9], [-0.15, -0.75, -0.6],
    [1.1, -0.6, 0.2], [-0.95, -0.95, 1.3], [0.95, -1.6, -1.1], [1.4, -1.2, 0.5],
  ];
  const onDesk = (x: number, z: number) => Math.abs(x) < 1.15 && z > DZ - 0.42 && z < DZ + 0.44;
  const restY = (x: number, z: number) => (onDesk(x, z) ? TOP : 0.008) + TAPE_T / 2;
  const tapes: TapeObj[] = [];
  const addTape = (title: string, sub: string, station: string | null, track: number | null) => {
    const i = tapes.length;
    const g = new THREE.Group();
    k.mesh(shellGeo, mk({ map: tex.tPlain, tint: SHELLS[i % SHELLS.length] }), g);
    k.mesh(labelGeo, mk({ map: labelTex(title, sub, BANDS[i % BANDS.length]), tint: "#ffffff" }), g, 0, TAPE_T / 2 + 0.0006, 0);
    const reels = [-0.032, 0.032].map((x) => {
      const r = new THREE.Group();
      r.position.set(x, TAPE_T / 2 + 0.0012, 0.004);
      g.add(r);
      k.mesh(reelGeo, mBlack, r);
      for (let j = 0; j < 3; j++) k.mesh(hubGeo, mBeige, r, 0, 0.002, 0, 0, (j * Math.PI) / 3, 0);
      return r;
    });
    g.traverse((o) => { o.userData.tape = i; });
    const [sx, sz, turn] = SPOTS[i % SPOTS.length];
    const rest = new THREE.Vector3(sx, restY(sx, sz), sz);
    g.position.copy(rest);
    g.rotation.y = turn;
    scene.add(g);
    tapes.push({ g, title, station, track, reels, rest, restYaw: turn, tgt: rest.clone(), yaw: turn });
  };
  for (const s of STATIONS) addTape(s.name, s.by.split(" · ")[1] ?? s.by, s.id, null);
  // The site's own tapes, when it has any, join them.
  void fetch(PLAYLIST_URL)
    .then((r) => (r.ok ? (r.json() as Promise<Playlist>) : null))
    .then((list) => list?.tracks.forEach((t, n) => addTape(t.title, t.artist, null, n)))
    .catch(() => {});

  /* ---- the deck's state, over the player bus ---- */
  let loaded = -1, playing = false, held = -1;
  const sendHome = (i: number) => {
    const o = tapes[i];
    if (o) { o.tgt.copy(o.rest); o.yaw = o.restYaw; }
  };
  const putIn = (i: number) => {
    if (loaded >= 0 && loaded !== i) sendHome(loaded);
    loaded = i;
    tapes[i].tgt.copy(WELL);
    tapes[i].yaw = 0;
  };
  const loadTape = (i: number) => {
    const o = tapes[i];
    putIn(i);
    if (o.station) requestDeck({ kind: "station", id: o.station });
    else if (o.track !== null) requestDeck({ kind: "tape", index: o.track });
  };
  onDeckState((s) => {
    playing = s.playing;
    const want = s.station ? tapes.findIndex((t) => t.station === s.station) : s.tape !== null ? tapes.findIndex((t) => t.track === s.tape) : -1;
    if (want === loaded || (want >= 0 && want === held)) return;
    if (want >= 0) putIn(want);
    else if (loaded >= 0 && loaded !== held) { sendHome(loaded); loaded = -1; }
  });

  /* ---- pointer: hover, pick up, carry, drop ---- */
  const raycaster = new THREE.Raycaster();
  const ray = new THREE.Ray();
  let hasRay = false, hoverTape = -1, hoverDeck = false, overWell = false, carried = false;
  const carryPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TOP + 0.24));
  const carry = new THREE.Vector3(), pressAt = new THREE.Vector3();
  const pickTape = () => {
    raycaster.ray.copy(ray);
    const hit = raycaster.intersectObjects(tapes.map((t) => t.g), true)[0];
    const i = hit?.object.userData.tape;
    return typeof i === "number" ? i : -1;
  };

  /* ---- motion state ---- */
  const CAM = new THREE.Vector3(0.25, 1.6, 1.15), AIM = new THREE.Vector3(0.1, 0.92, -2.3);
  let lastT = -1, lampOn = true, tLamp = -99, tTv = -99, tBit = -99, tapeRun = 0, chanNext = 0;
  const tmpC = new THREE.Color();

  return {
    scene, cam, idleFps: 30, fog: [10, 160], fov: [58, 74], limits: { pitch: [-0.35, 0.3], zoom: [0.8, 2], yaw: 0.6 },
    labels: [
      { name: "Deck", sub: "drop a tape in", at: (v) => { v.set(DKX, TOP + 0.3, DKZ); }, sub2: () => (loaded >= 0 ? tapes[loaded].title : "empty") },
      { name: "Bit", sub: "asleep", at: (v) => { v.copy(bit.position).y += 0.5; } },
    ],
    eggs: [
      { id: "study-lamp", r: 26, at: (v) => { v.copy(shade.position); }, fire: (t) => { tLamp = t; lampOn = !lampOn; } },
      { id: "study-tv", r: 34, at: (v) => { v.copy(tvScreen.position); }, fire: (t) => { tTv = t; chanNext = 1 - chanNext; } },
      { id: "study-bit", r: 30, at: (v) => { v.copy(bit.position).y += 0.15; }, fire: (t) => { tBit = t; } },
    ],
    pointer: {
      aim(r) {
        hasRay = Boolean(r);
        if (!r) { hoverTape = -1; hoverDeck = false; return; }
        ray.copy(r);
        if (held >= 0) {
          if (ray.intersectPlane(carryPlane, carry)) {
            carry.x = Math.max(-3.8, Math.min(3.8, carry.x));
            carry.z = Math.max(-2.85, Math.min(0.9, carry.z));
            if (carry.distanceTo(pressAt) > 0.04) carried = true;
          }
          overWell = carried && Math.hypot(carry.x - WELL.x, carry.z - WELL.z) < 0.2;
          return;
        }
        hoverTape = pickTape();
        raycaster.ray.copy(ray);
        hoverDeck = hoverTape < 0 && raycaster.intersectObject(deck, true).length > 0;
      },
      grab: () => hasRay && hoverTape >= 0,
      press() {
        if (hoverTape < 0) return;
        held = hoverTape;
        carried = false;
        const o = tapes[held].g.position;
        if (!ray.intersectPlane(carryPlane, carry)) carry.set(o.x, TOP + 0.24, o.z);
        pressAt.copy(carry);
      },
      release(tap) {
        const i = held;
        held = -1;
        const over = overWell;
        overWell = false;
        if (i < 0) {
          if (tap && hoverDeck) requestDeck({ kind: "toggle" });
          return;
        }
        const o = tapes[i];
        if (!carried) {
          // A tap: the tape in the deck plays or pauses, any other goes in and plays.
          if (tap) {
            if (i === loaded) requestDeck({ kind: "toggle" });
            else loadTape(i);
          } else o.tgt.copy(i === loaded ? WELL : o.rest);
        } else if (over) {
          if (i === loaded) o.tgt.copy(WELL);
          else loadTape(i);
        } else {
          // Let go anywhere else: it comes to rest there, and a tape taken out of the deck ejects.
          if (i === loaded) { loaded = -1; requestDeck({ kind: "eject" }); }
          const desk = onDesk(carry.x, carry.z);
          const x = carry.x, z = desk ? Math.max(DZ + 0.22, carry.z) : carry.z;
          o.rest.set(x, restY(x, z), z);
          o.restYaw = o.yaw + (rnd() - 0.5) * 1.2;
          o.tgt.copy(o.rest);
          o.yaw = o.restYaw;
        }
      },
      busy: () => held >= 0 || tapes.some((o) => o.g.position.distanceToSquared(o.tgt) > 1e-6),
      cursor: () => (held >= 0 ? "grabbing" : hoverTape >= 0 ? "grab" : hoverDeck ? "pointer" : ""),
    },
    update(t) {
      const dt = lastT < 0 ? 1 / 60 : Math.max(0, Math.min(0.1, t - lastT));
      lastT = t;

      // The lamp: a quick flicker when it is switched, then an eased fade to its new level.
      const flick = t - tLamp < 0.25 ? (Math.sin((t - tLamp) * 80) > 0 ? 1 : 0.4) : 1;
      level.value = Math.max(0, Math.min(1, level.value + ((lampOn ? 1 : 0) - level.value) * Math.min(1, dt * 6)));
      const L = level.value * flick, room = 0.22 + 0.78 * L;
      for (const { m, amb, sun } of lit) {
        m.uniforms.uAmbient.value.copy(tmpC.copy(amb).multiplyScalar(room));
        m.uniforms.uSun.value.copy(tmpC.copy(sun).multiplyScalar(L));
      }
      bulbMat.uniforms.uEmit.value = 0.1 + 1.3 * L;
      shadeMat.uniforms.uTint.value.copy(shadeOff).lerp(shadeOn, L);
      shadeMat.uniforms.uEmit.value = 0.25 + 0.75 * L;
      consoleLed.uniforms.uEmit.value = 0.6 + 0.3 * Math.sin(t * 3);

      // The deck: the play key down while it plays, the light and the meters with it.
      const run = playing && loaded >= 0;
      keys.forEach((key, i) => { key.position.y = DKH + 0.009 - (i === 1 && run ? 0.007 : 0); });
      deckLed.uniforms.uEmit.value = run ? 1.1 : loaded >= 0 ? 0.35 : 0.1;
      vuMat.uniforms.uEmit.value = run ? 1 : 0.15;
      vu.forEach((b, i) => {
        const lv = run ? 0.35 + 0.65 * Math.abs(Math.sin(t * (7 + i * 2.3)) * Math.sin(t * (2.9 + i))) : 0.15;
        b.scale.z = lv;
        b.position.z = -0.085 + 0.025 * lv;
      });
      wellMat.color.copy(U.uAccent.value);
      wellMat.opacity += ((held >= 0 ? (overWell ? 1 : 0.45) : 0) - wellMat.opacity) * Math.min(1, dt * 12);
      wellLine.visible = wellMat.opacity > 0.02;

      // Tapes ease toward where they're going; the one carried floats under the pointer.
      if (run) tapeRun += dt;
      const ease = Math.min(1, dt * 12);
      tapes.forEach((o, i) => {
        const g = o.g;
        if (i === held) {
          g.position.lerp(carried ? carry : pressAt, Math.min(1, dt * 18));
          g.rotation.x = overWell ? 0 : -0.2 + Math.sin(t * 3) * 0.03;
        } else {
          g.position.lerp(o.tgt, ease);
          g.rotation.x *= 1 - ease;
        }
        let dy = o.yaw - g.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        g.rotation.y += dy * ease;
        if (i === loaded && run) o.reels.forEach((r, j) => { r.rotation.y = -tapeRun * (j ? 2.2 : 3.1); });
      });

      // The television: static, then the other channel.
      const te = t - tTv;
      tvU.uStatic.value = te >= 0 && te < 0.7 ? 1 - te / 0.7 : 0;
      if (te > 0.3) tvU.uChan.value = chanNext;

      // Bit: breathing in its sleep, or awake for a few seconds after a tap.
      const awake = pulse(t - tBit, 5), hop = pulse(t - tBit, 0.5);
      headG.rotation.x = 0.28 * (1 - awake) + Math.sin(t * 0.9) * 0.02;
      bit.position.y = SH + 0.01 + hop * 0.09 + Math.sin(t * 0.9) * 0.004;
      eyeMat.uniforms.uEmit.value = 0.12 + 0.06 * Math.sin(t * 0.9) + 1.3 * awake;
      runeMat.uniforms.uEmit.value = 0.08 + 0.7 * awake;
      ears.forEach((e, i) => { e.position.y = 0.08 + Math.sin(t * 1.3 + i * 2) * 0.008 + awake * 0.02; });
      hands.forEach((hd, i) => { hd.position.y = 0.05 + awake * (0.06 + Math.sin(t * 7 + i * 3) * 0.02); });

      beacons.forEach((b, i) => { b.visible = Math.sin(t * 2.2 + i * 1.7) > 0.6; });

      // A slow sway, held still while a tape is carried so the drop lands where it looks.
      const sway = held >= 0 ? 0 : 1;
      cam.position.set(CAM.x + (Math.sin(t * 0.13) * 0.05 + view.px * 0.15) * sway, CAM.y + (Math.sin(t * 0.21) * 0.02 - view.py * 0.1) * sway, CAM.z);
      cam.lookAt(AIM.x + view.px * 0.4 * sway, AIM.y - view.py * 0.3 * sway, AIM.z);
      k.look(cam);
    },
    readout() {
      const s = 2 * 3600 + 47 * 60 + Math.floor(Math.max(0, lastT));
      return [
        ["Time", `${k.pad(Math.floor(s / 3600) % 24)}:${k.pad(Math.floor(s / 60) % 60)}`],
        ["Lamp", lampOn ? "On" : "Off"],
        ["Deck", loaded >= 0 ? tapes[loaded].title : "Empty"],
        ["Play", loaded >= 0 && playing ? "▶" : "■"],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
      ];
    },
  };
}
