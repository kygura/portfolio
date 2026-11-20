/** Sheet · Room: a small bedroom at night. One warm lamp on a nightstand is the main light; the CRT
 *  monitor and the television throw a little cool light of their own and the window lets in the moon.
 *  A wooden desk carries a beige computer, a boombox cassette deck stands on a low cabinet, a shelf
 *  holds books, a plant and a stack of tapes, and a console sits beside the television. Fourteen
 *  cassettes lie about the room.
 *
 *  Tapes can be picked up. Press one and drag: it lifts, turns to face you and follows the pointer on
 *  a plane through the deck. Let go over the deck's door and it flies in and plays one of the synth
 *  loops in room-audio/. Drag the loaded tape out and let go elsewhere to eject it; a tap on a tape
 *  loads it, a tap on the deck pauses or resumes. The reels turn and the level lights follow the music.
 *
 *  The room has its own material: the PS1 vertex snap and affine textures of the shared one, but with
 *  the lamp, the two screens and the moon lit per pixel, so a pool of light can fall on a plain wall.
 *  Eggs: the lamp (it flickers out and back), the console (the television flashes) and the moon. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pulse, type PsxKit, type SceneDef, type V3 } from "./psx";
import { createAudio, TAPE_SOUNDS } from "./room-audio";

/* ---- tapes: the title and label colours come from the synth's own list ---- */
const INFO: Record<string, { title: string; paper: string; ink: string }> = {
  "plaza-after-hours": { title: "Plaza After Hours", paper: "#d9cfe0", ink: "#7c2d63" },
  "ecco-lobby": { title: "Ecco Lobby", paper: "#52cfc0", ink: "#0b080d" },
  "floral-mall-mix": { title: "Floral Mall Mix", paper: "#e8a9c9", ink: "#2b1440" },
  "night-drive-82": { title: "Night Drive 82", paper: "#e2d48c", ink: "#e0243f" },
  "marble-trap": { title: "Marble Trap", paper: "#9a8fa3", ink: "#0b080d" },
  "grey-block": { title: "Grey Block", paper: "#c9c4bd", ink: "#e0243f" },
  "hard-reset-plaza": { title: "Hard Reset Plaza", paper: "#0b080d", ink: "#b4f03c" },
  "slush-fountain": { title: "Slush Fountain", paper: "#bfe3f0", ink: "#3a5a8c" },
  "room-service": { title: "Room Service", paper: "#d6b38a", ink: "#3b2316" },
  "penthouse-1am": { title: "Penthouse 1AM", paper: "#1d1a3a", ink: "#e2a85c" },
  "local-forecast": { title: "Local Forecast", paper: "#4fa3d9", ink: "#f2e34c" },
  "channel-31": { title: "Channel 31", paper: "#c9d3d6", ink: "#3b4a8c" },
  "aero-garden": { title: "Aero Garden", paper: "#e6f6ff", ink: "#2bb3a3" },
  "glass-atrium": { title: "Glass Atrium", paper: "#e6f4f1", ink: "#2f7fd0" },
};
const SHELLS = ["#2b2930", "#3b3741", "#8d9099", "#1d1b20"];

/* ---- room size and the main landmarks ---- */
const HX = 7.2; // half width
const BACK = -5.5; // back wall
const FRONT = 5.5;
const H = 5.8; // ceiling
const T = 2.1; // desk top
const NS = 1.7; // nightstand top
const CB = 1.3; // cabinet top
const ST = 1.02; // television stand top
const TW = 0.9, TH = 0.58, TD = 0.09; // a cassette

/* ---- the room's material: PS1 snap and affine UVs, per-pixel point lights ---- */
const V = `
uniform vec2 uSnap; uniform vec2 uUv; uniform float uPlanar;
attribute vec3 aCol;
varying vec3 vAff; varying vec3 vWP; varying vec3 vN; varying vec3 vCol;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vWP = wp.xyz; vCol = aCol;
  vec4 mv = viewMatrix * wp;
  vec4 p = projectionMatrix * mv;
  p.xy = floor(p.xy / p.w * uSnap + 0.5) / uSnap * p.w;
  gl_Position = p;
  vec2 q = uv;
  if (uPlanar > 0.0) {
    vec3 a = abs(normal);
    q = (a.y > 0.7 ? position.xz : (a.x > a.z ? position.zy : position.xy)) * uPlanar;
  }
  vAff = vec3(q * uUv * p.w, p.w);
}`;
const F = `
uniform sampler2D uMap; uniform vec3 uTint; uniform vec3 uEmit; uniform float uUnlit; uniform float uGain; uniform float uAlpha; uniform float uCrt;
uniform vec3 uAmb; uniform vec3 uMoonDir; uniform vec3 uMoonCol;
uniform vec3 uL0; uniform vec3 uC0; uniform vec3 uL1; uniform vec3 uC1; uniform vec3 uL2; uniform vec3 uC2; uniform vec3 uR;
varying vec3 vAff; varying vec3 vWP; varying vec3 vN; varying vec3 vCol;
vec3 pt(vec3 P, vec3 N, vec3 L, vec3 C, float r){
  vec3 d = L - P; float dd = dot(d, d); float dist = sqrt(dd);
  float w = clamp(dot(N, d / max(dist, 1e-3)) * 0.75 + 0.25, 0.0, 1.0);
  return C * w / (1.0 + dd / (r * r));
}
void main(){
  vec2 uv = vAff.xy / vAff.z;
  vec3 t = texture2D(uMap, uv).rgb * uTint * vCol;
  vec3 c;
  if (uUnlit > 0.5) {
    c = t * uGain;
    if (uCrt > 0.5) { vec2 q = uv - 0.5; c *= 1.0 - 1.2 * dot(q, q); }
  } else {
    vec3 N = normalize(vN);
    float low = mix(0.55, 1.0, smoothstep(0.0, 1.5, vWP.y));
    float amb = (0.78 + 0.22 * N.y) * mix(1.0, low, 1.0 - abs(N.y));
    vec3 l = uAmb * amb + uMoonCol * max(dot(N, -uMoonDir), 0.0);
    // The shade throws light up and down more than sideways.
    vec3 ld = vWP - uL0; float lh = abs(ld.y) / max(length(ld), 1e-3);
    vec3 lamp = pt(vWP, N, uL0, uC0, uR.x) * mix(0.5, 1.0, smoothstep(0.1, 0.75, lh));
    vec3 pl = lamp + pt(vWP, N, uL1, uC1, uR.y) + pt(vWP, N, uL2, uC2, uR.z);
    pl = floor(pl * 16.0 + 0.5) / 16.0;
    c = t * (l + pl) * uGain;
  }
  c += uEmit;
  gl_FragColor = vec4(c, uAlpha);
}`;

interface MOpt {
  map: THREE.Texture;
  tint?: string;
  planar?: number;
  unlit?: boolean;
  gain?: number;
  crt?: boolean;
  add?: boolean;
  alpha?: number;
  side?: THREE.Side;
}

type TapeState = "home" | "lift" | "fly" | "loaded";
interface Tape {
  i: number;
  g: THREE.Group;
  label: THREE.ShaderMaterial;
  reels: THREE.Object3D[];
  hp: THREE.Vector3;
  hq: THREE.Quaternion;
  state: TapeState;
  to: "home" | "loaded";
  fp: THREE.Vector3;
  fq: THREE.Quaternion;
  fs: number;
  tp: THREE.Vector3;
  tq: THREE.Quaternion;
  ts: number;
  k: number;
  target: THREE.Vector3;
}

export function buildRoom(kit: PsxKit): SceneDef {
  const { U, rnd, view } = kit;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 80);
  const audio = createAudio();
  const root = new THREE.Group();
  scene.add(root);

  /* ---- textures: small, nearest-filtered, painted here ---- */
  const textures: THREE.Texture[] = [];
  const keep = <X extends THREE.Texture>(t: X) => {
    textures.push(t);
    return t;
  };
  const crisp = (t: THREE.Texture) => {
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return keep(t);
  };
  const paint = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (!g) throw new Error("2d canvas unavailable");
    draw(g, w, h);
    return { c, g, tex: crisp(new THREE.CanvasTexture(c)) };
  };
  const pix = (s: number, f: (x: number, y: number) => [number, number, number]) =>
    paint(s, s, (g) => {
      const img = g.createImageData(s, s);
      for (let y = 0; y < s; y++)
        for (let x = 0; x < s; x++) {
          const [r, gg, b] = f(x, y), i = (y * s + x) * 4;
          img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
        }
      g.putImageData(img, 0, 0);
    }).tex;

  const tPlain = pix(16, () => { const k = 0.9 + rnd() * 0.12; return [236 * k, 236 * k, 230 * k]; });
  const tPlank = pix(32, (x, y) => {
    const row = y >> 3, base = [0.9, 1.04, 0.95, 1.0][row];
    let k = base * (0.86 + rnd() * 0.2 + 0.07 * Math.sin(x * 0.45 + row * 3));
    if ((y & 7) === 0 || x === (row * 13 + 7) % 32) k *= 0.5;
    return [160 * k, 112 * k, 76 * k];
  });
  // Striped wallpaper: deep teal and dusty rose bands split by gold pinstripes, a small gold diamond in each teal band.
  const tWall = pix(32, (x, y) => {
    const xm = x % 16, k = 0.94 + rnd() * 0.1;
    if (xm === 0 || xm === 9) return [226 * k, 176 * k, 84 * k];
    if (xm > 9) return [196 * k, 92 * k, 128 * k];
    const dx = Math.abs(xm - 4.5), dy = Math.abs((y % 16) - 7.5);
    if (dx + dy < 2.6) return [236 * k, 190 * k, 96 * k];
    return [38 * k, 128 * k, 136 * k];
  });
  const tWood = pix(32, (x, y) => {
    const k = 0.84 + 0.14 * Math.sin((y + 3 * Math.sin(x * 0.35)) * 0.9) + (rnd() - 0.5) * 0.1;
    return [186 * k, 132 * k, 88 * k];
  });
  const tFabric = pix(16, (x, y) => { const k = (((x + y) & 1) ? 0.93 : 1) * (0.93 + rnd() * 0.08); return [232 * k, 230 * k, 226 * k]; });
  const tRug = pix(32, (x, y) => {
    const k = 0.92 + rnd() * 0.12;
    const edge = Math.min(x, y, 31 - x, 31 - y);
    if (edge < 2) return [34 * k, 62 * k, 80 * k];
    if (edge === 2 || edge === 4) return [220 * k, 182 * k, 118 * k];
    if (edge === 3) return [150 * k, 60 * k, 50 * k];
    const dx = Math.abs(x - 15.5), dy = Math.abs(y - 15.5);
    if (dx + dy < 9 && (Math.floor(dx + dy) & 1) === 0) return [226 * k, 186 * k, 120 * k];
    if (dx + dy < 4) return [40 * k, 100 * k, 110 * k];
    if (((x + y) % 8 < 2) || ((x - y + 32) % 8 < 2)) return [196 * k, 150 * k, 100 * k];
    return [122 * k, 52 * k, 48 * k];
  });
  const tShade = paint(4, 16, (g, w, h) => {
    for (let y = 0; y < h; y++) {
      const k = 1 - Math.abs((y + 0.5) / h * 2 - 1);
      g.fillStyle = `rgb(${Math.round(222 + 33 * k)},${Math.round(150 + 85 * k)},${Math.round(70 + 100 * k)})`;
      g.fillRect(0, y, w, 1);
    }
    g.fillStyle = "rgba(120,60,20,0.25)";
    g.fillRect(0, 0, 1, h);
  }).tex;
  // Window: the night outside. The moon sits at (118, 17) of 160 x 52, which the moon halo and the egg match.
  const tSky = paint(160, 52, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#050819");
    gr.addColorStop(0.65, "#141d49");
    gr.addColorStop(1, "#2c2f66");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 110; i++) {
      const b = rnd();
      g.fillStyle = b > 0.92 ? "#ffffff" : b > 0.5 ? "#9fb1e8" : "#5f6fae";
      g.fillRect((rnd() * w) | 0, (rnd() * h * 0.8) | 0, 1, 1);
    }
    g.fillStyle = "#e8eeff";
    for (const [x, y] of [[20, 8], [58, 14], [140, 6], [84, 5]]) {
      g.fillRect(x - 1, y, 3, 1);
      g.fillRect(x, y - 1, 1, 3);
    }
    g.fillStyle = "#f6f0d8";
    g.beginPath();
    g.arc(118, 17, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#d3cbae";
    for (const [x, y, r] of [[114, 14, 3], [122, 21, 2.5], [120, 12, 1.5], [113, 22, 1.5]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#0b0e22";
    let x = 0;
    while (x < w) {
      const bw = 5 + ((rnd() * 9) | 0), bh = 8 + ((rnd() * 16) | 0);
      g.fillRect(x, h - bh, bw, bh);
      g.fillStyle = "#ffcf79";
      for (let wy = h - bh + 2; wy < h - 2; wy += 4) for (let wx = x + 1; wx < x + bw - 1; wx += 3) if (rnd() > 0.82) g.fillRect(wx, wy, 1, 2);
      g.fillStyle = "#0b0e22";
      x += bw + ((rnd() * 2) | 0);
    }
  }).tex;
  const tPoster = paint(32, 44, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, 28);
    gr.addColorStop(0, "#2a0a52");
    gr.addColorStop(0.6, "#b0306c");
    gr.addColorStop(1, "#ff8a50");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, 28);
    g.fillStyle = "#ffd95a";
    g.beginPath();
    g.arc(16, 22, 9, Math.PI, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ff8a50";
    for (let y = 18; y < 28; y += 3) g.fillRect(6, y, 20, 1);
    g.fillStyle = "#170a2e";
    g.fillRect(0, 28, w, 16);
    g.fillStyle = "#ff4fa3";
    for (let y = 29; y < 44; y += 3) g.fillRect(0, y, w, 1);
    for (let x = -24; x < 56; x += 8) {
      g.beginPath();
      g.moveTo(16 + x * 0.12, 28);
      g.lineTo(16 + x, 44);
      g.strokeStyle = "#ff4fa3";
      g.lineWidth = 1;
      g.stroke();
    }
    g.fillStyle = "#e8d6ff";
    g.fillRect(6, 37, 20, 2);
    g.fillRect(10, 40, 12, 1);
  }).tex;
  const tArt = paint(32, 24, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#2d8f9c");
    gr.addColorStop(1, "#f2c780");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#274a6e";
    g.beginPath();
    g.moveTo(0, 24); g.lineTo(9, 9); g.lineTo(18, 24);
    g.fill();
    g.fillStyle = "#1b3556";
    g.beginPath();
    g.moveTo(12, 24); g.lineTo(23, 6); g.lineTo(32, 24);
    g.fill();
    g.fillStyle = "#fff1c8";
    g.beginPath();
    g.arc(24, 5, 2.5, 0, Math.PI * 2);
    g.fill();
  }).tex;
  const tGlow = keep(
    (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.35, "rgba(255,255,255,0.45)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    })(),
  );
  const tPatch = paint(64, 32, (g) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, 64, 32);
    g.fillStyle = "#b7c8f0";
    for (const [x, y] of [[2, 2], [34, 2], [2, 17], [34, 17]]) g.fillRect(x, y, 28, 13);
  }).tex;
  const mon = paint(64, 48, () => {});
  const tv = paint(64, 48, () => {});

  /* ---- lights and materials ---- */
  const LU = {
    uSnap: U.uSnap,
    uAmb: { value: new THREE.Color(0.27, 0.31, 0.47) },
    uMoonDir: { value: new THREE.Vector3(0.15, -0.55, 0.8).normalize() },
    uMoonCol: { value: new THREE.Color(0.12, 0.17, 0.34) },
    uL0: { value: new THREE.Vector3(2.55, 2.85, -4.8) }, uC0: { value: new THREE.Color(0, 0, 0) },
    uL1: { value: new THREE.Vector3(-1.9, 3.1, -3.0) }, uC1: { value: new THREE.Color(0, 0, 0) },
    uL2: { value: new THREE.Vector3(-5.85, 2.2, -3.3) }, uC2: { value: new THREE.Color(0, 0, 0) },
    uR: { value: new THREE.Vector3(3.2, 1.7, 2.6) },
  };
  const mk = (o: MOpt) =>
    new THREE.ShaderMaterial({
      vertexShader: V,
      fragmentShader: F,
      side: o.side ?? THREE.FrontSide,
      transparent: Boolean(o.add),
      blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !o.add,
      uniforms: {
        ...LU,
        uMap: { value: o.map },
        uTint: { value: new THREE.Color(o.tint ?? "#ffffff") },
        uEmit: { value: new THREE.Color(0, 0, 0) },
        uUnlit: { value: o.unlit ? 1 : 0 },
        uGain: { value: o.gain ?? 1 },
        uAlpha: { value: o.alpha ?? 1 },
        uCrt: { value: o.crt ? 1 : 0 },
        uPlanar: { value: o.planar ?? 0 },
        uUv: { value: new THREE.Vector2(1, 1) },
      },
    });
  const mFloor = mk({ map: tPlank, tint: "#c0916a", planar: 0.5 });
  const mWall = mk({ map: tWall, tint: "#ffffff", planar: 0.3 });
  const mWood = mk({ map: tWood, tint: "#c2915f", planar: 0.6 });
  const mDark = mk({ map: tWood, tint: "#6f4c36", planar: 0.6 });
  const mPlain = mk({ map: tPlain });
  const mFab = mk({ map: tFabric, planar: 1.6 });
  const mRug = mk({ map: tRug });
  const mPoster = mk({ map: tPoster, gain: 1.35 });
  const mArt = mk({ map: tArt, gain: 1.35 });
  const mSky = mk({ map: tSky, unlit: true });
  const mDouble = mk({ map: tPlain, side: THREE.DoubleSide });
  const mBulbs = mk({ map: tPlain, unlit: true, gain: 1.2 });
  const mShade = mk({ map: tShade, unlit: true, side: THREE.DoubleSide, tint: "#ffffff", gain: 1.15 });
  const mMon = mk({ map: mon.tex, unlit: true, crt: true, gain: 1.15 });
  const mTv = mk({ map: tv.tex, unlit: true, crt: true, gain: 1.1 });
  const led = (hex: string) => mk({ map: tPlain, unlit: true, tint: hex, gain: 1.3 });
  const mLedG = led("#5dff8a");
  const mLedA = led("#ffb43a");
  const mLedR = led("#ff4a3a");
  const mLedBoom = led("#ff4a3a");
  const mGlass = mk({ map: tPlain, unlit: true, tint: "#9fd7ff", add: true, alpha: 0.07 });
  const glow = (hex: string, alpha: number) => mk({ map: tGlow, unlit: true, tint: hex, add: true, alpha });
  const mHaloLamp = glow("#ff9a48", 0.34);
  const mPoolLamp = glow("#ffa957", 0.5);
  const mWallLamp = glow("#ff9446", 0.2);
  const mHaloMoon = glow("#9db6ff", 0.3);
  const mHaloMon = glow("#7dffb0", 0.05);
  const mHaloTv = glow("#8fb0ff", 0.14);
  const mPatch = mk({ map: tPatch, unlit: true, tint: "#6f8fd8", add: true, alpha: 0.2 });
  const mStar = glow("#ffffff", 0);

  /* ---- geometry helpers ---- */
  const bat = kit.batcher();
  const col = new THREE.Color();
  const prep = (geo: THREE.BufferGeometry, color = "#ffffff", flat = false) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (flat) g.computeVertexNormals();
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    col.set(color);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute("aCol", new THREE.BufferAttribute(a, 3));
    return g;
  };
  /** A box sitting on `y` (its base), centred on x and z. */
  const bx = (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, c = "#ffffff", ry = 0, rx = 0, rz = 0) =>
    bat.add(prep(new THREE.BoxGeometry(w, h, d), c), m, x, y + h / 2, z, rx, ry, rz);
  /** A cylinder, axis up, base on `y`. `z` axis turns it to point at the room. */
  const cy = (m: THREE.Material, x: number, y: number, z: number, rt: number, rb: number, h: number, seg: number, c = "#ffffff", axisZ = false) => {
    const geo = new THREE.CylinderGeometry(rt, rb, h, seg);
    if (axisZ) geo.rotateX(Math.PI / 2);
    bat.add(prep(geo, c), m, x, axisZ ? y : y + h / 2, z);
  };
  const lathe = (m: THREE.Material, x: number, y: number, z: number, pts: [number, number][], seg: number, c = "#ffffff") =>
    bat.add(prep(new THREE.LatheGeometry(pts.map(([r, yy]) => new THREE.Vector2(r, yy)), seg), c), m, x, y, z);
  const plane = (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, rx = 0, ry = 0, sx = 1, sy = 1, c = "#ffffff") =>
    bat.add(prep(new THREE.PlaneGeometry(w, h, sx, sy), c), m, x, y, z, rx, ry, 0);
  const dyn = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, c = "#ffffff") => {
    const m = new THREE.Mesh(prep(geo, c), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  /* ---- shell: floor, walls, ceiling, skirting ---- */
  plane(mFloor, 0, 0, 0, HX * 2, FRONT - BACK, -Math.PI / 2, 0, 14, 11);
  plane(mWall, 0, H / 2, BACK, HX * 2, H, 0, 0, 12, 5);
  // Each wall gets its own cast of the paper: violet on the left, warm coral on the right.
  plane(mWall, -HX, H / 2, 0, FRONT - BACK, H, 0, Math.PI / 2, 10, 5, "#b48cff");
  plane(mWall, HX, H / 2, 0, FRONT - BACK, H, 0, -Math.PI / 2, 10, 5, "#ffb08a");
  plane(mWall, 0, H / 2, FRONT, HX * 2, H, 0, Math.PI, 12, 5, "#b48cff");
  plane(mPlain, 0, H, 0, HX * 2, FRONT - BACK, Math.PI / 2, 0, 1, 1, "#585270");
  bx(mDark, 0, 0, BACK + 0.05, HX * 2, 0.34, 0.1);
  bx(mDark, -HX + 0.05, 0, 0, 0.1, 0.34, FRONT - BACK);
  bx(mDark, HX - 0.05, 0, 0, 0.1, 0.34, FRONT - BACK);
  bx(mDark, 0, H - 0.18, BACK + 0.04, HX * 2, 0.18, 0.08, "#8c8296");

  /* ---- window with the moon, curtains ---- */
  const WX = -1.0, WY = 4.825, WW = 4.2, WH = 1.35;
  plane(mSky, WX, WY, BACK + 0.012, WW, WH);
  const frameC = "#e0d2bc";
  bx(mWood, WX, WY + WH / 2, BACK + 0.06, WW + 0.3, 0.14, 0.12, frameC);
  bx(mWood, WX, WY - WH / 2 - 0.14, BACK + 0.06, WW + 0.3, 0.14, 0.12, frameC);
  bx(mWood, WX - WW / 2 - 0.08, WY - WH / 2, BACK + 0.06, 0.14, WH, 0.12, frameC);
  bx(mWood, WX + WW / 2 + 0.08, WY - WH / 2, BACK + 0.06, 0.14, WH, 0.12, frameC);
  bx(mWood, WX, WY - WH / 2, BACK + 0.07, 0.07, WH, 0.1, frameC);
  bx(mWood, WX, WY - 0.035, BACK + 0.07, WW, 0.07, 0.1, frameC);
  bx(mWood, WX, WY - WH / 2 - 0.24, BACK + 0.15, WW + 0.6, 0.1, 0.32, frameC);
  bx(mPlain, WX, 5.62, BACK + 0.2, WW + 2.6, 0.05, 0.05, "#b9a46a");
  for (const sx of [-1, 1]) {
    const cx = WX + sx * (WW / 2 + 0.55);
    for (let i = 0; i < 3; i++) bx(mFab, cx + (i - 1) * 0.2, 3.75, BACK + 0.2 + (i % 2) * 0.04, 0.2, 1.9, 0.14, ["#7a2f3f", "#8a3a4c", "#6a2636"][i]);
  }

  /* ---- desk ---- */
  bx(mWood, -1.0, T - 0.12, -4.3, 4.8, 0.12, 2.4);
  bx(mWood, -3.32, 0, -4.3, 0.16, T - 0.12, 2.4);
  bx(mWood, 0.7, 0, -4.3, 1.4, T - 0.12, 2.4);
  bx(mDark, -1.66, 0.45, -5.44, 3.0, T - 0.57, 0.06);
  bx(mDark, -1.66, 1.2, -3.2, 3.0, 0.1, 0.06);
  bx(mWood, 0.7, 1.3, -3.08, 1.2, 0.55, 0.06, "#d2a373");
  bx(mWood, 0.7, 0.55, -3.08, 1.2, 0.6, 0.06, "#d2a373");
  bx(mPlain, 0.7, 1.52, -3.03, 0.5, 0.06, 0.07, "#c9b787");
  bx(mPlain, 0.7, 0.8, -3.03, 0.5, 0.06, 0.07, "#c9b787");
  bx(mPlain, 0.7, 1.12, -3.04, 1.14, 0.03, 0.04, "#2a1a10");

  /* ---- the computer ---- */
  const BEIGE = "#d8caa6", BEIGE2 = "#b8aa88";
  const CX = -1.9;
  bx(mPlain, CX, T, -4.65, 2.0, 0.42, 1.5, BEIGE);
  bx(mPlain, CX, T + 0.42, -4.65, 2.0, 0.03, 1.5, BEIGE2);
  bx(mPlain, CX - 0.45, T + 0.2, -3.9, 0.68, 0.12, 0.02, "#a79e8a");
  bx(mPlain, CX - 0.45, T + 0.23, -3.89, 0.5, 0.045, 0.02, "#15130f");
  bx(mPlain, CX + 0.25, T + 0.2, -3.9, 0.82, 0.14, 0.02, BEIGE2);
  bx(mPlain, CX + 0.25, T + 0.26, -3.89, 0.62, 0.03, 0.02, "#2a2722");
  for (let i = 0; i < 6; i++) bx(mPlain, CX + 0.58 + i * 0.07, T + 0.06, -3.895, 0.03, 0.12, 0.01, "#8c8370");
  cy(mPlain, CX + 0.8, T + 0.07, -3.9, 0.055, 0.055, 0.03, 10, "#e8dfc6", true);
  // monitor: stand, tube, bezel, screen recess
  const MY = T + 0.45, MH = 1.25, MZ = -4.15;
  cy(mPlain, CX, MY, -4.6, 0.5, 0.55, 0.06, 12, BEIGE2);
  bx(mPlain, CX, MY + 0.06, -4.78, 1.3, 1.0, 0.4, BEIGE);
  bx(mPlain, CX, MY + 0.2, -5.15, 0.9, 0.7, 0.35, BEIGE2);
  bx(mPlain, CX, MY + MH - 0.13, MZ - 0.25, 1.75, 0.13, 0.5, BEIGE);
  bx(mPlain, CX, MY + 0.06, MZ - 0.25, 1.75, 0.22, 0.5, BEIGE);
  bx(mPlain, CX - 0.775, MY + 0.28, MZ - 0.25, 0.2, MH - 0.41, 0.5, BEIGE);
  bx(mPlain, CX + 0.775, MY + 0.28, MZ - 0.25, 0.2, MH - 0.41, 0.5, BEIGE);
  bx(mPlain, CX, MY + 0.28, MZ - 0.42, 1.35, MH - 0.41, 0.1, "#0b0d0c");
  bx(mPlain, CX, MY + MH - 0.15, MZ - 0.04, 1.4, 0.03, 0.08, "#8f8670");
  bx(mPlain, CX, MY + 0.26, MZ - 0.04, 1.4, 0.03, 0.08, "#8f8670");
  bx(mPlain, CX - 0.69, MY + 0.28, MZ - 0.04, 0.03, MH - 0.41, 0.08, "#8f8670");
  bx(mPlain, CX + 0.69, MY + 0.28, MZ - 0.04, 0.03, MH - 0.41, 0.08, "#8f8670");
  bx(mPlain, CX + 0.35, MY + 0.07, MZ + 0.005, 0.22, 0.07, 0.03, "#9d937c");
  cy(mPlain, CX + 0.1, MY + 0.1, MZ + 0.01, 0.035, 0.035, 0.03, 8, "#8f8670", true);
  cy(mPlain, CX - 0.05, MY + 0.1, MZ + 0.01, 0.035, 0.035, 0.03, 8, "#8f8670", true);
  bx(mPlain, CX - 0.65, MY + MH - 0.35, MZ + 0.0, 0.2, 0.2, 0.01, "#f2e34c", 0, 0, 0.12);
  // keyboard
  const KX = -1.7, KZ = -3.45;
  bx(mPlain, KX, T, KZ, 1.7, 0.06, 0.56, BEIGE);
  const rows: [number, number][] = [[14, 0.0], [14, 0.0], [13, 0.055], [12, 0.11]];
  rows.forEach(([n, off], r) => {
    for (let k = 0; k < n; k++) {
      const wide = (r === 1 && k === 13) || (r === 2 && k === 0) || (r === 3 && (k === 0 || k === 11));
      bx(mPlain, KX - 0.78 + off + k * 0.113 + (wide ? 0.03 : 0), T + 0.06, KZ - 0.19 + r * 0.105, wide ? 0.15 : 0.092, 0.04, 0.092, k === 0 || wide ? BEIGE2 : "#ece3cb");
    }
  });
  bx(mPlain, KX, T + 0.06, KZ + 0.2, 0.72, 0.04, 0.085, "#ece3cb");
  bx(mPlain, KX - 0.84, T + 0.05, KZ + 0.0, 0.03, 0.07, 0.3, BEIGE2);
  // mouse pad, mouse, cables
  bx(mFab, -0.4, T, -3.5, 0.78, 0.02, 0.66, "#33376a");
  bx(mPlain, -0.4, T + 0.02, -3.52, 0.2, 0.08, 0.32, BEIGE);
  bx(mPlain, -0.4, T + 0.095, -3.6, 0.19, 0.01, 0.012, "#5a5444");
  bx(mPlain, -0.4, T + 0.095, -3.62, 0.012, 0.012, 0.12, "#5a5444");
  bx(mPlain, -0.4, T + 0.02, -3.82, 0.025, 0.025, 0.4, "#9d937c");
  bx(mPlain, -0.5, T + 0.02, -4.1, 0.025, 0.025, 0.42, "#9d937c", -0.6);
  bx(mPlain, KX + 0.1, T, -3.8, 0.03, 0.025, 0.18, "#9d937c");
  // mug, papers
  cy(mPlain, 1.05, T, -4.5, 0.19, 0.17, 0.34, 10, "#d2564a");
  cy(mPlain, 1.05, T + 0.33, -4.5, 0.16, 0.16, 0.015, 10, "#3a2316");
  bx(mPlain, 1.27, T + 0.08, -4.5, 0.07, 0.2, 0.07, "#d2564a");
  bx(mPlain, 0.68, T, -3.75, 0.72, 0.025, 0.92, "#ebe6d4", 0.2);
  bx(mPlain, 0.74, T + 0.025, -3.7, 0.7, 0.025, 0.9, "#e2dccb", -0.12);
  for (let i = 0; i < 4; i++) bx(mPlain, 0.74, T + 0.05, -3.45 - i * 0.18, 0.5, 0.004, 0.025, "#4a4a58", -0.12);
  // pencil cup
  cy(mPlain, -3.05, T, -4.9, 0.13, 0.11, 0.3, 8, "#4a6a8a");
  for (let i = 0; i < 3; i++) bx(mPlain, -3.05 + (i - 1) * 0.05, T + 0.2, -4.9, 0.02, 0.28, 0.02, ["#e0c84a", "#d8484a", "#4a8fd8"][i], 0, (i - 1) * 0.15, (i - 1) * -0.1);

  /* ---- nightstand and lamp ---- */
  const NX = 2.55, NZ = -4.8;
  bx(mWood, NX, NS - 0.12, NZ, 1.62, 0.12, 1.62);
  bx(mWood, NX, 0.22, NZ, 1.4, NS - 0.34, 1.4);
  bx(mDark, NX, 0, NZ, 1.3, 0.22, 1.3);
  bx(mWood, NX, 0.95, NZ + 0.71, 1.2, 0.5, 0.05, "#d2a373");
  bx(mWood, NX, 0.36, NZ + 0.71, 1.2, 0.5, 0.05, "#d2a373");
  cy(mPlain, NX, 1.15, NZ + 0.76, 0.07, 0.07, 0.05, 8, "#c8a24a", true);
  cy(mPlain, NX, 0.56, NZ + 0.76, 0.07, 0.07, 0.05, 8, "#c8a24a", true);
  bx(mPlain, 3.05, NS, -5.05, 0.42, 0.22, 0.22, "#1d1c22");
  bx(mLedR, 3.05, NS + 0.06, -4.935, 0.3, 0.1, 0.01);
  lathe(mPlain, NX, NS, NZ, [[0, 0], [0.3, 0], [0.37, 0.08], [0.42, 0.25], [0.38, 0.45], [0.2, 0.56], [0.09, 0.6], [0, 0.6]], 12, "#3d9a92");
  cy(mPlain, NX, NS + 0.6, NZ, 0.045, 0.045, 0.3, 6, "#cfaa52");
  cy(mPlain, NX, NS + 0.88, NZ, 0.1, 0.07, 0.1, 8, "#cfaa52");
  plane(mArt, 2.55, 4.6, BACK + 0.02, 1.1, 0.83, 0, 0);
  for (const [x, y, w, h] of [[2.55, 5.04, 1.22, 0.07], [2.55, 4.16, 1.22, 0.07], [1.97, 4.6, 0.07, 0.9], [3.13, 4.6, 0.07, 0.9]]) bx(mDark, x, y - h / 2, BACK + 0.04, w, h, 0.06);

  /* ---- cabinet ---- */
  bx(mWood, 5.2, CB - 0.1, -4.78, 3.1, 0.1, 1.5);
  bx(mWood, 5.2, 0.14, -4.8, 3.0, CB - 0.24, 1.4);
  bx(mDark, 5.2, 0, -4.8, 2.9, 0.14, 1.3);
  for (const x of [4.45, 5.95]) {
    bx(mWood, x, 0.28, -4.08, 1.38, 0.8, 0.05, "#d2a373");
    bx(mPlain, x + (x < 5 ? 0.5 : -0.5), 0.6, -4.03, 0.07, 0.22, 0.05, "#c8a24a");
  }

  /* ---- wall shelf: books, a plant, a stack of tapes ---- */
  const SA = 3.95, SAT = SA + 0.12;
  bx(mDark, 5.25, SA, -5.1, 3.1, 0.12, 0.8);
  bx(mDark, 4.0, SA - 0.3, -5.38, 0.08, 0.3, 0.12);
  bx(mDark, 6.4, SA - 0.3, -5.38, 0.08, 0.3, 0.12);
  const bookCols = ["#a8352f", "#2e5f8f", "#d4a63a", "#3e7a4b", "#6a3f8f", "#d8d0bd", "#c9602e", "#2a2f44", "#8f3a5a", "#4a8f8a"];
  let bxp = 3.85;
  for (let i = 0; i < 9; i++) {
    const w = 0.12 + rnd() * 0.09, h = 0.55 + rnd() * 0.4, c = bookCols[(i * 3 + 1) % bookCols.length];
    bx(mPlain, bxp + w / 2, SAT, -5.08, w, h, 0.5, c);
    bx(mPlain, bxp + w / 2, SAT + h * 0.55, -4.82, w * 0.98, 0.05, 0.01, "#e8dfbf");
    bxp += w + 0.01;
  }
  bx(mPlain, bxp + 0.28, SAT + 0.02, -5.08, 0.12, 0.8, 0.5, "#c9602e", 0, 0, -0.3);
  bx(mPlain, 5.35, SAT, -5.1, 0.06, 0.25, 0.4, "#8c8296");
  lathe(mPlain, 6.15, SAT, -5.1, [[0, 0], [0.2, 0], [0.27, 0.05], [0.3, 0.3], [0.33, 0.34], [0.33, 0.4], [0.22, 0.4], [0, 0.38]], 10, "#c0623f");
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7 + 0.2, tilt = 0.25 + (i % 3) * 0.18;
    const geo = new THREE.ConeGeometry(0.1, 0.8, 4);
    bat.add(prep(geo, ["#3f8f4f", "#2f7a45", "#58a95b"][i % 3], true), mPlain, 6.15 + Math.cos(a) * 0.13, SAT + 0.72, -5.1 + Math.sin(a) * 0.13, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
  }
  bx(mPlain, 5.75, SAT, -5.2, 0.14, 0.14, 0.14, "#d8d0bd", 0.5);
  cy(mPlain, 5.85, SAT, -4.95, 0.07, 0.06, 0.2, 8, "#ffcf79");

  /* ---- boombox on the cabinet ---- */
  const deck = new THREE.Group();
  deck.position.set(5.2, CB + 0.65, -4.85);
  root.add(deck);
  const dbat = kit.batcher();
  const dbx = (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, c: string, rz = 0) =>
    dbat.add(prep(new THREE.BoxGeometry(w, h, d), c), m, x, y, z, 0, 0, rz);
  const dcy = (m: THREE.Material, x: number, y: number, z: number, r: number, h: number, seg: number, c: string) =>
    dbat.add(prep(new THREE.CylinderGeometry(r, r, h, seg).rotateX(Math.PI / 2), c), m, x, y, z);
  dbx(mPlain, 0, 0, 0, 2.6, 1.3, 0.9, "#a3a9b1");
  dbx(mPlain, -0.8, 0.75, 0, 0.1, 0.2, 0.12, "#2a2c31");
  dbx(mPlain, 0.8, 0.75, 0, 0.1, 0.2, 0.12, "#2a2c31");
  dbx(mPlain, 0, 0.9, 0, 1.7, 0.1, 0.12, "#2a2c31");
  for (const sx of [-1, 1]) {
    dbx(mPlain, sx * 0.925, 0, 0.48, 0.77, 1.18, 0.06, "#17191d");
    dcy(mPlain, sx * 0.925, -0.12, 0.52, 0.32, 0.03, 14, "#a9adb3");
    dcy(mPlain, sx * 0.925, 0.43, 0.51, 0.13, 0.03, 10, "#a9adb3");
    dcy(mPlain, sx * 0.925, 0.43, 0.525, 0.09, 0.03, 10, "#0e0f12");
  }
  // centre column: panel around the cassette well
  dbx(mPlain, 0, 0.47, 0.475, 1.1, 0.36, 0.05, "#2b2e34");
  dbx(mPlain, 0, -0.52, 0.475, 1.1, 0.26, 0.05, "#2b2e34");
  dbx(mPlain, -0.54, -0.05, 0.475, 0.06, 0.68, 0.05, "#2b2e34");
  dbx(mPlain, 0.54, -0.05, 0.475, 0.06, 0.68, 0.05, "#2b2e34");
  dbx(mPlain, 0, -0.05, 0.4, 1.02, 0.7, 0.04, "#08090b");
  dbx(mPlain, 0, 0.3, 0.5, 1.04, 0.03, 0.02, "#a9adb3");
  dbx(mPlain, 0, -0.4, 0.5, 1.04, 0.03, 0.02, "#a9adb3");
  dbx(mPlain, 0, 0.47, 0.502, 0.96, 0.2, 0.01, "#07120b");
  dbx(mPlain, 0.98, 0.65, -0.3, 0.04, 1.0, 0.04, "#b9bcc2", 0.55);
  dbat.flush(deck);
  const meters: THREE.Mesh[] = [];
  const meterMats: THREE.ShaderMaterial[] = [];
  for (let i = 0; i < 8; i++) {
    const m = led("#1d2a1f");
    meterMats.push(m);
    meters.push(dyn(new THREE.BoxGeometry(0.095, 0.1, 0.01), m, deck, -0.42 + i * 0.12, 0.47, 0.51));
  }
  const playLed = dyn(new THREE.BoxGeometry(0.07, 0.07, 0.01), mLedBoom, deck, -0.45, -0.52 + 0.17, 0.505);
  const keyDefs: [number, string][] = [[-0.4, "#7a2a2a"], [-0.2, "#9a9da3"], [0, "#c3c6cb"], [0.2, "#9a9da3"], [0.4, "#9a9da3"]];
  const keys = keyDefs.map(([x, c]) => {
    const k = dyn(new THREE.BoxGeometry(0.15, 0.12, 0.07), mPlain, deck, x, -0.55, 0.52, c);
    k.userData.rest = k.position.z;
    return k;
  });
  const cones = [-1, 1].map((sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.925, -0.12, 0.52);
    deck.add(g);
    dyn(new THREE.CylinderGeometry(0.27, 0.1, 0.1, 12, 1, true).rotateX(Math.PI / 2), mDouble, g, 0, 0, 0.0, "#34373e");
    dyn(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 8).rotateX(Math.PI / 2), mPlain, g, 0, 0, 0.02, "#555a63");
    return g;
  });
  const glass = dyn(new THREE.PlaneGeometry(1.02, 0.7), mGlass, deck, 0, -0.05, 0.512);
  glass.renderOrder = 3;
  deck.updateMatrixWorld(true);
  const wellW = deck.localToWorld(new THREE.Vector3(0, -0.05, 0.455));

  /* ---- television, stand, console, controller ---- */
  const CH = "#34363b";
  bx(mWood, -5.4, ST - 0.1, -4.7, 3.4, 0.1, 1.6);
  bx(mWood, -7.04, 0, -4.7, 0.12, ST - 0.1, 1.6);
  bx(mWood, -3.76, 0, -4.7, 0.12, ST - 0.1, 1.6);
  bx(mWood, -5.4, 0.42, -4.7, 3.2, 0.08, 1.6);
  bx(mDark, -5.4, 0, -5.45, 3.2, ST - 0.1, 0.06);
  const TVX = -5.85, TZ = -4.55;
  bx(mPlain, TVX, ST + 1.55, TZ, 2.2, 0.25, 0.5, CH);
  bx(mPlain, TVX, ST, TZ, 2.2, 0.25, 0.5, CH);
  bx(mPlain, -6.89, ST + 0.25, TZ, 0.12, 1.3, 0.5, CH);
  bx(mPlain, -5.01, ST + 0.25, TZ, 0.53, 1.3, 0.5, "#3b3d43");
  bx(mPlain, -6.05, ST + 0.25, TZ - 0.12, 1.55, 1.3, 0.1, "#08090a");
  bx(mPlain, TVX, ST + 0.15, -5.0, 1.9, 1.5, 0.4, CH);
  bx(mPlain, TVX, ST + 0.4, -5.33, 1.3, 1.0, 0.25, "#2b2d31");
  cy(mPlain, -5.0, ST + 1.35, TZ + 0.26, 0.09, 0.09, 0.05, 10, "#8f9299", true);
  cy(mPlain, -5.0, ST + 1.0, TZ + 0.26, 0.09, 0.09, 0.05, 10, "#8f9299", true);
  for (let i = 0; i < 6; i++) bx(mPlain, -5.0, ST + 0.28 + i * 0.09, TZ + 0.255, 0.34, 0.03, 0.01, "#15161a");
  bx(mLedR, -5.2, ST + 0.06, TZ + 0.255, 0.05, 0.05, 0.01);
  cy(mPlain, -5.9, ST + 1.8, -4.95, 0.2, 0.22, 0.1, 10, "#2b2d31");
  for (const s of [-1, 1]) {
    // tilt each ear about its own base
    const geo = new THREE.CylinderGeometry(0.022, 0.022, 0.95, 5).translate(0, 0.475, 0);
    bat.add(prep(geo, "#c3c6cb"), mPlain, -5.9 + s * 0.05, ST + 1.88, -4.95, 0, 0, -s * 0.65);
  }
  // console on the floor in front of the stand, its controller a little way off
  const CNX = -5.3, CNZ = -3.25;
  bx(mPlain, CNX, 0, CNZ, 0.9, 0.17, 0.75, "#454952");
  bx(mPlain, CNX, 0.17, CNZ, 0.84, 0.03, 0.69, "#646a76");
  cy(mPlain, CNX, 0.2, CNZ - 0.03, 0.22, 0.22, 0.02, 12, "#2b2e35");
  cy(mPlain, CNX, 0.22, CNZ - 0.03, 0.05, 0.05, 0.02, 8, "#9a9ea8");
  for (let i = 0; i < 3; i++) bx(mPlain, CNX + 0.3, 0.2, CNZ - 0.25 + i * 0.07, 0.2, 0.004, 0.03, "#15161a");
  for (const dx of [-0.3, -0.16]) bx(mPlain, CNX + dx, 0.05, CNZ + 0.375, 0.1, 0.08, 0.02, "#0c0d10");
  bx(mPlain, CNX + 0.16, 0.1, CNZ + 0.375, 0.09, 0.05, 0.03, "#aab0bc");
  bx(mPlain, CNX + 0.29, 0.1, CNZ + 0.375, 0.09, 0.05, 0.03, "#aab0bc");
  const CTX = -5.0, CTZ = -2.4;
  bx(mPlain, CTX, 0, CTZ, 0.4, 0.08, 0.26, "#b4b7bd");
  for (const s of [-1, 1]) bx(mPlain, CTX + s * 0.24, 0, CTZ + 0.02, 0.17, 0.08, 0.32, "#b4b7bd", s * 0.2);
  bx(mPlain, CTX - 0.24, 0.08, CTZ, 0.12, 0.02, 0.035, "#33353b");
  bx(mPlain, CTX - 0.24, 0.08, CTZ, 0.035, 0.02, 0.12, "#33353b");
  [["#d8484a", 0.0, -0.055], ["#4a8fd8", -0.055, 0.0], ["#e0c84a", 0.0, 0.055], ["#5ac06a", 0.055, 0.0]].forEach(([c, dx, dz]) =>
    bx(mPlain, CTX + 0.25 + (dx as number), 0.08, CTZ + (dz as number), 0.05, 0.02, 0.05, c as string));
  const cable: [number, number][] = [[CTX, CTZ - 0.13], [CTX + 0.08, CTZ - 0.3], [CTX + 0.2, CTZ - 0.45], [CNX + 0.3, CNZ + 0.9], [CNX + 0.2, CNZ + 0.6], [CNX + 0.0, CNZ + 0.5], [CNX - 0.23, CNZ + 0.4]];
  for (let i = 0; i < cable.length - 1; i++) {
    const [ax, az] = cable[i], [cx2, cz] = cable[i + 1];
    bx(mPlain, (ax + cx2) / 2, 0, (az + cz) / 2, Math.hypot(cx2 - ax, cz - az) + 0.03, 0.03, 0.03, "#1c1c22", -Math.atan2(cz - az, cx2 - ax));
  }
  plane(mPoster, -5.6, 4.75, BACK + 0.02, 1.1, 1.5, 0, 0);
  for (const [x, y, w, h] of [[-5.6, 5.52, 1.22, 0.08], [-5.6, 3.98, 1.22, 0.08], [-6.19, 4.75, 0.08, 1.5], [-5.01, 4.75, 0.08, 1.5]]) bx(mDark, x, y - h / 2, BACK + 0.04, w, h, 0.06);

  /* ---- rug, cushion, bed, left wall ---- */
  plane(mRug, 0.5, 0.03, -0.8, 6.4, 4.4, -Math.PI / 2, 0, 6, 4);
  cy(mFab, 3.0, 0.03, 0.45, 0.5, 0.5, 0.22, 10, "#c95d4a");
  bx(mDark, 5.95, 0.2, -1.2, 2.5, 0.3, 3.2);
  for (const [x, z] of [[4.8, -2.7], [7.0, -2.7], [4.8, 0.3], [7.0, 0.3]]) bx(mDark, x, 0, z, 0.2, 0.2, 0.2);
  bx(mFab, 5.95, 0.5, -1.2, 2.4, 0.45, 3.1, "#cfc8d8");
  // Blanket on the mattress (top at 0.95, foot at z 0.35), hanging down over the foot and the open side.
  bx(mFab, 5.95, 0.95, -0.53, 2.46, 0.12, 1.94, "#b7523f");
  bx(mFab, 5.95, 0.55, 0.42, 2.46, 0.52, 0.04, "#b7523f");
  bx(mFab, 4.71, 0.55, -0.53, 0.04, 0.52, 1.94, "#b7523f");
  bx(mFab, 5.95, 0.97, 0.12, 2.48, 0.12, 0.3, "#2c3f66");
  bx(mFab, 5.95, 0.97, -0.7, 2.48, 0.12, 0.3, "#2c3f66");
  bx(mFab, 5.95, 0.95, -1.55, 2.46, 0.2, 0.4, "#c9674f");
  bx(mFab, 5.95, 0.95, -2.3, 1.4, 0.28, 0.7, "#e9e1d3", 0, 0.08);
  plane(mArt, HX - 0.02, 3.3, -1.0, 1.5, 1.12, 0, -Math.PI / 2);
  bx(mDark, HX - 0.04, 3.3 + 0.56, -1.0, 0.06, 0.08, 1.62);
  bx(mDark, HX - 0.04, 3.3 - 0.64, -1.0, 0.06, 0.08, 1.62);
  bx(mDark, HX - 0.04, 3.3 - 0.6, -1.78, 0.06, 1.2, 0.08);
  bx(mDark, HX - 0.04, 3.3 - 0.6, -0.22, 0.06, 1.2, 0.08);
  bx(mWood, -HX + 0.05, 0, 1.2, 0.1, 4.2, 2.0, "#8a6a4e");
  cy(mPlain, -HX + 0.14, 2.0, 0.55, 0.07, 0.07, 0.07, 8, "#c8a24a", false);
  plane(mPoster, -HX + 0.02, 3.4, -2.2, 1.0, 1.36, 0, Math.PI / 2);
  // fairy lights along the top of the back wall
  const lightCols = ["#ffd27a", "#ff9ac8", "#ffd27a", "#9fe6ff"];
  for (const [x0, x1] of [[-7.0, -3.6], [2.1, 7.0]]) {
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = x0 + (x1 - x0) * u;
      bat.add(prep(new THREE.BoxGeometry(0.1, 0.1, 0.1), lightCols[i % 4]), mBulbs, x, 5.55 - Math.sin(u * Math.PI) * 0.35, BACK + 0.12);
    }
  }

  // moonlight on the floor and a faint shine on the desk
  plane(mPatch, -0.4, 0.045, -1.0, 4.6, 2.3, -Math.PI / 2, 0.12);

  /* ---- soft glows (billboards): lamp, moon, screens ---- */
  const billboards: THREE.Mesh[] = [];
  const halo = (m: THREE.Material, x: number, y: number, z: number, r: number) => {
    const h = dyn(new THREE.PlaneGeometry(r * 2, r * 2), m, root, x, y, z);
    billboards.push(h);
    return h;
  };
  const lampHalo = halo(mHaloLamp, NX, NS + 1.15, NZ + 0.2, 1.9);
  const moonHalo = halo(mHaloMoon, WX + (118 / 160 - 0.5) * WW, WY + (0.5 - 17 / 52) * WH, BACK + 0.2, 0.65);
  halo(mHaloMon, CX, MY + 0.7, MZ + 0.2, 1.4);
  const tvHalo = halo(mHaloTv, TVX - 0.2, ST + 0.9, TZ + 0.5, 2.0);
  const wallGlow = dyn(new THREE.PlaneGeometry(5.6, 4.2), mWallLamp, root, NX, 3.1, BACK + 0.03);
  const pool = dyn(new THREE.PlaneGeometry(2.0, 1.4).rotateX(-Math.PI / 2), mPoolLamp, root, NX, NS + 0.012, NZ + 0.1);
  moonHalo.renderOrder = 2;
  const star = dyn(new THREE.PlaneGeometry(1.0, 0.07), mStar, root, 0, 0, BACK + 0.03);
  star.visible = false;

  const lampShade = dyn(new THREE.CylinderGeometry(0.45, 0.78, 0.85, 14, 1, true), mShade, root, NX, NS + 0.7 + 0.425, NZ);

  const statics = bat.flush(root);
  statics.forEach((m) => { m.frustumCulled = false; });

  /* ---- screens ---- */
  const monScreen = dyn(new THREE.PlaneGeometry(1.35, MH - 0.41), mMon, root, CX, MY + 0.28 + (MH - 0.41) / 2, MZ - 0.36);
  const tvScreen = dyn(new THREE.PlaneGeometry(1.55, 1.3), mTv, root, -6.05, ST + 0.9, TZ - 0.07);
  const ledPower = dyn(new THREE.BoxGeometry(0.05, 0.05, 0.01), mLedG, root, CX + 0.55, MY + 0.08, MZ + 0.005);
  const ledHdd = dyn(new THREE.BoxGeometry(0.05, 0.05, 0.01), mLedA, root, CX + 0.65, MY + 0.08, MZ + 0.005);
  const ledCase = dyn(new THREE.BoxGeometry(0.05, 0.04, 0.01), mLedG, root, CX - 0.1, T + 0.32, -3.89);
  const ledConsole = dyn(new THREE.BoxGeometry(0.06, 0.05, 0.01), mLedA, root, CNX - 0.04, 0.1, CNZ + 0.385);

  const monDraw = (t: number) => {
    const g = mon.g;
    g.fillStyle = "#04120a";
    g.fillRect(0, 0, 64, 48);
    g.fillStyle = "#103a24";
    g.fillRect(0, 0, 64, 4);
    g.fillStyle = "#58f08a";
    g.fillRect(2, 1, 9, 2);
    g.fillRect(14, 1, 5, 2);
    const base = Math.floor(t * 1.6);
    for (let r = 0; r < 10; r++) {
      const s = base + r;
      const h1 = Math.abs(Math.sin(s * 12.9898) * 43758.5453) % 1;
      let x = 3 + (h1 > 0.7 ? 6 : h1 > 0.45 ? 3 : 0);
      const y = 6 + r * 4;
      let k = 0;
      while (x < 58) {
        const h2 = Math.abs(Math.sin((s * 7 + k) * 78.233) * 12345.678) % 1;
        const w = 2 + Math.floor(h2 * 6);
        g.fillStyle = h2 > 0.86 ? "#ffc24a" : h2 > 0.7 ? "#6fd8ff" : h2 < 0.2 ? "#2d8f55" : "#58f08a";
        if (h2 > 0.12) g.fillRect(x, y, Math.min(w, 59 - x), 2);
        x += w + 2;
        k++;
      }
    }
    // prompt, typing, cursor
    const typed = Math.floor((t * 5) % 22);
    g.fillStyle = "#58f08a";
    g.fillRect(3, 46 - 4, 2, 2);
    g.fillRect(7, 46 - 4, Math.min(typed, 20), 2);
    if (Math.floor(t * 2.5) % 2 === 0) g.fillRect(9 + Math.min(typed, 20), 46 - 5, 3, 4);
    mon.tex.needsUpdate = true;
  };
  const tvImg = tv.g.createImageData(64, 48);
  let tvAvg: [number, number, number] = [0.5, 0.6, 1];
  const BARS = [[0.82, 0.82, 0.82], [0.82, 0.82, 0.08], [0.08, 0.82, 0.82], [0.08, 0.82, 0.08], [0.82, 0.08, 0.82], [0.82, 0.08, 0.08], [0.08, 0.08, 0.82]];
  const tvDraw = (t: number, mode: number) => {
    const d = tvImg.data;
    let ar = 0, ag = 0, ab = 0;
    for (let y = 0; y < 48; y++) {
      const jit = mode === 1 ? Math.round(Math.sin(y * 0.7 + t * 40) * 2) : 0;
      for (let x = 0; x < 64; x++) {
        let r: number, g: number, b: number;
        if (mode === 0) {
          const v = Math.sin(x * 0.2 + t * 0.9) + Math.sin(y * 0.28 - t * 1.2) + Math.sin((x + y) * 0.13 + t * 0.6) + Math.sin(Math.hypot(x - 32, y - 24) * 0.26 - t * 1.5);
          const k = Math.floor(((v + 4) / 8) * 7) / 7;
          r = 0.5 + 0.5 * Math.cos(6.283 * (k * 0.9 + 0.55));
          g = 0.5 + 0.5 * Math.cos(6.283 * (k * 0.9 + 0.78));
          b = 0.5 + 0.5 * Math.cos(6.283 * (k * 0.9 + 0.05));
          const chk = ((x >> 3) + (y >> 3) + Math.floor(t * 1.5)) & 1;
          if (y > 40) { r = g = b = chk ? 0.12 : 0.85; }
        } else {
          const xi = ((x + jit) % 64 + 64) % 64;
          if (y < 32) [r, g, b] = BARS[Math.min(6, Math.floor(xi / 9.2))];
          else if (y < 40) [r, g, b] = [0.08 + 0.7 * (xi / 64), 0.08, 0.08 + 0.7 * (1 - xi / 64)];
          else { r = g = b = Math.random() * 0.9; }
          const roll = (t * 18) % 60;
          if (Math.abs(y - roll) < 3) { r = g = b = Math.min(1, r + 0.4); }
        }
        const i = (y * 64 + x) * 4;
        d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255; d[i + 3] = 255;
        ar += r; ag += g; ab += b;
      }
    }
    tvAvg = [ar / 3072, ag / 3072, ab / 3072];
    tv.g.putImageData(tvImg, 0, 0);
    tv.tex.needsUpdate = true;
  };
  monDraw(0);
  tvDraw(0, 0);

  /* ---- cassettes ---- */
  const tapeBody = prep(new THREE.BoxGeometry(TW, TH, TD), "#ffffff");
  const tapeFace = prep(new THREE.PlaneGeometry(TW * 0.998, TH * 0.998));
  const hubGeo = (() => {
    const z = (g: THREE.BufferGeometry, zz: number, c: string) => prep(g.translate(0, 0, zz), c);
    const parts = [
      z(new THREE.CylinderGeometry(0.15, 0.15, 0.01, 10).rotateX(Math.PI / 2), 0.0, "#4a2f22"),
      z(new THREE.CylinderGeometry(0.085, 0.085, 0.012, 10).rotateX(Math.PI / 2), 0.01, "#e8e4da"),
      z(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 6).rotateX(Math.PI / 2), 0.02, "#1c1a20"),
    ];
    for (let i = 0; i < 3; i++) parts.push(prep(new THREE.BoxGeometry(0.17, 0.028, 0.01).rotateZ((i * Math.PI) / 3).translate(0, 0, 0.018), "#2a2630"));
    return mergeGeometries(parts)!;
  })();
  const mHub = mk({ map: tPlain, gain: 1.2 });
  const labelTex = (i: number, paper: string, ink: string, shell: string) =>
    paint(64, 40, (g) => {
      g.fillStyle = shell;
      g.fillRect(0, 0, 64, 40);
      g.fillStyle = paper;
      g.fillRect(3, 3, 58, 31);
      g.fillStyle = ink;
      g.fillRect(3, 5, 58, 5);
      g.fillRect(6, 33 - 2, 12 + (i % 4) * 4, 1);
      g.fillStyle = shell === "#8d9099" ? "#4a4d56" : "#0d0c10";
      g.fillRect(10, 12, 44, 19);
      g.fillStyle = ink;
      g.fillRect(52, 6, 7, 3);
      g.fillStyle = shell;
      g.fillRect(8, 34, 48, 6);
      g.fillStyle = "#0a090c";
      g.fillRect(20, 35, 3, 3);
      g.fillRect(41, 35, 3, 3);
      g.fillStyle = "#aeb0b8";
      for (const [x, y] of [[1, 1], [62, 1], [1, 38], [62, 38]]) g.fillRect(x, y, 1, 1);
    }).tex;

  const Qx = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
  const Qy = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
  const flat = (yaw: number) => Qy(yaw).multiply(Qx(-Math.PI / 2));
  // x, y (centre), z, yaw
  const HOMES: [number, number, number, number][] = [
    [-0.9, 0.075, -1.6, 0.4], [0.4, 0.075, -0.6, -0.7], [1.9, 0.075, -1.9, 1.2], [-2.0, 0.075, -0.2, 0.15],
    [-2.95, T + 0.045, -3.85, 0.25], [0.0, T + 0.045, -4.6, -0.5], [0.7, T + 0.1, -3.7, 0.55],
    [5.35, SAT + 0.045, -5.0, 0.1], [5.4, SAT + 0.135, -5.0, -0.12], [5.33, SAT + 0.225, -5.02, 0.2], [5.37, SAT + 0.315, -5.0, -0.05],
    [2.3, NS + 0.045, -4.4, 0.3], [-5.3, 0.5 + 0.045, -4.6, -0.2], [6.05, 1.09 + 0.045, -0.6, 0.5],
  ];
  const tapes: Tape[] = TAPE_SOUNDS.map((snd, i) => {
    const info = INFO[snd.id] ?? { title: snd.id, paper: "#d9cfe0", ink: "#7c2d63" };
    const shell = SHELLS[i % SHELLS.length];
    const g = new THREE.Group();
    const body = new THREE.Mesh(tapeBody, mk({ map: tPlain, tint: shell, gain: 1.1 }));
    const label = mk({ map: labelTex(i, info.paper, info.ink, shell), gain: 1.3 });
    const face = new THREE.Mesh(tapeFace, label);
    face.position.z = TD / 2 + 0.002;
    g.add(body, face);
    const reels = [-1, 1].map((s) => {
      const r = new THREE.Mesh(hubGeo, mHub);
      r.position.set(s * 0.2, -0.0, TD / 2 + 0.006);
      g.add(r);
      return r;
    });
    const [x, y, z, yaw] = HOMES[i] ?? HOMES[0];
    const hp = new THREE.Vector3(x, y, z), hq = flat(yaw);
    g.position.copy(hp);
    g.quaternion.copy(hq);
    root.add(g);
    return {
      i, g, label, reels, hp, hq, state: "home", to: "home",
      fp: new THREE.Vector3(), fq: new THREE.Quaternion(), fs: 1, tp: new THREE.Vector3(), tq: new THREE.Quaternion(), ts: 1, k: 1,
      target: hp.clone(),
    };
  });

  /* ---- the deck: loading, playing, ejecting ---- */
  const DECK_Q = new THREE.Quaternion();
  let loadedIdx = -1;
  let spinning = false;
  let level = 0;
  let lastWall = performance.now();
  let watch: ReturnType<typeof setInterval> | undefined;
  const stopWatch = () => {
    if (watch) clearInterval(watch);
    watch = undefined;
  };
  // update() stops being called when the scene is hidden or off screen: take the tape out of the music then.
  const startWatch = () => {
    if (watch) return;
    watch = setInterval(() => {
      if (performance.now() - lastWall > 2000) {
        audio.pause();
        spinning = false;
        stopWatch();
      }
    }, 1000);
  };
  const flyTo = (t: Tape, to: "home" | "loaded") => {
    t.fp.copy(t.g.position);
    t.fq.copy(t.g.quaternion);
    t.fs = t.g.scale.x;
    if (to === "home") {
      t.tp.copy(t.hp);
      t.tq.copy(t.hq);
      t.ts = 1;
    } else {
      t.tp.copy(wellW);
      t.tq.copy(DECK_Q);
      t.ts = 1;
    }
    t.to = to;
    t.k = 0;
    t.state = "fly";
  };
  const sendHome = (t: Tape) => flyTo(t, "home");
  const eject = () => {
    audio.eject();
    loadedIdx = -1;
    spinning = false;
    stopWatch();
  };
  const startPlay = () => {
    spinning = true;
    startWatch();
    audio.play().catch(() => {});
  };
  const loadTape = (i: number) => {
    if (loadedIdx >= 0 && loadedIdx !== i) sendHome(tapes[loadedIdx]);
    loadedIdx = i;
    flyTo(tapes[i], "loaded");
    audio.load(i);
    startPlay();
  };
  const togglePlay = () => {
    if (loadedIdx < 0) return;
    if (spinning) {
      audio.pause();
      spinning = false;
    } else startPlay();
  };

  /* ---- pointer: aim, grab, drag, drop ---- */
  const ray = new THREE.Ray();
  let rayOn = false;
  const inv = new THREE.Matrix4(), lr = new THREE.Ray(), bb = new THREE.Box3(), hit = new THREE.Vector3(), tmp = new THREE.Vector3();
  const hitBox = (o: THREE.Object3D, hx: number, hy: number, hz: number) => {
    o.updateWorldMatrix(true, false);
    inv.copy(o.matrixWorld).invert();
    lr.copy(ray).applyMatrix4(inv);
    bb.min.set(-hx, -hy, -hz);
    bb.max.set(hx, hy, hz);
    return lr.intersectBox(bb, hit) ? lr.origin.distanceTo(hit) : Infinity;
  };
  const pickTape = () => {
    let best = -1, bd = Infinity;
    for (const t of tapes) {
      if (t.state !== "home" && t.state !== "loaded") continue;
      const d = hitBox(t.g, TW * 0.6, TH * 0.65, 0.16);
      if (d < bd) { bd = d; best = t.i; }
    }
    return best;
  };
  const overDeck = () => hitBox(deck, 1.3, 0.65, 0.45) < Infinity;
  let grab: { i: number; sx: number; sy: number; lifted: boolean } | null = null;
  let hoverTape = -1, hoverDeck = false, deckPressed = false, dropOn = false;
  const plane3 = new THREE.Plane(), nrm = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const LIFT_NDC = 0.016;

  const aim = (r: THREE.Ray | null) => {
    rayOn = Boolean(r);
    if (r) ray.copy(r);
    if (!rayOn) { hoverTape = -1; hoverDeck = false; return; }
    if (grab) {
      ray.at(10, ndc).project(cam);
      if (!grab.lifted && Math.hypot(ndc.x - grab.sx, ndc.y - grab.sy) > LIFT_NDC) {
        grab.lifted = true;
        const t = tapes[grab.i];
        t.state = "lift";
      }
      if (grab.lifted) {
        const t = tapes[grab.i];
        cam.getWorldDirection(nrm).negate();
        plane3.setFromNormalAndCoplanarPoint(nrm, wellW);
        if (ray.intersectPlane(plane3, tmp)) {
          t.target.set(Math.max(-HX + 0.6, Math.min(HX - 0.6, tmp.x)), Math.max(0.4, Math.min(H - 0.8, tmp.y)), Math.max(BACK + 0.4, Math.min(FRONT - 0.5, tmp.z)));
          dropOn = t.target.distanceTo(wellW) < 0.95;
        }
      }
      return;
    }
    hoverTape = pickTape();
    hoverDeck = hoverTape < 0 && overDeck();
  };

  /* ---- eggs ---- */
  let tLamp = -99, tConsole = -99, tMoon = -99;
  const lampLevel = (t: number) => {
    const e = t - tLamp;
    let k = 1;
    if (e > 0 && e < 2.5) {
      if (e < 0.9) k = Math.sin(e * 47) > 0.1 ? 1 : 0.2;
      else if (e < 1.8) k = 0.06;
      else k = Math.sin(e * 55) > -0.2 ? 1 : 0.3;
    }
    return k * (0.975 + 0.025 * Math.sin(t * 2.3));
  };

  /* ---- frame loop ---- */
  const LAMP = new THREE.Color(1.0, 0.6, 0.28);
  const lastKey = { mon: -1, tv: -1 };
  let lastT = -1, still = 0;
  const qFace = new THREE.Quaternion(), qTilt = Qx(-0.3);
  const vuOn = ["#6bff8c", "#6bff8c", "#6bff8c", "#6bff8c", "#b7ff5a", "#ffc23a", "#ffc23a", "#ff4a3a"];
  const vuOff = "#1d2a1f";
  const vuState: boolean[] = new Array(8).fill(false);
  const CAM = new THREE.Vector3(0.6, 4.2, 5.25);
  let sx = 0, sy = 0;

  return {
    scene,
    cam,
    fog: [60, 140],
    fov: [52, 86],
    limits: { pitch: [-0.22, 0.3], zoom: [0.8, 1.8], yaw: 0.6 },
    labels: [],
    pointer: {
      aim: (r) => aim(r),
      press: () => {
        deckPressed = hoverDeck;
      },
      grab: () => {
        if (hoverTape < 0) return false;
        ray.at(10, ndc).project(cam);
        grab = { i: hoverTape, sx: ndc.x, sy: ndc.y, lifted: false };
        return true;
      },
      release: (tap) => {
        if (grab) {
          const g = grab, t = tapes[g.i];
          grab = null;
          const over = dropOn;
          dropOn = false;
          if (!g.lifted) {
            if (tap) {
              if (g.i === loadedIdx) togglePlay();
              else loadTape(g.i);
            }
            return;
          }
          if (over) {
            if (g.i !== loadedIdx) loadTape(g.i);
            else flyTo(t, "loaded");
          } else {
            if (g.i === loadedIdx) eject();
            sendHome(t);
          }
          return;
        }
        if (tap && deckPressed) togglePlay();
        deckPressed = false;
      },
      busy: () => grab !== null || spinning || tapes.some((t) => t.state === "fly" || t.state === "lift"),
    },
    cursor: () => (grab ? "" : hoverTape >= 0 ? "grab" : hoverDeck ? "pointer" : ""),
    eggs: [
      { id: "room-lamp", r: 38, at: (v: V3) => { v.set(NX, NS + 1.15, NZ + 0.4); }, fire: (t) => { tLamp = t; } },
      { id: "room-console", r: 30, at: (v: V3) => { v.set(CNX, 0.25, CNZ); }, fire: (t) => { tConsole = t; } },
      { id: "room-moon", r: 30, at: (v: V3) => { v.copy(moonHalo.position); }, fire: (t) => { tMoon = t; } },
    ],
    update(t) {
      const now = performance.now();
      const rdt = Math.min(0.05, (now - lastWall) / 1000);
      lastWall = now;
      const sdt = lastT < 0 ? 0 : t - lastT;
      lastT = t;
      // Scene time stands still under reduced motion: then tapes snap instead of flying.
      still = sdt <= 0 ? still + 1 : 0;
      const snap = still >= 2;
      const dt = Math.max(0, Math.min(0.1, sdt));

      // camera: standing in the room, a slow drift with the pointer
      const f = 1 - Math.exp(-rdt * 0.9);
      sx += (view.px - sx) * f;
      sy += (view.py - sy) * f;
      cam.position.set(CAM.x + Math.sin(t * 0.07) * 0.05 + sx * 0.5, CAM.y - sy * 0.15, CAM.z);
      // A tall frame looks at the desk, lamp and deck; a wide one takes in the whole back wall.
      const tall = cam.aspect < 1;
      cam.lookAt((tall ? 1.4 : 0.1) + sx * 0.8, (tall ? 1.5 : 2.15) - sy * 0.6, BACK);
      kit.look(cam);

      // lights
      const k = lampLevel(t);
      LU.uC0.value.copy(LAMP).multiplyScalar(2.2 * k);
      const mm = 0.9 + 0.1 * Math.sin(t * 7.3);
      LU.uC1.value.set(0.35, 1.0, 0.6).multiplyScalar(0.6 * mm);
      const tvGain = 1.5;
      LU.uC2.value.set(tvAvg[0], tvAvg[1], tvAvg[2]).multiplyScalar(tvGain);
      mShade.uniforms.uGain.value = 0.55 + 0.7 * k;
      mHaloLamp.uniforms.uAlpha.value = 0.34 * k;
      mPoolLamp.uniforms.uAlpha.value = 0.5 * k;
      mWallLamp.uniforms.uAlpha.value = 0.1 * k;
      for (const b of billboards) b.quaternion.copy(cam.quaternion);
      const em = pulse(t - tMoon, 3);
      mHaloMoon.uniforms.uAlpha.value = 0.3 + 0.4 * em;
      moonHalo.scale.setScalar(1 + 0.25 * em);
      const es = t - tMoon;
      star.visible = es > 0.2 && es < 1.4;
      if (star.visible) {
        const u = (es - 0.2) / 1.2;
        star.position.set(WX + 1.7 - u * 3.0, WY + 0.55 - u * 0.75, BACK + 0.03);
        star.rotation.z = Math.atan2(-0.75, -3.0);
        mStar.uniforms.uAlpha.value = Math.sin(u * Math.PI) * 0.9;
      }

      // screens, 10 fps
      const km = Math.floor(t * 10);
      if (km !== lastKey.mon) { lastKey.mon = km; monDraw(t); }
      const et = t - tConsole;
      const mode = et > 0 && et < 3.2 ? 1 : 0;
      if (km !== lastKey.tv) { lastKey.tv = km; tvDraw(t, mode); }
      mHaloTv.uniforms.uAlpha.value = 0.12 + 0.12 * (mode === 1 ? 1 : 0);
      ledConsole.visible = mode === 1 ? Math.floor(t * 8) % 2 === 0 : true;
      ledHdd.visible = Math.sin(t * 13) * Math.sin(t * 5.1) > 0.55;

      // tapes
      const loadedTape = loadedIdx >= 0 ? tapes[loadedIdx] : null;
      for (const tp of tapes) {
        const g = tp.g;
        if (tp.state === "lift") {
          const over = dropOn && grab?.i === tp.i;
          if (snap) g.position.copy(tp.target);
          else g.position.lerp(tp.target, 1 - Math.exp(-rdt * 16));
          if (over) qFace.copy(DECK_Q);
          else qFace.copy(cam.quaternion).multiply(qTilt);
          g.quaternion.slerp(qFace, snap ? 1 : 1 - Math.exp(-rdt * 10));
          g.scale.setScalar(g.scale.x + (1.12 - g.scale.x) * (snap ? 1 : 1 - Math.exp(-rdt * 10)));
        } else if (tp.state === "fly") {
          tp.k = snap ? 1 : Math.min(1, tp.k + rdt / 0.42);
          const e = 1 - Math.pow(1 - tp.k, 3);
          g.position.lerpVectors(tp.fp, tp.tp, e);
          g.position.y += Math.sin(e * Math.PI) * 0.6;
          g.quaternion.copy(tp.fq).slerp(tp.tq, e);
          g.scale.setScalar(tp.fs + (tp.ts - tp.fs) * e);
          if (tp.k >= 1) tp.state = tp.to;
        }
        const hot = tp.i === hoverTape && !grab;
        tp.label.uniforms.uEmit.value.setScalar(hot ? 0.2 : 0);
      }
      if (loadedTape && loadedTape.state === "loaded" && spinning) for (let r = 0; r < 2; r++) loadedTape.reels[r].rotation.z -= dt * (3.6 + r * 0.5);

      // deck: level lights, cones, keys, glass
      const raw = spinning ? audio.level() : 0;
      level += (raw - level) * (raw > level ? 0.7 : 0.15);
      cones.forEach((c) => { c.position.z = 0.52 + level * 0.05; c.scale.setScalar(1 + level * 0.06); });
      for (let i = 0; i < 8; i++) {
        const on = level * 9.5 > i + 0.3;
        if (on !== vuState[i]) {
          vuState[i] = on;
          meterMats[i].uniforms.uTint.value.set(on ? vuOn[i] : vuOff);
          meters[i].scale.z = on ? 1.6 : 1;
        }
      }
      const loadedNow = loadedTape !== null;
      mLedBoom.uniforms.uTint.value.set(spinning ? "#ff5a3a" : loadedNow ? "#6a2a22" : "#3a1a18");
      keys[2].position.z = (keys[2].userData.rest as number) - (spinning ? 0.05 : 0);
      keys[3].position.z = (keys[3].userData.rest as number) - (!spinning && loadedNow ? 0.05 : 0);
      const gl = dropOn ? 0.3 : hoverDeck && grab === null ? 0.14 : 0.07;
      mGlass.uniforms.uAlpha.value += (gl - mGlass.uniforms.uAlpha.value) * 0.3;
    },
    readout() {
      const tape = loadedIdx >= 0 ? (INFO[TAPE_SOUNDS[loadedIdx].id]?.title ?? "") : "none";
      return [
        ["Tape", tape],
        ["Deck", spinning ? "playing" : loadedIdx >= 0 ? "paused" : "empty"],
        ["Level", `${Math.round(level * 100)}%`],
        ["Lamp", "on"],
        ["Tapes", String(tapes.length)],
      ];
    },
    dispose() {
      stopWatch();
      audio.dispose();
      textures.forEach((x) => x.dispose());
    },
  };
}
