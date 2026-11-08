/** Sheet 01 · Ocean, as an early raytracer would draw it: a glittering mirror sea
 *  under a teal sky, a chrome spire and flat slab towers standing drowned in it,
 *  palm islands, a lion-prowed sailboat moored at a pier, and two suns setting
 *  gold. Out past the islands a ring of thin spires stands on the horizon and
 *  islands float upside down overhead; everything doubles in the water.
 *
 *  The palette is fixed (tropical teal and mint, sun gold), not the site accent.
 *  Tap the boat's head to make it talk, the suns to flare them, a gull to loop it. */
import * as THREE from "three";
import { pulse, type PsxKit, type SceneDef, type V3 } from "./psx";
import { createRay } from "./ray";

export function buildOcean(k: PsxKit): SceneDef {
  const { rnd, facet, view } = k;
  const PIVOT = new THREE.Vector3(0, 8, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(64, 16 / 9, 0.1, 320);
  const R = createRay(k, scene, {
    zen: "#03506a", mid: "#16a2b2", low: "#9ee8d8", hor: "#f4fff8", fog: "#cdeee4",
    ice: "#bff6ea", sea: "#2a94a2", ink: "#08303a", light: [-0.37, 0.5, -0.76],
  });
  // The floor is one huge quad; snapping its corners behind the lens tilts the whole plane up
  // over anything low in the water near the camera, so it goes unsnapped.
  R.floor({ fogNear: 60, fogFar: 260 });

  const amb = "#06343e";
  const mat = {
    slab: R.flat({ tint: "#dff6f0", amb, sun: "#f4fff8" }),
    slab2: R.flat({ tint: "#9ad8d4", amb: "#043040", sun: "#e8fff6" }),
    band: R.flat({ tint: "#2a5a60", amb, emit: "#ffd890", emitAmt: 0.9 }),
    far: R.flat({ tint: "#8cc8cc", amb: "#1c6070", sun: "#bfeee6", fogAmt: 1 }),
    sand: R.flat({ tint: "#fff0c8", amb: "#2a5a58", sun: "#fff8e8" }),
    leaf: R.flat({ tint: "#7ad89a", amb: "#063a2c", sun: "#e8ffd8" }),
    trunk: R.flat({ tint: "#e8c890", amb: "#3a2a1c" }),
    wood: R.flat({ tint: "#d8b088", amb: "#2c2420" }),
    red: R.flat({ tint: "#ff6a48", amb: "#5a0e1c", sun: "#fff0e0" }),
    gold: R.flat({ tint: "#ffd060", amb: "#6a3008", sun: "#fff4d8" }),
    cream: R.flat({ tint: "#fff8ea", amb: "#2a5058" }),
    mast: R.flat({ tint: "#60c890", amb: "#0a3a30" }),
    sail: R.flat({ tint: "#ffffff", amb: "#a8d4d0", sun: "#ffffff" }),
    eye: R.flat({ tint: "#2050a0", amb: "#081830", emit: "#80c0ff", emitAmt: 0.3 }),
  };
  mat.sail.side = THREE.DoubleSide;

  /* A batch of static parts, merged per material, then put in the world and in its mirror. */
  const twin = <T extends THREE.Object3D>(o: T, parent: THREE.Object3D = R.world) => {
    parent.add(o);
    const c = o.clone() as T;
    (parent === R.world ? R.mirror : parent).add(c);
    return [o, c] as const;
  };
  const bake = (b: ReturnType<PsxKit["batcher"]>) => {
    const g = new THREE.Group();
    b.flush(g);
    return twin(g);
  };
  const up = new THREE.Vector3(0, 1, 0);
  const seg = (a: V3, b: V3, r0: number, r1: number, n = 5) => {
    const g = new THREE.CylinderGeometry(r1, r0, a.distanceTo(b) * 1.06, n, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    return facet(g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2));
  };

  /* ---- palms: a leaning trunk and a crown of long flat fronds ---- */
  const frond = facet(new THREE.ConeGeometry(0.6, 3.6, 4).scale(0.25, 1, 1).translate(0, 1.8, 0));
  const palm = (b: ReturnType<PsxKit["batcher"]>, x: number, y: number, z: number, s: number) => {
    const H = 4.6 + rnd() * 2, lean = 0.8 + rnd() * 1.2, ry = rnd() * 6.28;
    const q = new THREE.Quaternion().setFromAxisAngle(up, ry);
    const P = (i: number) => new THREE.Vector3(lean * (i / 4) ** 2, (H * i) / 4, 0).applyQuaternion(q).multiplyScalar(s).add(new THREE.Vector3(x, y, z));
    for (let i = 0; i < 4; i++) b.add(seg(P(i), P(i + 1), 0.24 * s, 0.18 * s), mat.trunk);
    const top = P(4);
    for (let f = 0; f < 7; f++) {
      b.add(frond.clone().rotateZ(-Math.PI / 2 - (f % 2 ? 0.25 : 0.6)).rotateY(ry + (f / 7) * 6.28), mat.leaf, top.x, top.y, top.z, 0, 0, 0, s);
    }
  };

  /* ---- drowned towers: a chrome spire at the centre, flat slabs around it ---- */
  const ring: [number, number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * 6.28 + rnd() * 0.3, r = 90 + rnd() * 60, h = 22 + rnd() * 40;
    ring.push([Math.cos(a) * r, Math.sin(a) * r, h * 0.12, h]);
  }
  const SPIRE_H = 26, SPIRE_R = 3.2;
  R.add(facet(new THREE.CylinderGeometry(SPIRE_R * 0.55, SPIRE_R, SPIRE_H, 4, 1).rotateY(Math.PI / 4).translate(0, SPIRE_H / 2, 0)), R.chrome({ marble: 0.6, scale: 1.2, tint: "#d8fff4", cones: ring.slice(0, 8) }));
  R.add(facet(new THREE.ConeGeometry(SPIRE_R * 0.78, 9, 4).rotateY(Math.PI / 4)), mat.gold, 0, SPIRE_H + 4.5, 0);
  R.shadow(0, 0, SPIRE_R, 48, 0.5);
  const spireTop = SPIRE_H + 9;

  const tb = k.batcher();
  ([
    // x, z, width, height, round?
    [-8, 5, 4.6, 20, 0], [7, 7, 3.8, 16, 1], [-4, -8, 3.6, 12, 0], [10, -3, 3.2, 9, 0],
    [-13, -4, 3.8, 15, 1], [2, 13, 5.4, 22, 0], [-10, 14, 3.4, 11, 0],
  ] as [number, number, number, number, number][]).forEach(([x, z, w, h, round], i) => {
    const m = i % 2 ? mat.slab2 : mat.slab, ry = rnd() * 0.8;
    tb.add(facet(round ? new THREE.CylinderGeometry(w / 2, w / 2, h, 8) : new THREE.BoxGeometry(w, h, w * 0.8)), m, x, h / 2, z, 0, ry, 0);
    for (let y = 6; y < h - 2; y += 5) {
      tb.add(facet(round ? new THREE.CylinderGeometry(w / 2 + 0.06, w / 2 + 0.06, 0.4, 8) : new THREE.BoxGeometry(w + 0.1, 0.4, w * 0.8 + 0.1)), mat.band, x, y, z, 0, ry, 0);
    }
    if (round) tb.add(facet(new THREE.SphereGeometry(w * 0.45, 8, 4, 0, 6.28, 0, Math.PI / 2)), mat.slab2, x, h, z);
    else palm(tb, x, h, z, 0.5);
    R.shadow(x, z, w * 0.55, h * 1.8, 0.42);
  });
  bake(tb);

  /* ---- palm islands: low sand discs ---- */
  const ib = k.batcher();
  ([
    [9, -14, 3.2, 2], [20, -6, 4.5, 3], [-20, -22, 5, 3], [-24, 8, 6, 4], [24, 14, 4, 2], [-6, -24, 3.5, 2], [10, 40, 8, 4], [-40, -30, 7, 4], [-48, 34, 9, 4],
  ] as [number, number, number, number][]).forEach(([x, z, r, n]) => {
    ib.add(facet(new THREE.CylinderGeometry(r * 0.8, r, 0.9, 10)), mat.sand, x, 0.45, z);
    for (let p = 0; p < n; p++) {
      const a = rnd() * 6.28, d = rnd() * r * 0.5;
      palm(ib, x + Math.cos(a) * d, 0.9, z + Math.sin(a) * d, 0.8 + rnd() * 0.35);
    }
    R.shadow(x, z, r * 0.8, r * 1.6, 0.3);
  });

  /* ---- the ring of spires on the horizon, and islands upside down over it ---- */
  for (const [x, z, br, h] of ring) ib.add(facet(new THREE.ConeGeometry(br, h, 4)), mat.far, x, h / 2, z, 0, rnd(), 0);
  bake(ib);
  const floats = Array.from({ length: 5 }, (_, i) => {
    const a = -0.6 + i * 0.9 + rnd() * 0.4, r = 60 + rnd() * 40, s = 4 + rnd() * 4;
    const b = k.batcher();
    b.add(facet(new THREE.ConeGeometry(s, s * 2.2, 5).rotateX(Math.PI)), mat.slab2, 0, -s * 1.1, 0);
    b.add(facet(new THREE.CylinderGeometry(s, s * 0.95, 0.6, 5)), mat.leaf, 0, 0.3, 0);
    palm(b, 0, 0.6, 0, s * 0.22);
    const [g, gm] = bake(b);
    const y0 = 30 + rnd() * 24;
    for (const o of [g, gm]) o.position.set(Math.cos(a) * r, y0, Math.sin(a) * r);
    return { g, gm, y0, ph: rnd() * 6 };
  });

  /* ---- pier off the dock island ---- */
  const SX = 4, SZ = -17, PZ = SZ + 1.65;
  const pb = k.batcher();
  pb.add(facet(new THREE.BoxGeometry(9.5, 0.3, 1.6)), mat.wood, SX + 0.4, 1.4, PZ);
  for (let i = 0; i < 5; i++) for (const s of [-0.7, 0.7]) pb.add(facet(new THREE.BoxGeometry(0.3, 1.4, 0.3)), mat.wood, SX - 4 + i * 1.9, 0.7, PZ + s);
  bake(pb);
  R.shadow(SX + 0.4, PZ, 1, 8, 0.35);

  /* ---- the lion-prowed boat: red hull, a neck rising off the bow into a lion's head
     (gold snout and horns, white mane), green mast, white sail ---- */
  const boat = new THREE.Group();
  boat.position.set(SX, 0, SZ);
  boat.scale.setScalar(0.95);
  const bb = k.batcher();
  const HL = 7;
  const hull = (g: THREE.BufferGeometry, widen: number) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), f = (x + HL / 2) / HL;
      const w = Math.max(f < 0.4 ? Math.sqrt(f / 0.4) : 1 - Math.max(0, f - 0.8) * 1.5, 0.04) * (y < 0 ? 0.5 : 1) * widen;
      p.setXYZ(i, x, y + (y > 0 ? 0.55 * (1 - f) ** 3 : 0), p.getZ(i) * w);
    }
    return facet(g);
  };
  bb.add(hull(new THREE.BoxGeometry(HL, 1.1, 2, 6, 2, 2), 1), mat.red, 0, 0.5, 0);
  bb.add(hull(new THREE.BoxGeometry(HL, 0.18, 2, 6, 1, 1).translate(0, 0.6, 0), 1.06), mat.cream, 0, 0.5, 0);
  const neck = [[-3.1, 0.8], [-3.6, 1.8], [-3.5, 2.7], [-3.15, 3.6]].map(([x, y]) => new THREE.Vector3(x, y, 0));
  for (let i = 0; i < 3; i++) bb.add(seg(neck[i], neck[i + 1], 0.55 - i * 0.05, 0.5 - i * 0.05, 6), i === 1 ? mat.cream : mat.red);
  const MX = -0.9, MH = 9.2;
  bb.add(facet(new THREE.CylinderGeometry(0.12, 0.15, MH, 6)), mat.mast, MX, 1 + MH / 2, 0);
  bb.flush(boat);

  const head = new THREE.Group();
  head.name = "head";
  head.position.set(-3.45, 4.2, 0);
  head.scale.setScalar(1.6);
  boat.add(head);
  const hb = k.batcher();
  hb.add(facet(new THREE.BoxGeometry(1, 0.75, 0.9)), mat.red);
  hb.add(facet(new THREE.BoxGeometry(0.7, 0.42, 0.72)), mat.gold, -0.72, 0.06, 0);
  for (const s of [-1, 1]) {
    hb.add(facet(new THREE.BoxGeometry(0.14, 0.14, 0.08)), mat.eye, -0.46, 0.25, s * 0.42);
    hb.add(facet(new THREE.ConeGeometry(0.16, 1.6, 4)), mat.gold, 0.15, 1.0, s * 0.32, -s * 0.25, 0, 0.2);
  }
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI * 0.55 + (i / 7) * Math.PI * 1.1;
    hb.add(facet(new THREE.IcosahedronGeometry(0.34, 0)), mat.cream, 0.5, Math.sin(a) * 0.55, Math.cos(a) * 0.6);
  }
  hb.flush(head);
  const jaw = new THREE.Group();
  jaw.name = "jaw";
  jaw.position.set(0.15, -0.3, 0);
  head.add(jaw);
  k.mesh(facet(new THREE.BoxGeometry(1.15, 0.22, 0.78)), mat.red, jaw, -0.55, -0.06, 0);

  const sail = new THREE.Group();
  sail.name = "sail";
  sail.position.set(MX, 0, 0);
  boat.add(sail);
  const SY0 = 2.4, SH = 7.4, SW = 3.6;
  const sg = new THREE.PlaneGeometry(1, 1, 2, 3);
  const sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const v = sp.getX(i) + 0.5, u = sp.getY(i) + 0.5;
    sp.setXYZ(i, v * Math.max(0.2, SW * (1 - u) ** 0.7), SY0 + u * SH, -0.5 * Math.sin(Math.PI * v) * (1 - u * 0.6));
  }
  k.mesh(facet(sg), mat.sail, sail);
  k.mesh(facet(new THREE.CylinderGeometry(0.07, 0.07, SW + 0.3, 5).rotateZ(Math.PI / 2)), mat.wood, sail, SW / 2, SY0 - 0.08, 0);
  const boats = twin(boat);
  const part = (n: string) => boats.map((b) => b.getObjectByName(n)!);
  const heads = part("head"), jaws = part("jaw"), sails = part("sail");
  R.shadow(SX + 1, SZ, 1.2, 12, 0.4);

  /* ---- twin suns setting gold, each with its double in the water ---- */
  const SUNS: [number, number, number, number, string, string][] = [
    [-126.3, 30, 64.9, 14, "#fff6d8", "#ffc860"],
    [-135.4, 13, 38.2, 9, "#ffe0a8", "#ff9c48"],
  ];
  const suns = SUNS.map(([x, y, z, r, c, g]) => [k.sunDisc(scene, x, y, z, r, c, g), k.sunDisc(scene, x, -y, z, r, c, g)]);
  const sunA = suns[0][0];

  // glitter on the sea along the line to the suns
  const NG = 160, gp = new Float32Array(NG * 3);
  for (let i = 0; i < NG; i++) {
    const [dx, dz] = i % 3 ? [-0.829, 0.559] : [-0.91, 0.415], s = 6 + Math.pow(rnd(), 0.6) * 110, w = (rnd() - 0.5) * (0.6 + s * 0.14);
    gp.set([14.7 + dx * s - dz * w, -9, -30 + dz * s + dx * w], i * 3);
  }
  const glintGeo = new THREE.BufferGeometry();
  glintGeo.setAttribute("position", new THREE.BufferAttribute(gp, 3));
  const glints = new THREE.Points(glintGeo, new THREE.PointsMaterial({ color: "#ffe6a0", size: 1, sizeAttenuation: false }));
  glints.frustumCulled = false;
  scene.add(glints);

  // gulls
  const gullGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.6, 0.22, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.6, 0.22, 0),
  ]);
  const gullMat = k.lineMat({ value: new THREE.Color("#ffffff") }, 110);
  const gulls = Array.from({ length: 7 }, (_, i) => {
    const l = new THREE.LineSegments(gullGeo, gullMat);
    scene.add(l);
    return { l, r: 7 + rnd() * 10, y: 16 + rnd() * 9, sp: (0.12 + rnd() * 0.1) * (i % 3 ? 1 : -1), ph: rnd() * 6.28 };
  });

  // easter eggs: start times, negative = never fired
  let tTalk = -99, tSun = -99, tGull = -99;
  return {
    scene, cam, fog: [40, 200], fov: [64, 74], limits: { pitch: [-0.05, 0.7], zoom: [0.55, 1.5] },
    labels: [
      { name: "Drowned spire", sub: "chrome, standing", at: (v) => { v.set(0, spireTop, 0); } },
      { name: "Red lion", sub: "moored · talks back", at: (v) => { v.set(-0.9, 10.6, 0); boats[0].localToWorld(v); } },
      { name: "Twin suns", sub: "binary, setting", at: (v) => { v.copy(sunA.position).y += 16; } },
    ],
    eggs: [
      { id: "ocean-korl", r: 34, at: (v) => { heads[0].getWorldPosition(v); }, fire: (t) => { tTalk = t; } },
      { id: "ocean-suns", r: 40, at: (v) => { v.copy(sunA.position); }, fire: (t) => { tSun = t; } },
      { id: "ocean-gull", r: 32, at: (v) => { v.copy(gulls[0].l.position); }, fire: (t) => { tGull = t; } },
    ],
    update(t) {
      // the boat rides a slow swell; tapped, the head talks, jaw flapping, nodding along
      const er = t - tTalk, talk = pulse(er, 2.8);
      boats.forEach((b, i) => {
        b.position.y = (0.12 * Math.sin(t * 0.8) + 0.1 * pulse(er, 1.2));
        b.rotation.set(Math.sin(t * 0.8) * 0.025, 0.04, Math.sin(t * 0.63) * 0.03);
        heads[i].rotation.y = Math.sin(t * 0.37) * 0.12 + Math.sin(t * 0.11) * 0.08;
        heads[i].rotation.z = talk * 0.12 * Math.sin(er * 3.5);
        jaws[i].rotation.z = 0.03 + (er > 0 && er < 2.8 ? 0.38 * Math.abs(Math.sin(er * 9)) * talk : 0);
        sails[i].rotation.y = -0.18 + Math.sin(t * 0.9) * 0.04;
      });
      for (const f of floats) {
        const y = f.y0 + Math.sin(t * 0.3 + f.ph) * 0.8;
        f.g.position.y = y;
        f.gm.position.y = y;
        f.g.rotation.y = f.gm.rotation.y = t * 0.02 + f.ph;
      }

      for (let i = 0; i < NG; i++) gp[i * 3 + 1] = Math.sin(t * 2.7 + i * 1.73) > 0.35 ? 0.06 : -9;
      glintGeo.attributes.position.needsUpdate = true;

      // suns: swell one after the other and wash the scene gold
      const es = t - tSun;
      suns[0].forEach((s) => s.scale.setScalar(1 + 0.4 * pulse(es, 1.4)));
      suns[1].forEach((s) => s.scale.setScalar(1 + 0.5 * pulse(es - 0.5, 1.4)));
      R.uniforms.flash.value = 0.2 * pulse(es - 0.3, 1.8);

      for (const g of gulls) {
        const a = g.ph + t * g.sp;
        g.l.position.set(Math.cos(a) * g.r, g.y + Math.sin(t * 0.5 + g.ph) * 0.8, 6 + Math.sin(a) * g.r);
        g.l.rotation.y = -a + (g.sp > 0 ? 0 : Math.PI);
        g.l.scale.y = Math.sin(t * 6 + g.ph * 3);
      }
      const eg = Math.min(1, (t - tGull) / 1.3);
      gulls[0].l.rotation.z = eg > 0 && eg < 1 ? eg * eg * (3 - 2 * eg) * Math.PI * 2 : 0;

      const a = -1.09 + Math.sin(t * 0.035) * 0.18 + view.px * 0.12 + view.yaw, r = 34 + Math.sin(t * 0.05) * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      cam.position.set(x, 3.4 + Math.sin(t * 0.7) * 0.1 - view.py * 0.6, z);
      cam.lookAt(0, 8 - view.py * 1.2, 0);
      cam.rotateZ(Math.sin(t * 0.7) * 0.01);
      k.orbit(cam, PIVOT);
      for (const pair of suns) for (const s of pair) s.lookAt(cam.position);
      R.follow(cam);
    },
    readout() {
      const p = cam.position;
      return [
        ["Lat", k.dms(-8.9142 - p.z * 0.00009, "N", "S", 2)],
        ["Lon", k.dms(-140.1027 + p.x * 0.00013, "E", "W", 3)],
        ["Elev", `${p.y.toFixed(1)} m`],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
        ["Grid", k.gridRef(p.x, p.z, 40)],
      ];
    },
  };
}
