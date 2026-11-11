/** Sheet 05 · Field: an abstract relief seen from above, drawn as a stack of cut plates.
 *  One procedural height function (GLSL, shared by the vertex and fragment stages) is
 *  sliced into flat elevation bands: each band is a solid step of tone, edged with a
 *  hairline and casting a hard offset shadow on the band below. The mass morphs slowly;
 *  one index contour in the accent ticks from level to level. The cursor lifts the
 *  surface (a press dents it) and a tap sends a ring out through the bands.
 *
 *  A `clean` scene: full resolution, no vertex snap, no dither. Every edge is
 *  anti-aliased in the fragment shader from screen-space derivatives. */
import * as THREE from "three";
import type { PsxKit, SceneDef } from "./psx";

const LEVELS = 9; // bands 0…9
const STEP_H = 1; // world height of one band
const RINGS = 4;
const RING_LIFE = 3.6, RING_SPEED = 13;
const TICK = 2.8; // seconds per index-contour step

/* Height in band units (0…LEVELS). Value noise, domain-warped; two layers slide against
   each other so the mass changes shape instead of just scrolling. */
const HEIGHT = `
uniform float uT; uniform vec3 uPtr; uniform vec4 uRing[${RINGS}];
float hash(vec2 p){ p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float H(vec2 p){
  vec2 q = p * 0.021 + 40.0;
  vec2 w = vec2(vn(q * 0.8 + vec2(3.1, uT * 0.017)), vn(q * 0.8 + vec2(-7.7 - uT * 0.017, 5.2)));
  float h = vn(q + (w - 0.5) * 1.7 + vec2(uT * 0.009, 0.0));
  h += 0.3 * vn(q * 2.3 + vec2(11.0, -uT * 0.021));
  h = smoothstep(0.2, 1.08, h) * ${LEVELS}.0 + 0.35;
  vec2 d = p - uPtr.xy;
  h += uPtr.z * exp(-dot(d, d) * 0.012);
  for (int i = 0; i < ${RINGS}; i++) {
    float r = length(p - uRing[i].xy) - uRing[i].z;
    h += uRing[i].w * exp(-r * r * 0.11);
  }
  return h;
}`;

const VERT = `
${HEIGHT}
varying vec2 vP; varying vec2 vClip;
void main(){
  vP = position.xz;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position.x, H(vP) * ${STEP_H.toFixed(2)}, position.z, 1.0);
  vClip = p.xy / p.w;
  gl_Position = p;
}`;

const FRAG = `
${HEIGHT}
uniform vec3 uAccent; uniform vec3 uAccent2; uniform vec3 uFogColor; uniform vec3 uZen;
uniform vec3 uInk; uniform float uIdx; uniform vec3 uMark; uniform float uRingFade[${RINGS}];
varying vec2 vP; varying vec2 vClip;
const vec2 L = vec2(-0.6, -0.8); // toward the light, on the sheet
void main(){
  float px = max(length(fwidth(vP)) * 0.7071, 1e-4); // world size of a pixel
  float e = 0.3;
  float h = H(vP);
  vec2 g = vec2(H(vP + vec2(e, 0.0)) - h, H(vP + vec2(0.0, e)) - h) / e;
  float gl = max(length(g), 1e-4);
  float lvl = clamp(floor(h), 0.0, ${LEVELS}.0), fr = h - floor(h);
  float k = lvl / ${LEVELS}.0;

  // Plates: flat steps of tone from the ground up; the top one is solid ink.
  vec3 ink = mix(uInk, uAccent, 0.1);
  vec3 lo = uZen * 0.8, mid = mix(uFogColor, ink, 0.22);
  vec3 c = mix(lo, mid, k * 1.2);
  c = mix(c, ink * 0.88, step(${LEVELS - 1}.0, lvl));
  float top = step(${LEVELS - 1}.0, lvl);

  // The lowest plate is ruled: a 45° hairline hatch.
  float hs = 2.2, hd = abs(fract((vP.x + vP.y) / hs + 0.5) - 0.5) * hs * 0.7071;
  float hatch = (1.0 - smoothstep(0.35 * px, 1.35 * px, hd)) * smoothstep(0.05, 0.4, hs / (px * 6.0) - 0.4);
  c = mix(c, mid * 0.75, hatch * step(lvl, 0.0) * 0.6);

  // Hard offset shadow from the plate above, thrown away from the light.
  float up = dot(g, L);
  float dist = (1.0 - fr) / max(up, 1e-4);
  float sl = 1.9 + 0.14 * lvl;
  float sh = step(1e-3, up) * (1.0 - smoothstep(sl - px, sl + px, dist));
  c *= 1.0 - sh * mix(0.6, 0.3, top);

  // Contour hairlines on every plate edge; the edge that faces the light is brighter.
  float fw = max(fwidth(h), 1e-5);
  float dl = min(fr, 1.0 - fr) / fw;
  float line = 1.0 - smoothstep(0.25, 1.25, dl);
  float lit = smoothstep(-0.2, 0.2, -up / gl);
  vec3 lc = mix(ink, uZen, top);
  c = mix(c, lc, line * mix(0.32, 0.85, lit));

  // Index contour: one level in the accent, heavier.
  float di = abs(h - uIdx) / fw;
  c = mix(c, uAccent, 1.0 - smoothstep(1.0, 2.0, di));

  // Registration crosses on a 16 m grid.
  vec2 q = abs(vP - 16.0 * floor(vP / 16.0 + 0.5));
  float arm = 1.1;
  float cx = (1.0 - smoothstep(0.3 * px, 1.3 * px, q.y)) * (1.0 - smoothstep(arm - px, arm + px, q.x));
  float cz = (1.0 - smoothstep(0.3 * px, 1.3 * px, q.x)) * (1.0 - smoothstep(arm - px, arm + px, q.y));
  c = mix(c, mix(ink, uZen, top), max(cx, cz) * 0.5);

  // Ring fronts.
  for (int i = 0; i < ${RINGS}; i++) {
    float r = abs(length(vP - uRing[i].xy) - uRing[i].z);
    c = mix(c, uAccent, (1.0 - smoothstep(0.7 * px, 1.7 * px, r)) * uRingFade[i]);
  }

  // Benchmark: a solid accent block in a square frame.
  vec2 m = abs(vP - uMark.xy);
  float md = max(m.x, m.y);
  float blk = 1.0 - smoothstep(0.9 - px, 0.9 + px, md);
  float frm = 1.0 - smoothstep(0.4 * px, 1.4 * px, abs(md - (1.9 + uMark.z * 2.5)));
  c = mix(c, mix(ink, uZen, top), frm * 0.9);
  c = mix(c, uAccent, blk);

  c *= 1.0 - dot(vClip, vClip) * 0.14;
  gl_FragColor = vec4(c, 1.0);
}`;

interface Ring { x: number; z: number; age: number }

export function buildField(k: PsxKit): SceneDef {
  const { U, view } = k;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(42, 16 / 9, 1, 600);
  const PIVOT = new THREE.Vector3(0, STEP_H * LEVELS * 0.45, 0);
  const TILT = 0.3, DIST = 96;

  const ringU = Array.from({ length: RINGS }, () => new THREE.Vector4(0, 0, 0, 0));
  const ringFade = new Array<number>(RINGS).fill(0);
  const uT = { value: 0 }, uPtr = { value: new THREE.Vector3() }, uIdx = { value: 1 };
  const MARK = new THREE.Vector3(24, PIVOT.y, -8);
  const uMark = { value: new THREE.Vector3(MARK.x, MARK.z, 0) };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uT, uPtr, uIdx, uMark,
      uRing: { value: ringU }, uRingFade: { value: ringFade },
      uAccent: U.uAccent, uAccent2: U.uAccent2, uFogColor: U.uFogColor, uZen: U.uZen,
      uInk: { value: new THREE.Color("#e4ddca") },
    },
  });
  // The height function has no edge; the sheet only has to outreach the widest, lowest view.
  const geo = new THREE.PlaneGeometry(900, 900, 300, 300);
  geo.rotateX(-Math.PI / 2);
  const sheet = new THREE.Mesh(geo, mat);
  sheet.frustumCulled = false;
  scene.add(sheet);

  /* ---- pointer ---- */
  const rings: Ring[] = [];
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PIVOT.y);
  const hit = new THREE.Vector3();
  let aimed = false, pressed = false, px = 0, pz = 0, lift = 0, hx = 0, hz = 0;
  let sweep = -1; // egg: seconds since the benchmark was hit
  const spawn = (x: number, z: number) => {
    if (rings.length >= RINGS) rings.shift();
    rings.push({ x, z, age: 0 });
  };
  const busy = () => rings.length > 0 || sweep >= 0 || Math.abs(lift - (aimed ? (pressed ? -1.3 : 0.9) : 0)) > 0.01 ||
    (aimed && Math.hypot(hx - px, hz - pz) > 0.05);

  const ease = (x: number) => x * x * (3 - 2 * x);
  let lastNow = performance.now();

  return {
    scene, cam, clean: true,
    fog: [200, 600], fov: [42, 58],
    limits: { pitch: [-0.24, 0.28], zoom: [0.62, 2.4] },
    labels: [],
    eggs: [
      {
        id: "field-benchmark", r: 34,
        at: (v) => { v.copy(MARK); },
        fire: () => {
          sweep = 0;
          spawn(MARK.x, MARK.z);
        },
      },
    ],
    pointer: {
      aim(ray) {
        const ok = Boolean(ray && ray.intersectPlane(plane, hit)) && Math.hypot(hit.x, hit.z) < 400;
        if (ok) {
          px = hit.x; pz = hit.z;
          if (!aimed && Math.abs(lift) < 0.02) { hx = px; hz = pz; }
        }
        aimed = ok;
      },
      press() { pressed = true; },
      release(tap) {
        if (pressed && aimed && tap) spawn(px, pz);
        pressed = false;
      },
      busy,
    },
    update(t) {
      const now = performance.now();
      const dt = Math.max(0, Math.min(0.05, (now - lastNow) / 1000));
      lastNow = now;

      // Near top-down and square to the sheet; drag tilts and turns, zoom dollies.
      const tilt = TILT + view.pitch, yaw = view.yaw, d = DIST / view.zoom;
      const tx = PIVOT.x + view.px * 3, tz = PIVOT.z + view.py * 3;
      cam.position.set(tx + Math.sin(yaw) * Math.sin(tilt) * d, PIVOT.y + Math.cos(tilt) * d, tz + Math.cos(yaw) * Math.sin(tilt) * d);
      cam.lookAt(tx, PIVOT.y, tz);

      uT.value = t;
      // Index contour: holds on a level, then snaps to the next. Up the stack and back down.
      const s = t / TICK, n = Math.floor(s), span = LEVELS - 2, m = n % (span * 2);
      const at = (i: number) => 1 + (i < span ? i : span * 2 - i);
      const a = at(m), b = at((m + 1) % (span * 2));
      uIdx.value = a + (b - a) * ease(Math.min(1, Math.max(0, (s - n - 0.72) / 0.28)));
      if (sweep >= 0) {
        // Benchmark hit: the index runs the whole stack once.
        sweep += dt;
        const u = sweep / 1.8;
        if (u >= 1) sweep = -1;
        else uIdx.value += (1 + (LEVELS - 1) * ease(u) - uIdx.value) * Math.sin(Math.PI * u);
        uMark.value.z = u < 1 ? Math.sin(Math.PI * u) : 0;
      }

      // Cursor: the surface rises under it and follows with a little lag; a press dents it.
      const target = aimed ? (pressed ? -1.3 : 0.9) : 0;
      lift += (target - lift) * (1 - Math.exp(-dt * 7));
      if (aimed) {
        const f = 1 - Math.exp(-dt * 9);
        hx += (px - hx) * f; hz += (pz - hz) * f;
      }
      uPtr.value.set(hx, hz, lift);

      for (let i = rings.length - 1; i >= 0; i--) {
        rings[i].age += dt;
        if (rings[i].age > RING_LIFE) rings.splice(i, 1);
      }
      for (let i = 0; i < RINGS; i++) {
        const r = rings[i];
        if (!r) { ringU[i].set(0, 0, -1e3, 0); ringFade[i] = 0; continue; }
        const u = r.age / RING_LIFE, f = (1 - u) * (1 - u);
        ringU[i].set(r.x, r.z, r.age * RING_SPEED, 1.25 * f * Math.min(1, r.age * 6));
        ringFade[i] = f;
      }
    },
    readout() {
      return [
        ["Scale", "1:2 500"],
        ["Plates", `${LEVELS + 1} · CI 1 m`],
        ["Index", `L${k.pad(Math.round(uIdx.value))}`],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
        ["Rings", String(rings.length)],
      ];
    },
  };
}
