/** Sheet · Orb: an early raytracer's still life. A chrome planet hangs over a
 *  lone pyramid on a glittering mirror sea that runs out to a white horizon
 *  under a deep sky. Two small chrome moons circle it, and everything
 *  doubles in the water. The orb's chrome carries the sky, the sea and the
 *  pyramids in its reflection, under swirled ink marbling.
 *
 *  Three hand-set looks: the magenta-to-gold sunset (the Sunset palette), the
 *  ultramarine noon (the Sky palette) and a verdigris dusk, teal overhead to
 *  pale gold, for the greens. Any other palette takes whichever of the
 *  three sits nearer its deep accent on the colour wheel, turned round to that
 *  accent and muted to match a quieter one (Graphite goes fully grey).
 *  Tap the orb to set it spinning, the pyramid's apex to light it. */
import * as THREE from "three";
import { burst, pulse, type PsxKit, type SceneDef } from "./psx";
import { createRay } from "./ray";

export function buildOrb(kit: PsxKit): SceneDef {
  const { rnd, view } = kit;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 520);
  const R = createRay(kit, scene, {
    zen: "#0d1290", mid: "#2a43d6", low: "#7fa6ee", hor: "#eef6ff", fog: "#c9def4",
    ice: "#a8e6f0", sea: "#5a8cc4", ink: "#1a2a40",
  });
  R.floor({ fogNear: 60, fogFar: 330 });

  const mPyr = R.flat({ tint: "#cdf4fa", sun: "#c4f2ff" });
  const mCap = R.flat({ tint: "#cdf4fa", sun: "#c4f2ff", emit: "#e8fcff" });
  const mFar = R.flat({ tint: "#9cc8e8", amb: "#2a3c80", sun: "#a8d8f0", fogAmt: 1 });
  const shadows: THREE.Mesh[] = [];

  // Pyramid: four faces, an edge toward the camera so one face catches the light and one falls dark.
  const PZ = -26, PH = 6.8, PR = 1.9;
  R.add(kit.facet(new THREE.ConeGeometry(PR, PH, 4, 1, true)), mPyr, 0, PH / 2, PZ);
  R.add(kit.facet(new THREE.ConeGeometry(PR * 0.16, PH * 0.16, 4, 1, true)), mCap, 0, PH - PH * 0.08 + 0.01, PZ);
  shadows.push(R.shadow(0, PZ, PR * 1.1, 34, 0.55));

  // Small pyramids far out, near the haze.
  const cones: [number, number, number, number][] = [[0, PZ, PR, PH]];
  for (let i = 0; i < 5; i++) {
    const x = (rnd() > 0.5 ? 1 : -1) * (40 + rnd() * 120), z = -150 - rnd() * 140, h = 4 + rnd() * 8;
    R.add(kit.facet(new THREE.ConeGeometry(h * 0.3, h, 4)), mFar, x, h / 2, z, 0, rnd() * 0.6, 0);
    cones.push([x, z, h * 0.3, h]);
    if (i < 2) shadows.push(R.shadow(x, z, h * 0.3, h * 6, 0.3));
  }

  // The orb, and two moons on tilted orbits.
  const ORB = new THREE.Vector3(0, 17.2, -34), OR = 5.4;
  const [orbA, orbB] = R.add(new THREE.SphereGeometry(OR, 48, 32), R.chrome({ cones, marble: 0.85, scale: 1.7 }));
  const orbMat = orbA.material as THREE.ShaderMaterial;
  const moonMat = R.chrome({ cones, marble: 0.35, scale: 2.4, tint: "#d8e4ec" });
  const moonGeo = new THREE.SphereGeometry(1, 20, 14);
  const moons = [
    { r: 9.5, s: 0.85, sp: 0.32, tilt: 0.38, ph: 0 },
    { r: 12.5, s: 0.5, sp: -0.21, tilt: -0.22, ph: 2.4 },
  ].map((m) => ({ ...m, pair: R.add(moonGeo, moonMat, 0, 0, 0, 0, 0, 0, m.s) }));

  /* ---- apex beam for the egg ---- */
  const beamLen = Math.hypot(ORB.y - PH, ORB.z - PZ) - OR + 1;
  const beamMat = R.glow("#e8fcff", 0);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.7, beamLen, 6, 1, true), beamMat);
  const tilt = Math.atan2(ORB.z - PZ, ORB.y - PH);
  beam.position.set(0, PH + (Math.cos(tilt) * beamLen) / 2, PZ + (Math.sin(tilt) * beamLen) / 2);
  beam.rotation.x = tilt;
  beam.visible = false;
  scene.add(beam);

  /* ---- palette ----
     Each recoloured colour with its noon and sunset values. */
  const shadowMats = [...new Set(shadows.map((m) => m.material as THREE.MeshBasicMaterial))];
  const sky = R.uniforms.sky;
  type Row = [THREE.Color, string, string, string];
  const flatU = (m: THREE.ShaderMaterial, tint: string[], amb: string[], sun: string[], acc: string[]) =>
    [[m.uniforms.uTint.value, ...tint], [m.uniforms.uAmbient.value, ...amb], [m.uniforms.uSun.value, ...sun], [m.uniforms.uAccent.value, ...acc]] as Row[];
  // Columns: noon, sunset, verdigris.
  const table: Row[] = [
    [sky.uZen.value, "#0d1290", "#3a0a4a", "#031a1c"],
    [sky.uMid.value, "#2a43d6", "#b02a6a", "#0c5a52"],
    [sky.uLow.value, "#7fa6ee", "#f08048", "#6cc09a"],
    [sky.uHor.value, "#eef6ff", "#fff0c8", "#fbf6cc"],
    [R.uniforms.fog.value, "#c9def4", "#f4d4a8", "#d6e8c0"],
    [R.uniforms.ice.value, "#a8e6f0", "#ffd8a0", "#e0f4b8"],
    [R.uniforms.sea.value, "#5a8cc4", "#b85a48", "#2c7a6c"],
    [R.uniforms.ink.value, "#1a2a40", "#2e0c24", "#04221e"],
    ...flatU(mPyr, ["#cdf4fa", "#ffe2b0", "#eaf6c4"], ["#0e1844", "#3a0f2a", "#082a26"], ["#c4f2ff", "#ffd8a8", "#e6f4b4"], ["#ffffff", "#ffffff", "#ffffff"]),
    ...flatU(mCap, ["#cdf4fa", "#ffe2b0", "#eaf6c4"], ["#0e1844", "#3a0f2a", "#082a26"], ["#c4f2ff", "#ffd8a8", "#e6f4b4"], ["#e8fcff", "#fff4d8", "#f6ffd8"]),
    ...flatU(mFar, ["#9cc8e8", "#f0b090", "#a4d4b0"], ["#2a3c80", "#7a2a4a", "#1a5048"], ["#a8d8f0", "#f8c8a0", "#c4e4b8"], ["#ffffff", "#ffffff", "#ffffff"]),
    [orbMat.uniforms.uTint.value, "#e4f0f4", "#f4e0d4", "#e6f0de"],
    [moonMat.uniforms.uTint.value, "#d8e4ec", "#f0dcd0", "#d8e6d4"],
    [beamMat.color, "#e8fcff", "#fff4d8", "#f6ffd8"],
    ...shadowMats.map((m): Row => [m.color, "#1a2a40", "#2e0c24", "#04221e"]),
  ];
  // The deep accents the looks belong to: Sky's, Sunset's and Moss's.
  // Warm hues sit close together, so the sunset turns only half as far as the gap;
  // the verdigris dusk barely turns, so its teal-to-gold spread survives every green.
  const looks = [
    { at: new THREE.Color("#2f6f9a").getHSL({ h: 0, s: 0, l: 0 }), turn: 1, cols: table.map((r) => new THREE.Color(r[1])) },
    { at: new THREE.Color("#b02a6a").getHSL({ h: 0, s: 0, l: 0 }), turn: 0.5, cols: table.map((r) => new THREE.Color(r[2])) },
    { at: new THREE.Color("#2f8a4a").getHSL({ h: 0, s: 0, l: 0 }), turn: 0.25, cols: table.map((r) => new THREE.Color(r[3])) },
  ];
  const hueGap = (a: number, b: number) => ((((a - b) % 1) + 1.5) % 1) - 0.5;
  const hsl = { h: 0, s: 0, l: 0 };
  let applied = -1;
  const recolour = () => {
    const deep = kit.U.uAccent2.value;
    if (deep.getHex() === applied) return;
    applied = deep.getHex();
    deep.getHSL(hsl);
    const { h, s } = hsl;
    const look = s < 0.05 ? looks[0] : looks.reduce((x, y) => (Math.abs(hueGap(h, y.at.h)) < Math.abs(hueGap(h, x.at.h)) ? y : x));
    const dh = s < 0.05 ? 0 : hueGap(h, look.at.h) * look.turn;
    const k = s < 0.05 ? 0 : Math.max(0.45, Math.min(1, s / look.at.s));
    table.forEach(([c], i) => {
      look.cols[i].getHSL(hsl);
      c.setHSL((((hsl.h + dh) % 1) + 1) % 1, Math.min(1, hsl.s * k), hsl.l);
    });
  };

  let tSpin = -99, tApex = -99;
  // The camera answers the pointer through its own slow follow, on top of the engine's.
  let sx = 0, sy = 0, lastNow = 0;
  const CAM = new THREE.Vector3(0, 2.7, 4);
  const mp = new THREE.Vector3();

  return {
    scene,
    cam,
    fog: [60, 330],
    fov: [50, 68],
    limits: { pitch: [-0.25, 0.35], zoom: [0.8, 2.4], yaw: 0.9 },
    labels: [
      { name: "Orb", sub: "chrome, held", at: (v) => { v.copy(orbA.position).x += OR + 1; } },
      { name: "Pyramid", sub: "true north", at: (v) => { v.set(PR + 1.5, PH + 0.5, PZ); } },
    ],
    eggs: [
      { id: "orb-spin", r: 50, at: (v) => { v.copy(orbA.position); }, fire: (t) => { tSpin = t; } },
      { id: "orb-apex", r: 28, at: (v) => { v.set(0, PH, PZ); }, fire: (t) => { tApex = t; } },
    ],
    update(t) {
      recolour();
      // Slow turn, plus an eased burst after a tap; the moons speed up with it.
      const spin = t * 0.08 + burst(t - tSpin, 6, 3);
      const y = ORB.y + Math.sin(t * 0.5) * 0.35;
      for (const o of [orbA, orbB]) {
        o.position.set(ORB.x, y, ORB.z);
        o.rotation.set(0.35, spin, 0.12);
      }
      for (const m of moons) {
        const a = m.ph + spin * m.sp * 12;
        mp.set(Math.cos(a) * m.r, Math.sin(a) * m.r * Math.sin(m.tilt), Math.sin(a) * m.r * Math.cos(m.tilt));
        for (const o of m.pair) o.position.set(ORB.x + mp.x, y + mp.y, ORB.z + mp.z);
      }

      const ea = pulse(t - tApex, 2.4);
      mCap.uniforms.uEmit.value = ea * 1.4;
      beam.visible = ea > 0;
      beamMat.opacity = ea * 0.55;
      R.uniforms.flash.value = 0.25 * pulse(t - tApex - 0.6, 1.6);

      const now = performance.now();
      const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0;
      lastNow = now;
      const f = 1 - Math.exp(-dt * 0.9);
      sx += (view.px - sx) * f;
      sy += (view.py - sy) * f;
      cam.position.set(CAM.x + Math.sin(t * 0.018) * 0.5 + sx * 0.3, CAM.y + Math.sin(t * 0.11) * 0.03 - sy * 0.15, CAM.z);
      cam.lookAt(sx * 1.4, 9.6 - sy * 1.4, PZ);
      kit.look(cam);
      R.follow(cam);
    },
    readout() {
      const p = cam.position;
      return [
        ["Lat", kit.dms(64.1355 - p.z * 0.0001, "N", "S", 2)],
        ["Lon", kit.dms(-21.8954 + p.x * 0.00013, "E", "W", 3)],
        ["Elev", `${p.y.toFixed(1)} m`],
        ["Brg", `${kit.pad(Math.round(kit.bearing(cam)), 3)}°`],
        ["Grid", kit.gridRef(p.x, p.z, 40)],
      ];
    },
  };
}
