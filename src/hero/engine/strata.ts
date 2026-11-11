/** Sheet 05 · Strata: an abstract relief read from straight above. One plane is
 *  displaced into terraces by a slow, drifting height function, and the same
 *  function is evaluated per pixel to draw it as stacked plates: a flat tone per
 *  level (dark low, accent at the summits), a hairline at every level with every
 *  fifth one in the accent colour, and a soft shadow each plate casts on the one
 *  below. A tap sends a ripple out through the levels; the cursor lifts a swell.
 *
 *  A `clean` scene: it is drawn at full resolution with no PS1 pass, so its lines
 *  are anti-aliased in the shader instead (screen-space derivatives). */
import * as THREE from "three";
import type { PsxKit, SceneDef } from "./psx";

/** Contour interval (m), index line every IDX levels, and the level range the tones span. */
const STEP = 1, IDX = 5, LV_LO = -7, LV_HI = 6;
/** Ripples: how many at once, how long they live (s) and how fast they travel (m/s). */
const MAXP = 4, LIFE = 4.5, SPEED = 14;
/** Swell under the cursor (m). */
const SWELL = 2.2;
/** Datum benchmark: a ring drawn on the surface, and the scene's hidden target. */
const BM = { x: 26, z: -15 };
/** Plane size (m) and segments. The edge fades out long before the camera can reach it. */
const SIZE = 400, SEG = 144;

const f = (n: number) => n.toFixed(1);

/* The height function, shared by both shaders (and mirrored in `relief` below for
   the readout). Domain-warped sines rather than noise: the curves stay clean. */
const RELIEF = `
uniform float uTime;
uniform vec3 uPulse[${MAXP}];
uniform vec3 uSwell;
float relief(vec2 p){
  float t = uTime * 1.4;
  vec2 q = p * 0.05;
  q += 0.55 * vec2(sin(q.y * 1.31 + t * 0.050), sin(q.x * 1.13 - t * 0.041));
  float h = 1.9 * sin(q.x * 1.7 + t * 0.060) * cos(q.y * 1.3 - t * 0.047)
          + 1.3 * sin((q.x + q.y) * 1.1 + 1.3 + t * 0.038)
          + 0.8 * sin(q.x * 2.9 - q.y * 2.3 + t * 0.071)
          + 0.4 * sin(q.x * 4.7 + q.y * 3.9 - t * 0.093 + 2.0);
  h *= 2.0 * (1.0 + 0.05 * sin(t * 0.21));
  for (int i = 0; i < ${MAXP}; i++) {
    vec3 u = uPulse[i];
    if (u.z >= 0.0) {
      float d = distance(p, u.xy) - ${f(SPEED)} * u.z;
      float k = 1.0 - u.z / ${f(LIFE)};
      h += 2.4 * k * k * smoothstep(0.0, 0.3, u.z) * cos(d * 0.45) * exp(-d * d * 0.03);
    }
  }
  vec2 s = p - uSwell.xy;
  h += uSwell.z * exp(-dot(s, s) * 0.012);
  return h;
}`;

const VERT = `
varying vec2 vP;
${RELIEF}
void main(){
  vec3 p = position;
  vP = p.xz;
  float h = relief(vP);
  // Terraces: flat plates with a short riser just under each level.
  float q = h / ${f(STEP)}, fl = floor(q);
  float terr = (fl + smoothstep(0.7, 1.0, q - fl)) * ${f(STEP)};
  p.y = mix(h, terr, 0.85);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = `
varying vec2 vP;
uniform vec3 uAccent; uniform vec3 uAccent2; uniform vec3 uZen; uniform vec3 uFogColor;
uniform float uDpr;
uniform vec2 uMark;
${RELIEF}
float aa(float d, float w){ return 1.0 - smoothstep(w - 0.5, w + 0.5, d); }
void main(){
  float q = relief(vP) / ${f(STEP)};
  float fw = max(fwidth(q), 1e-5);
  vec2 pw = max(fwidth(vP), vec2(1e-5));
  float lvl = floor(q), fr = q - lvl;
  vec3 bone = mix(uAccent, vec3(1.0), 0.62);

  // One flat tone per level: zenith dark in the hollows, haze, then the deep accent; summits in full accent.
  float tone = clamp((lvl - ${f(LV_LO)}) / ${f(LV_HI - LV_LO)}, 0.0, 1.0);
  vec3 col = mix(uZen * 0.85, uFogColor, smoothstep(0.0, 0.62, tone));
  col = mix(col, uAccent2, smoothstep(0.45, 1.0, tone) * 0.72);
  float top = step(${f(LV_HI - 1)}, lvl);
  col = mix(col, uAccent, top);

  // Each plate shades the edge of the one below it; where levels crowd, the whole slope darkens.
  col *= 1.0 - 0.5 * exp(-(1.0 - fr) / (fw * 9.0 * uDpr));

  // Survey grid (10 m) with registration crosses (40 m).
  vec2 g = vP / 10.0;
  vec2 gd = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(1e-5));
  col = mix(col, bone, 0.07 * aa(min(gd.x, gd.y), 0.5 * uDpr));
  vec2 c = (fract(vP / 40.0 - 0.5) - 0.5) * 40.0;
  float reg = max(aa(abs(c.x) / pw.x, 0.6 * uDpr) * step(abs(c.y), 1.7), aa(abs(c.y) / pw.y, 0.6 * uDpr) * step(abs(c.x), 1.7));
  col = mix(col, bone, 0.5 * reg);

  // Level lines: hairlines that brighten with height, every ${IDX}th in the accent.
  float li = floor(q + 0.5);
  float idx = 1.0 - step(0.5, mod(li, ${f(IDX)}));
  float line = aa(min(fr, 1.0 - fr) / fw, mix(0.55, 1.05, idx) * uDpr) * (1.0 - smoothstep(0.4, 0.8, fw));
  float lt = clamp((li - ${f(LV_LO)}) / ${f(LV_HI - LV_LO)}, 0.0, 1.0);
  vec3 lc = mix(mix(col, bone, 0.22 + 0.5 * lt), uAccent, idx);
  col = mix(col, mix(lc, uZen, top * (1.0 - idx) * 0.6), line);

  // Ripple fronts and the datum benchmark.
  float ring = 0.0;
  for (int i = 0; i < ${MAXP}; i++) {
    vec3 u = uPulse[i];
    if (u.z >= 0.0) ring = max(ring, aa(abs(distance(vP, u.xy) - ${f(SPEED)} * u.z) / pw.x, 0.7 * uDpr) * (1.0 - u.z / ${f(LIFE)}));
  }
  col = mix(col, uAccent, ring);
  float md = distance(vP, uMark);
  col = mix(col, bone, max(aa(abs(md - 1.7) / pw.x, 0.7 * uDpr), aa(md / pw.x, 0.45 / pw.x)));

  // The sheet runs out into the dark well before its edge.
  col = mix(col, uZen * 0.85, smoothstep(150.0, 195.0, max(abs(vP.x), abs(vP.y))));
  gl_FragColor = vec4(col, 1.0);
}`;

/** CPU mirror of the shader's ambient relief (no ripples or swell), for the readout and the benchmark. */
const relief = (x: number, z: number, time: number) => {
  const t = time * 1.4;
  let qx = x * 0.05, qz = z * 0.05;
  const wx = 0.55 * Math.sin(qz * 1.31 + t * 0.05), wz = 0.55 * Math.sin(qx * 1.13 - t * 0.041);
  qx += wx; qz += wz;
  const h = 1.9 * Math.sin(qx * 1.7 + t * 0.06) * Math.cos(qz * 1.3 - t * 0.047) +
    1.3 * Math.sin((qx + qz) * 1.1 + 1.3 + t * 0.038) +
    0.8 * Math.sin(qx * 2.9 - qz * 2.3 + t * 0.071) +
    0.4 * Math.sin(qx * 4.7 + qz * 3.9 - t * 0.093 + 2.0);
  return h * 2.0 * (1.0 + 0.05 * Math.sin(t * 0.21));
};

export function buildStrata(k: PsxKit): SceneDef {
  const { U, view } = k;
  const PIVOT = new THREE.Vector3(0, 0, 0);
  const scene = new THREE.Scene();
  scene.background = U.uZen.value; // shared colour object: follows the accent
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 1, 600);

  const pulses = Array.from({ length: MAXP }, () => new THREE.Vector3(0, 0, -1));
  const swell = new THREE.Vector3(0, 0, 0);
  const uDpr = { value: 1 };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    extensions: { derivatives: true },
    uniforms: {
      uTime: U.uTime, uAccent: U.uAccent, uAccent2: U.uAccent2, uZen: U.uZen, uFogColor: U.uFogColor,
      uPulse: { value: pulses }, uSwell: { value: swell }, uDpr,
      uMark: { value: new THREE.Vector2(BM.x, BM.z) },
    },
  });
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const sheet = new THREE.Mesh(geo, mat);
  sheet.frustumCulled = false;
  // Line weights are set in device pixels, so they stay the same on a dense screen.
  sheet.onBeforeRender = (r) => { uDpr.value = r.getPixelRatio(); };
  scene.add(sheet);

  /* ---- pointer ---- */
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let aimed = false, px = 0, pz = 0, pressed = false, live = 0, next = 0;
  let lastNow = performance.now(), now = lastNow, time = 0;
  const spawn = (x: number, z: number) => {
    pulses[next].set(x, z, 0);
    next = (next + 1) % MAXP;
    live = pulses.filter((p) => p.z >= 0).length;
  };
  // The benchmark answers with a cascade.
  const cascade: { due: number; x: number; z: number }[] = [];
  const busy = () =>
    live > 0 || cascade.length > 0 || pressed || Math.abs(swell.z - (aimed ? SWELL : 0)) > 0.01 ||
    (aimed && Math.hypot(px - swell.x, pz - swell.y) > 0.05);

  return {
    scene, cam, clean: true, fog: [200, 600], fov: [50, 64],
    // Tight on purpose: the sheet is meant to be read from above.
    limits: { pitch: [-0.2, 0.2], zoom: [0.7, 1.6] },
    labels: [],
    eggs: [
      {
        id: "strata-benchmark", r: 34,
        at: (v) => { v.set(BM.x, relief(BM.x, BM.z, time), BM.z); },
        fire: () => {
          const n = performance.now();
          [[0, 0, 0], [260, 22, 0], [520, -11, 19], [780, -11, -19]].forEach(([d, dx, dz]) =>
            cascade.push({ due: n + d, x: BM.x + dx, z: BM.z + dz }));
        },
      },
    ],
    pointer: {
      aim(ray) {
        const ok = Boolean(ray?.intersectPlane(plane, hit)) && Math.abs(hit.x) < 150 && Math.abs(hit.z) < 150;
        if (ok) { px = hit.x; pz = hit.z; }
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
      time = t;
      now = performance.now();
      const dt = Math.max(0, Math.min(0.05, (now - lastNow) / 1000));
      lastNow = now;

      // Nearly plumb, turning slowly; the cursor slides the eye a little so the plates part.
      const a = 0.5 + t * 0.012 + view.yaw, r = 14;
      cam.position.set(Math.sin(a) * r + view.px * 5, 62, Math.cos(a) * r + view.py * 5);
      cam.lookAt(PIVOT);
      k.orbit(cam, PIVOT);

      for (let i = cascade.length - 1; i >= 0; i--) {
        if (cascade[i].due > now) continue;
        spawn(cascade[i].x, cascade[i].z);
        cascade.splice(i, 1);
      }
      live = 0;
      for (const p of pulses) {
        if (p.z < 0) continue;
        p.z += dt;
        if (p.z > LIFE) p.z = -1;
        else live++;
      }

      // The swell follows the pointer and settles when it leaves.
      if (aimed) {
        if (swell.z < 0.02) { swell.x = px; swell.y = pz; }
        const e = 1 - Math.pow(1 - 0.2, dt * 60);
        swell.x += (px - swell.x) * e;
        swell.y += (pz - swell.y) * e;
      }
      const target = aimed ? SWELL : 0;
      swell.z += (target - swell.z) * (1 - Math.pow(1 - 0.1, dt * 60));
      if (Math.abs(swell.z - target) < 0.01) swell.z = target;
    },
    readout() {
      const h = aimed ? relief(px, pz, time) + swell.z : relief(0, 0, time);
      const lv = Math.max(0, Math.min(LV_HI - LV_LO, Math.floor(h / STEP) - LV_LO));
      return [
        ["CI", `${STEP.toFixed(1)} m · idx ${(STEP * IDX).toFixed(1)}`],
        ["Spot", `${h < 0 ? "−" : "+"}${Math.abs(h).toFixed(1)} m`],
        ["Level", `L${k.pad(lv)}/${LV_HI - LV_LO}`],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
        ["Pulses", String(live)],
      ];
    },
  };
}
