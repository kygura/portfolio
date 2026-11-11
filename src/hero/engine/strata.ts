/** Sheet 05 · Strata: an abstract relief read from straight above, drawn with
 *  strokes only. One plane is displaced by a slow, drifting height function and
 *  the same function is evaluated per pixel to rule a hairline at every level on
 *  a near-black ground that takes its cast from the palette. No fills, no grid:
 *  height reads from the strokes themselves (low levels sink into the ground,
 *  high ones brighten and thicken, every fifth is in the accent) and from the
 *  way they slide over one another as the eye moves.
 *
 *  The lines are the thing you touch. Every vertex carries a 2D offset (the warp)
 *  that shifts where the height function is read, so moving the offset moves the
 *  contours themselves: a drag pulls them along with the pointer, a tap pushes
 *  them apart into a dent, the cursor parts them like a lens, and they ease back
 *  over a few seconds once let go.
 *
 *  A `clean` scene: it is drawn at full resolution with no PS1 pass, so its lines
 *  are anti-aliased in the shader instead (screen-space derivatives). */
import * as THREE from "three";
import type { PsxKit, SceneDef } from "./psx";

/** Contour interval (m), index line every IDX levels, and the level range the strokes fade across. */
const STEP = 1, IDX = 5, LV_LO = -7, LV_HI = 6;
/** Datum benchmark: a ring drawn on the surface, and the scene's hidden target. */
const BM = { x: 26, z: -15 };
/** Ground: the palette's zenith colour pulled most of the way to black. */
const GROUND = 0.4;
/** Plane size (m) and segments. The edge fades out long before the camera can reach it.
 *  The warp lives on the vertices, so the segment count is also its resolution. */
const SIZE = 400, SEG = 176;
/** Warp: pull radius and falloff (m), the furthest a line can be dragged (m), and how long it takes to ease back (s). */
const PULL_R = 26, PULL_S = 9, PULL_MAX = 24, RELAX = 2.4;
/** A tap's dent: radius, falloff (m), strength, and how long the push takes to land (s). */
const DENT_R = 20, DENT_S = 6.5, DENT_K = 1.25, DENT_T = 0.2;
/** The hover lens: how far it parts the lines (a factor of the distance from the cursor). */
const LENS = 0.3;

const f = (n: number) => n.toFixed(1);

/* The height function, shared by both shaders (and mirrored in `relief` below for
   the readout). Domain-warped sines rather than noise: the curves stay clean. */
const RELIEF = `
uniform float uTime;
float relief(vec2 p){
  float t = uTime * 1.4;
  vec2 q = p * 0.05;
  q += 0.55 * vec2(sin(q.y * 1.31 + t * 0.050), sin(q.x * 1.13 - t * 0.041));
  float h = 1.9 * sin(q.x * 1.7 + t * 0.060) * cos(q.y * 1.3 - t * 0.047)
          + 1.3 * sin((q.x + q.y) * 1.1 + 1.3 + t * 0.038)
          + 0.8 * sin(q.x * 2.9 - q.y * 2.3 + t * 0.071)
          + 0.4 * sin(q.x * 4.7 + q.y * 3.9 - t * 0.093 + 2.0);
  return h * 2.0 * (1.0 + 0.05 * sin(t * 0.21));
}`;

const VERT = `
attribute vec2 aWarp;
uniform vec3 uLens;
varying vec2 vP;
varying vec2 vW;
${RELIEF}
void main(){
  vec3 p = position;
  vP = p.xz;
  // Where the relief is read from: the sheet's own position, less the pull stored on
  // this vertex and the lens under the cursor. Moving this moves the lines.
  vec2 d = vP - uLens.xy;
  vW = vP - aWarp - d * uLens.z * exp(-dot(d, d) * 0.011);
  // Real height, so the strokes slide over one another as the eye moves.
  p.y = relief(vW);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = `
varying vec2 vP;
varying vec2 vW;
uniform vec3 uAccent; uniform vec3 uZen;
uniform float uDpr;
uniform vec2 uMark;
${RELIEF}
float aa(float d, float w){ return 1.0 - smoothstep(w - 0.5, w + 0.5, d); }
void main(){
  float q = relief(vW) / ${f(STEP)};
  float pw = max(fwidth(vP.x), 1e-5);   // metres per pixel
  float gq = fwidth(q);                 // levels per pixel
  float slope = gq / pw;                // levels per metre
  // A stroke is a distance in pixels from the level, which needs a slope to divide by.
  // Where the surface goes flat (summits, pits, saddles) that distance would stay small
  // over a whole patch and the stroke would flood it, so the slope is floored and the
  // stroke is let go as the ground levels out: a line may end, it may never fill.
  float fw = max(gq, 0.03 * pw);
  float fr = fract(q);
  vec3 ground = uZen * ${f(GROUND)};
  vec3 bone = mix(uAccent, vec3(1.0), 0.62);
  vec3 col = ground;

  // Level strokes, nothing else. Height reads from the stroke alone: low levels sink
  // into the ground, high ones come up brighter and a touch heavier, every ${IDX}th in the accent.
  float li = floor(q + 0.5);
  float idx = 1.0 - step(0.5, mod(li, ${f(IDX)}));
  float lt = clamp((li - ${f(LV_LO)}) / ${f(LV_HI - LV_LO)}, 0.0, 1.0);
  float w = min(mix(mix(0.45, 0.75, lt), mix(0.8, 1.2, lt), idx) * uDpr, 2.4);
  float line = aa(min(fr, 1.0 - fr) / fw, w);
  line *= smoothstep(0.03, 0.09, slope) * (1.0 - smoothstep(0.4, 0.8, gq));
  float a = mix(0.07 + 0.63 * lt * lt, 0.3 + 0.7 * lt, idx);
  col = mix(col, mix(bone, uAccent, idx), line * a);

  // The datum benchmark: a small open ring.
  col = mix(col, bone, 0.8 * aa(abs(distance(vP, uMark) - 1.5) / pw, min(0.55 * uDpr, 1.2)));

  // The sheet runs out into the ground well before its edge.
  col = mix(col, ground, smoothstep(150.0, 195.0, max(abs(vP.x), abs(vP.y))));
  gl_FragColor = vec4(col, 1.0);
}`;

/** CPU mirror of the shader's ambient relief (before any warp), for the readout and the benchmark. */
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
  const ground = new THREE.Color();
  scene.background = ground; // refreshed from the palette every frame
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 1, 600);

  const lens = new THREE.Vector3(0, 0, 0);
  const uDpr = { value: 1 };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    extensions: { derivatives: true },
    uniforms: {
      uTime: U.uTime, uAccent: U.uAccent, uZen: U.uZen, uLens: { value: lens }, uDpr,
      uMark: { value: new THREE.Vector2(BM.x, BM.z) },
    },
  });
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  /* The warp: one (x, z) offset per vertex, in metres. Vertices run in rows of W along
     +x, rows along +z, so a node is found from its world position without a lookup. */
  const W = SEG + 1, half = SIZE / 2, cs = SIZE / SEG;
  const warp = new Float32Array(W * W * 2);
  const warpAttr = new THREE.BufferAttribute(warp, 2);
  warpAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aWarp", warpAttr);
  const sheet = new THREE.Mesh(geo, mat);
  sheet.frustumCulled = false;
  // Line weights are set in device pixels, so they stay the same on a dense screen.
  sheet.onBeforeRender = (r) => { uDpr.value = r.getPixelRatio(); };
  scene.add(sheet);

  let warpE = 0; // largest offset on the sheet (m); 0 = at rest
  /** Add to the warp around (cx, cz): `pull` moves the lines by (dx, dz), `push` moves them radially by `amt`. */
  const brush = (cx: number, cz: number, rad: number, sigma: number, dx: number, dz: number, push: number) => {
    const x0 = Math.max(0, Math.floor((cx - rad + half) / cs)), x1 = Math.min(SEG, Math.ceil((cx + rad + half) / cs));
    const z0 = Math.max(0, Math.floor((cz - rad + half) / cs)), z1 = Math.min(SEG, Math.ceil((cz + rad + half) / cs));
    const k2 = 1 / (2 * sigma * sigma);
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      const ox = -half + ix * cs - cx, oz = -half + iz * cs - cz, i = (iz * W + ix) * 2;
      const g = Math.exp(-(ox * ox + oz * oz) * k2);
      let wx = warp[i] + (dx + ox * push) * g, wz = warp[i + 1] + (dz + oz * push) * g;
      const m = Math.hypot(wx, wz);
      if (m > PULL_MAX) { wx *= PULL_MAX / m; wz *= PULL_MAX / m; }
      warp[i] = wx; warp[i + 1] = wz;
      if (m > warpE) warpE = Math.min(m, PULL_MAX);
    }
    warpAttr.needsUpdate = true;
  };
  const relax = (dt: number) => {
    const fall = Math.exp(-dt / RELAX);
    let e = 0;
    for (let i = 0; i < warp.length; i++) {
      const v = (warp[i] *= fall), m = v < 0 ? -v : v;
      if (m > e) e = m;
    }
    if (e < 0.02) { warp.fill(0); e = 0; }
    warpE = e;
    warpAttr.needsUpdate = true;
  };

  /* ---- pointer ---- */
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let aimed = false, px = 0, pz = 0, lx = 0, lz = 0, mvx = 0, mvz = 0, pressed = false;
  let lastNow = performance.now(), time = 0;
  // Dents still landing: a tap's push is spread over DENT_T so the lines move, not jump.
  const dents: { x: number; z: number; left: number; due: number }[] = [];
  const dent = (x: number, z: number, delay = 0) => dents.push({ x, z, left: 1, due: performance.now() + delay });
  const lensTarget = () => (aimed && !pressed ? LENS : 0);
  const busy = () =>
    pressed || dents.length > 0 || warpE > 0 || Math.abs(lens.z - lensTarget()) > 0.002 ||
    (aimed && lens.z > 0 && Math.hypot(px - lens.x, pz - lens.y) > 0.05);
  /** Relief under a point, read through the warp (nearest vertex). */
  const spot = (x: number, z: number) => {
    const ix = Math.max(0, Math.min(SEG, Math.round((x + half) / cs))), iz = Math.max(0, Math.min(SEG, Math.round((z + half) / cs)));
    const i = (iz * W + ix) * 2;
    return relief(x - warp[i], z - warp[i + 1], time);
  };

  return {
    scene, cam, clean: true, ownsDrag: true, fog: [200, 600], fov: [50, 64],
    // Tight on purpose: the sheet is meant to be read from above.
    limits: { pitch: [-0.2, 0.2], zoom: [0.7, 1.6] },
    labels: [],
    eggs: [
      {
        // The benchmark answers by pushing the lines apart all round it.
        id: "strata-benchmark", r: 34,
        at: (v) => { v.set(BM.x, spot(BM.x, BM.z), BM.z); },
        fire: () => {
          [[0, 0, 0], [180, 20, 0], [360, -10, 17], [540, -10, -17]].forEach(([d, dx, dz]) => dent(BM.x + dx, BM.z + dz, d));
        },
      },
    ],
    pointer: {
      aim(ray) {
        const ok = Boolean(ray?.intersectPlane(plane, hit)) && Math.abs(hit.x) < 150 && Math.abs(hit.z) < 150;
        if (ok) {
          px = hit.x; pz = hit.z;
          // Travel since the last frame, summed: aim can run more than once between updates.
          if (aimed && pressed) { mvx += px - lx; mvz += pz - lz; }
          lx = px; lz = pz;
        }
        aimed = ok;
      },
      press() {
        pressed = true;
        lx = px; lz = pz; mvx = mvz = 0;
      },
      release(tap) {
        if (pressed && aimed && tap) dent(px, pz);
        pressed = false;
        mvx = mvz = 0;
      },
      busy,
    },
    update(t) {
      time = t;
      ground.copy(U.uZen.value).multiplyScalar(GROUND);
      const now = performance.now();
      const dt = Math.max(0, Math.min(0.05, (now - lastNow) / 1000));
      lastNow = now;

      // Nearly plumb, turning slowly; the cursor slides the eye a little so the lines part.
      const a = 0.5 + t * 0.012 + view.yaw, r = 14;
      cam.position.set(Math.sin(a) * r + view.px * 5, 62, Math.cos(a) * r + view.py * 5);
      cam.lookAt(PIVOT);
      k.orbit(cam, PIVOT);

      // A held drag carries the lines with the pointer, one for one at its centre.
      if (pressed && aimed && (mvx || mvz)) brush(px, pz, PULL_R, PULL_S, mvx, mvz, 0);
      mvx = mvz = 0;
      for (let i = dents.length - 1; i >= 0; i--) {
        const d = dents[i];
        if (d.due > now) continue;
        const part = Math.min(d.left, dt / DENT_T);
        if (part > 0) brush(d.x, d.z, DENT_R, DENT_S, 0, 0, DENT_K * part);
        d.left -= part;
        if (d.left <= 1e-4) dents.splice(i, 1);
      }
      // Let go, the lines ease back to where the relief puts them. Held, they stay put.
      if (!pressed && warpE > 0 && dt > 0) relax(dt);

      // The lens follows the cursor and closes when it leaves or grabs.
      if (aimed) {
        if (lens.z < 0.004) { lens.x = px; lens.y = pz; }
        const e = 1 - Math.pow(1 - 0.25, dt * 60);
        lens.x += (px - lens.x) * e;
        lens.y += (pz - lens.y) * e;
      }
      const target = lensTarget();
      lens.z += (target - lens.z) * (1 - Math.pow(1 - 0.12, dt * 60));
      if (Math.abs(lens.z - target) < 0.002) lens.z = target;
    },
    readout() {
      const h = aimed ? spot(px, pz) : spot(0, 0);
      const lv = Math.max(0, Math.min(LV_HI - LV_LO, Math.floor(h / STEP) - LV_LO));
      return [
        ["CI", `${STEP.toFixed(1)} m · idx ${(STEP * IDX).toFixed(1)}`],
        ["Spot", `${h < 0 ? "−" : "+"}${Math.abs(h).toFixed(1)} m`],
        ["Level", `L${k.pad(lv)}/${LV_HI - LV_LO}`],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
        ["Warp", `${warpE.toFixed(1)} m`],
      ];
    },
  };
}
