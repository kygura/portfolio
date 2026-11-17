/** Sheet 05 · Field: a contour map that a touch distorts and reveals.
 *
 *  One smooth height field is drawn as anti-aliased isolines in a fragment
 *  shader (no PS1 treatment: the scene is `clean`, so the engine draws it at
 *  full resolution without the low-res dither pass). The ground is a single
 *  palette colour, the same in every pixel at every camera angle: no shading,
 *  no fade, no marks. Ground and ink both come from the shared accent
 *  uniforms, so a palette switch recolours both live.
 *
 *  - Heavy index lines over hairline intermediates, around one summit. Until it
 *    is touched the map is only a faint hint of itself.
 *  - Alive: the relief drifts slowly and every contour level breathes on its
 *    own phase (brightness and weight).
 *  - The hover raises a soft swell under the cursor that bends the lines
 *    around it.
 *  - A press drops a ripple into the height field itself, and a drag lays a
 *    continuous wake of smaller ones: the isolines bunch, part and flow
 *    behind the pointer, then settle. Every ripple reveals the ground it
 *    crosses: full-strength lines and stepped height tints, held in a
 *    coverage map that fades back to the faint hint over three minutes.
 *  - Free camera (`freeCam`): the plain drag paints, so the engine moves the
 *    camera to Shift/Alt/right-drag (orbit, from straight down to a low
 *    oblique), middle-drag (pan), wheel and two fingers.
 *  - Reduced motion: nothing drifts or fades, and a touch raises a soft swell
 *    that eases back in place and reveals its disc at once. */
import * as THREE from "three";
import type { PsxKit, SceneDef } from "./psx";

/** Ripples alive at once: presses and the stamps of a drag share the pool. */
const MAXP = 12;
/** Contour interval in height units (1 unit reads as 100 m); every fifth line is an index line. */
const STEP = 0.5;
/** Summit and basin, on the ground plane (x, z). */
const SUMMIT: [number, number] = [8, -3], BASIN: [number, number] = [-15, 8];
/** Camera at rest: elevation above the ground (rad) and distance from its target. */
const ELEV = 1.2, DIST = 50, MIN_ELEV = 0.32;
/** Coverage map: RES² texels over a square of half-size COV_R world units about the origin. */
const RES = 256, COV_R = 120;
/** Seconds for fully revealed ground to fade back to the hint, and how strong the hint is. */
const HOLD = 180, HINT = 0.09;

const v2 = (p: [number, number]) => `vec2(${p[0].toFixed(1)}, ${p[1].toFixed(1)})`;

/* The relief, written once for the shaders and mirrored below in JS (the JS
   copy places the pointer, the spot heights and the readout). */
const RELIEF_GLSL = `
uniform float uTime;
float relief(vec2 p){
  vec2 q = p * 0.085;
  q += 0.55 * vec2(sin(q.y * 1.3 + uTime * 0.05 + 1.7), cos(q.x * 1.1 - uTime * 0.04));
  float h = 1.5 * sin(q.x + 0.3) * cos(q.y * 0.9)
          + 1.0 * sin((q.x + q.y) * 0.7 + 1.3 + uTime * 0.03)
          + 0.4 * sin(q.x * 2.3 - q.y * 1.9 + uTime * 0.06);
  vec2 a = p - ${v2(SUMMIT)}, b = p - ${v2(BASIN)};
  h += 4.4 * exp(-dot(a, a) * 0.0075) - 2.4 * exp(-dot(b, b) * 0.012);
  return h;
}`;

const VERT = `
${RELIEF_GLSL}
varying vec2 vP; varying float vDist;
void main(){
  vP = position.xz;
  // The sheet is really raised, so a tilted camera sees the relief in parallax.
  vec4 mv = modelViewMatrix * vec4(position.x, relief(vP), position.z, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
${RELIEF_GLSL}
uniform sampler2D uCov;
uniform vec4 uPulse[${MAXP}];   // x, z, age, amplitude
uniform vec2 uPulseB[${MAXP}];  // lifetime, speed
uniform int uCount;              // live ripples, packed at the front
uniform vec3 uHover;
uniform float uCalm;
uniform vec3 uAccent; uniform vec3 uAccent2; uniform vec3 uFogColor; uniform vec3 uZen;
uniform float uPx; uniform vec2 uFade;
varying vec2 vP; varying float vDist;

/* x: height added by the ripples and the pointer, y: how much of a wave front is here (0..1),
   z: how freshly a ripple has passed over here (0..1). */
vec3 touch(vec2 p){
  float h = 0.0, e = 0.0, s = 0.0;
  for (int i = 0; i < ${MAXP}; i++) {
    if (i >= uCount) break;
    vec4 u = uPulse[i];
    vec2 b = uPulseB[i];
    float r = length(p - u.xy), life = clamp(u.z / b.x, 0.0, 1.0);
    if (uCalm > 0.5) {
      // A swell that rises and settles in place.
      if (r > 24.0) continue;
      h += u.w * 1.3 * sin(3.14159 * life) * exp(-r * r * 0.01);
    } else {
      float d = r - b.y * u.z;
      // Ground the front has already crossed is revealed; the coverage map holds it after the ripple dies.
      s += u.w * (1.0 - life) * (1.0 - life) * step(d, 0.0) * exp(d * 0.06);
      // Nothing of this ripple reaches here: ahead of its front, or behind it and clear of the centre.
      if (d > 19.0 || (d < -19.0 && r > 13.0)) continue;
      float env = exp(-d * d * 0.017) * (1.0 - life) * (1.0 - life) * smoothstep(0.0, 0.12, u.z);
      h += u.w * (env * cos(d * 0.56) / (1.0 + r * 0.014) - 1.5 * exp(-r * r * 0.035) * exp(-u.z * 1.6));
      e += env * u.w;
    }
  }
  vec2 hv = p - uHover.xy;
  h += uHover.z * exp(-dot(hv, hv) * 0.03);
  return vec3(h, min(e, 1.0), min(s, 1.0));
}
void main(){
  vec3 tc = touch(vP);
  float h = relief(vP) + tc.x;
  float f = h / ${STEP.toFixed(2)};
  float df = max(fwidth(f), 1e-5);
  float lid = floor(f + 0.5);
  float dist = abs(f - lid);
  float idx = 1.0 - step(0.5, mod(lid, 5.0));
  // Each level breathes on its own phase.
  float breath = 0.5 + 0.5 * sin(uTime * 0.55 + lid * 0.83);
  float hn = clamp(h / 10.0 + 0.45, 0.0, 1.0);
  // Half-width in device pixels: hairline intermediates under heavy index lines.
  float w = uPx * (mix(0.3, 0.95, idx) + 0.16 * breath + 0.2 * hn + 0.35 * tc.y);
  float line = clamp(w + 0.5 - dist / df, 0.0, 1.0);
  line *= 1.0 - smoothstep(0.2, 0.34, dist);        // no blobs on flat ground
  line *= 1.0 - smoothstep(0.22, 0.5, df);          // no moire where lines crowd
  float a = mix(0.4, 0.95, idx) * (0.64 + 0.36 * breath) * mix(0.62, 1.0, hn);
  a = min(1.0, a + 0.45 * tc.y);

  // Far lines thin out into the ground.
  float far = 1.0 - smoothstep(uFade.x, uFade.y, vDist);
  a *= far;

  // Revealed ground: what the coverage map holds, what a ripple has just crossed, and the wave fronts themselves.
  float cov = texture2D(uCov, vP * ${(0.5 / COV_R).toFixed(6)} + 0.5).r;
  float seen = clamp(max(max(cov, tc.z), tc.y), 0.0, 1.0);
  a *= mix(${HINT.toFixed(2)}, 1.0, seen);

  // Ground and ink both belong to the palette. Unrevealed ground is one flat colour, the same as the clear colour;
  // revealed ground takes stepped height tints, high ground lighter.
  vec3 ground = mix(uZen, uFogColor, 0.36) + uAccent2 * 0.08;
  float band = floor(hn * 9.0) / 9.0;
  vec3 tint = mix(ground, mix(uFogColor, uAccent2, 0.45), 0.08 + 0.5 * band * band);
  vec3 minor = mix(uFogColor, uAccent, 0.62);
  vec3 ink = mix(minor, uAccent, max(idx, tc.y));
  vec3 c = mix(ground, tint, seen * far * 0.9);
  c = mix(c, ink, line * a);

  gl_FragColor = vec4(c, 1.0);
}`;

export function buildField(k: PsxKit): SceneDef {
  const { U, view } = k;
  const scene = new THREE.Scene();
  const bg = new THREE.Color();
  scene.background = bg;
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 900);
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- the same relief in JS ---- */
  const relief = (x: number, z: number, t: number) => {
    let qx = x * 0.085, qz = z * 0.085;
    const wx = 0.55 * Math.sin(qz * 1.3 + t * 0.05 + 1.7), wz = 0.55 * Math.cos(qx * 1.1 - t * 0.04);
    qx += wx; qz += wz;
    const ax = x - SUMMIT[0], az = z - SUMMIT[1], bx = x - BASIN[0], bz = z - BASIN[1];
    return 1.5 * Math.sin(qx + 0.3) * Math.cos(qz * 0.9) + 1.0 * Math.sin((qx + qz) * 0.7 + 1.3 + t * 0.03) +
      0.4 * Math.sin(qx * 2.3 - qz * 1.9 + t * 0.06) +
      4.4 * Math.exp(-(ax * ax + az * az) * 0.0075) - 2.4 * Math.exp(-(bx * bx + bz * bz) * 0.012);
  };
  /* ---- coverage map: what the ripples have revealed, fading over HOLD seconds ---- */
  const covF = new Float32Array(RES * RES);
  const covB = new Uint8Array(RES * RES * 4);
  const covTex = new THREE.DataTexture(covB, RES, RES, THREE.RGBAFormat, THREE.UnsignedByteType);
  covTex.magFilter = THREE.LinearFilter;
  covTex.minFilter = THREE.LinearFilter;
  covTex.wrapS = covTex.wrapT = THREE.ClampToEdgeWrapping;
  covTex.needsUpdate = true;
  let covDirty = false, coverage = 0, fadeAcc = 0;
  const toTex = (w: number) => (w / (2 * COV_R) + 0.5) * RES - 0.5;
  /** Reveal a disc, strongest at the centre, soft at the rim. Texels inside `inner` are skipped. */
  const reveal = (x: number, z: number, r: number, val: number, inner = 0) => {
    const cx = toTex(x), cz = toTex(z), rt = (r / (2 * COV_R)) * RES, it = (inner / (2 * COV_R)) * RES;
    const i0 = Math.max(1, Math.floor(cx - rt)), i1 = Math.min(RES - 2, Math.ceil(cx + rt));
    const j0 = Math.max(1, Math.floor(cz - rt)), j1 = Math.min(RES - 2, Math.ceil(cz + rt));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i - cx, j - cz);
        if (d > rt || d < it - 1) continue;
        const u = d / rt;
        const v = val * (1 - 0.45 * u * u) * Math.min(1, (1 - u) * 6);
        const o = j * RES + i;
        if (v > covF[o]) { covF[o] = v; covDirty = true; }
      }
    }
  };
  /** Fade everything a little, and measure how much of the central 120 × 96 area is revealed. */
  const fadeCov = (dt: number) => {
    const by = dt / HOLD;
    const b0 = Math.floor(toTex(-60)), b1 = Math.ceil(toTex(60)), c0 = Math.floor(toTex(-48)), c1 = Math.ceil(toTex(48));
    let sum = 0, n = 0;
    for (let j = 0; j < RES; j++) {
      for (let i = 0; i < RES; i++) {
        const o = j * RES + i;
        const v = covF[o] = Math.max(0, covF[o] - by);
        if (i >= b0 && i <= b1 && j >= c0 && j <= c1) { sum += v > 0.25 ? 1 : 0; n++; }
      }
    }
    coverage = n ? sum / n : 0;
    covDirty = true;
  };
  const pushCov = () => {
    if (!covDirty) return;
    for (let o = 0; o < RES * RES; o++) {
      const b = Math.round(covF[o] * 255);
      covB[o * 4] = b; covB[o * 4 + 1] = b; covB[o * 4 + 2] = b; covB[o * 4 + 3] = 255;
    }
    covTex.needsUpdate = true;
    covDirty = false;
  };

  const pulseU = Array.from({ length: MAXP }, () => new THREE.Vector4(0, 0, 0, 0));
  const pulseB = Array.from({ length: MAXP }, () => new THREE.Vector2(1, 1));
  const hoverU = new THREE.Vector3(0, 0, 0);
  const fadeU = new THREE.Vector2(75, 160);
  const pxU = { value: 1 }, countU = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.uTime, uCov: { value: covTex }, uAccent: U.uAccent, uAccent2: U.uAccent2, uFogColor: U.uFogColor, uZen: U.uZen,
      uPulse: { value: pulseU }, uPulseB: { value: pulseB }, uHover: { value: hoverU }, uCalm: { value: reduced ? 1 : 0 },
      uPx: pxU, uFade: { value: fadeU }, uCount: countU,
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  // Wide enough that the lines have thinned out before the edge at every camera setting.
  const geo = new THREE.PlaneGeometry(840, 840, 280, 280);
  geo.rotateX(-Math.PI / 2);
  const sheet = new THREE.Mesh(geo, mat);
  sheet.frustumCulled = false;
  scene.add(sheet);
  // Lines stay hairlines on dense screens: weight grows slower than the drawing buffer's pixel ratio.
  sheet.onBeforeRender = (renderer) => { pxU.value = 1 + (renderer.getPixelRatio() - 1) * 0.6; };
  /* ---- ripples: presses and drag stamps share one pool ---- */
  interface Pulse { x: number; z: number; age: number; amp: number; life: number; speed: number; reach: number }
  const pool: Pulse[] = Array.from({ length: MAXP }, () => ({ x: 0, z: 0, age: 0, amp: 0, life: 1, speed: 1, reach: 0 }));
  let live = 0;
  const spawn = (x: number, z: number, amp: number, life: number, speed: number) => {
    // A free slot, or else the ripple with the least left in it.
    let best = pool[0], least = Infinity;
    for (const p of pool) {
      const left = p.amp <= 0 ? -1 : p.amp * (1 - p.age / p.life) ** 2;
      if (left < least) { least = left; best = p; }
    }
    best.x = x; best.z = z; best.age = 0; best.amp = amp; best.life = life; best.speed = speed; best.reach = 0;
    // Without travelling rings, the disc is revealed at once.
    if (reduced) reveal(x, z, life * speed * 0.4, Math.min(1, amp));
  };
  const ripple = (x: number, z: number, amp = 1.25) => spawn(x, z, amp, 4.6, 13);

  /* ---- pointer state ---- */
  const cascade: { due: number; x: number; z: number }[] = [];
  let aimed = false, pressed = false, px = 0, pz = 0, hx = 0, hz = 0, lift = 0;
  let sx = 0, sz = 0, stampAt = 0; // last drag stamp
  let sceneT = 18, lastNow = performance.now(), opened = false;
  const hit = new THREE.Vector3(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // Ray onto the raised sheet: a few plane intersections converge on it.
  const pick = (ray: THREE.Ray) => {
    let y = 0;
    for (let i = 0; i < 3; i++) {
      plane.constant = -y;
      if (!ray.intersectPlane(plane, hit)) return false;
      y = relief(hit.x, hit.z, sceneT);
    }
    return Math.abs(hit.x) < 300 && Math.abs(hit.z) < 300;
  };
  const busy = () =>
    cascade.length > 0 || pressed || live > 0 || Math.abs(lift) > 0.01 ||
    (aimed && Math.hypot(px - hx, pz - hz) > 0.05);

  const pivot = new THREE.Vector3();
  const summit = new THREE.Vector3(SUMMIT[0], 0, SUMMIT[1]);

  return {
    scene, cam, clean: true, idleFps: 30, freeCam: { pan: 60 }, fog: [75, 160], fov: [50, 66],
    // From straight overhead down to a low oblique, and from a wide sheet to a close study.
    limits: { pitch: [MIN_ELEV - ELEV, Math.PI / 2 - ELEV], zoom: [0.4, 3.2] },
    labels: [],
    eggs: [
      {
        // Unmarked: a tap on the summit answers with a ring of ripples around it.
        id: "field-benchmark", r: 30,
        at: (v) => { v.copy(summit); },
        fire: () => {
          const now = performance.now();
          [[0, 0, 0], [240, 10, 0], [480, 0, 10], [720, -10, 0], [960, 0, -10]].forEach(([d, dx, dz]) =>
            cascade.push({ due: now + d, x: summit.x + dx, z: summit.z + dz }));
        },
      },
    ],
    pointer: {
      aim(ray, moved) {
        const ok = ray ? pick(ray) : false;
        if (ok) {
          px = hit.x; pz = hit.z;
          // A drag lays a wake: one small ripple every few metres of travel.
          const now = performance.now(), run = Math.hypot(px - sx, pz - sz);
          if (pressed && moved && run > 3 && now - stampAt > 140) {
            const pace = Math.min(1, run / Math.max(0.1, (now - stampAt) / 1000) / 45);
            spawn(px, pz, 0.6 + 0.4 * pace, 2.2, 8);
            sx = px; sz = pz; stampAt = now;
          }
        }
        aimed = ok;
      },
      press() {
        pressed = true;
        if (!aimed) return;
        ripple(px, pz);
        sx = px; sz = pz; stampAt = performance.now();
      },
      release() { pressed = false; },
      busy,
    },
    update(t) {
      const now = performance.now();
      const dt = Math.max(0, Math.min(0.05, (now - lastNow) / 1000));
      lastNow = now;
      sceneT = t;

      // Free camera about a target on the ground. `up` is the heading, so straight down is no special case.
      const yaw = Math.PI / 2 + view.yaw;
      const elev = Math.max(MIN_ELEV, Math.min(Math.PI / 2, ELEV + view.pitch));
      const d = DIST / view.zoom, flat = Math.cos(elev) * d;
      pivot.set(view.panX, 0, view.panZ);
      cam.position.set(pivot.x + Math.cos(yaw) * flat, Math.sin(elev) * d, pivot.z + Math.sin(yaw) * flat);
      cam.up.set(-Math.cos(yaw), 0, -Math.sin(yaw));
      cam.lookAt(pivot);
      // A low camera sees further across the sheet before the lines thin out.
      const low = 1 - Math.sin(elev), far = Math.min(d * (3.2 + 3.5 * low), 400);
      fadeU.set(Math.min(d * (1.5 + 1.2 * low), far * 0.55), far);
      // The clear colour is the shader's ground, so the sheet has no visible edge.
      const z = U.uZen.value, f = U.uFogColor.value, a2 = U.uAccent2.value;
      bg.setRGB(z.r + (f.r - z.r) * 0.36 + a2.r * 0.08, z.g + (f.g - z.g) * 0.36 + a2.g * 0.08, z.b + (f.b - z.b) * 0.36 + a2.b * 0.08);

      // Pointer: a faint swell follows the cursor and sinks into a hollow under a press.
      if (aimed) {
        if (Math.abs(lift) < 0.02) { hx = px; hz = pz; }
        const e = 1 - Math.pow(1 - 0.25, dt * 60);
        hx += (px - hx) * e; hz += (pz - hz) * e;
      }
      const liftT = pressed ? -0.9 : aimed ? 0.32 : 0;
      lift += (liftT - lift) * (1 - Math.pow(1 - (pressed ? 0.14 : 0.06), dt * 60));
      if (!aimed && !pressed && Math.abs(lift) < 0.01) lift = 0;
      hoverU.set(hx, hz, lift);

      // Open with one ripple from the summit, so the first view shows what a touch does.
      if (!opened) { opened = true; spawn(summit.x, summit.z, 0.9, 3.4, 9); }

      for (let i = cascade.length - 1; i >= 0; i--) {
        if (cascade[i].due > now) continue;
        ripple(cascade[i].x, cascade[i].z, 0.9);
        cascade.splice(i, 1);
      }
      // Age the pool and pack what is alive at the front of the uniforms, so the shader loops over that alone.
      live = 0;
      for (let i = 0; i < MAXP; i++) {
        const p = pool[i];
        if (p.amp <= 0) continue;
        p.age += dt;
        if (p.age > p.life) { p.amp = 0; continue; }
        // The front reveals what it crosses, strongly near the centre and faintly far out.
        const R = p.speed * p.age;
        if (!reduced && R > p.reach) {
          reveal(p.x, p.z, R, Math.min(1, p.amp) * (1 - 0.5 * p.age / p.life), p.reach * 0.8);
          p.reach = R;
        }
        pulseU[live].set(p.x, p.z, p.age, p.amp);
        pulseB[live].set(p.life, p.speed);
        live++;
      }
      countU.value = live;

      fadeAcc += reduced ? 0 : dt;
      if (fadeAcc > 0.5) { fadeCov(fadeAcc); fadeAcc = 0; }
      pushCov();
      summit.y = relief(summit.x, summit.z, t);
    },
    readout() {
      const e = relief(aimed ? px : pivot.x, aimed ? pz : pivot.z, sceneT);
      return [
        ["Scale", "1:25 000"],
        ["CI", "50 m · index 250 m"],
        ["Elev", `${e < 0 ? "\u2212" : ""}${Math.abs(Math.round(e * 100))} m`],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
        ["Ripples", String(live)],
        ["Mapped", `${Math.round(coverage * 100)}%`],
      ];
    },
  };
}
