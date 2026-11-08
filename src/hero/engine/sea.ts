/** The shallow sea, the skyline and the two suns; the camera faces the city. In front of it the
 *  wasteland has come in: shard towers and wreckage standing in the shallows, stone hanging over
 *  the water, islands floating upside down above the skyline. */
import * as THREE from "three";
import { pulse, type PsxKit, type SceneDef } from "./psx";
import { createWaste } from "./wasteland";

export function buildSea(k: PsxKit): SceneDef {
  const { rnd, facet, wallUV, mesh, psx, M, tex, view } = k;
  const { add, flush } = k.batcher();
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 520);
  const sky = k.skyDome(0, 0.15, 2.6);
  scene.add(sky);

  // A near-still sea: long low swell, nothing breaking.
  const wave = (x: number, z: number, t: number) =>
    0.07 * Math.sin(x * 0.21 + z * 0.06 + t * 0.6) +
    0.05 * Math.sin(z * 0.27 - x * 0.09 - t * 0.48) +
    0.025 * Math.sin((x + z) * 0.6 + t * 1.2);

  const mat = {
    water: psx({ map: tex.tWater, tint: "#b9d6d8", amb: "#5a7682", sun: "#d6ccb0" }),
    dark: psx({ map: tex.tPlain, tint: "#2b3439", amb: "#3c464c" }),
    city: [
      psx({ map: tex.tGlass, tint: "#b7c4ca", amb: "#56646e", sun: "#c8c0aa", fogAmt: 0.62 }),
      psx({ map: tex.tGlass, tint: "#8f9eaa", amb: "#4a5862", sun: "#b8b09c", fogAmt: 0.62 }),
      psx({ map: tex.tStone, tint: "#a9aba4", amb: "#56646e", sun: "#c8c0aa", fogAmt: 0.62 }),
    ],
    shard: psx({ map: tex.tPlain, tint: "#5c6672", amb: "#4a5862", sun: "#b8b09c", fogAmt: 0.7 }),
    wreck: psx({ map: tex.tStone, tint: "#a4a69c", amb: "#56646e", sun: "#c8c0aa" }),
    rust: psx({ map: tex.tBark, tint: "#a07462", amb: "#56646e", sun: "#c8c0aa" }),
  };

  /* ---- sea: a grid denser near the camera, displaced every frame ---- */
  const WN = 72, WH = 420, WCX = -2, WCZ = 12;
  const warp = (u: number) => Math.sign(u) * Math.pow(Math.abs(u), 1.8) * WH;
  const wg = new THREE.PlaneGeometry(2, 2, WN, WN);
  wg.rotateX(-Math.PI / 2);
  const wp0 = wg.attributes.position;
  for (let i = 0; i < wp0.count; i++) wp0.setXYZ(i, WCX + warp(wp0.getX(i)), 0, WCZ + warp(wp0.getZ(i)));
  const water = facet(wg);
  const wpos = water.attributes.position, wuv = water.attributes.uv;
  const wx = new Float32Array(wpos.count), wz = new Float32Array(wpos.count);
  for (let i = 0; i < wpos.count; i++) {
    wx[i] = wpos.getX(i);
    wz[i] = wpos.getZ(i);
    wuv.setXY(i, wx[i] / 6, wz[i] / 6);
  }
  mesh(water, mat.water, scene).frustumCulled = false;

  /* ---- skyline: a city of towers standing in the sea, tallest where the line runs in ---- */
  let peak = new THREE.Vector3(0, 0, -200);
  for (let i = 0; i < 70; i++) {
    const x = (rnd() - 0.5) * 460, z = -290 - rnd() * 80;
    const h = 16 + rnd() * 20 + 92 * Math.exp(-(((x - 10) / 80) ** 2)) * (0.45 + rnd() * 0.55);
    const w = 6 + rnd() * 8, d = w * (0.7 + rnd() * 0.4), ry = (rnd() - 0.5) * 0.5;
    const clad = mat.city[Math.floor(rnd() * 3)], kind = rnd();
    let top = h;
    if (kind < 0.55) {
      // box, sometimes stepped back once or twice
      const tiers = h > 50 ? 1 + Math.floor(rnd() * 3) : 1;
      let y = 0, tw = w, td = d;
      for (let t = 0; t < tiers; t++) {
        const th = t === tiers - 1 ? h - y : (h - y) * (0.5 + rnd() * 0.2);
        add(wallUV(facet(new THREE.BoxGeometry(tw, th + (t ? 0 : 3), td)), 1 / 12), clad, x, y + (th - (t ? 0 : 3)) / 2, z, 0, ry, 0);
        y += th;
        tw *= 0.72;
        td *= 0.72;
      }
    } else if (kind < 0.8) {
      add(wallUV(facet(new THREE.CylinderGeometry(w * 0.45, w * 0.5, h + 3, 8)), 1 / 12), clad, x, (h - 3) / 2, z, 0, ry, 0);
    } else {
      add(wallUV(facet(new THREE.CylinderGeometry(w * 0.3, w * 0.62, h + 3, 4).rotateY(Math.PI / 4)), 1 / 12), clad, x, (h - 3) / 2, z, 0, ry, 0);
      top = h + 4;
      add(facet(new THREE.ConeGeometry(w * 0.3, 8, 4).rotateY(Math.PI / 4)), clad, x, h + 4, z, 0, ry, 0);
    }
    // lit crown bands on the tall ones, masts with a beacon on some
    if (h > 55) add(facet(new THREE.BoxGeometry(w * 0.62, 0.6, d * 0.62)), M.glyph, x, h * 0.86, z, 0, ry, 0);
    if (rnd() > 0.45) {
      const mh = 4 + rnd() * (h > 60 ? 16 : 6);
      add(facet(new THREE.CylinderGeometry(0.2, 0.35, mh, 4)), mat.dark, x, top + mh / 2, z);
      add(facet(new THREE.BoxGeometry(0.9, 0.9, 0.9)), M.glyph, x, top + mh, z);
      top += mh;
    }
    if (top > peak.y) peak = new THREE.Vector3(x, top, z);
  }
  flush(scene);

  /* ---- the wasteland come in: towers off the line of sight so they frame the city, wreckage
     in the shallows, islands upside down above the skyline, stone hanging over the water ---- */
  const W = createWaste(k, { debris: mat.wreck, rust: mat.rust, seam: M.glyph });
  {
    const b = W.batch();
    const lineX = (z: number) => -3.6 + (13.6 * (18.5 - z)) / 348.5;
    for (let i = 0; i < 28; i++) {
      const z = W.between(-60, -250), side = rnd() > 0.5 ? 1 : -1;
      W.spire(b, lineX(z) + side * W.between(22 + -z * 0.08, 230), -0.5, z, W.between(12, 70), [mat.city[2], mat.shard, mat.dark], true, { lean: 2 });
    }
    for (let i = 0; i < 24; i++) W.junk(b, (rnd() - 0.5) * 100, -0.15, W.between(-8, -95), W.between(0.4, 1.6));
    for (let i = 0; i < 7; i++) b.add(W.island(W.between(8, 22)), mat.city[2], (rnd() - 0.5) * 420, W.between(110, 200), W.between(-260, -380), 0, rnd() * 3, 0);
    b.flush(scene);
  }
  const hang = W.hanging(scene, 16, [mat.wreck, mat.dark, mat.rust], (s) => [(rnd() - 0.5) * 80, W.between(2, 12) + s, W.between(-14, -80)]);

  /* ---- two suns, high over the horizon ---- */
  const sunA = k.sunDisc(scene, 130, 205, -420, 22, "#fff3d2", "#ffc874");
  const sunB = k.sunDisc(scene, -70, 168, -435, 14, "#ffd8b8", "#ff9a68");

  /* ---- glitter on the sea along the line to each sun ---- */
  const CX = -3.6, CZ = 18.5, CAMY = 2.8;
  const NG = 180, gp = new Float32Array(NG * 3), gBase: number[] = [];
  for (let i = 0; i < NG; i++) {
    const s = i % 3 ? sunA.position : sunB.position;
    const dx = s.x - CX, dz = s.z - CZ, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    const d = 8 + Math.pow(rnd(), 0.6) * 280, w = (rnd() - 0.5) * (0.6 + d * 0.1);
    gBase.push(CX + ux * d - uz * w, CZ + uz * d + ux * w);
  }
  const glintGeo = new THREE.BufferGeometry();
  glintGeo.setAttribute("position", new THREE.BufferAttribute(gp, 3));
  const glints = new THREE.Points(glintGeo, new THREE.PointsMaterial({ color: "#ffe0a0", size: 1, sizeAttenuation: false }));
  glints.frustumCulled = false;
  scene.add(glints);

  // easter eggs: start times; flare for the skyline's tallest mast
  let tSun = -99, tCity = -99;
  const cityFlare = k.flare(scene, peak.x, peak.y + 1, peak.z, 9);

  return {
    scene, cam, fog: [30, 260], fov: [58, 72], limits: { pitch: [-0.3, 0.35], zoom: [0.8, 2.4], yaw: 0.85 },
    labels: [
      { name: "Skyline", sub: "lights still on", at: (v) => { v.copy(peak).y += 6; } },
      { name: "Twin suns", sub: "binary, high", at: (v) => { v.copy(sunA.position).y += 26; } },
    ],
    eggs: [
      {
        id: "sea-skyline", r: 40,
        at: (v) => { v.copy(peak).y += 1; },
        fire: (t) => { tCity = t; },
      },
      {
        id: "sea-suns", r: 44,
        at: (v) => { v.copy(sunA.position); },
        fire: (t) => { tSun = t; },
      },
    ],
    update(t) {
      hang(t);
      for (let i = 0; i < wpos.count; i++) wpos.setY(i, wave(wx[i], wz[i], t));
      wpos.needsUpdate = true;
      water.computeVertexNormals();

      const ec = t - tCity;
      cityFlare.g.visible = ec > 0 && ec < 1.2;
      cityFlare.mat.opacity = 0.8 * pulse(ec, 1.2);
      cityFlare.g.lookAt(cam.position);
      const esn = t - tSun;
      sunA.scale.setScalar(1 + 0.35 * pulse(esn, 1.4));
      sunB.scale.setScalar(1 + 0.45 * pulse(esn - 0.5, 1.4));

      for (let i = 0; i < NG; i++) {
        const x = gBase[i * 2], z = gBase[i * 2 + 1], on = Math.sin(t * 2.3 + i * 1.73) > 0.4;
        gp[i * 3] = x;
        gp[i * 3 + 1] = on ? wave(x, z, t) + 0.04 : -9;
        gp[i * 3 + 2] = z;
      }
      glintGeo.attributes.position.needsUpdate = true;

      const x = CX + Math.sin(t * 0.05) * 0.25 + view.px * 0.6, z = CZ + Math.sin(t * 0.031) * 0.4;
      cam.position.set(x, CAMY + Math.sin(t * 0.6) * 0.015 - view.py * 0.3, z);
      cam.lookAt(10 + view.px * 6 + Math.sin(t * 0.04) * 3, 28 - view.py * 4, -330);
      k.look(cam);
      sky.position.copy(cam.position);
      sunA.lookAt(cam.position);
      sunB.lookAt(cam.position);
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
