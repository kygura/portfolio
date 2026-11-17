/** Sheet 05 · Field: a sonar survey of the deep seabed, drawn as bathymetry.
 *
 *  One smooth seabed (a seamount, a trench, a chain of knolls) is drawn as
 *  anti-aliased isobaths in a fragment shader (no PS1 treatment: the scene is
 *  `clean`, so the engine draws it at full resolution without the low-res
 *  dither pass). The seabed is dark until something sounds it:
 *
 *  - A survey vessel runs lawnmower lines across the area. Its multibeam swath
 *    maps a band either side of the track into a coverage map that holds for a
 *    few minutes and then fades, so the chart is always being remade.
 *  - A sector scan sweeps round the vessel like a sonar display: the beam lights
 *    the bottom with grainy backscatter and an afterglow that trails behind it.
 *  - Mapped ground takes stepped depth tints, isobaths, a graticule; unmapped
 *    ground stays abyss with the odd stray return.
 *  - A press sends a ping: a ring runs out across the bottom and maps what it
 *    passes. A drag tows a sidescan that maps a strip behind the pointer.
 *  - All colours come from the shared accent uniforms, so a palette switch
 *    recolours the chart live; the abyss is the clear colour, so the sheet has
 *    no edge.
 *  - Free camera (`freeCam`): the plain drag sounds, so the engine moves the
 *    camera to Shift/Alt/right-drag (orbit, from straight down to a low
 *    oblique), middle-drag (pan), wheel and two fingers.
 *  - Reduced motion: the vessel holds station, the sweep is off, and a ping
 *    maps its disc at once without a travelling ring. */
import * as THREE from "three";
import type { PsxKit, SceneDef } from "./psx";

/** Pings alive at once: presses and the stamps of a drag share the pool. */
const MAXP = 12;
/** Contour interval in height units (1 unit reads as 120 m); every fifth line is an index line. */
const STEP = 0.5;
/** Metres per height unit, and the depth of height 0. */
const M_PER = 120, DATUM = 3000;
/** Seamount, trench and two knolls on the ground plane (x, z). */
const SUMMIT: [number, number] = [8, -3], TRENCH: [number, number] = [-15, 12];
const KNOLL_A: [number, number] = [-26, -22], KNOLL_B: [number, number] = [32, 24];
/** Camera at rest: elevation above the ground (rad) and distance from its target. */
const ELEV = 1.2, DIST = 50, MIN_ELEV = 0.32;
/** Coverage map: RES² texels over a square of half-size COV_R world units about the origin. */
const RES = 256, COV_R = 120;
/** Multibeam half-swath, sector-scan range and vessel speed (units/s). */
const SWATH = 6.5, RANGE = 34, SPEED = 4.2;
/** Seconds for fully mapped ground to fade back to abyss. */
const HOLD = 170;

const v2 = (p: [number, number]) => `vec2(${p[0].toFixed(1)}, ${p[1].toFixed(1)})`;
const f1 = (n: number) => n.toFixed(2);

/* The seabed, written once for the shaders and mirrored below in JS (the JS
   copy places the pointer, the vessel's depth and the readout). It is static:
   the motion is all in the instruments. */
const RELIEF_GLSL = `
float relief(vec2 p){
  vec2 q = p * 0.085;
  q += 0.55 * vec2(sin(q.y * 1.3 + 1.7), cos(q.x * 1.1));
  float h = 1.5 * sin(q.x + 0.3) * cos(q.y * 0.9)
          + 1.0 * sin((q.x + q.y) * 0.7 + 1.3)
          + 0.4 * sin(q.x * 2.3 - q.y * 1.9)
          + 0.18 * sin(q.x * 5.1 + q.y * 3.7) * cos(q.y * 4.3 - q.x * 1.2);
  vec2 a = p - ${v2(SUMMIT)}, b = p - ${v2(TRENCH)}, c = p - ${v2(KNOLL_A)}, d = p - ${v2(KNOLL_B)};
  h += 4.4 * exp(-dot(a, a) * 0.0075)
     - 3.2 * exp(-(b.x * b.x * 0.0035 + b.y * b.y * 0.03))
     + 2.0 * exp(-dot(c, c) * 0.02)
     + 1.6 * exp(-dot(d, d) * 0.025);
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
uniform float uTime;
uniform sampler2D uCov;
uniform vec4 uShip;              // x, z, heading, seconds since the last multibeam ping
uniform float uSweep;            // sector-scan beam bearing (rad)
uniform vec4 uPulse[${MAXP}];   // x, z, age, amplitude
uniform vec2 uPulseB[${MAXP}];  // lifetime, speed
uniform int uCount;              // live pings, packed at the front
uniform vec3 uHover;             // x, z, strength
uniform float uCalm;
uniform vec3 uAccent; uniform vec3 uAccent2; uniform vec3 uFogColor; uniform vec3 uZen;
uniform float uPx; uniform vec2 uFade;
varying vec2 vP; varying float vDist;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
/* Coverage of a hairline at signed distance d (world units), w px half-width. */
float hair(float d, float fw, float w){ return clamp(w + 0.5 - abs(d) / max(fw, 1e-5), 0.0, 1.0); }

void main(){
  float h = relief(vP);
  float far = 1.0 - smoothstep(uFade.x, uFade.y, vDist);
  float fwP = length(fwidth(vP));
  // Fine detail (grain, ticks) gives way before it can shimmer.
  float fine = 1.0 - smoothstep(0.18, 0.6, fwP);

  /* ---- what has been sounded ---- */
  float cov = texture2D(uCov, vP * ${(0.5 / COV_R).toFixed(6)} + 0.5).r;

  vec2 sd = vP - uShip.xy;
  float sr = length(sd);
  float inRange = 1.0 - smoothstep(${f1(RANGE * 0.82)}, ${f1(RANGE)}, sr);
  float lag = mod(uSweep - atan(sd.y, sd.x), 6.28318);
  float glow = (1.0 - uCalm) * inRange * exp(-lag * 1.25);
  float beam = (1.0 - uCalm) * inRange * (1.0 - smoothstep(0.0, 0.05, lag)) * smoothstep(0.6, 2.0, sr);

  float ringL = 0.0, wake = 0.0;
  for (int i = 0; i < ${MAXP}; i++) {
    if (i >= uCount) break;
    vec4 u = uPulse[i];
    vec2 b = uPulseB[i];
    float r = length(vP - u.xy), life = clamp(u.z / b.x, 0.0, 1.0);
    float R = b.y * u.z, fade = (1.0 - life) * (1.0 - life);
    if (uCalm < 0.5) {
      ringL += u.w * fade * hair(r - R, fwidth(r), 0.7 * uPx);
      // A fainter echo trails the front.
      ringL += 0.35 * u.w * fade * hair(r - R + 2.4, fwidth(r), 0.4 * uPx);
    }
    wake += u.w * fade * step(r, R) * exp(-(R - r) * 0.09);
  }
  vec2 hv = vP - uHover.xy;
  float hd = length(hv);
  float torch = uHover.z * exp(-hd * hd * 0.012);
  float seen = clamp(max(max(cov, glow * 0.85), max(wake, torch * 0.6)), 0.0, 1.0) * far;

  /* ---- isobaths ---- */
  float f = h / ${STEP.toFixed(2)};
  float df = max(fwidth(f), 1e-5);
  float lid = floor(f + 0.5);
  float dist = abs(f - lid);
  float idx = 1.0 - step(0.5, mod(lid, 5.0));
  // Each level breathes on its own phase.
  float breath = 0.5 + 0.5 * sin(uTime * 0.55 + lid * 0.83);
  float hn = clamp(h / 10.0 + 0.45, 0.0, 1.0);
  float w = uPx * (mix(0.3, 0.95, idx) + 0.16 * breath + 0.2 * hn + 0.4 * beam);
  float line = clamp(w + 0.5 - dist / df, 0.0, 1.0);
  line *= 1.0 - smoothstep(0.2, 0.34, dist);        // no blobs on flat ground
  line *= 1.0 - smoothstep(0.22, 0.5, df);          // no moire where lines crowd
  float a = mix(0.4, 0.95, idx) * (0.64 + 0.36 * breath) * mix(0.62, 1.0, hn);
  // Unmapped relief is barely there: enough to hint at the shape below.
  a *= mix(0.05 * far, 1.0, seen);

  /* ---- colour ---- */
  vec3 abyss = mix(uZen, uFogColor, 0.2) + uAccent2 * 0.04;
  vec3 minor = mix(uFogColor, uAccent, 0.62);
  vec3 ink = mix(minor, uAccent, idx);
  // Stepped depth tints: shoal ground lighter, deep ground sinks into the abyss.
  float band = floor(hn * 9.0) / 9.0;
  vec3 tint = mix(abyss, mix(uFogColor, uAccent2, 0.45), 0.1 + 0.55 * band * band);
  vec3 c = mix(abyss, tint, seen * 0.9);

  // Backscatter: the beam lights the bottom grainy, and the grain flickers ping to ping.
  float n = hash(floor(vP * 2.4) + floor(uTime * 9.0) * vec2(13.0, 7.0));
  c += uAccent * (glow * 0.16 * n * n + beam * 0.35) * fine * far;
  // Stray returns out in the dark.
  float stray = step(0.9965, hash(floor(vP * 1.3) + floor(uTime * 1.5) * vec2(3.0, 17.0)));
  c += uAccent * stray * 0.22 * (1.0 - seen) * fine * far;

  c = mix(c, ink, line * a);

  // Graticule every 10 units, stronger where the chart is mapped.
  vec2 gq = abs(fract(vP / 10.0 + 0.5) - 0.5) * 10.0;
  vec2 gw = max(fwidth(vP), vec2(1e-5));
  float grid = max(clamp(0.45 * uPx + 0.5 - gq.x / gw.x, 0.0, 1.0), clamp(0.45 * uPx + 0.5 - gq.y / gw.y, 0.0, 1.0));
  c = mix(c, minor, grid * (0.06 + 0.12 * seen) * far * fine);

  // Range rings about the vessel, and the edge of the scan.
  float rq = abs(fract(sr / 10.0 + 0.5) - 0.5) * 10.0;
  float rings = clamp(0.45 * uPx + 0.5 - rq / max(fwidth(sr), 1e-5), 0.0, 1.0) * inRange;
  float edge = hair(sr - ${f1(RANGE * 0.82)}, fwidth(sr), 0.5 * uPx);
  c = mix(c, minor, (rings * (0.1 + 0.3 * glow) + edge * 0.28) * (1.0 - uCalm * 0.6) * far);

  // Pings.
  c = mix(c, uAccent, clamp(ringL, 0.0, 1.0) * far);

  // Vessel: a hull pointing along its heading, and the multibeam fan flashing across the track.
  vec2 dir = vec2(cos(uShip.z), sin(uShip.z));
  float along = dot(sd, dir), across = dot(sd, vec2(-dir.y, dir.x));
  float hull = 1.0 - smoothstep(0.85, 1.0, (along * along) / 1.6 + (across * across) / 0.22);
  float flash = exp(-uShip.w * 4.0);
  float fan = hair(along, fwidth(along), 0.6 * uPx) * (1.0 - smoothstep(${f1(SWATH * 0.85)}, ${f1(SWATH)}, abs(across)));
  c = mix(c, uAccent, clamp(hull + fan * (0.25 + 0.75 * flash), 0.0, 1.0));

  // Pointer: a small reticle on the bottom.
  float ret = hair(hd - 1.6, fwidth(hd), 0.5 * uPx);
  c = mix(c, uAccent, ret * uHover.z * 0.8 * far);

  gl_FragColor = vec4(c, 1.0);
}`;

export function buildField(k: PsxKit): SceneDef {
  const { U, view } = k;
  const scene = new THREE.Scene();
  const bg = new THREE.Color();
  scene.background = bg;
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 900);
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- the same seabed in JS ---- */
  const bump = (x: number, z: number, p: [number, number], k2: number) => {
    const dx = x - p[0], dz = z - p[1];
    return Math.exp(-(dx * dx + dz * dz) * k2);
  };
  const relief = (x: number, z: number) => {
    let qx = x * 0.085, qz = z * 0.085;
    const wx = 0.55 * Math.sin(qz * 1.3 + 1.7), wz = 0.55 * Math.cos(qx * 1.1);
    qx += wx; qz += wz;
    const bx = x - TRENCH[0], bz = z - TRENCH[1];
    return 1.5 * Math.sin(qx + 0.3) * Math.cos(qz * 0.9) + 1.0 * Math.sin((qx + qz) * 0.7 + 1.3) +
      0.4 * Math.sin(qx * 2.3 - qz * 1.9) +
      0.18 * Math.sin(qx * 5.1 + qz * 3.7) * Math.cos(qz * 4.3 - qx * 1.2) +
      4.4 * bump(x, z, SUMMIT, 0.0075) - 3.2 * Math.exp(-(bx * bx * 0.0035 + bz * bz * 0.03)) +
      2.0 * bump(x, z, KNOLL_A, 0.02) + 1.6 * bump(x, z, KNOLL_B, 0.025);
  };
  const depth = (h: number) => Math.round(DATUM - h * M_PER);
  const fmtDepth = (h: number) => `${depth(h).toLocaleString("en-GB").replace(",", " ")} m`;

  /* ---- coverage map: what the survey has sounded, fading over HOLD seconds ---- */
  const covF = new Float32Array(RES * RES);
  const covB = new Uint8Array(RES * RES * 4);
  const covTex = new THREE.DataTexture(covB, RES, RES, THREE.RGBAFormat, THREE.UnsignedByteType);
  covTex.magFilter = THREE.LinearFilter;
  covTex.minFilter = THREE.LinearFilter;
  covTex.wrapS = covTex.wrapT = THREE.ClampToEdgeWrapping;
  covTex.needsUpdate = true;
  let covDirty = false, coverage = 0;
  const toTex = (w: number) => ((w / (2 * COV_R)) + 0.5) * RES - 0.5;
  /** Sound a disc: strongest at the centre, falling off to `edge` at radius r, soft rim. Texels inside `inner` are skipped. */
  const stamp = (x: number, z: number, r: number, val: number, edge = 0.65, inner = 0) => {
    const cx = toTex(x), cz = toTex(z), rt = (r / (2 * COV_R)) * RES, it = (inner / (2 * COV_R)) * RES;
    const i0 = Math.max(1, Math.floor(cx - rt)), i1 = Math.min(RES - 2, Math.ceil(cx + rt));
    const j0 = Math.max(1, Math.floor(cz - rt)), j1 = Math.min(RES - 2, Math.ceil(cz + rt));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i - cx, j - cz);
        if (d > rt || d < it - 1) continue;
        const u = d / rt;
        const v = val * (1 - (1 - edge) * u * u) * Math.min(1, (1 - u) * 6);
        const o = j * RES + i;
        if (v > covF[o]) { covF[o] = v; covDirty = true; }
      }
    }
  };
  /** Fade everything a little, refresh the texture, and measure how much of the survey box is mapped. */
  const fadeCov = (dt: number) => {
    const by = dt / HOLD;
    let sum = 0, n = 0;
    const b0 = Math.floor(toTex(-60)), b1 = Math.ceil(toTex(60)), c0 = Math.floor(toTex(-48)), c1 = Math.ceil(toTex(48));
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

  /* ---- survey track: two interleaved lawnmower passes, looping ---- */
  const track: [number, number][] = [];
  /** Track points per survey line: its two ends and the turn after it. */
  const PER_LINE = 13;
  {
    const lines = [
      ...Array.from({ length: 8 }, (_, i) => -45 + 12 * i),
      ...Array.from({ length: 8 }, (_, i) => 45 - 12 * i),
    ];
    const XE = 56;
    lines.forEach((z, i) => {
      const dirX = i % 2 === 0 ? 1 : -1;
      track.push([-XE * dirX, z], [XE * dirX, z]);
      // Turn round onto the next line, bulging outward past the end of this one.
      const zn = lines[(i + 1) % lines.length], cz = (z + zn) / 2, r = Math.abs(zn - z) / 2, sgn = Math.sign(zn - z);
      for (let s = 1; s < PER_LINE - 1; s++) {
        const a = (s / (PER_LINE - 1)) * Math.PI;
        track.push([XE * dirX + dirX * r * Math.sin(a), cz - sgn * r * Math.cos(a)]);
      }
    });
  }
  const cum = [0];
  for (let i = 1; i <= track.length; i++) {
    const a = track[i - 1], b = track[i % track.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const LOOP = cum[track.length];
  let seg = 0;
  const shipAt = (s: number, out: { x: number; z: number; hd: number }) => {
    s = ((s % LOOP) + LOOP) % LOOP;
    if (s < cum[seg]) seg = 0;
    while (seg < track.length - 1 && cum[seg + 1] <= s) seg++;
    const a = track[seg], b = track[(seg + 1) % track.length];
    const u = (s - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
    out.x = a[0] + (b[0] - a[0]) * u;
    out.z = a[1] + (b[1] - a[1]) * u;
    out.hd = Math.atan2(b[1] - a[1], b[0] - a[0]);
    return out;
  };
  const ship = { x: 0, z: 0, hd: 0 };
  // Start a few lines into the survey, with the lines already run mapped and fading by age.
  const S0 = cum[5 * PER_LINE] + 40;
  for (let s = 0; s <= S0; s += 1) {
    shipAt(s, ship);
    stamp(ship.x, ship.z, SWATH, Math.max(0.3, 1 - (S0 - s) / SPEED / HOLD));
  }
  seg = 0;
  shipAt(S0, ship);
  fadeCov(0);
  let shipS = S0, t0 = -1, pingAge = 0;

  const pulseU = Array.from({ length: MAXP }, () => new THREE.Vector4(0, 0, 0, 0));
  const pulseB = Array.from({ length: MAXP }, () => new THREE.Vector2(1, 1));
  const hoverU = new THREE.Vector3(0, 0, 0);
  const shipU = new THREE.Vector4(ship.x, ship.z, ship.hd, 0);
  const fadeU = new THREE.Vector2(75, 160);
  const pxU = { value: 1 }, countU = { value: 0 }, sweepU = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.uTime, uAccent: U.uAccent, uAccent2: U.uAccent2, uFogColor: U.uFogColor, uZen: U.uZen,
      uCov: { value: covTex }, uShip: { value: shipU }, uSweep: sweepU,
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

  /* ---- pings: presses and drag stamps share one pool; each maps the ground its ring passes ---- */
  interface Pulse { x: number; z: number; age: number; amp: number; life: number; speed: number; reach: number }
  const pool: Pulse[] = Array.from({ length: MAXP }, () => ({ x: 0, z: 0, age: 0, amp: 0, life: 1, speed: 1, reach: 0 }));
  let live = 0, pings = 0;
  const spawn = (x: number, z: number, amp: number, life: number, speed: number) => {
    // A free slot, or else the ping with the least left in it.
    let best = pool[0], least = Infinity;
    for (const p of pool) {
      const left = p.amp <= 0 ? -1 : p.amp * (1 - p.age / p.life) ** 2;
      if (left < least) { least = left; best = p; }
    }
    best.x = x; best.z = z; best.age = 0; best.amp = amp; best.life = life; best.speed = speed; best.reach = 0;
    pings++;
    // Without travelling rings, the disc is mapped at once.
    if (reduced) stamp(x, z, life * speed * 0.55, Math.min(1, amp), 0.5);
  };
  const ping = (x: number, z: number, amp = 1) => spawn(x, z, amp, 4.6, 9);

  /* ---- pointer state ---- */
  const cascade: { due: number; x: number; z: number }[] = [];
  let aimed = false, pressed = false, px = 0, pz = 0, hx = 0, hz = 0, lit = 0;
  let sx = 0, sz = 0, stampAt = 0; // last drag stamp
  let lastNow = performance.now(), fadeAcc = 0;
  const hit = new THREE.Vector3(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // Ray onto the raised sheet: a few plane intersections converge on it.
  const pick = (ray: THREE.Ray) => {
    let y = 0;
    for (let i = 0; i < 3; i++) {
      plane.constant = -y;
      if (!ray.intersectPlane(plane, hit)) return false;
      y = relief(hit.x, hit.z);
    }
    return Math.abs(hit.x) < 300 && Math.abs(hit.z) < 300;
  };
  const busy = () =>
    cascade.length > 0 || pressed || live > 0 || Math.abs(lit - (aimed ? 1 : 0)) > 0.01 ||
    (aimed && Math.hypot(px - hx, pz - hz) > 0.05);

  const pivot = new THREE.Vector3();
  const summit = new THREE.Vector3(SUMMIT[0], relief(SUMMIT[0], SUMMIT[1]), SUMMIT[1]);

  return {
    scene, cam, clean: true, idleFps: 30, freeCam: { pan: 60 }, fog: [75, 160], fov: [50, 66],
    // From straight overhead down to a low oblique, and from a wide sheet to a close study.
    limits: { pitch: [MIN_ELEV - ELEV, Math.PI / 2 - ELEV], zoom: [0.4, 3.2] },
    labels: [
      {
        name: "Survey vessel",
        sub: "multibeam · 12 kHz",
        at: (v) => { v.set(ship.x, relief(ship.x, ship.z) + 1.5, ship.z); },
        sub2: () => `under keel ${fmtDepth(relief(ship.x, ship.z))}`,
      },
    ],
    eggs: [
      {
        // Unmarked: a tap on the seamount answers with a ring of pings around it.
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
          // A drag tows a sidescan: it maps a strip, with a small ping every few metres.
          const now = performance.now(), run = Math.hypot(px - sx, pz - sz);
          if (pressed && moved) {
            for (let s = 0, n = Math.ceil(run); s <= n; s++) {
              const u = n ? s / n : 1;
              stamp(sx + (px - sx) * u, sz + (pz - sz) * u, 4, 0.9);
            }
            if (run > 3 && now - stampAt > 140) {
              const pace = Math.min(1, run / Math.max(0.1, (now - stampAt) / 1000) / 45);
              spawn(px, pz, 0.5 + 0.4 * pace, 2.2, 7);
              stampAt = now;
            }
            sx = px; sz = pz;
          }
        }
        aimed = ok;
      },
      press() {
        pressed = true;
        if (!aimed) return;
        ping(px, pz);
        sx = px; sz = pz; stampAt = performance.now();
      },
      release() { pressed = false; },
      busy,
    },
    update(t) {
      const now = performance.now();
      const dt = Math.max(0, Math.min(0.05, (now - lastNow) / 1000));
      lastNow = now;

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
      // The clear colour is the shader's abyss, so the sheet has no visible edge.
      const z = U.uZen.value, f = U.uFogColor.value, a2 = U.uAccent2.value;
      bg.setRGB(z.r + (f.r - z.r) * 0.2 + a2.r * 0.04, z.g + (f.g - z.g) * 0.2 + a2.g * 0.04, z.b + (f.b - z.b) * 0.2 + a2.b * 0.04);

      // The vessel runs its lines on scene time (which stops under reduced motion), mapping as it goes.
      if (t0 < 0) t0 = t;
      const s = S0 + (t - t0) * SPEED;
      for (; shipS < s; shipS = Math.min(s, shipS + 1)) {
        shipAt(shipS, ship);
        stamp(ship.x, ship.z, SWATH, 1);
      }
      shipAt(s, ship);
      if (!reduced) pingAge += dt;
      if (pingAge > 0.8) pingAge = 0;
      shipU.set(ship.x, ship.z, ship.hd, reduced ? 9 : pingAge);
      sweepU.value = t * 0.9;

      // Pointer: a reticle and a faint lamp follow the cursor.
      if (aimed) {
        if (lit < 0.02) { hx = px; hz = pz; }
        const e = 1 - Math.pow(1 - 0.25, dt * 60);
        hx += (px - hx) * e; hz += (pz - hz) * e;
      }
      lit += ((aimed ? 1 : 0) - lit) * (1 - Math.pow(1 - 0.08, dt * 60));
      if (!aimed && lit < 0.01) lit = 0;
      hoverU.set(hx, hz, lit);

      for (let i = cascade.length - 1; i >= 0; i--) {
        if (cascade[i].due > now) continue;
        ping(cascade[i].x, cascade[i].z, 0.9);
        cascade.splice(i, 1);
      }
      // Age the pool, map behind each ring, and pack what is alive at the front of the uniforms.
      live = 0;
      for (let i = 0; i < MAXP; i++) {
        const p = pool[i];
        if (p.amp <= 0) continue;
        p.age += dt;
        if (p.age > p.life) { p.amp = 0; continue; }
        const R = p.speed * p.age;
        // Sound returns weaken with range, so a ping maps strongly near and faintly far.
        if (!reduced && R > p.reach) {
          stamp(p.x, p.z, R, Math.min(1, p.amp) * (1 - 0.5 * p.age / p.life), 0.55, p.reach * 0.8);
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
    },
    readout() {
      const e = relief(aimed ? px : pivot.x, aimed ? pz : pivot.z);
      return [
        ["Depth", fmtDepth(e)],
        ["CI", `${STEP * M_PER} m · index ${STEP * M_PER * 5} m`],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
        ["Mapped", `${Math.round(coverage * 100)}%`],
        ["Pings", String(pings)],
      ];
    },
  };
}
