/** The shallow sea at dusk, as an early raytracer would draw it: a glittering
 *  mirror sea under a violet sky that runs down through rose and peach to a cream
 *  horizon, a skyline of chrome and flat slab towers standing in the water far out,
 *  shard towers in the shallows framing it, stones hanging over the water, islands
 *  floating upside down above the city and two suns high over it. Everything
 *  doubles in the sea; the camera faces the city.
 *
 *  The palette is fixed (dusk), not the site accent.
 *  Tap the skyline's tallest mast to flash its beacon, the suns to flare them. */
import * as THREE from "three";
import { pulse, type PsxKit, type SceneDef } from "./psx";
import { createRay } from "./ray";

export function buildSea(k: PsxKit): SceneDef {
  const { rnd, facet, view } = k;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 620);
  const R = createRay(k, scene, {
    zen: "#2a0f52", mid: "#b44c7e", low: "#f6a88a", hor: "#fff2dc", fog: "#f4d4c8",
    ice: "#ffd0c4", sea: "#8a4a80", ink: "#2a1034", light: [0.8, 0.38, 0.5],
  });
  // One huge quad: unsnapped, or its corners behind the lens tilt the whole plane.
  R.floor({ fogNear: 80, fogFar: 420 });
  const between = (a: number, b: number) => a + rnd() * (b - a);

  const amb = "#2a0c3a";
  const mat = {
    slab: R.flat({ tint: "#fff0e4", amb, sun: "#ffffff", fogAmt: 0.25 }),
    slab2: R.flat({ tint: "#ffbcd0", amb: "#24083a", sun: "#ffffff", fogAmt: 0.25 }),
    beacon: R.flat({ tint: "#40203a", amb, emit: "#fff0c0", emitAmt: 1, fogAmt: 0.3 }),
    shard: R.flat({ tint: "#c890b8", amb: "#1e0632", sun: "#fff0e8", fogAmt: 0.7 }),
    stone: R.flat({ tint: "#f0c0b8", amb: "#30103c" }),
    island: R.flat({ tint: "#f0a8c0", amb: "#4a1850", sun: "#ffe8e0", fogAmt: 0.3 }),
  };
  // The skyline stands far out in the haze; over-drive its key light so the lit faces still read pale.
  for (const m of [mat.slab, mat.slab2, mat.island, mat.shard, mat.stone]) (m.uniforms.uSun.value as THREE.Color).multiplyScalar(1.7);
  const chrome = R.chrome({ tint: "#ffe4ec", marble: 0.35, scale: 1.2, ink: "#3a1440" });

  /* ---- skyline: chrome and flat slab towers standing in the sea, tallest where the line runs in ---- */
  const sb = k.batcher();
  const CITY = new THREE.Group();
  let peak = new THREE.Vector3(0, 0, -200);
  for (let i = 0; i < 34; i++) {
    const x = (rnd() - 0.5) * 380, z = between(-250, -310);
    const h = 14 + rnd() * 18 + 90 * Math.exp(-(((x - 10) / 80) ** 2)) * (0.45 + rnd() * 0.55);
    const w = 8 + rnd() * 10, ry = (rnd() - 0.5) * 0.6;
    let top = h;
    if (i % 4 === 0) {
      // chrome: a tall cylinder with a cap
      k.mesh(facet(new THREE.CylinderGeometry(w * 0.42, w * 0.5, h, 12).translate(0, h / 2, 0)), chrome, CITY, x, 0, z);
    } else if (i % 4 === 3) {
      sb.add(facet(new THREE.CylinderGeometry(w * 0.25, w * 0.6, h, 4).rotateY(Math.PI / 4)), mat.slab2, x, h / 2, z, 0, ry, 0);
      sb.add(facet(new THREE.ConeGeometry(w * 0.25 * 1.4, 10, 4).rotateY(Math.PI / 4)), mat.slab2, x, h + 5, z, 0, ry, 0);
      top = h + 10;
    } else {
      // a flat slab, sometimes stepped back once
      const d = w * 0.45, m = i % 2 ? mat.slab : mat.slab2;
      sb.add(facet(new THREE.BoxGeometry(w, h, d)), m, x, h / 2, z, 0, ry, 0);
      if (h > 50) {
        sb.add(facet(new THREE.BoxGeometry(w * 0.6, h * 0.25, d * 0.8)), m, x, h + h * 0.125, z, 0, ry, 0);
        top = h * 1.25;
      }
    }
    if (h > 55) {
      const mh = 8 + rnd() * 14;
      sb.add(facet(new THREE.CylinderGeometry(0.3, 0.5, mh, 4)), mat.shard, x, top + mh / 2, z);
      sb.add(facet(new THREE.BoxGeometry(1.6, 1.6, 1.6)), mat.beacon, x, top + mh, z);
      top += mh;
    }
    if (top > peak.y) peak = new THREE.Vector3(x, top, z);
  }
  sb.flush(CITY);
  R.world.add(CITY);
  R.mirror.add(CITY.clone());

  /* ---- shard towers in the shallows, off the line of sight so they frame the city ---- */
  const lineX = (z: number) => -3.6 + (13.6 * (18.5 - z)) / 348.5;
  const nb = k.batcher();
  const cones: [number, number, number, number][] = [];
  for (let i = 0; i < 14; i++) {
    const z = between(-50, -240), side = i % 2 ? 1 : -1, x = lineX(z) + side * between(20 + -z * 0.1, 160);
    const h = between(16, 64), r = h * between(0.08, 0.14), lean = (rnd() - 0.5) * 0.12;
    nb.add(facet(new THREE.ConeGeometry(r, h, 4)), mat.shard, x, h / 2, z, lean, rnd() * 3, lean);
    if (rnd() > 0.5) nb.add(facet(new THREE.ConeGeometry(r * 0.6, h * 0.55, 4)), mat.shard, x + r * 1.8, h * 0.275, z + r, 0, rnd() * 3, -0.15);
    if (-z < 140) R.shadow(x, z, r, h * 1.4, 0.4);
    cones.push([x, z, r, h]);
  }

  /* ---- islands upside down above the skyline ---- */
  for (let i = 0; i < 6; i++) {
    const s = between(5, 10), x = (rnd() - 0.5) * 420, y = between(140, 200), z = between(-260, -330);
    nb.add(facet(new THREE.ConeGeometry(s, s * 2, 6).rotateX(Math.PI)), mat.island, x, y - s, z, 0, rnd() * 3, 0);
    nb.add(facet(new THREE.CylinderGeometry(s, s, 1.2, 6)), mat.slab, x, y, z, 0, rnd() * 3, 0);
  }
  const near = new THREE.Group();
  nb.flush(near);
  R.world.add(near);
  R.mirror.add(near.clone());
  chrome.uniforms.uNCones.value = Math.min(8, cones.length);
  cones.slice(0, 8).forEach((c, i) => (chrome.uniforms.uCones.value as THREE.Vector4[])[i].set(...c));

  /* ---- stones hanging over the water ---- */
  const stoneGeo = [facet(new THREE.OctahedronGeometry(1, 0)), facet(new THREE.IcosahedronGeometry(1, 0))];
  const stones = Array.from({ length: 9 }, (_, i) => {
    const s = between(0.8, 2.4), x = (rnd() - 0.5) * 70, y = between(4, 13), z = between(-16, -80);
    const pair = R.add(stoneGeo[i % 2], i === 4 ? chrome : mat.stone, x, y, z, rnd() * 3, rnd() * 3, 0, s);
    return { pair, y, ph: rnd() * 6, sp: between(0.1, 0.3) };
  });

  /* ---- two suns, high over the horizon, each with its double in the sea ---- */
  const SUNS: [number, number, number, number, string, string][] = [
    [130, 205, -420, 22, "#fff4dc", "#ffc070"],
    [-70, 168, -435, 14, "#ffe0c8", "#ff8a78"],
  ];
  const suns = SUNS.map(([x, y, z, r, c, g]) => [k.sunDisc(scene, x, y, z, r, c, g), k.sunDisc(scene, x, -y, z, r, c, g)]);
  const sunA = suns[0][0];

  /* ---- glitter on the sea along the line to each sun ---- */
  const CX = -3.6, CZ = 18.5, CAMY = 2.8;
  const NG = 180, gp = new Float32Array(NG * 3);
  for (let i = 0; i < NG; i++) {
    const s = SUNS[i % 3 ? 0 : 1];
    const dx = s[0] - CX, dz = s[2] - CZ, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    const d = 8 + Math.pow(rnd(), 0.6) * 280, w = (rnd() - 0.5) * (0.6 + d * 0.1);
    gp.set([CX + ux * d - uz * w, -9, CZ + uz * d + ux * w], i * 3);
  }
  const glintGeo = new THREE.BufferGeometry();
  glintGeo.setAttribute("position", new THREE.BufferAttribute(gp, 3));
  const glints = new THREE.Points(glintGeo, new THREE.PointsMaterial({ color: "#fff0c8", size: 1, sizeAttenuation: false }));
  glints.frustumCulled = false;
  scene.add(glints);

  // easter eggs: start times; a flare on the skyline's tallest mast
  let tSun = -99, tCity = -99;
  const cityFlare = k.flare(scene, peak.x, peak.y + 1, peak.z, 9);
  cityFlare.mat.color.set("#fff0c0");

  return {
    scene, cam, fog: [60, 520], fov: [58, 72], limits: { pitch: [-0.3, 0.35], zoom: [0.8, 2.4], yaw: 0.85 },
    labels: [
      { name: "Skyline", sub: "lights still on", at: (v) => { v.copy(peak).y += 6; } },
      { name: "Twin suns", sub: "binary, high", at: (v) => { v.copy(sunA.position).y += 26; } },
    ],
    eggs: [
      { id: "sea-skyline", r: 40, at: (v) => { v.copy(peak).y += 1; }, fire: (t) => { tCity = t; } },
      { id: "sea-suns", r: 44, at: (v) => { v.copy(sunA.position); }, fire: (t) => { tSun = t; } },
    ],
    update(t) {
      for (const s of stones) {
        const y = s.y + Math.sin(t * s.sp + s.ph) * 0.6;
        for (const o of s.pair) {
          o.position.y = y;
          o.rotation.y = t * s.sp * 0.5 + s.ph;
        }
      }

      // skyline: the beacons pulse, and flare white when tapped
      const ec = t - tCity;
      cityFlare.g.visible = ec > 0 && ec < 1.2;
      cityFlare.mat.opacity = 0.8 * pulse(ec, 1.2);
      cityFlare.g.lookAt(cam.position);
      mat.beacon.uniforms.uEmit.value = 0.7 + 0.3 * Math.sin(t * 2) + 1.5 * pulse(ec, 1.6);
      const esn = t - tSun;
      suns[0].forEach((s) => s.scale.setScalar(1 + 0.35 * pulse(esn, 1.4)));
      suns[1].forEach((s) => s.scale.setScalar(1 + 0.45 * pulse(esn - 0.5, 1.4)));
      R.uniforms.flash.value = 0.2 * pulse(esn - 0.3, 1.8);

      for (let i = 0; i < NG; i++) gp[i * 3 + 1] = Math.sin(t * 2.3 + i * 1.73) > 0.4 ? 0.04 : -9;
      glintGeo.attributes.position.needsUpdate = true;

      const x = CX + Math.sin(t * 0.05) * 0.25 + view.px * 0.6, z = CZ + Math.sin(t * 0.031) * 0.4;
      cam.position.set(x, CAMY + Math.sin(t * 0.6) * 0.015 - view.py * 0.3, z);
      cam.lookAt(10 + view.px * 6 + Math.sin(t * 0.04) * 3, 28 - view.py * 4, -330);
      k.look(cam);
      for (const pair of suns) for (const s of pair) s.lookAt(cam.position);
      R.follow(cam);
    },
    readout() {
      const p = cam.position;
      return [
        ["Lat", k.dms(-11.402 - p.z * 0.00009, "N", "S", 2)],
        ["Lon", k.dms(-152.7713 + p.x * 0.00013, "E", "W", 3)],
        ["Elev", `${p.y.toFixed(1)} m`],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
        ["Grid", k.gridRef(p.x, p.z, 40)],
      ];
    },
  };
}
