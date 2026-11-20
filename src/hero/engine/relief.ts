/** Sheet · Relief: a survey model. A square block of land, cut clean on four
 *  sides like a geologist's block diagram, hangs over its own map sheet. The
 *  top is plaster-pale with contour lines drawn on it (every fifth an index
 *  line in the accent), a small dark tarn in a hollow and a trig pillar on the
 *  summit. The cut faces show folded strata with one seam lit in the accent.
 *  Below, the same contours lie flat on the floor inside a ticked neatline,
 *  tied to the block's corners by drop lines, on a faint survey grid.
 *
 *  Tap the trig pillar to send a pulse across the land, the block to pull its
 *  strata apart, the north arrow to spin it. */
import * as THREE from "three";
import { burst, pulse, type PsxKit, type SceneDef, type V3 } from "./psx";

/** Half the block's width, in world units (1 unit reads as 50 m). */
const HALF = 10;
/** Grid cells per side: the top surface, its contours and the walls share these samples. */
const N = 60;
/** Contour interval; every fifth line is an index line. */
const STEP = 0.4;
/** Bottom of the block, the floor sheet under it, and the tarn's water level. */
const BASE = -3.6, FLOOR = -8, TARN = 0.1;

const SUMMIT: [number, number] = [2.5, -2];

/** Height of the land at (x, z): a summit with a ridge running south-east, a western knoll and a hollow. */
function height(x: number, z: number) {
  const g = (cx: number, cz: number, h: number, w: number) => h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / w);
  // Ridge: distance to the segment from the summit to (7.5, 6.5).
  const ax = SUMMIT[0], az = SUMMIT[1], bx = 7.5, bz = 6.5;
  const tt = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
  const rd = (x - ax - tt * (bx - ax)) ** 2 + (z - az - tt * (bz - az)) ** 2;
  return 1.2
    + g(SUMMIT[0], SUMMIT[1], 4.2, 10)
    + g(-5, -5.5, 2.0, 6)
    + 1.5 * (1 - tt * 0.6) * Math.exp(-rd / 2.2)
    - g(-3.5, 4, 2.6, 5)
    + 0.25 * Math.sin(x * 0.9 + z * 0.4)
    + 0.18 * Math.sin(z * 1.3 - x * 0.7);
}

export function buildRelief(k: PsxKit): SceneDef {
  const { U, view, segs, psx, facet, lineMat, circle } = k;
  const PIVOT = new THREE.Vector3(0, -1.2, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 420);
  scene.add(k.skyDome(0.35, 0.45, 0.6, 0.25));

  /* ---- grain: a 16px strip texture with darker bedding lines, for the cut faces ---- */
  const cv = document.createElement("canvas");
  cv.width = cv.height = 16;
  const g2 = cv.getContext("2d");
  if (!g2) throw new Error("2d canvas unavailable");
  const img = g2.createImageData(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = (y % 5 === 0 ? 0.72 : 0.92) * (0.88 + k.rnd() * 0.2) * 210;
    const i = (y * 16 + x) * 4;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v * 0.96; img.data[i + 3] = 255;
  }
  g2.putImageData(img, 0, 0);
  const tGrain = new THREE.CanvasTexture(cv);
  tGrain.magFilter = tGrain.minFilter = THREE.NearestFilter;
  tGrain.generateMipmaps = false;
  tGrain.wrapS = tGrain.wrapT = THREE.RepeatWrapping;

  /* ---- heights, sampled once on the shared grid ---- */
  const S = N + 1, cell = (HALF * 2) / N;
  const H = new Float32Array(S * S);
  let top = -Infinity, topAt = 0;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const h = height(-HALF + i * cell, -HALF + j * cell);
    H[j * S + i] = h;
    if (h > top) { top = h; topAt = j * S + i; }
  }
  const summit = new THREE.Vector3(-HALF + (topAt % S) * cell, top, -HALF + Math.floor(topAt / S) * cell);

  /* Each layer of the block lives in its own group, so the strata egg can lift them apart.
     Group 0 is the bottom; the last carries the land surface and everything drawn on it. */
  const layers: THREE.Group[] = [];
  const layer = () => { const g = new THREE.Group(); scene.add(g); layers.push(g); return g; };

  /* ---- the cut faces: folded strata between undulating boundaries ---- */
  type Edge = (s: number, y: number) => [number, number, number];
  const sides: { at: Edge; n: [number, number, number]; h: (s: number) => number }[] = [
    { at: (s, y) => [s, y, -HALF], n: [0, 0, -1], h: (s) => height(s, -HALF) },
    { at: (s, y) => [s, y, HALF], n: [0, 0, 1], h: (s) => height(s, HALF) },
    { at: (s, y) => [-HALF, y, s], n: [-1, 0, 0], h: (s) => height(-HALF, s) },
    { at: (s, y) => [HALF, y, s], n: [1, 0, 0], h: (s) => height(HALF, s) },
  ];
  // Boundaries as functions of position along the edge; the last one is the land itself.
  const bounds = [
    () => BASE,
    (s: number) => -2.6 + 0.3 * Math.sin(s * 0.35),
    (s: number) => -1.7 + 0.35 * Math.sin(s * 0.28 + 1),
    (s: number) => -1.3 + 0.3 * Math.sin(s * 0.28 + 1.2),
    (s: number) => -0.45 + 0.25 * Math.sin(s * 0.4 + 2),
  ];
  const bandMats = [
    psx({ map: tGrain, tint: "#5b564c", side: THREE.DoubleSide, uv: 0.5 }),
    psx({ map: tGrain, tint: "#7a7262", side: THREE.DoubleSide, uv: 0.5 }),
    psx({ map: tGrain, tint: "#2a2b28", side: THREE.DoubleSide, uv: 0.5, emit: 0.55 }),
    psx({ map: tGrain, tint: "#958c78", side: THREE.DoubleSide, uv: 0.5 }),
    psx({ map: tGrain, tint: "#b2aa96", side: THREE.DoubleSide, uv: 0.5 }),
  ];
  const wall = (lo: (s: number) => number, hi: (s: number) => number, side: (typeof sides)[number]) => {
    const pos: number[] = [], nor: number[] = [], uv: number[] = [];
    const push = (s: number, y: number) => {
      pos.push(...side.at(s, y));
      nor.push(...side.n);
      uv.push(s * 0.25, y * 0.5);
    };
    for (let i = 0; i < N; i++) {
      const s0 = -HALF + i * cell, s1 = s0 + cell;
      const a0 = lo(s0), a1 = lo(s1), b0 = Math.max(a0, hi(s0)), b1 = Math.max(a1, hi(s1));
      push(s0, a0); push(s1, a1); push(s1, b1);
      push(s0, a0); push(s1, b1); push(s0, b0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    return geo;
  };
  for (let b = 0; b < bandMats.length; b++) {
    const g = layer();
    for (const side of sides) {
      const lo = bounds[b], hi = b + 1 < bounds.length ? bounds[b + 1] : side.h;
      // Keep every boundary under the land, so a band never pokes through the top.
      const cap = (f: (s: number) => number) => (s: number) => Math.min(f(s), side.h(s) - 0.15);
      k.mesh(wall(cap(lo), b + 1 < bounds.length ? cap(hi) : hi, side), bandMats[b], g);
    }
  }
  const land = layers[layers.length - 1];
  const under = new THREE.PlaneGeometry(HALF * 2, HALF * 2).rotateX(Math.PI / 2);
  k.mesh(under, psx({ map: tGrain, tint: "#2c2e2b" }), layers[0], 0, BASE, 0);

  /* ---- the land: plaster-pale facets, warmed toward the accent with height ---- */
  const surf = new THREE.PlaneGeometry(HALF * 2, HALF * 2, N, N).rotateX(-Math.PI / 2);
  const sp = surf.attributes.position;
  for (let v = 0; v < sp.count; v++) {
    const i = Math.round((sp.getX(v) + HALF) / cell), j = Math.round((sp.getZ(v) + HALF) / cell);
    sp.setY(v, H[j * S + i]);
  }
  k.mesh(facet(surf), psx({ map: k.tex.tPlain, tint: "#d2ccba", hypso: 0.8, uv: 4, amb: "#626c6c", sun: "#e2d8c0" }), land);

  // The tarn: one flat sheet at water level, showing only where the hollow drops below it.
  const tarnMat = psx({ map: k.tex.tPlain, tint: "#1d2526", emit: 0.18, amb: "#4a5658" });
  k.mesh(new THREE.PlaneGeometry(9, 8).rotateX(-Math.PI / 2), tarnMat, land, -3.5, TARN, 4);

  /* ---- contours: marching squares over the shared grid ---- */
  const lift = 0.05;
  const minor: V3[] = [], index: V3[] = [];
  const lo = Math.ceil(TARN / STEP), hi = Math.floor(top / STEP);
  const P = (i: number, j: number) => [-HALF + i * cell, -HALF + j * cell] as const;
  for (let lv = lo; lv <= hi; lv++) {
    const L = lv * STEP, out = lv % 5 === 0 ? index : minor;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]] as const;
      const hs = c.map(([a, b]) => H[b * S + a]);
      const hits: V3[] = [];
      for (let e = 0; e < 4; e++) {
        const h0 = hs[e], h1 = hs[(e + 1) % 4];
        if ((h0 < L) === (h1 < L)) continue;
        const f = (L - h0) / (h1 - h0);
        const [x0, z0] = P(...c[e]), [x1, z1] = P(...c[(e + 1) % 4]);
        hits.push(new THREE.Vector3(x0 + (x1 - x0) * f, L + lift, z0 + (z1 - z0) * f));
      }
      if (hits.length >= 2) out.push(hits[0], hits[1]);
      if (hits.length === 4) out.push(hits[2], hits[3]);
    }
  }
  const lMinor = lineMat({ value: new THREE.Color("#5e5a50") }, 140);
  land.add(segs(minor, lMinor), segs(index, k.M.lAccent));

  /* ---- trig pillar on the summit, and the pulse it sends out ---- */
  const pillarMat = psx({ map: k.tex.tPlain, tint: "#ebe5d4", amb: "#7a8282" });
  const capMat = psx({ map: k.tex.tPlain, tint: "#ebe5d4", amb: "#7a8282" });
  k.mesh(facet(new THREE.CylinderGeometry(0.16, 0.24, 0.62, 4)), pillarMat, land, summit.x, summit.y + 0.28, summit.z, 0, Math.PI / 4, 0);
  k.mesh(facet(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 4)), capMat, land, summit.x, summit.y + 0.65, summit.z, 0, Math.PI / 4, 0);
  const ringMat = new THREE.LineBasicMaterial({ color: U.uAccent.value.clone(), transparent: true, opacity: 0, depthWrite: false });
  const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(circle(1, 72)), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(summit.x, summit.y + 0.2, summit.z);
  ring.visible = false;
  land.add(ring);

  /* ---- the map sheet under the block ---- */
  const flat = (pts: V3[]) => pts.map((p) => new THREE.Vector3(p.x, FLOOR + 0.02, p.z));
  const lSheet = lineMat({ value: new THREE.Color("#6e746c") }, 140);
  const lGrid = lineMat({ value: new THREE.Color("#262e2e") }, 120);
  scene.add(segs(flat(minor), lSheet), segs(flat(index), k.M.lDeep));
  const sheet: V3[] = [], grid: V3[] = [];
  const sq = (r: number, y: number, into: V3[]) => {
    const c = [[-r, -r], [r, -r], [r, r], [-r, r]];
    for (let e = 0; e < 4; e++) {
      const [x0, z0] = c[e], [x1, z1] = c[(e + 1) % 4];
      into.push(new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1, y, z1));
    }
  };
  sq(HALF, FLOOR + 0.02, sheet);
  const NEAT = 13;
  sq(NEAT, FLOOR + 0.02, sheet);
  // Ticks along the neatline: every unit, longer every five.
  for (let s = -NEAT + 1; s < NEAT; s++) {
    const len = s % 5 === 0 ? 0.7 : 0.3, y = FLOOR + 0.02;
    sheet.push(
      new THREE.Vector3(s, y, -NEAT), new THREE.Vector3(s, y, -NEAT + len),
      new THREE.Vector3(s, y, NEAT), new THREE.Vector3(s, y, NEAT - len),
      new THREE.Vector3(-NEAT, y, s), new THREE.Vector3(-NEAT + len, y, s),
      new THREE.Vector3(NEAT, y, s), new THREE.Vector3(NEAT - len, y, s),
    );
  }
  for (let g = -48; g <= 48; g += 4) {
    grid.push(new THREE.Vector3(g, FLOOR, -48), new THREE.Vector3(g, FLOOR, 48), new THREE.Vector3(-48, FLOOR, g), new THREE.Vector3(48, FLOOR, g));
  }
  scene.add(segs(sheet, k.M.lBoneDim), segs(grid, lGrid));
  // Drop lines from the block's corners to the sheet's.
  const drops: V3[] = [];
  for (const [x, z] of [[-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF]]) {
    for (let y = FLOOR; y < BASE - 0.3; y += 0.9) drops.push(new THREE.Vector3(x, y, z), new THREE.Vector3(x, Math.min(y + 0.45, BASE), z));
  }
  scene.add(segs(drops, k.M.lBoneDim));
  // North arrow in the neatline's corner: a half-filled point drawn in hairlines.
  const north = new THREE.Group();
  north.position.set(-NEAT + 1.6, FLOOR + 0.03, -NEAT + 1.6);
  scene.add(north);
  const na: V3[] = [];
  const pts = [[0, -1.1], [0.42, 0.7], [0, 0.35], [-0.42, 0.7]];
  for (let e = 0; e < 4; e++) na.push(new THREE.Vector3(pts[e][0], 0, pts[e][1]), new THREE.Vector3(pts[(e + 1) % 4][0], 0, pts[(e + 1) % 4][1]));
  na.push(new THREE.Vector3(0, 0, -1.1), new THREE.Vector3(0, 0, 0.35));
  north.add(segs(na, k.M.lAccent));
  const nRing = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(circle(1.35, 40)), k.M.lBoneDim);
  nRing.rotation.x = -Math.PI / 2;
  north.add(nRing);

  const dir = new THREE.Vector3();
  let tPulse = -99, tSplit = -99, tNorth = -99;
  const metres = (y: number) => Math.round(300 + y * 50);

  return {
    scene, cam, idleFps: 30, fog: [34, 120], fov: [42, 58], limits: { pitch: [-0.5, 0.6], zoom: [0.6, 2.2] },
    labels: [
      { name: "Trig", sub: `${metres(top)} m`, at: (v) => { v.copy(summit); v.y += 1.2; } },
      { name: "Tarn", sub: `${metres(TARN)} m`, at: (v) => { v.set(-3.5, TARN + 0.8, 4); } },
    ],
    eggs: [
      { id: "relief-trig", r: 30, at: (v) => { v.copy(summit).y += 0.4 + land.position.y; }, fire: (t) => { tPulse = t; } },
      { id: "relief-strata", r: 40, at: (v) => { v.set(0, -2, HALF); }, fire: (t) => { tSplit = t; } },
      { id: "relief-north", r: 26, at: (v) => { v.copy(north.position); }, fire: (t) => { tNorth = t; } },
    ],
    update(t) {
      const a = 0.75 + t * 0.03 + view.px * 0.2 + view.yaw, r = 31;
      cam.position.set(Math.cos(a) * r, 13 + Math.sin(t * 0.07) * 1.2 - view.py * 5, Math.sin(a) * r);
      cam.lookAt(PIVOT.x, PIVOT.y - view.py * 2, PIVOT.z);
      k.orbit(cam, PIVOT);

      // Strata pull apart and settle, each layer a little further than the one below it.
      const sp2 = pulse(t - tSplit, 3.2);
      layers.forEach((g, i) => { g.position.y = i * 0.75 * sp2 * sp2 * (3 - 2 * sp2) * 1.4; });

      // The pulse: a ring that runs out across the land and fades, the pillar's cap lit while it goes.
      const ep = t - tPulse;
      ring.visible = ep > 0 && ep < 2.6;
      if (ring.visible) {
        const f = ep / 2.6;
        ring.scale.setScalar(0.3 + f * 13);
        ringMat.color.copy(U.uAccent.value);
        ringMat.opacity = (1 - f) * 0.9;
      }
      capMat.uniforms.uEmit.value = 1.2 * pulse(ep, 1.4) + 0.12 * (0.5 + 0.5 * Math.sin(t * 1.3));

      north.rotation.y = burst(t - tNorth, 9, 2.6);
    },
    readout() {
      cam.getWorldDirection(dir);
      const el = (Math.asin(Math.max(-1, Math.min(1, -dir.y))) * 180) / Math.PI;
      return [
        ["Trig", `${metres(top)} m`],
        ["Int", `${Math.round(STEP * 50)} m`],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
        ["Dep", `${k.pad(el.toFixed(1), 4)}°`],
        ["Grid", k.gridRef(cam.position.x, cam.position.z, 32)],
      ];
    },
  };
}
