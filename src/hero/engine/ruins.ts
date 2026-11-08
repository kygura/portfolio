/** Sheet 04 · Ruins: a stone circle on a jade checker plaza, as an early
 *  raytracer would have staged it. Twelve slots of clean monoliths, columns
 *  and an obelisk ring a stepped round shrine; a glowing ward crystal floats
 *  over it inside a ring of rune lights, wisps circle, and a grove of cone and
 *  ball trees stands back toward the haze. Everything doubles in the tiles.
 *
 *  The palette is fixed (emerald, not the site accent).
 *  Tap the crystal to wake the ward, a wisp to scatter them, the old tree to
 *  shake its leaves loose. */
import * as THREE from "three";
import { burst, pulse, type PsxKit, type SceneDef } from "./psx";
import { createRay } from "./ray";

export function buildRuins(k: PsxKit): SceneDef {
  const { rnd, facet, view } = k;
  const PIVOT = new THREE.Vector3(0, 3.1, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(64, 16 / 9, 0.1, 400);
  const R = createRay(k, scene, {
    zen: "#06402a", mid: "#1f9468", low: "#9ed8bc", hor: "#effff6", fog: "#cdeedc",
    ice: "#a6e4c2", sea: "#14503a", ink: "#062218", light: [0.3, 0.55, 0.75],
  });
  R.floor({ checker: 3, fogNear: 30, fogFar: 140 });

  const mStone = R.flat({ tint: "#e8fff0", amb: "#104a34", sun: "#ffffff" });
  const mStone2 = R.flat({ tint: "#bce4cc", amb: "#0c3e2a", sun: "#ffffff" });
  const mLeaf = R.flat({ tint: "#5cc48c", amb: "#063a22", sun: "#d8ffe4" });
  const mLeaf2 = R.flat({ tint: "#2e9a64", amb: "#04301a", sun: "#c8f8d8" });
  const mBark = R.flat({ tint: "#5a6a50", amb: "#0a2018", sun: "#d8e8c8" });
  const mRune = R.flat({ tint: "#000000", amb: "#000000", sun: "#000000", emit: "#9effd0", emitAmt: 1, fogAmt: 0.2 });

  /* Static parts are batched per material, then shown twice: real and mirrored. */
  const b = k.batcher();
  const flushBoth = () => {
    const g = new THREE.Group();
    b.flush(g);
    R.world.add(g);
    R.mirror.add(g.clone());
  };

  /* ---- shrine: three round steps and an altar ---- */
  [[2.6, 0.4], [2.0, 0.4], [1.4, 0.4]].forEach(([r, h], i) => {
    b.add(facet(new THREE.CylinderGeometry(r, r, h, 12)), i % 2 ? mStone2 : mStone, 0, h / 2 + i * h, 0);
  });
  b.add(facet(new THREE.BoxGeometry(1.2, 0.8, 0.9)), mStone2, 0, 1.6, 0, 0, 0.3);
  b.add(facet(new THREE.BoxGeometry(1.5, 0.14, 1.1)), mStone, 0, 2.07, 0, 0, 0.3);
  R.shadow(0, 0, 2.6, 3.4, 0.35);

  /* ---- the stone circle: twelve slots, one empty, one fallen ---- */
  const SR = 10.5;
  const circleTop: THREE.Vector3[] = [];
  let standing = 0;
  const outer: [string, number][] = [
    ["col", 4.6], ["gap", 0], ["mono", 3.6], ["stump", 1.6], ["obelisk", 4.6], ["col", 3.9],
    ["lean", 4.4], ["mono", 4.3], ["fallen", 0], ["col", 5], ["stump", 2.2], ["mono", 2.8],
  ];
  const strip = facet(new THREE.BoxGeometry(0.16, 1, 0.05));
  outer.forEach(([kind, h], i) => {
    const a = 0.1 + (i / outer.length) * Math.PI * 2, x = Math.cos(a) * SR, z = Math.sin(a) * SR, ry = -a + Math.PI / 2;
    const ix = -Math.cos(a), iz = -Math.sin(a); // toward the centre
    if (kind === "gap") return;
    if (kind === "fallen") {
      b.add(facet(new THREE.CylinderGeometry(0.5, 0.5, 4.2, 10)), mStone2, x, 0.5, z, 0, ry + 0.4, Math.PI / 2);
      b.add(facet(new THREE.BoxGeometry(1.5, 0.4, 1.5)), mStone, x + ix * 2.6, 0.2, z + iz * 2.6, 0, ry + 0.3, 0);
      return;
    }
    let top = h;
    if (kind === "col" || kind === "lean" || kind === "stump") {
      const tilt = kind === "lean" ? 0.24 : 0;
      b.add(facet(new THREE.BoxGeometry(1.4, 0.4, 1.4)), mStone2, x, 0.2, z, 0, ry, 0);
      b.add(facet(new THREE.CylinderGeometry(0.46, 0.5, h, 10)), mStone, x + ix * Math.sin(tilt) * h * 0.5, 0.4 + (h / 2) * Math.cos(tilt), z + iz * Math.sin(tilt) * h * 0.5, -Math.sin(a) * tilt, 0, Math.cos(a) * tilt);
      if (kind === "col") {
        b.add(facet(new THREE.BoxGeometry(1.5, 0.36, 1.5)), mStone2, x, h + 0.58, z, 0, ry, 0);
        b.add(strip, mRune, x + ix * 0.5, 0.4 + h * 0.45, z + iz * 0.5, 0, ry, 0, 1.4);
        top = h + 0.8;
      }
    } else if (kind === "mono") {
      b.add(facet(new THREE.BoxGeometry(1.3, h, 0.7)), mStone, x, h / 2, z, 0, ry, 0);
      b.add(strip, mRune, x + ix * 0.37, h * 0.55, z + iz * 0.37, 0, ry, 0, h * 0.5);
    } else {
      b.add(facet(new THREE.BoxGeometry(1.5, 0.5, 1.5)), mStone2, x, 0.25, z, 0, ry, 0);
      b.add(facet(new THREE.CylinderGeometry(0.42, 0.66, h, 4)), mStone, x, 0.5 + h / 2, z, 0, ry + Math.PI / 4, 0);
      b.add(facet(new THREE.ConeGeometry(0.5, 0.9, 4)), mStone, x, 0.95 + h, z, 0, ry + Math.PI / 4, 0);
      top = h + 1.4;
    }
    R.shadow(x, z, 0.65, top * 1.6, 0.45);
    standing++;
    circleTop.push(new THREE.Vector3(x, top, z));
  });

  /* ---- the half-fallen arch on the north path ---- */
  const AZ = -14;
  b.add(facet(new THREE.BoxGeometry(1.2, 5.2, 1.3)), mStone, -2.9, 2.6, AZ);
  b.add(facet(new THREE.BoxGeometry(1.2, 3.4, 1.3)), mStone2, 2.9, 1.7, AZ);
  b.add(facet(new THREE.TorusGeometry(2.9, 0.55, 4, 8, Math.PI / 2)), mStone, 0, 5.2, AZ, 0, 0, Math.PI / 2);
  b.add(facet(new THREE.BoxGeometry(1.2, 0.7, 1.3)), mStone2, 3.8, 0.35, AZ + 1.6, 0, 0.7, 0);
  R.shadow(-2.9, AZ, 0.7, 8, 0.4);

  /* ---- trees: cones and balls on sticks, back toward the haze ---- */
  const stick = facet(new THREE.CylinderGeometry(0.14, 0.2, 2.4, 5).translate(0, 1.2, 0));
  const cone = facet(new THREE.ConeGeometry(1.3, 4, 6).translate(0, 4.2, 0));
  const ball = facet(new THREE.IcosahedronGeometry(1, 1));
  for (let i = 0; i < 60; i++) {
    const a = rnd() * Math.PI * 2, r = 19 + Math.pow(rnd(), 0.7) * 42, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if ((Math.abs(x) < 4 && z < -10) || Math.hypot(x + 17, z + 11) < 5) continue;
    const s = 0.9 + rnd() * 0.8, mat = i % 2 ? mLeaf : mLeaf2;
    b.add(stick, mBark, x, 0, z, 0, 0, 0, s);
    if (rnd() < 0.55) b.add(cone, mat, x, 0, z, 0, rnd() * 3, 0, s);
    else b.add(ball, mat, x, 3.3 * s, z, 0, rnd() * 3, 0, 1.4 * s);
    if (r < 30) R.shadow(x, z, 1.1 * s, 9 * s, 0.3);
  }

  flushBoth();

  // The old one: a fat trunk under a crown of three balls, between the circle and the grove.
  const OX = -17, OZ = -11;
  R.add(facet(new THREE.CylinderGeometry(0.7, 1.1, 8, 8)), mBark, OX, 4, OZ);
  [[0, 9.6, 0, 3.4], [2.2, 8.4, 1, 2.4], [-1.8, 8.8, -1.2, 2.6]].forEach(([x, y, z, s], i) => {
    R.add(ball, i ? mLeaf2 : mLeaf, OX + x, y, OZ + z, 0, i, 0, s);
  });
  R.shadow(OX, OZ, 2.6, 16, 0.4);

  /* ---- the ward: chrome crystal, rune ring, halo ---- */
  const CY = 3.6;
  const crystalGeo = new THREE.OctahedronGeometry(0.6, 0);
  const mCrystal = R.flat({ tint: "#d8fff0", amb: "#2a8a60", sun: "#ffffff", emit: "#7affc0", emitAmt: 0.35, fogAmt: 0.3 });
  const crystal = R.add(facet(crystalGeo), mCrystal);
  const runeRing = R.both(() => {
    const g = new THREE.Group();
    const rb = k.batcher();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      rb.add(new THREE.BoxGeometry(0.2, i % 3 ? 0.08 : 0.3, 0.06), mRune, Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5, 0, -a, 0);
    }
    rb.flush(g);
    return g;
  });
  const haloMat = R.glow("#b8ffd8", 0.15);
  const halo = new THREE.Group();
  [0.8, 1.5].forEach((r) => halo.add(new THREE.Mesh(new THREE.CircleGeometry(r, 16), haloMat)));
  scene.add(halo);

  /* ---- wisps: small lights circling the dais ---- */
  const wispGeo = new THREE.IcosahedronGeometry(0.13, 0);
  const wispMat = new THREE.MeshBasicMaterial({ color: "#e4fff0" });
  const wisps = Array.from({ length: 6 }, (_, i) => ({
    pair: R.both(() => new THREE.Mesh(wispGeo, wispMat)), r: 1.9 + i * 0.4, ph: i * 1.7, sp: 0.25 + rnd() * 0.25,
  }));

  /* ---- the old tree lets go of its leaves ---- */
  const NL = 40, lp = new Float32Array(NL * 3), lBase = new Float32Array(NL * 3);
  for (let i = 0; i < NL; i++) {
    const a = rnd() * 6.28, r = rnd() * 3.4;
    lBase.set([OX + Math.cos(a) * r, 8 + rnd() * 3, OZ + Math.sin(a) * r], i * 3);
  }
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute("position", new THREE.BufferAttribute(lp, 3));
  const leaves = new THREE.Points(leafGeo, new THREE.PointsMaterial({ color: "#7af0aa", size: 3, sizeAttenuation: false }));
  leaves.frustumCulled = false;
  leaves.visible = false;
  scene.add(leaves);

  let tWard = -99, tWisp = -99, tLeaf = -99;
  const LEAF_T = 7;

  return {
    scene, cam, fog: [30, 140], fov: [64, 74], limits: { pitch: [-0.02, 0.8], zoom: [0.8, 1.45] },
    labels: [
      { name: "Ward stone", sub: "still lit", at: (v) => { v.copy(crystal[0].position).y += 1.4; } },
      { name: "Stone circle", sub: `${standing} of 12 standing`, at: (v) => { v.copy(circleTop[0]).y += 0.6; } },
      { name: "Old growth", sub: "over the circle", at: (v) => { v.set(OX, 13.5, OZ); } },
    ],
    eggs: [
      { id: "ruins-ward", r: 40, at: (v) => { v.copy(crystal[0].position); }, fire: (t) => { tWard = t; } },
      { id: "ruins-wisps", r: 30, at: (v) => { v.copy(wisps[0].pair[0].position); }, fire: (t) => { tWisp = t; } },
      { id: "ruins-tree", r: 56, at: (v) => { v.set(OX, 8, OZ); }, fire: (t) => { tLeaf = t; } },
    ],
    update(t) {
      const a = 2.1 + t * 0.018 + view.px * 0.12 + view.yaw, r = 7.8 + Math.sin(t * 0.07) * 0.5;
      cam.position.set(Math.cos(a) * r, 2.0 + Math.sin(t * 0.11) * 0.2 - view.py * 0.4, Math.sin(a) * r);
      cam.lookAt(0, 3.4 - view.py * 1.0, 0);
      k.orbit(cam, PIVOT);

      const ew = t - tWard, ewp = pulse(ew, 1.6);
      const y = CY + Math.sin(t * 0.9) * 0.15 + 0.4 * ewp, s = 1 + 0.35 * pulse(ew, 1.2);
      for (const c of crystal) {
        c.position.set(0, y, 0);
        c.rotation.y = t * 0.5 + burst(ew, 9, 3.5);
        c.scale.set(0.9 * s, 1.6 * s, 0.9 * s);
      }
      for (const g of runeRing) {
        g.position.set(0, y, 0);
        g.rotation.set(Math.sin(t * 0.3) * 0.12, -t * 0.25 - burst(ew, 6, 4), 0);
      }
      mCrystal.uniforms.uEmit.value = 0.3 + 0.1 * Math.sin(t * 1.3) + ewp;
      mRune.uniforms.uEmit.value = 0.8 + 0.2 * Math.sin(t * 1.3) + ewp * 1.2;
      R.uniforms.flash.value = 0.35 * ewp;
      halo.position.set(0, y, 0);
      halo.lookAt(cam.position);
      haloMat.opacity = 0.08 + Math.sin(t * 1.3) * 0.03 + 0.3 * ewp;

      const ewi = pulse(t - tWisp, 3.2);
      wisps.forEach((w, i) => {
        const wa = w.ph + t * w.sp, wr = w.r * (1 + 2.2 * ewi);
        for (const m of w.pair) m.position.set(Math.cos(wa) * wr, 1.2 + i * 0.35 + Math.sin(t * 0.8 + w.ph) * 0.5 + 2.5 * ewi, Math.sin(wa) * wr);
      });

      const el = t - tLeaf;
      leaves.visible = el > 0 && el < LEAF_T;
      if (leaves.visible) {
        for (let i = 0; i < NL; i++) {
          const fall = Math.max(0, el - (i % 8) * 0.18);
          lp[i * 3] = lBase[i * 3] + Math.sin(fall * 1.7 + i) * 0.9 - fall * 0.35;
          lp[i * 3 + 1] = Math.max(0.05, lBase[i * 3 + 1] - fall * 1.5);
          lp[i * 3 + 2] = lBase[i * 3 + 2] + Math.cos(fall * 1.3 + i * 2) * 0.9;
        }
        leafGeo.attributes.position.needsUpdate = true;
      }
      R.follow(cam);
    },
    readout() {
      const p = cam.position;
      return [
        ["Lat", k.dms(48.0412 - p.z * 0.00009, "N", "S", 2)],
        ["Lon", k.dms(8.1736 + p.x * 0.00013, "E", "W", 3)],
        ["Elev", `${Math.round(840 + p.y * 3.1)} m`],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
        ["Grid", k.gridRef(p.x, p.z, 20)],
      ];
    },
  };
}
