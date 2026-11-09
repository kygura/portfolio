/** Sheet · Beach: a white-sand shore at sunset. Small waves roll in, wash up the slope and slide back,
 *  leaving the sand dark and wet behind them; the sun sinks into the sea far out, with a road of glitter
 *  across the water and streaks of cloud lit pink and gold. Leaning palms, driftwood, shells, gulls.
 *
 *  One shoreline model drives everything: the sand height `hs`, the runup that lifts the water up the
 *  slope (`eta`), the breaker rolling in ahead of it and the wet line the backwash leaves. It is written
 *  twice, in GLSL for the shaders and in JS for things riding the water, and the two must match.
 *
 *  The palette is fixed (the sunset's, not the site accent). Eggs: the sun, a gull, a bottle in the shallows. */
import * as THREE from "three";
import { pulse, type PsxKit, type SceneDef, type V3 } from "./psx";

const T = 7.5; // seconds per wave
const SUN = new THREE.Vector3(-38, 5, -420);
const LIGHT = new THREE.Vector3(-0.18, 0.38, -0.9).normalize();

/* ---- the shoreline model, JS side ---- */
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const fract = (x: number) => x - Math.floor(x);
const hs = (x: number, z: number) =>
  Math.max(-2.6, 0.075 * z + 0.05 * Math.sin(x * 0.21) + 0.04 * Math.sin(x * 0.07 + 1.3) + 0.55 * sstep(5, 24, z)) +
  0.18 * sstep(10, 18, z) * Math.sin(x * 0.09 + z * 0.15) * Math.sin(z * 0.23 + 1.1);
const phase = (x: number, t: number) => fract(t / T + 0.05 * Math.sin(x * 0.045) + 0.03 * Math.sin(x * 0.13 + 2));
const amp = (x: number) => 0.21 + 0.05 * Math.sin(x * 0.09 + 0.7) + 0.03 * Math.sin(x * 0.31);
const run = (p: number) => (p < 0.18 ? sstep(0, 0.18, p) : 1 - sstep(0.18, 0.8, p));
const swell = (x: number, z: number, t: number) =>
  (0.06 * Math.sin(x * 0.15 + z * 0.05 + t * 0.7) + 0.04 * Math.sin(z * 0.21 - x * 0.06 - t * 0.55)) * (1 - 0.8 * sstep(-10, -2, z));
const waterY = (x: number, z: number, t: number) => {
  const p = phase(x, t), s = Math.min(1, Math.max(0, (p - 0.3) / 0.7)), zb = -18 + 17.7 * s;
  const eta = Math.max(amp(x) * run(p), 0.5 * amp(x + 40) * run(fract(t / (T * 1.37) + 0.4)));
  return swell(x, z, t) + sstep(-9, -1, z) * eta + 0.11 * s * Math.exp(-(((z - zb) / 1.3) ** 2));
};

/* ---- the same model, GLSL side ---- */
const SHORE = `
uniform float uTime;
float sstep(float a, float b, float x){ return smoothstep(a, b, x); }
float hs(vec2 p){
  return max(-2.6, 0.075 * p.y + 0.05 * sin(p.x * 0.21) + 0.04 * sin(p.x * 0.07 + 1.3) + 0.55 * sstep(5.0, 24.0, p.y))
    + 0.18 * sstep(10.0, 18.0, p.y) * sin(p.x * 0.09 + p.y * 0.15) * sin(p.y * 0.23 + 1.1);
}
float phase(float x){ return fract(uTime / ${T.toFixed(2)} + 0.05 * sin(x * 0.045) + 0.03 * sin(x * 0.13 + 2.0)); }
float amp(float x){ return 0.21 + 0.05 * sin(x * 0.09 + 0.7) + 0.03 * sin(x * 0.31); }
float run(float p){ return p < 0.18 ? sstep(0.0, 0.18, p) : 1.0 - sstep(0.18, 0.8, p); }
float eta(float x){ return max(amp(x) * run(phase(x)), 0.5 * amp(x + 40.0) * run(fract(uTime / ${(T * 1.37).toFixed(3)} + 0.4))); }
// Highest the last wave reached, sinking slowly as the sand dries from the top down.
float wetLevel(float x){ return amp(x) * (1.0 - 0.55 * fract(phase(x) - 0.18)); }
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
uniform vec3 uSunDir;
// The haze at the horizon: gold toward the sun, coral away from it. Fog fades into this.
vec3 horizon(vec3 d){
  vec2 a = d.xz / max(length(d.xz), 1e-4), b = normalize(uSunDir.xz);
  float sw = max(dot(a, b), 0.0);
  return mix(vec3(0.95, 0.6, 0.5), vec3(1.0, 0.8, 0.52), pow(sw, 3.0));
}
`;
const SNAP = `p.xy = floor(p.xy / p.w * uSnap + 0.5) / uSnap * p.w;`;

const SKY_V = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_F = `${SHORE}
uniform float uFlash; varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir); float h = max(d.y, 0.0);
  vec2 a = d.xz / max(length(d.xz), 1e-4);
  float sw = max(dot(a, normalize(uSunDir.xz)), 0.0);
  vec3 low = mix(vec3(0.9, 0.44, 0.46), vec3(0.98, 0.56, 0.34), pow(sw, 4.0));
  vec3 c = mix(horizon(d), low, sstep(0.0, 0.07, h));
  c = mix(c, vec3(0.6, 0.31, 0.5), sstep(0.06, 0.32, h));
  c = mix(c, vec3(0.15, 0.13, 0.33), sstep(0.28, 0.9, h));
  float s = max(dot(d, uSunDir), 0.0);
  c += vec3(1.0, 0.72, 0.42) * (pow(s, 6.0) * 0.32 + pow(s, 48.0) * 0.5) * (1.0 + uFlash);
  float star = step(0.9975, hash(floor(d * 140.0))) * sstep(0.45, 0.8, h);
  c += vec3(star) * 0.5;
  gl_FragColor = vec4(c, 1.0);
}`;

const SAND_V = `
uniform vec2 uSnap; uniform vec3 uLight; uniform vec3 uAmb; uniform vec3 uSunCol;
varying vec3 vAff; varying vec3 vLit; varying float vDepth; varying vec3 vWP;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vWP = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vec4 p = projectionMatrix * mv;
  ${SNAP}
  gl_Position = p;
  vLit = uAmb + uSunCol * max(dot(n, uLight), 0.0);
  vAff = vec3(uv * p.w, p.w);
  vDepth = -mv.z;
}`;
const SAND_F = `${SHORE}
uniform sampler2D uMap; uniform float uFogNear; uniform float uFogFar;
varying vec3 vAff; varying vec3 vLit; varying float vDepth; varying vec3 vWP;
void main(){
  vec3 c = texture2D(uMap, vAff.xy / vAff.z).rgb * vLit;
  float wl = wetLevel(vWP.x);
  float wet = sstep(wl + 0.004, wl - 0.025, vWP.y);
  vec3 v = normalize(vWP - cameraPosition);
  c = mix(c, c * vec3(0.66, 0.62, 0.66) + horizon(v) * 0.16, wet);
  // a thin dark rim where the last wave stopped
  c *= 1.0 - 0.18 * sstep(0.012, 0.0, abs(vWP.y - wl)) * (1.0 - sstep(0.0, 0.02, eta(vWP.x) - vWP.y));
  gl_FragColor = vec4(mix(c, horizon(v), sstep(uFogNear, uFogFar, vDepth)), 1.0);
}`;

const WATER_V = `${SHORE}
uniform vec2 uSnap;
varying vec3 vWP; varying float vDepth; varying float vZb; varying float vS;
float swell(vec2 p){
  return (0.06 * sin(p.x * 0.15 + p.y * 0.05 + uTime * 0.7) + 0.04 * sin(p.y * 0.21 - p.x * 0.06 - uTime * 0.55)) * (1.0 - 0.8 * sstep(-10.0, -2.0, p.y));
}
void main(){
  vec3 w = position;
  float s = clamp((phase(w.x) - 0.3) / 0.7, 0.0, 1.0);
  vZb = -18.0 + 17.7 * s; vS = s;
  w.y = swell(w.xz) + sstep(-9.0, -1.0, w.z) * eta(w.x) + 0.11 * s * exp(-pow((w.z - vZb) / 1.3, 2.0));
  vec4 wp = modelMatrix * vec4(w, 1.0);
  vWP = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vec4 p = projectionMatrix * mv;
  ${SNAP}
  gl_Position = p;
  vDepth = -mv.z;
}`;
const WATER_F = `${SHORE}
uniform float uFogNear; uniform float uFogFar; uniform vec3 uSunPos; uniform float uFlash;
varying vec3 vWP; varying float vDepth; varying float vZb; varying float vS;
void main(){
  float depth = vWP.y - hs(vWP.xz);
  if (depth < 0.0) discard;
  vec3 v = normalize(vWP - cameraPosition);
  vec3 hz = horizon(v);
  // shallows: clear aqua over the sand, deepening to violet-blue
  vec3 c = mix(vec3(0.5, 0.8, 0.76), vec3(0.24, 0.3, 0.5), sstep(0.04, 1.6, depth));
  float graze = 1.0 - abs(v.y);
  c = mix(c, mix(vec3(0.82, 0.46, 0.55), hz, 0.6), sstep(0.8, 1.0, graze) * 0.8);
  float n = vnoise(vec3(vWP.x * 0.7, vWP.z * 2.2, uTime * 0.6));
  c *= 0.92 + 0.16 * n;
  // the road of light to the sun
  vec2 toSun = normalize(uSunPos.xz - cameraPosition.xz), rel = vWP.xz - cameraPosition.xz;
  float along = dot(rel, toSun), lat = abs(rel.x * toSun.y - rel.y * toSun.x);
  float road = along > 0.0 ? exp(-pow(lat / (0.8 + along * 0.075), 2.0)) : 0.0;
  float glit = step(0.78 - 0.12 * road, vnoise(vec3(floor(vWP.x * 1.4), floor(vWP.z * 3.0), floor(uTime * 5.0))));
  c = mix(c, vec3(1.0, 0.78, 0.45), road * (0.35 + 0.65 * glit) * (0.7 + 0.5 * uFlash));
  // foam: the lip of the swash, and the crest of the wave rolling in
  float lip = 1.0 - sstep(0.0, 0.03 + 0.03 * n, depth);
  float crest = sstep(0.45, 0.8, vS) * (1.0 - sstep(0.0, 0.5 + 0.4 * n, abs(vWP.z - vZb - 0.25)));
  float foam = max(lip, crest * step(0.35, n));
  c = mix(c, vec3(1.0, 0.95, 0.9), foam);
  float a = mix(0.45, 1.0, sstep(0.0, 0.5, depth));
  a = max(a, foam);
  float fg = sstep(uFogNear, uFogFar, vDepth);
  gl_FragColor = vec4(mix(c, hz, fg), mix(a, 1.0, fg));
}`;

// White sand: near-white grains, a few darker and a few bright ones. 32px, nearest-filtered.
function sandTex() {
  const S = 32, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d canvas unavailable");
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const f = r(), k = 0.9 + r() * 0.1;
    g.fillStyle = f > 0.95 ? "rgb(196,186,172)" : f > 0.9 ? "rgb(255,253,248)" : `rgb(${242 * k},${236 * k},${224 * k})`;
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
  const cam = new THREE.PerspectiveCamera(56, 16 / 9, 0.1, 760);

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

  /* ---- materials for props: the kit's PS1 shader, lit by the low sun, fogged into the haze ---- */
  const fogU = { value: new THREE.Color("#f0a07c") }, lightU = { value: LIGHT };
  const mat = (o: Parameters<typeof psx>[0]) => {
    const m = psx({ amb: "#7a5a86", sun: "#ffb27a", ...o });
    m.uniforms.uFogColor = fogU;
    m.uniforms.uLightDir = lightU;
    return m;
  };
  const m = {
    trunk: mat({ map: tex.tBark, tint: "#ffe0c0", amb: "#f0dce4" }),
    frond: mat({ map: tex.tPlain, tint: "#dcff9c", amb: "#ece0e8", sun: "#ffd090" }),
    frond2: mat({ map: tex.tPlain, tint: "#bcec88", amb: "#e0d4e0", sun: "#ffd090" }),
    drift: mat({ map: tex.tPlain, tint: "#e8d8c8", amb: "#a08aa0" }),
    rock: mat({ map: tex.tStone, tint: "#b8a4b0", amb: "#8a6a90", uv: 1.5 }),
    shell: mat({ map: tex.tPlain, tint: "#ffd6c8" }),
    shell2: mat({ map: tex.tPlain, tint: "#f4e8dc" }),
    star: mat({ map: tex.tPlain, tint: "#ff8a5c" }),
    print: mat({ map: tex.tPlain, tint: "#c8b8ae", amb: "#6a5070" }),
    bottle: mat({ map: tex.tPlain, tint: "#7cc6a0", amb: "#4a6a6a" }),
    cork: mat({ map: tex.tBark, tint: "#c89a6a" }),
    head: mat({ map: tex.tStone, tint: "#6a4c74", amb: "#5a3c66", fogAmt: 0.8 }),
  };
  m.print.polygonOffset = true;
  m.print.polygonOffsetFactor = -2;
  m.print.polygonOffsetUnits = -2;

  /* ---- sand: one sheet from under the water up to the dune line ---- */
  const NX = 120, NZ = 110;
  const sg = new THREE.PlaneGeometry(1, 1, NX, NZ);
  sg.rotateX(-Math.PI / 2);
  const sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const u = sp.getX(i) * 2, v = sp.getZ(i) + 0.5;
    const x = Math.sign(u) * Math.abs(u) ** 1.4 * 150, z = -30 + v * 80;
    sp.setXYZ(i, x, hs(x, z), z);
  }
  const sand = facet(sg, 0.02);
  const spos = sand.attributes.position, suv = sand.attributes.uv;
  for (let i = 0; i < spos.count; i++) suv.setXY(i, spos.getX(i) / 3, spos.getZ(i) / 3);
  const sandMat = new THREE.ShaderMaterial({
    uniforms: {
      ...shared, uSnap: U.uSnap, uMap: { value: sandTex() }, uLight: lightU,
      uAmb: { value: new THREE.Color("#c4b0bc") }, uSunCol: { value: new THREE.Color("#ffc890") },
      uFogNear: U.uFogNear, uFogFar: U.uFogFar,
    },
    vertexShader: SAND_V,
    fragmentShader: SAND_F,
  });
  const sandMesh = new THREE.Mesh(sand, sandMat);
  sandMesh.frustumCulled = false;
  scene.add(sandMesh);

  /* ---- sea: a grid fine across the surf zone, coarse out to the horizon; displaced on the GPU ---- */
  const WX = 110, WZ = 150;
  const wg = new THREE.PlaneGeometry(1, 1, WX, WZ);
  wg.rotateX(-Math.PI / 2);
  const wp = wg.attributes.position;
  for (let i = 0; i < wp.count; i++) {
    const u = wp.getX(i) * 2, v = wp.getZ(i) + 0.5;
    const z = v > 0.5 ? 9 - (1 - v) * 2 * 32 : -23 - ((0.5 - v) * 2) ** 2.2 * 640;
    wp.setXYZ(i, Math.sign(u) * Math.abs(u) ** 1.6 * 680, 0, z);
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

  /* ---- the sun, half sunk, and clouds streaked across the glow ---- */
  const sun = k.sunDisc(scene, SUN.x, SUN.y, SUN.z, 17, "#fff0c8", "#ffa868");
  const clouds: { g: THREE.Mesh; x: number; sp: number; ph: number }[] = [];
  const cloudGeo = new THREE.CircleGeometry(1, 9);
  for (let i = 0; i < 16; i++) {
    const y = 14 + Math.pow(rnd(), 1.4) * 80, near = Math.max(0, 1 - y / 70);
    const col = new THREE.Color("#7e4f86").lerp(new THREE.Color("#ffb07a"), near * near).lerp(new THREE.Color("#ffd8a0"), rnd() * 0.15);
    const c = new THREE.Mesh(cloudGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55 + rnd() * 0.35, depthWrite: false }));
    const x = SUN.x + (rnd() - 0.5) * 620;
    c.position.set(x, y, -330 - rnd() * 90);
    c.scale.set(30 + rnd() * 70, 1.2 + rnd() * 2.8, 1);
    c.renderOrder = 0;
    scene.add(c);
    clouds.push({ g: c, x, sp: 0.4 + rnd() * 0.6, ph: rnd() * 6.28 });
  }

  /* ---- props ---- */
  const { add, flush } = k.batcher();
  const up = new THREE.Vector3(0, 1, 0);
  const seg = (a: V3, b: V3, r0: number, r1: number, n = 5) => {
    const g = new THREE.CylinderGeometry(r1, r0, a.distanceTo(b) * 1.08, n, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return facet(g, 0.03);
  };

  // palms leaning out toward the water
  const frondG = new THREE.ConeGeometry(0.42, 3.2, 4);
  frondG.scale(0.22, 1, 1);
  frondG.translate(0, 1.6, 0);
  const frond = facet(frondG, 0.04);
  const nut = facet(new THREE.IcosahedronGeometry(0.18, 0), 0.03);
  const palm = (x: number, z: number, s: number, ry: number, lean: number) => {
    const H = 5.5 + rnd() * 2, n = 7;
    const xf = new THREE.Matrix4().compose(new THREE.Vector3(x, hs(x, z) - 0.2, z), new THREE.Quaternion().setFromAxisAngle(up, ry), new THREE.Vector3(s, s, s));
    const P = (i: number) => new THREE.Vector3(lean * (i / n) ** 2, (H * i) / n, 0);
    for (let i = 0; i < n; i++) add(seg(P(i), P(i + 1), 0.24 - i * 0.014, 0.23 - (i + 1) * 0.014).applyMatrix4(xf), m.trunk);
    const top = P(n).applyMatrix4(xf);
    for (let f = 0; f < 9; f++) {
      const a = ry + (f / 9) * Math.PI * 2 + rnd() * 0.3, droop = f % 2 ? 0.25 : 0.6 + rnd() * 0.3;
      add(frond.clone().rotateZ(-Math.PI / 2 - droop).rotateY(a), f % 2 ? m.frond2 : m.frond, top.x, top.y, top.z, 0, 0, 0, s);
    }
    for (let c = 0; c < 3; c++) {
      const a = c * 2.1;
      add(nut, m.trunk, top.x + Math.cos(a) * 0.22 * s, top.y - 0.2 * s, top.z + Math.sin(a) * 0.22 * s, 0, 0, 0, s);
    }
  };
  // the camera sees a narrow strip of shore, so the palms stand near its edges and lean in over the water
  palm(-5.8, 3.3, 0.9, 1.1, 4.2);
  palm(-9, 5, 0.85, 0.7, 2.4);
  palm(8.8, 3.8, 0.95, 2.05, 3.8);
  palm(12.5, 5.6, 0.8, 2.4, 2.2);
  palm(-7.6, 1.8, 0.75, 0.95, 3.2);
  palm(6.4, 2.6, 0.7, 2.3, 2.6);
  palm(-12, 6.2, 0.9, 0.5, 1.4);

  // driftwood: a bleached trunk with a broken limb, lying across the slope
  const dA = new THREE.Vector3(3.8, 0, 3.6), dB = new THREE.Vector3(7.6, 0, 4.4);
  dA.y = hs(dA.x, dA.z) + 0.12;
  dB.y = hs(dB.x, dB.z) + 0.1;
  add(seg(dA, dB, 0.17, 0.11, 6), m.drift);
  const dC = dA.clone().lerp(dB, 0.35), dD = dC.clone().add(new THREE.Vector3(0.4, 0.75, -1.1));
  add(seg(dC, dD, 0.1, 0.05, 5), m.drift);
  const stump = facet(new THREE.DodecahedronGeometry(0.34, 0), 0.08);
  add(stump, m.drift, dB.x + 0.15, dB.y, dB.z + 0.05, 0, 0, 0, 0.7);

  // rocks at the water's edge, half buried
  const rock = facet(new THREE.DodecahedronGeometry(1, 0), 0.32);
  ([[-15, -0.6, 1.3], [-13.4, 0.4, 0.8], [-16.6, 0.9, 0.6], [16, -2.4, 0.9], [17.2, -1.5, 0.55]] as const).forEach(([x, z, s]) =>
    add(rock, m.rock, x, hs(x, z) + s * 0.25, z, rnd() * 3, rnd() * 3, rnd() * 3, s),
  );

  // shells and starfish on the dry sand
  const shellG = facet(new THREE.ConeGeometry(0.11, 0.07, 6).scale(1, 1, 0.8), 0.01);
  const starArm = facet(new THREE.ConeGeometry(0.05, 0.2, 3).rotateX(Math.PI / 2).translate(0, 0, 0.1).scale(1, 0.4, 1));
  for (let i = 0; i < 26; i++) {
    const x = (rnd() - 0.5) * 26, z = 2.8 + rnd() * 5.5;
    add(shellG, rnd() > 0.5 ? m.shell : m.shell2, x, hs(x, z) + 0.02, z, 0, rnd() * 6, 0, 0.8 + rnd() * 0.8);
  }
  for (let i = 0; i < 3; i++) {
    const x = -4 + i * 5.5 + rnd(), z = 3.2 + rnd() * 3, ry = rnd() * 6, y = hs(x, z) + 0.02;
    for (let a = 0; a < 5; a++) add(starArm, m.star, x, y, z, 0, ry + (a / 5) * Math.PI * 2, 0, 1.4);
  }

  // footprints walking down to the water, gone below the wet line
  const printG = new THREE.CircleGeometry(0.11, 7).rotateX(-Math.PI / 2).scale(1, 1, 1.8);
  for (let i = 0; i < 16; i++) {
    const f = i / 15, side = i % 2 ? 1 : -1;
    const x = -7 + f * 5 + side * 0.17, z = 8.6 - f * 6;
    if (z < 3) break;
    add(printG, m.print, x, hs(x, z) + 0.02, z, -Math.atan(0.075), -0.53, 0);
  }

  // a headland far off to the right, dark against the haze, and a stack off its point
  const head = facet(new THREE.IcosahedronGeometry(1, 1), 0.18);
  ([[190, -300, 70, 26, 40], [130, -280, 36, 14, 22], [95, -265, 9, 13, 9], [-260, -340, 60, 9, 30]] as const).forEach(([x, z, sx, sy, sz]) => {
    const g = head.clone();
    g.scale(sx, sy, sz);
    add(g, m.head, x, -sy * 0.25, z, 0, rnd() * 3, 0);
  });
  flush(scene);

  /* ---- the bottle, adrift in the shallows ---- */
  const bottle = new THREE.Group();
  scene.add(bottle);
  add(facet(new THREE.CylinderGeometry(0.16, 0.16, 0.6, 6)), m.bottle);
  add(facet(new THREE.CylinderGeometry(0.06, 0.15, 0.24, 6)), m.bottle, 0, 0.42, 0);
  add(facet(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 5)), m.cork, 0, 0.58, 0);
  flush(bottle);
  const BX = 3.5, BZ = -4.2;

  /* ---- glitter on the swell along the line to the sun ---- */
  const CX = 1.5, CZ = 9.5;
  const NG = 200, gp = new Float32Array(NG * 3), gBase: number[] = [];
  {
    const dx = SUN.x - CX, dz = SUN.z - CZ, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    for (let i = 0; i < NG; i++) {
      const d = 22 + Math.pow(rnd(), 0.7) * 380, w = (rnd() - 0.5) * (1 + d * 0.11);
      gBase.push(CX + ux * d - uz * w, CZ + uz * d + ux * w);
    }
  }
  const glintGeo = new THREE.BufferGeometry();
  glintGeo.setAttribute("position", new THREE.BufferAttribute(gp, 3));
  const glints = new THREE.Points(glintGeo, new THREE.PointsMaterial({ color: "#fff0c0", size: 1, sizeAttenuation: false }));
  glints.frustumCulled = false;
  scene.add(glints);

  /* ---- gulls, dark against the glow ---- */
  const gullGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.7, 0.25, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.7, 0.25, 0),
  ]);
  const gullMat = new THREE.LineBasicMaterial({ color: "#3a2440" });
  const gulls = Array.from({ length: 6 }, (_, i) => {
    const l = new THREE.LineSegments(gullGeo, gullMat);
    scene.add(l);
    return { l, r: 10 + rnd() * 14, y: 12 + rnd() * 10, sp: (0.08 + rnd() * 0.08) * (i % 3 ? 1 : -1), ph: rnd() * 6.28, cz: -22 - rnd() * 12 };
  });

  let tSun = -99, tGull = -99, tBottle = -99;
  const camY = hs(CX, CZ) + 1.7;

  return {
    scene, cam, fog: [70, 560], fov: [56, 70], limits: { pitch: [-0.4, 0.3], zoom: [0.8, 2.4], yaw: 0.75 },
    labels: [
      { name: "Sunset", sub: "going down, west", at: (v) => { v.copy(SUN).y += 30; } },
      { name: "Shoreline", sub: "the tide, turning", at: (v) => { v.set(0, 1.2, 0); } },
    ],
    eggs: [
      { id: "beach-sun", r: 46, at: (v) => { v.copy(SUN).y += 6; }, fire: (t) => { tSun = t; } },
      { id: "beach-gull", r: 32, at: (v) => { v.copy(gulls[0].l.position); }, fire: (t) => { tGull = t; } },
      { id: "beach-bottle", r: 30, at: (v) => { bottle.getWorldPosition(v); }, fire: (t) => { tBottle = t; } },
    ],
    update(t) {
      // sun: a tap swells it and floods the sky and the road on the water
      const es = t - tSun;
      sun.scale.setScalar(1 + 0.3 * pulse(es, 1.8));
      flashU.value = 1.2 * pulse(es, 1.8);
      sun.lookAt(cam.position);
      for (const c of clouds) {
        c.g.position.x = c.x + Math.sin(t * 0.004 * c.sp + c.ph) * 40;
        c.g.lookAt(cam.position);
      }

      // bottle: bobs on the swell; tapped, it rides a wave in toward the shore and drifts back out
      const eb = t - tBottle, ride = pulse(eb, 6) ** 0.7;
      const bz = BZ + ride * 3.6, bx = BX + ride * 0.8;
      bottle.position.set(bx, waterY(bx, bz, t) + 0.02, bz);
      bottle.rotation.set(Math.PI / 2 - 0.2 + Math.sin(t * 1.1) * 0.15, 0.8 + Math.sin(t * 0.3) * 0.3 + ride * 2, Math.sin(t * 0.9) * 0.2);

      for (let i = 0; i < NG; i++) {
        const x = gBase[i * 2], z = gBase[i * 2 + 1], on = Math.sin(t * 2.6 + i * 1.73) > 0.45;
        gp[i * 3] = x;
        gp[i * 3 + 1] = on ? swell(x, z, t) + 0.05 : -9;
        gp[i * 3 + 2] = z;
      }
      glintGeo.attributes.position.needsUpdate = true;

      for (const g of gulls) {
        const a = g.ph + t * g.sp;
        g.l.position.set(Math.cos(a) * g.r, g.y + Math.sin(t * 0.5 + g.ph) * 0.8, g.cz + Math.sin(a) * g.r * 0.6);
        g.l.rotation.y = -a + (g.sp > 0 ? 0 : Math.PI);
        g.l.scale.y = Math.sin(t * 5 + g.ph * 3);
      }
      const eg = Math.min(1, (t - tGull) / 1.3);
      gulls[0].l.rotation.z = eg > 0 && eg < 1 ? eg * eg * (3 - 2 * eg) * Math.PI * 2 : 0;

      // standing on the sand, a slow sway; looking out past the surf to the sun
      cam.position.set(CX + Math.sin(t * 0.05) * 0.3 + view.px * 0.6, camY + Math.sin(t * 0.5) * 0.02 - view.py * 0.3, CZ + Math.sin(t * 0.031) * 0.3);
      cam.lookAt(SUN.x * 0.25 + view.px * 6 + Math.sin(t * 0.04) * 2, 2 - view.py * 4, -200);
      k.look(cam);
      sky.position.copy(cam.position);
    },
    readout() {
      const p = cam.position;
      return [
        ["Lat", k.dms(-16.5004 - p.z * 0.00009, "N", "S", 2)],
        ["Lon", k.dms(-151.7415 + p.x * 0.00013, "E", "W", 3)],
        ["Elev", `${p.y.toFixed(1)} m`],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
        ["Grid", k.gridRef(p.x, p.z, 40)],
      ];
    },
  };
}
