/** Sheet · Beach: a crescent of white sand at sunset. You stand near the top of the beach under the palms; the shore curves
 *  away to the left into a long bay arm ending in a wooded headland, and the open sea runs out to the right
 *  where the sun is going down far off on the horizon.
 *
 *  Waves come in as lines: each crest builds over the shallows, curls white and breaks, and the bore runs
 *  up the sand as a thin sheet, stops, and drains back, leaving the sand dark and glossy where it reached.
 *  Wave heights vary from set to set. Sandpipers chase the edge of the water up and down.
 *
 *  Everything lives in a shore frame: `bend(x)` is the curve of the waterline, and `zs = z - bend(x)` is the
 *  distance inland from it (negative = out to sea). One model of sand, crests and runup is written twice, in
 *  GLSL for the shaders and in JS for the birds, and the two must match.
 *
 *  The palette is fixed. Eggs: the sun (a green flash), the sandpipers (they flush and come back). */
import * as THREE from "three";
import { pulse, type PsxKit, type SceneDef } from "./psx";

const T = 6.5; // seconds between waves
const L = 21; // metres between crests out past the break
const RUN = 0.28; // runup height of an average wave, metres
const SUN = new THREE.Vector3(-96, 3.2, -440);
const LIGHT = new THREE.Vector3(-0.2, 0.32, -0.92).normalize();

/* ---- the shore model, JS side ---- */
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const fract = (x: number) => x - Math.floor(x);
const bend = (x: number) => (x < 0 ? (x > -300 ? -0.002 * x * x : -180 + 1.2 * (x + 300)) : -0.0004 * x * x);
const hsZ = (x: number, zs: number) =>
  Math.max(-3, 0.062 * zs + 0.028 * Math.sin(x * 0.19) + 0.018 * Math.sin(x * 0.53 + 1.7) + 0.5 * sstep(7, 22, zs)) +
  sstep(26, 60, zs) * (1.6 + 0.9 * Math.sin(x * 0.045 + 0.6) * Math.sin(zs * 0.09 + x * 0.013));
const hs = (x: number, z: number) => hsZ(x, z - bend(x));
const phi = (x: number) => 0.07 * Math.sin(x * 0.031) + 0.035 * Math.sin(x * 0.12 + 2);
const size = (n: number) => 0.65 + 0.6 * fract(Math.sin(n * 12.9898 + 4.1) * 43758.5453);
const run = (p: number) => (p < 0.14 ? sstep(0, 0.14, p) : 1 - sstep(0.14, 0.82, p));
/** Water level up the slope from the last wave's bore. */
const eta = (x: number, t: number) => {
  const q = -1.5 / L - t / T - phi(x), n = Math.floor(-q), p = -q - n;
  return RUN * size(-n) * run(p);
};

/* ---- the same model, GLSL side ---- */
const SHORE = `
uniform float uTime;
float sstep(float a, float b, float x){ return smoothstep(a, b, x); }
float bend(float x){ return x < 0.0 ? (x > -300.0 ? -0.002 * x * x : -180.0 + 1.2 * (x + 300.0)) : -0.0004 * x * x; }
float hsZ(float x, float zs){
  return max(-3.0, 0.062 * zs + 0.028 * sin(x * 0.19) + 0.018 * sin(x * 0.53 + 1.7) + 0.5 * sstep(7.0, 22.0, zs))
    + sstep(26.0, 60.0, zs) * (1.6 + 0.9 * sin(x * 0.045 + 0.6) * sin(zs * 0.09 + x * 0.013));
}
float phi(float x){ return 0.07 * sin(x * 0.031) + 0.035 * sin(x * 0.12 + 2.0); }
float size(float n){ return 0.65 + 0.6 * fract(sin(n * 12.9898 + 4.1) * 43758.5453); }
float run(float p){ return p < 0.14 ? sstep(0.0, 0.14, p) : 1.0 - sstep(0.14, 0.82, p); }
// The last wave to reach the shore: its number, and how far through its run up and back (0..1).
vec2 swash(float x){ float q = -1.5 / ${L.toFixed(1)} - uTime / ${T.toFixed(2)} - phi(x); float n = floor(-q); return vec2(n, -q - n); }
float eta(float x){ vec2 s = swash(x); return ${RUN.toFixed(3)} * size(-s.x) * run(s.y); }
// How high the sand is still wet: the last wave's reach, or the one before it, drying from the top.
float wetLevel(float x){
  vec2 s = swash(x);
  float now = ${RUN.toFixed(3)} * size(-s.x) * (s.y < 0.14 ? run(s.y) : 1.0);
  float before = ${RUN.toFixed(3)} * size(1.0 - s.x);
  return max(now, before * (1.0 - 0.85 * s.y));
}
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
uniform vec3 uSunDir;
// Haze at the horizon: pale gold toward the sun, rose away from it. Fog fades into this.
vec3 horizon(vec3 d){
  vec2 a = d.xz / max(length(d.xz), 1e-4);
  float sw = max(dot(a, normalize(uSunDir.xz)), 0.0);
  return mix(vec3(0.96, 0.66, 0.6), vec3(1.0, 0.84, 0.6), pow(sw, 4.0));
}
`;
const NSH = 3; // palms whose shadows fall on the sand in view
const SNAP = `p.xy = floor(p.xy / p.w * uSnap + 0.5) / uSnap * p.w;`;

const SKY_V = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_F = `${SHORE}
uniform float uFlash; varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir); float h = max(d.y, 0.0);
  vec2 a = d.xz / max(length(d.xz), 1e-4);
  float sw = max(dot(a, normalize(uSunDir.xz)), 0.0);
  vec3 low = mix(vec3(0.98, 0.58, 0.48), vec3(1.0, 0.66, 0.38), pow(sw, 3.0));
  vec3 c = mix(horizon(d), low, sstep(0.0, 0.05, h));
  c = mix(c, vec3(0.74, 0.46, 0.58), sstep(0.04, 0.22, h));
  c = mix(c, vec3(0.3, 0.32, 0.58), sstep(0.18, 0.55, h));
  c = mix(c, vec3(0.13, 0.17, 0.4), sstep(0.5, 1.0, h));
  float s = max(dot(d, uSunDir), 0.0);
  c += vec3(1.0, 0.76, 0.46) * (pow(s, 5.0) * 0.28 + pow(s, 40.0) * 0.45) * (1.0 + 0.6 * uFlash);
  // long streaks of cloud on a high deck, lit gold underneath near the sun and lilac away from it
  if (d.y > 0.012) {
    vec2 uv = d.xz / d.y * 0.06 + vec2(uTime * 0.002, 0.0);
    float n = fbm(vec3(uv.x * 0.9, uv.y * 4.5, 1.7));
    float dens = sstep(0.5, 0.72, n) * sstep(0.012, 0.06, d.y) * (1.0 - sstep(0.35, 0.7, d.y));
    vec3 lit = mix(vec3(0.62, 0.42, 0.62), vec3(1.0, 0.7, 0.46), pow(s, 3.0));
    lit = mix(lit, vec3(1.0, 0.88, 0.66), pow(s, 24.0));
    c = mix(c, lit, dens * 0.85);
  }
  // the green flash, a thin band just above the sun
  c += vec3(-0.2, 0.55, 0.15) * uFlash * pow(s, 400.0) * sstep(0.004, 0.012, d.y);
  float star = step(0.9978, hash(floor(d * 150.0))) * sstep(0.5, 0.85, h);
  c += vec3(star) * 0.45;
  gl_FragColor = vec4(c, 1.0);
}`;

const SAND_V = `
uniform vec2 uSnap; uniform vec3 uLight; uniform vec3 uSunCol;
varying vec3 vAff; varying vec3 vSun; varying float vDepth; varying vec3 vWP;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vWP = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vec4 p = projectionMatrix * mv;
  ${SNAP}
  gl_Position = p;
  vSun = uSunCol * max(dot(n, uLight), 0.0);
  vAff = vec3(uv * p.w, p.w);
  vDepth = -mv.z;
}`;
const SAND_F = `${SHORE}
uniform sampler2D uMap; uniform float uFogNear; uniform float uFogFar; uniform vec3 uAmb; uniform vec3 uLight;
uniform vec4 uSh[${NSH}]; uniform vec3 uShTop[${NSH}];
varying vec3 vAff; varying vec3 vSun; varying float vDepth; varying vec3 vWP;
float segD(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
// Shadows of the near palms, thrown long across the sand toward the viewer by the low sun:
// the trunk as a thin band, the crown as a ragged star stretched along the light.
float palmShadow(vec2 p){
  float s = 0.0;
  for (int i = 0; i < ${NSH}; i++){
    vec2 a = uSh[i].xy, b = uSh[i].zw;
    float trunk = 1.0 - sstep(0.12, 0.3, segD(p, a, b));
    vec2 dir = normalize(b - a), q = p - b;
    float along = dot(q, dir), lat = q.x * dir.y - q.y * dir.x;
    float ang = atan(lat, along * 0.33);
    float r = uShTop[i].z * (0.55 + 0.45 * abs(sin(ang * 4.5 + uShTop[i].x)));
    float crown = 1.0 - sstep(0.75, 1.0, length(vec2(along / 3.0, lat)) / r);
    s = max(s, max(trunk, crown));
  }
  return s;
}
void main(){
  float zs = vWP.z - bend(vWP.x);
  vec3 c = texture2D(uMap, vAff.xy / vAff.z).rgb;
  // behind the beach: low dunes going over to scrub and sea grape
  float g = sstep(22.0, 34.0, zs + 6.0 * vnoise(vec3(vWP.xz * 0.12, 0.0)));
  c = mix(c, mix(vec3(0.42, 0.5, 0.3), vec3(0.26, 0.36, 0.24), vnoise(vec3(vWP.xz * 0.6, 3.0))), g);
  float sh = palmShadow(vWP.xz) * (1.0 - g * 0.5);
  c *= uAmb + vSun * (1.0 - 0.85 * sh);
  vec3 v = normalize(vWP - cameraPosition);
  // wet sand: darker, cooler, and glossy with the sky
  float wl = wetLevel(vWP.x);
  float wet = sstep(wl + 0.006, wl - 0.02, vWP.y);
  c = mix(c, c * vec3(0.8, 0.76, 0.7) + vec3(0.03, 0.03, 0.04) + horizon(v) * 0.06 * sstep(0.85, 1.0, 1.0 - abs(v.y)), wet);
  // the wet sand mirrors the sun: a hot streak of glare under it
  vec3 r = reflect(v, vec3(0.0, 1.0, 0.0));
  float gl = max(dot(r, normalize(uSunDir)), 0.0);
  c += wet * (vec3(1.0, 0.78, 0.5) * pow(gl, 90.0) * 1.3 + vec3(1.0, 0.7, 0.55) * pow(gl, 12.0) * 0.18) * (1.0 - 0.6 * sh);
  c *= 1.0 - 0.14 * sstep(0.012, 0.0, abs(vWP.y - wl)) * (1.0 - sstep(0.0, 0.02, eta(vWP.x) - vWP.y));
  // under the water: a little greener
  c = mix(c, c * vec3(0.78, 0.95, 0.92), sstep(0.0, -0.4, vWP.y));
  gl_FragColor = vec4(mix(c, horizon(v), sstep(uFogNear, uFogFar, vDepth)), 1.0);
}`;

// Shared by the water's vertex and fragment shaders: height of the crests at a point, and where in its cycle.
const WAVE = `
// q rises with distance inland and falls with time, so a crest (q whole) moves toward the shore.
float crestQ(float x, float zs){ return zs / ${L.toFixed(1)} - uTime / ${T.toFixed(2)} - phi(x); }
float crestShape(float u){ return u < 0.5 ? exp(-u / 0.022) : exp(-(1.0 - u) / 0.15); }
float crestAmp(float zs){ return (0.05 + 0.24 * sstep(-40.0, -7.0, zs)) * (1.0 - sstep(-4.5, -1.2, zs)); }
`;

const WATER_V = `${SHORE}${WAVE}
uniform vec2 uSnap;
varying vec3 vWP; varying float vDepth;
void main(){
  vec3 w = position;
  float zs = w.z - bend(w.x);
  float q = crestQ(w.x, zs), n = floor(q);
  float far = 0.06 * sin(w.x * 0.13 + w.z * 0.05 + uTime * 0.8) + 0.04 * sin(w.z * 0.19 - w.x * 0.07 - uTime * 0.6);
  w.y = far * (1.0 - sstep(-30.0, -6.0, zs)) + crestAmp(zs) * size(n) * crestShape(q - n) + sstep(-4.0, -0.6, zs) * eta(w.x);
  vec4 wp = modelMatrix * vec4(w, 1.0);
  vWP = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vec4 p = projectionMatrix * mv;
  ${SNAP}
  gl_Position = p;
  vDepth = -mv.z;
}`;
const WATER_F = `${SHORE}${WAVE}
uniform float uFogNear; uniform float uFogFar; uniform vec3 uSunPos; uniform float uFlash;
varying vec3 vWP; varying float vDepth;
void main(){
  float zs = vWP.z - bend(vWP.x);
  float depth = vWP.y - hsZ(vWP.x, zs);
  if (depth < 0.0) discard;
  vec3 v = normalize(vWP - cameraPosition);
  vec3 hz = horizon(v);
  // glass-clear over white sand, turquoise, then deep teal
  vec3 c = mix(vec3(0.62, 0.9, 0.84), vec3(0.24, 0.66, 0.68), sstep(0.03, 0.6, depth));
  c = mix(c, vec3(0.1, 0.3, 0.42), sstep(0.5, 3.0, depth));
  float graze = 1.0 - abs(v.y);
  c = mix(c, mix(vec3(0.88, 0.56, 0.58), hz, 0.55), sstep(0.82, 1.0, graze) * 0.85);
  float nz = vnoise(vec3(vWP.x * 0.6, vWP.z * 1.8, uTime * 0.5));
  c *= 0.93 + 0.14 * nz;
  // the road of light out to the sun
  vec2 toSun = normalize(uSunPos.xz - cameraPosition.xz), rel = vWP.xz - cameraPosition.xz;
  float along = dot(rel, toSun), lat = abs(rel.x * toSun.y - rel.y * toSun.x);
  float road = along > 0.0 ? exp(-pow(lat / (1.0 + along * 0.06), 2.0)) : 0.0;
  float glit = step(0.74 - 0.14 * road, vnoise(vec3(floor(vWP.x * 1.3), floor(vWP.z * 2.6), floor(uTime * 5.0))));
  c = mix(c, vec3(1.0, 0.8, 0.5), road * (0.3 + 0.7 * glit) * (0.65 + 0.5 * uFlash) * sstep(4.0, 30.0, along));
  // foam: whitecaps curling over as a crest breaks, the white water it leaves behind,
  // lace on the thin sheet of the bore, and the bright lip at its edge
  float q = crestQ(vWP.x, zs), u = q - floor(q), big = size(floor(q));
  float lace = vnoise(vec3(vWP.x * 1.6, zs * 3.2, uTime * 0.4));
  float cap = step(0.45, crestShape(u)) * sstep(-13.0, -6.0, zs) * (1.0 - sstep(-1.5, 0.5, zs)) * step(0.55 - 0.25 * big, lace + 0.3 * sstep(-9.0, -4.0, zs));
  float white = step(0.3, exp(-(1.0 - u) / 0.09)) * sstep(-7.0, -3.5, zs) * step(0.38, lace);
  float sheet = sstep(-3.0, -0.5, zs) * step(0.62, lace) * (1.0 - sstep(0.05, 0.25, depth));
  float lip = 1.0 - sstep(0.0, 0.025 + 0.025 * lace, depth);
  float foam = max(max(cap, white), max(sheet, lip));
  c = mix(c, vec3(1.0, 0.96, 0.92), foam);
  float a = mix(0.35, 1.0, sstep(0.0, 0.45, depth));
  a = max(a, foam);
  float fg = sstep(uFogNear, uFogFar, vDepth);
  gl_FragColor = vec4(mix(c, hz, fg), mix(a, 1.0, fg));
}`;

// White sand with a warm cast: near-white grains, a few bright ones, a few shell-pink and grey. 32px, nearest.
function sandTex() {
  const S = 32, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d canvas unavailable");
  let seed = 11;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const f = r(), k = 0.92 + r() * 0.08;
    g.fillStyle = f > 0.96 ? "rgb(206,196,186)" : f > 0.93 ? "rgb(250,222,214)" : f > 0.86 ? "rgb(255,255,252)" : `rgb(${246 * k},${242 * k},${232 * k})`;
    g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildBeach(k: PsxKit): SceneDef {
  const { rnd, facet, psx, tex, view, U } = k;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(54, 16 / 9, 0.1, 900);

  const sunDirU = { value: SUN.clone().normalize() };
  const flashU = { value: 0 };
  const shared = { uTime: U.uTime, uSunDir: sunDirU };

  /* ---- sky ---- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(200, 32, 20),
    new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { ...shared, uFlash: flashU }, vertexShader: SKY_V, fragmentShader: SKY_F }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  /* ---- prop materials: the kit's PS1 shader, lit by the low sun, fogged into the haze ---- */
  const fogU = { value: new THREE.Color("#f2a888") }, lightU = { value: LIGHT };
  const mat = (o: Parameters<typeof psx>[0]) => {
    const m = psx({ amb: "#8a6e92", sun: "#ffbe86", ...o });
    m.uniforms.uFogColor = fogU;
    m.uniforms.uLightDir = lightU;
    return m;
  };
  const m = {
    trunk: mat({ map: tex.tBark, tint: "#e8cbb0", amb: "#9a8698", sun: "#ffc890" }),
    frond: mat({ map: tex.tLeaf, tint: "#d0e4a8", amb: "#7a8a84", sun: "#ffd090", uv: 1.5, side: THREE.DoubleSide }),
    nut: mat({ map: tex.tPlain, tint: "#8a7a48", amb: "#6a5a60" }),
    grass: mat({ map: tex.tLeaf, tint: "#e8e0a8", amb: "#c8b8b8", sun: "#ffd8a0" }),
    shell: mat({ map: tex.tPlain, tint: "#ffe2d6", amb: "#e8d4d8" }),
    shell2: mat({ map: tex.tPlain, tint: "#f6ece0", amb: "#d8c8cc" }),
    print: mat({ map: tex.tPlain, tint: "#d8ccd0", amb: "#a8a0b8" }),
    head: mat({ map: tex.tLeaf, tint: "#7a8a70", amb: "#5a4a6c", fogAmt: 0.85, uv: 3 }),
    isle: mat({ map: tex.tStone, tint: "#6c5878", amb: "#5a4468", fogAmt: 0.9 }),
    bird: mat({ map: tex.tPlain, tint: "#d8c0a8", amb: "#b09aa8" }),
    belly: mat({ map: tex.tPlain, tint: "#fff6ee", amb: "#b8a4b4" }),
    beak: mat({ map: tex.tPlain, tint: "#3a2c34", amb: "#3a2c34" }),
  };
  m.print.polygonOffset = true;
  m.print.polygonOffsetFactor = -2;
  m.print.polygonOffsetUnits = -2;

  const shA: THREE.Vector4[] = [], shB: THREE.Vector3[] = []; // filled once the palms are placed

  /* ---- sand: one sheet following the curve of the bay, fine at the waterline, coarse far off ---- */
  const NX = 150, NZ = 120;
  const sg = new THREE.PlaneGeometry(1, 1, NX, NZ);
  sg.rotateX(-Math.PI / 2);
  const sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const u = sp.getX(i) * 2, v = sp.getZ(i) + 0.5;
    const x = u < 0 ? -(Math.abs(u) ** 1.6) * 620 : u ** 1.6 * 170;
    const zs = v < 0.55 ? -12 + (v / 0.55) * 24 : 12 + ((v - 0.55) / 0.45) ** 1.5 * 88;
    const z = zs + bend(x);
    sp.setXYZ(i, x, hsZ(x, zs), z);
  }
  const sand = facet(sg, 0.015);
  const spos = sand.attributes.position, suv = sand.attributes.uv;
  for (let i = 0; i < spos.count; i++) suv.setXY(i, spos.getX(i) / 3, spos.getZ(i) / 3);
  const sandMesh = new THREE.Mesh(
    sand,
    new THREE.ShaderMaterial({
      uniforms: {
        ...shared, uSnap: U.uSnap, uMap: { value: sandTex() }, uLight: lightU,
        uAmb: { value: new THREE.Color("#a6a2bc") }, uSunCol: { value: new THREE.Color("#ffc890").multiplyScalar(1.4) },
        uSh: { value: shA }, uShTop: { value: shB },
        uFogNear: U.uFogNear, uFogFar: U.uFogFar,
      },
      vertexShader: SAND_V,
      fragmentShader: SAND_F,
    }),
  );
  sandMesh.frustumCulled = false;
  scene.add(sandMesh);

  /* ---- sea: rows packed tight through the surf, stretching out to the horizon; displaced on the GPU ---- */
  const WX = 140, WZ = 170;
  const wg = new THREE.PlaneGeometry(1, 1, WX, WZ);
  wg.rotateX(-Math.PI / 2);
  const wp = wg.attributes.position;
  for (let i = 0; i < wp.count; i++) {
    const u = wp.getX(i) * 2, v = wp.getZ(i) + 0.5;
    const x = Math.sign(u) * Math.abs(u) ** 1.6 * 820;
    const zs = v > 0.45 ? -28 + ((v - 0.45) / 0.55) * 38 : -28 - ((0.45 - v) / 0.45) ** 2.2 * 760;
    wp.setXYZ(i, x, 0, zs + bend(Math.max(x, -420)));
  }
  const water = new THREE.Mesh(
    wg,
    new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { ...shared, uSnap: U.uSnap, uFogNear: U.uFogNear, uFogFar: U.uFogFar, uSunPos: { value: SUN }, uFlash: flashU },
      vertexShader: WATER_V,
      fragmentShader: WATER_F,
    }),
  );
  water.frustumCulled = false;
  scene.add(water);

  /* ---- the sun, far off and half down ---- */
  const sun = k.sunDisc(scene, SUN.x, SUN.y, SUN.z, 11, "#fff2cc", "#ffaa6a");
  const sunCore = (sun.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
  const coreCol = sunCore.color.clone(), green = new THREE.Color("#b8ffb0");

  /* ---- props ---- */
  const { add, flush } = k.batcher();
  const up = new THREE.Vector3(0, 1, 0);
  const seg = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, n = 5) => {
    const g = new THREE.CylinderGeometry(r1, r0, a.distanceTo(b) * 1.08, n, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return facet(g, 0.03);
  };
  const at = (x: number, zs: number) => new THREE.Vector3(x, hsZ(x, zs), zs + bend(x));

  // coconut palms along the back of the beach, thinning out down the bay.
  // Trunk: one smooth tube up a curved spine, ringed with leaf scars, flaring at the foot.
  const trunkGeo = (spine: THREE.Vector3[], r0: number, r1: number, sides = 9) => {
    const pos: number[] = [], idx: number[] = [], uvs: number[] = [];
    const tg = new THREE.Vector3(), nA = new THREE.Vector3(), nB = new THREE.Vector3(), ref = new THREE.Vector3(1, 0, 0);
    const N = spine.length;
    spine.forEach((c, i) => {
      tg.subVectors(spine[Math.min(N - 1, i + 1)], spine[Math.max(0, i - 1)]).normalize();
      nA.crossVectors(tg, ref).normalize();
      nB.crossVectors(tg, nA).normalize();
      const t = i / (N - 1);
      const r = (r0 + (r1 - r0) * t) * (1 + 0.55 * Math.exp(-t * 18)) * (i % 2 ? 0.94 : 1.04);
      for (let j = 0; j <= sides; j++) {
        const a = (j / sides) * Math.PI * 2;
        pos.push(c.x + (nA.x * Math.cos(a) + nB.x * Math.sin(a)) * r, c.y + (nA.y * Math.cos(a) + nB.y * Math.sin(a)) * r, c.z + (nA.z * Math.cos(a) + nB.z * Math.sin(a)) * r);
        uvs.push(j / sides, t * 6);
      }
    });
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j, b = a + sides + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    return facet(g);
  };
  // Frond: a midrib that arches up and out then droops, with paired leaflets folded down in a V
  // along its length, longest in the middle. Built pointing along +x from the crown.
  const frondGeo = (droop: number, len: number) => {
    const K = 14, pos: number[] = [], uvs: number[] = [];
    const rib = Array.from({ length: K + 1 }, (_, k) => {
      const t = k / K;
      return new THREE.Vector3(len * t * (1 - 0.12 * droop * t), len * (0.42 * Math.sin(t * Math.PI * 0.7) - droop * t * t), 0);
    });
    for (let k = 1; k < K; k++) {
      const t = k / K, w = 0.95 * Math.sin(Math.PI * Math.min(1, t * 1.08)) * (1 - 0.25 * t) + 0.08;
      const a = rib[k], b = rib[k + 1], dir = b.clone().sub(a).normalize();
      for (const side of [-1, 1]) {
        const tip = a.clone().addScaledVector(dir, w * 0.55).add(new THREE.Vector3(0, -0.24 * w - 0.05, side * w));
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z);
        uvs.push(0, 0, 1, 0, 0.5, 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  };
  const fronds = [0.15, 0.35, 0.6, 0.85].map((d) => frondGeo(d, 3.8));
  const nut = facet(new THREE.IcosahedronGeometry(0.17, 1), 0.02);
  const palm = (x: number, zs: number, s: number, lean: number, ry: number) => {
    const H = 6 + rnd() * 3, n = 18, base = at(x, zs), wob = rnd() * 6;
    const xf = new THREE.Matrix4().compose(base.clone().setY(base.y - 0.25), new THREE.Quaternion().setFromAxisAngle(up, ry), new THREE.Vector3(s, s, s));
    // a gentle S: leaning out low down, curving back up toward the crown
    const P = (i: number) => {
      const t = i / n;
      return new THREE.Vector3(lean * (t * t * 0.85 + 0.15 * Math.sin(t * Math.PI)), H * t, 0.25 * Math.sin(t * 3 + wob) * t);
    };
    const spine = Array.from({ length: n + 1 }, (_, i) => P(i));
    add(trunkGeo(spine, 0.26, 0.15).applyMatrix4(xf), m.trunk);
    const top = P(n).applyMatrix4(xf);
    const crown = 12 + Math.floor(rnd() * 3);
    for (let f = 0; f < crown; f++) {
      const a = (f / crown) * Math.PI * 2 + rnd() * 0.35;
      const lift = f % 3 === 0 ? -0.25 - rnd() * 0.2 : 0.05 + (rnd() - 0.5) * 0.3;
      const g = fronds[Math.min(3, Math.floor(rnd() * 4))].clone().rotateZ(lift).rotateX((rnd() - 0.5) * 0.5).rotateY(a);
      add(g, m.frond, top.x, top.y, top.z, 0, 0, 0, s * (0.85 + rnd() * 0.3));
    }
    for (let c = 0; c < 5; c++) {
      const a = c * 1.31 + wob;
      add(nut, m.nut, top.x + Math.cos(a) * 0.24 * s, top.y - (0.22 + (c % 2) * 0.12) * s, top.z + Math.sin(a) * 0.24 * s, 0, 0, 0, s);
    }
    return { base, top, s };
  };
  // three close by, leaning out over the beach toward the water; their shadows reach back up the sand
  const near = [palm(-7, 11.5, 0.84, 3.2, 1.86), palm(-13.5, 13.2, 0.85, 2.2, 2.25), palm(-10.2, 15.6, 0.75, 1.1, 1.3)];
  near.forEach(({ base, top, s: sc }, i) => {
    const toGround = (p: THREE.Vector3) => {
      const h = p.y - hs(p.x, p.z);
      return [p.x - (h / LIGHT.y) * LIGHT.x, p.z - (h / LIGHT.y) * LIGHT.z];
    };
    const [tx, tz] = toGround(top);
    shA.push(new THREE.Vector4(base.x, base.z, tx, tz));
    shB.push(new THREE.Vector3(i * 1.7, 0, 3.4 * sc));
  });
  for (let i = 0; i < 44; i++) {
    const x = -28 - Math.pow(rnd(), 0.75) * 340;
    palm(x, 18 + rnd() * 18, 1 + rnd() * 0.5, 0.8 + rnd() * 2.6, Math.PI * 0.25 + (rnd() - 0.5) * 1.6);
  }

  // dune grass on the berm
  const blade = facet(new THREE.ConeGeometry(0.05, 0.7, 3).translate(0, 0.35, 0));
  for (let i = 0; i < 60; i++) {
    const x = -45 + rnd() * 36, zs = 13 + rnd() * 9, p = at(x, zs);
    for (let b = 0; b < 5; b++) add(blade, m.grass, p.x + (rnd() - 0.5) * 0.4, p.y - 0.05, p.z + (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.7, 0, (rnd() - 0.5) * 0.7, 0.7 + rnd() * 0.8);
  }

  // shells on the dry sand above the wet line
  const shellG = facet(new THREE.ConeGeometry(0.1, 0.07, 6).scale(1, 1, 0.8), 0.01);
  for (let i = 0; i < 18; i++) {
    const x = -16 + rnd() * 22, zs = 5.5 + rnd() * 6, p = at(x, zs);
    add(shellG, rnd() > 0.5 ? m.shell : m.shell2, p.x, p.y + 0.02, p.z, 0, rnd() * 6, 0, 0.8 + rnd() * 0.8);
  }

  // one set of footprints walking off down the bay, just above the reach of the waves
  const printG = new THREE.CircleGeometry(0.1, 7).rotateX(-Math.PI / 2).scale(1, 1, 1.8);
  for (let i = 0; i < 70; i++) {
    const x = 4 - i * 0.62, zs = 7.2 + Math.sin(i * 0.11) * 0.7 + (i % 2 ? 0.15 : -0.15), p = at(x, zs);
    const yaw = Math.atan2(-(bend(x - 0.5) - bend(x + 0.5)), -1) + Math.PI / 2;
    add(printG, m.print, p.x, p.y + 0.02, p.z, 0, yaw, 0);
  }

  // the headland closing the bay, and a low island off to the right on the horizon
  const lump = facet(new THREE.IcosahedronGeometry(1, 1), 0.2);
  const end = at(-390, 0);
  ([[-30, 40, 70, 30, 46], [10, 0, 46, 22, 36], [-60, 90, 90, 38, 60], [38, -30, 24, 12, 18]] as const).forEach(([dx, dz, sx, sy, sz]) => {
    const g = lump.clone();
    g.scale(sx, sy, sz);
    add(g, m.head, end.x + dx, -sy * 0.35, end.z + dz, 0, rnd() * 3, 0);
  });
  ([[150, -600, 60, 9, 22], [205, -620, 22, 5, 12]] as const).forEach(([x, z, sx, sy, sz]) => {
    const g = lump.clone();
    g.scale(sx, sy, sz);
    add(g, m.isle, x, -sy * 0.3, z, 0, rnd() * 3, 0);
  });
  flush(scene);

  /* ---- sandpipers working the edge of the water ---- */
  const body = facet(new THREE.IcosahedronGeometry(0.1, 0).scale(1.6, 0.9, 1), 0.01);
  const bellyG = facet(new THREE.IcosahedronGeometry(0.085, 0).scale(1.4, 0.7, 0.9), 0.0);
  const headG = facet(new THREE.IcosahedronGeometry(0.055, 0));
  const beakG = facet(new THREE.ConeGeometry(0.012, 0.12, 3).rotateZ(Math.PI / 2));
  const legG = facet(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 3));
  const waterline = (x: number, t: number) => {
    // highest point the water reaches here: bisect hs(zs) = level on the slope
    const lvl = Math.max(eta(x, t), 0);
    let a = -3, b = 9;
    for (let i = 0; i < 14; i++) {
      const c = (a + b) / 2;
      if (hsZ(x, c) > lvl) b = c; else a = c;
    }
    return a;
  };
  const birds = Array.from({ length: 6 }, (_, i) => {
    const g = new THREE.Group();
    const parts = new THREE.Group();
    parts.add(new THREE.Mesh(body, m.bird));
    const bl = new THREE.Mesh(bellyG, m.belly);
    bl.position.y = -0.03;
    parts.add(bl);
    const hd = new THREE.Mesh(headG, m.bird);
    hd.position.set(0.15, 0.07, 0);
    parts.add(hd);
    const bk = new THREE.Mesh(beakG, m.beak);
    bk.position.set(0.25, 0.06, 0);
    parts.add(bk);
    parts.position.y = 0.16;
    g.add(parts);
    const legs = [-0.03, 0.03].map((dz) => {
      const l = new THREE.Mesh(legG, m.beak);
      l.position.set(0, 0.08, dz);
      g.add(l);
      return l;
    });
    g.scale.setScalar(0.95);
    scene.add(g);
    const x0 = -9 + i * 2.1 + rnd() * 1.2;
    return { g, parts, legs, x0, x: x0, zs: 3, ph: rnd() * 6.28, gap: 0.3 + rnd() * 0.5, dir: 1 };
  });

  /* ---- gulls far out over the water ---- */
  const gullGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.8, 0.25, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.8, 0.25, 0),
  ]);
  const gullMat = new THREE.LineBasicMaterial({ color: "#4a3050" });
  const gulls = Array.from({ length: 4 }, () => {
    const l = new THREE.LineSegments(gullGeo, gullMat);
    scene.add(l);
    return { l, r: 14 + rnd() * 18, y: 10 + rnd() * 8, sp: 0.05 + rnd() * 0.05, ph: rnd() * 6.28, cx: -30 + rnd() * 30, cz: -50 - rnd() * 20 };
  });

  let tSun = -99, tBird = -99, prevT = 0;
  const CX = 0, CZS = 17;
  const camBase = at(CX, CZS);
  const camY = camBase.y + 1.6;

  return {
    scene, cam, fog: [60, 600], fov: [54, 68], limits: { pitch: [-0.4, 0.3], zoom: [0.8, 2.6], yaw: 0.8 },
    labels: [
      { name: "Sunset", sub: "far out, west", at: (v) => { v.copy(SUN).y += 28; } },
      { name: "Shoreline", sub: "small surf, rising", at: (v) => { v.set(-4, 1.2, bend(-4)); } },
      { name: "Headland", sub: "the end of the bay", at: (v) => { v.copy(end).y += 40; } },
    ],
    eggs: [
      { id: "beach-sun", r: 40, at: (v) => { v.copy(SUN).y += 4; }, fire: (t) => { tSun = t; } },
      { id: "beach-birds", r: 34, at: (v) => { birds[2].g.getWorldPosition(v); }, fire: (t) => { tBird = t; } },
    ],
    update(t) {
      const dt = Math.min(0.1, Math.max(0, t - prevT));
      prevT = t;

      // sun: a tap brings on the green flash
      const es = t - tSun, fl = pulse(es, 2.2);
      flashU.value = fl;
      sunCore.color.copy(coreCol).lerp(green, fl * 0.8);
      sun.scale.setScalar(1 + 0.12 * fl);
      sun.lookAt(cam.position);

      // sandpipers: keep just ahead of the water, darting up as it comes in and following it back down
      const eb = t - tBird, flush = pulse(eb, 5);
      for (const b of birds) {
        const goal = waterline(b.x, t) + b.gap;
        const d = goal - b.zs, step = Math.sign(d) * Math.min(Math.abs(d), 4.5 * dt);
        b.zs += step;
        const moving = Math.abs(step) > 0.002;
        b.x += Math.sin(t * 0.2 + b.ph) * 0.15 * dt;
        const y = hsZ(b.x, b.zs);
        const lift = flush * (2.5 + Math.sin(b.ph) * 0.8);
        b.g.position.set(b.x + flush * 3 * Math.sin(b.ph * 2), Math.max(y, eta(b.x, t)) + lift, b.zs + bend(b.x) + flush * 1.5);
        if (moving) b.dir = step > 0 ? 1 : -1;
        b.g.rotation.y = b.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        const stride = moving && !flush ? Math.sin(t * 30 + b.ph) * 0.5 : 0;
        b.legs[0].rotation.z = stride;
        b.legs[1].rotation.z = -stride;
        b.legs.forEach((l) => { l.visible = flush < 0.2; });
        // standing still, they probe the wet sand
        b.parts.rotation.z = moving || flush ? 0 : -0.35 * Math.max(0, Math.sin(t * 2.4 + b.ph * 3));
        b.parts.rotation.x = flush ? Math.sin(t * 25 + b.ph) * 0.3 : 0;
      }

      for (const g of gulls) {
        const a = g.ph + t * g.sp;
        g.l.position.set(g.cx + Math.cos(a) * g.r, g.y + Math.sin(t * 0.4 + g.ph) * 0.8, g.cz + Math.sin(a) * g.r * 0.5);
        g.l.rotation.y = -a;
        g.l.scale.y = Math.sin(t * 4 + g.ph * 3);
      }

      // standing at the top of the beach, looking out across the surf to the sun
      cam.position.set(CX + Math.sin(t * 0.05) * 0.3 + view.px * 0.6, camY + Math.sin(t * 0.45) * 0.02 - view.py * 0.3, camBase.z + Math.sin(t * 0.03) * 0.3);
      cam.lookAt((cam.aspect < 1 ? -120 : -255) + view.px * 8 + Math.sin(t * 0.04) * 2, -6 - view.py * 5, -440);
      k.look(cam);
      sky.position.copy(cam.position);
    },
    readout() {
      const p = cam.position;
      return [
        ["Lat", k.dms(-8.6871 - p.z * 0.00009, "N", "S", 2)],
        ["Lon", k.dms(115.4458 + p.x * 0.00012, "E", "W", 3)],
        ["Elev", `${p.y.toFixed(1)} m`],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
        ["Grid", k.gridRef(p.x, p.z, 40)],
      ];
    },
  };
}
