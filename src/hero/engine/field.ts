/** Sheet 05 · Field: an abstract contour sheet, seen from almost straight above.
 *
 *  One smooth height field is drawn as anti-aliased isolines in a fragment
 *  shader (no PS1 treatment: the scene is `clean`, so the engine draws it at
 *  full resolution without the low-res dither pass). The ground is one flat
 *  colour and the lines a restrained tone of the palette; both come from the
 *  shared accent uniforms, so a palette switch recolours it like every scene.
 *
 *  - Alive: the relief drifts slowly and every contour level breathes on its
 *    own phase (brightness and weight).
 *  - A click or tap drops a ripple into the height field itself: the isolines
 *    bunch and part as the ring travels out, then settle.
 *  - Holding (Shift+drag) presses a hollow the lines bend around; letting go
 *    releases it as a ripple. The cursor alone lifts a faint swell.
 *  - Reduced motion: nothing drifts, and a tap raises a soft swell that eases
 *    back instead of sending a travelling ring. */
import * as THREE from "three";
import type { PsxKit, SceneDef } from "./psx";

const MAXP = 6;
/** Contour interval in height units; every fifth line is an index line. */
const STEP = 0.5;
const LIFE = 4.6, SPEED = 9;

/* The relief, written once for the shader and mirrored below in JS (the JS
   copy only places the pointer and the readout, so it skips the ripples). */
const HEIGHT_GLSL = `
uniform float uTime;
uniform vec4 uPulse[${MAXP}];
uniform vec3 uHover;
uniform float uCalm;
float relief(vec2 p){
  vec2 q = p * 0.085;
  q += 0.55 * vec2(sin(q.y * 1.3 + uTime * 0.05 + 1.7), cos(q.x * 1.1 - uTime * 0.04));
  float h = 1.9 * sin(q.x + 0.3) * cos(q.y * 0.9)
          + 1.2 * sin((q.x + q.y) * 0.7 + 1.3 + uTime * 0.03)
          + 0.5 * sin(q.x * 2.3 - q.y * 1.9 + uTime * 0.06);
  vec2 a = p - vec2(7.0, -5.0), b = p - vec2(-13.0, 8.0);
  h += 3.0 * exp(-dot(a, a) * 0.010) - 2.2 * exp(-dot(b, b) * 0.014);
  return h;
}
/* x: height added by the ripples and the pointer, y: how much of a wave front is here (0..1). */
vec2 touch(vec2 p){
  float h = 0.0, e = 0.0;
  for (int i = 0; i < ${MAXP}; i++) {
    vec4 u = uPulse[i];
    if (u.w <= 0.0) continue;
    float r = length(p - u.xy), life = clamp(u.z / ${LIFE.toFixed(1)}, 0.0, 1.0);
    if (uCalm > 0.5) {
      // A swell that rises and settles in place.
      h += u.w * 1.3 * sin(3.14159 * life) * exp(-r * r * 0.02);
    } else {
      float d = r - ${SPEED.toFixed(1)} * u.z;
      float env = exp(-d * d * 0.035) * (1.0 - life) * (1.0 - life) * smoothstep(0.0, 0.12, u.z);
      h += u.w * (env * cos(d * 0.8) / (1.0 + r * 0.02) - 1.5 * exp(-r * r * 0.07) * exp(-u.z * 2.2));
      e += env;
    }
  }
  vec2 hv = p - uHover.xy;
  h += uHover.z * exp(-dot(hv, hv) * 0.03);
  return vec2(h, min(e, 1.0));
}`;

const VERT = `
${HEIGHT_GLSL}
varying vec2 vP; varying float vDist;
void main(){
  vP = position.xz;
  // The sheet is really raised, so the slight tilt gives the relief parallax.
  vec3 q = vec3(position.x, relief(vP) + touch(vP).x, position.z);
  vec4 mv = modelViewMatrix * vec4(q, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
${HEIGHT_GLSL}
uniform vec3 uAccent; uniform vec3 uFogColor; uniform vec3 uZen;
uniform float uPx; uniform vec2 uFade;
varying vec2 vP; varying float vDist;
void main(){
  vec2 tc = touch(vP);
  float h = relief(vP) + tc.x;
  float f = h / ${STEP.toFixed(2)};
  float df = max(fwidth(f), 1e-5);
  float lid = floor(f + 0.5);
  float dist = abs(f - lid);
  float idx = 1.0 - step(0.5, mod(lid, 5.0));
  // Each level breathes on its own phase.
  float breath = 0.5 + 0.5 * sin(uTime * 0.55 + lid * 0.83);
  float hn = clamp(h / 9.0 + 0.5, 0.0, 1.0);
  // Half-width in device pixels: index lines and high ground are heavier.
  float w = uPx * (mix(0.42, 0.8, idx) + 0.22 * breath + 0.3 * hn + 0.35 * tc.y);
  float line = clamp(w + 0.5 - dist / df, 0.0, 1.0);
  line *= 1.0 - smoothstep(0.2, 0.34, dist);        // no blobs on flat ground
  line *= 1.0 - smoothstep(0.22, 0.5, df);          // no moire where lines crowd
  float a = mix(0.44, 0.82, idx) * (0.62 + 0.38 * breath) * mix(0.6, 1.0, hn);
  a = min(1.0, a + 0.45 * tc.y);

  vec3 bg = mix(uZen, uFogColor, 0.2);
  vec3 ground = bg + uFogColor * (hn - 0.5) * 0.09;  // a breath of hypsometric shading
  vec3 ink = mix(mix(uFogColor, uAccent, 0.6), uAccent, max(idx * 0.6, tc.y));
  vec3 c = mix(ground, ink, line * a);
  c = mix(c, bg, smoothstep(uFade.x, uFade.y, vDist));
  gl_FragColor = vec4(c, 1.0);
}`;

export function buildField(k: PsxKit): SceneDef {
  const { U, view } = k;
  const PIVOT = new THREE.Vector3(0, 0, 0);
  const scene = new THREE.Scene();
  const bg = new THREE.Color();
  scene.background = bg;
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 600);
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const pulseU = Array.from({ length: MAXP }, () => new THREE.Vector4(0, 0, 0, 0));
  const hoverU = new THREE.Vector3(0, 0, 0);
  const fadeU = new THREE.Vector2(70, 150);
  const pxU = { value: 1 };
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.uTime, uAccent: U.uAccent, uFogColor: U.uFogColor, uZen: U.uZen,
      uPulse: { value: pulseU }, uHover: { value: hoverU }, uCalm: { value: reduced ? 1 : 0 },
      uPx: pxU, uFade: { value: fadeU },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  // Wide enough that the fade to the ground colour hides the edge at every camera setting.
  const geo = new THREE.PlaneGeometry(420, 420, 200, 200);
  geo.rotateX(-Math.PI / 2);
  const sheet = new THREE.Mesh(geo, mat);
  sheet.frustumCulled = false;
  scene.add(sheet);

  /* ---- the same relief in JS ---- */
  const relief = (x: number, z: number, t: number) => {
    let qx = x * 0.085, qz = z * 0.085;
    const wx = 0.55 * Math.sin(qz * 1.3 + t * 0.05 + 1.7), wz = 0.55 * Math.cos(qx * 1.1 - t * 0.04);
    qx += wx; qz += wz;
    const ax = x - 7, az = z + 5, bx = x + 13, bz = z - 8;
    return 1.9 * Math.sin(qx + 0.3) * Math.cos(qz * 0.9) + 1.2 * Math.sin((qx + qz) * 0.7 + 1.3 + t * 0.03) +
      0.5 * Math.sin(qx * 2.3 - qz * 1.9 + t * 0.06) +
      3.0 * Math.exp(-(ax * ax + az * az) * 0.01) - 2.2 * Math.exp(-(bx * bx + bz * bz) * 0.014);
  };

  /* ---- pointer state ---- */
  interface Pulse { x: number; z: number; age: number; amp: number }
  const pulses: Pulse[] = [];
  const cascade: { due: number; x: number; z: number }[] = [];
  let aimed = false, pressed = false, px = 0, pz = 0, hx = 0, hz = 0, lift = 0;
  let sceneT = 0, lastNow = performance.now();
  const hit = new THREE.Vector3(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // Ray onto the raised sheet: a few plane intersections converge on it.
  const pick = (ray: THREE.Ray) => {
    let y = 0;
    for (let i = 0; i < 3; i++) {
      plane.constant = -y;
      if (!ray.intersectPlane(plane, hit)) return false;
      y = relief(hit.x, hit.z, sceneT);
    }
    return Math.abs(hit.x) < 150 && Math.abs(hit.z) < 150;
  };
  const spawn = (x: number, z: number, amp = 1.25) => {
    if (pulses.length >= MAXP) pulses.shift();
    pulses.push({ x, z, age: 0, amp });
  };
  const busy = () =>
    cascade.length > 0 || pressed || pulses.length > 0 || Math.abs(lift) > 0.01 ||
    (aimed && Math.hypot(px - hx, pz - hz) > 0.05);

  const summit = new THREE.Vector3(7, 0, -5);

  return {
    scene, cam, clean: true, fog: [70, 150], fov: [50, 66], limits: { pitch: [-0.24, 0.42], zoom: [0.6, 1.9] },
    labels: [],
    eggs: [
      {
        // The summit answers with a ring of ripples around it.
        id: "field-benchmark", r: 34,
        at: (v) => { v.copy(summit); },
        fire: () => {
          const now = performance.now();
          [[0, 0, 0], [240, 10, 0], [480, 0, 10], [720, -10, 0], [960, 0, -10]].forEach(([d, dx, dz]) =>
            cascade.push({ due: now + d, x: summit.x + dx, z: summit.z + dz }));
        },
      },
    ],
    pointer: {
      aim(ray) {
        const ok = ray ? pick(ray) : false;
        if (ok) { px = hit.x; pz = hit.z; }
        aimed = ok;
      },
      press() { pressed = true; },
      release(tap) {
        // A tap ripples where it landed; a held press lets its hollow go as a ripple too.
        if (pressed && aimed && (tap || lift < -0.6)) spawn(px, pz);
        pressed = false;
      },
      busy,
    },
    update(t) {
      const now = performance.now();
      const dt = Math.max(0, Math.min(0.05, (now - lastNow) / 1000));
      lastNow = now;
      sceneT = t;

      // Almost top-down, turning very slowly; the engine's orbit tilts and dollies from here.
      const a = 0.9 + t * 0.012 + view.yaw;
      cam.position.set(Math.cos(a) * 15 + view.px * 2, 46, Math.sin(a) * 15 + view.py * 2);
      cam.lookAt(PIVOT);
      k.orbit(cam, PIVOT);
      const d = cam.position.distanceTo(PIVOT);
      fadeU.set(d * 1.45, d * 3.1);
      // Lines stay hairlines on dense screens: weight grows slower than the pixel ratio.
      pxU.value = 1 + (Math.min(window.devicePixelRatio || 1, 2) - 1) * 0.6;
      bg.copy(U.uZen.value).lerp(U.uFogColor.value, 0.2);

      // Pointer: a faint swell follows the cursor and sinks into a hollow under a press.
      if (aimed) {
        if (Math.abs(lift) < 0.02) { hx = px; hz = pz; }
        const e = 1 - Math.pow(1 - 0.2, dt * 60);
        hx += (px - hx) * e; hz += (pz - hz) * e;
      }
      const liftT = pressed ? -1.7 : aimed ? 0.32 : 0;
      lift += (liftT - lift) * (1 - Math.pow(1 - (pressed ? 0.1 : 0.06), dt * 60));
      if (!aimed && !pressed && Math.abs(lift) < 0.01) lift = 0;
      hoverU.set(hx, hz, lift);

      for (let i = cascade.length - 1; i >= 0; i--) {
        if (cascade[i].due > now) continue;
        spawn(cascade[i].x, cascade[i].z, 0.9);
        cascade.splice(i, 1);
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        pulses[i].age += dt;
        if (pulses[i].age > LIFE) pulses.splice(i, 1);
      }
      for (let i = 0; i < MAXP; i++) {
        const p = pulses[i];
        if (p) pulseU[i].set(p.x, p.z, p.age, p.amp);
        else pulseU[i].set(0, 0, 0, 0);
      }
      summit.y = relief(summit.x, summit.z, t);
    },
    readout() {
      const e = relief(aimed ? px : 0, aimed ? pz : 0, sceneT) * 10;
      return [
        ["Scale", "1:2 500"],
        ["CI", "5 m · index 25 m"],
        ["Elev", `${e < 0 ? "−" : "+"}${k.pad(Math.abs(Math.round(e)), 2)} m`],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
        ["Ripples", String(pulses.length)],
      ];
    },
  };
}
