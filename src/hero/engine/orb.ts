/** Sheet · Orb: an early raytracer's still life. A chrome planet hangs over a
 *  lone pyramid on a glittering mirror sea that runs out to a white horizon
 *  under a magenta-to-gold sunset sky. Two small chrome moons circle it, and
 *  everything doubles in the water. The orb's chrome carries the sky, the sea
 *  and the pyramids in its reflection, under swirled ink marbling.
 *
 *  The palette is fixed (the render's, not the site accent).
 *  Tap the orb to set it spinning, the pyramid's apex to light it. */
import * as THREE from "three";
import { burst, pulse, type PsxKit, type SceneDef } from "./psx";
import { createRay } from "./ray";

export function buildOrb(kit: PsxKit): SceneDef {
  const { rnd, view } = kit;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 520);
  const R = createRay(kit, scene, {
    zen: "#3a0a4a", mid: "#b02a6a", low: "#f08048", hor: "#fff0c8", fog: "#f4d4a8",
    ice: "#ffd8a0", sea: "#b85a48", ink: "#2e0c24",
  });
  R.floor({ fogNear: 60, fogFar: 330 });

  const mPyr = R.flat({ tint: "#ffe2b0", amb: "#3a0f2a", sun: "#ffd8a8" });
  const mCap = R.flat({ tint: "#ffe2b0", amb: "#3a0f2a", sun: "#ffd8a8", emit: "#fff4d8" });
  const mFar = R.flat({ tint: "#f0b090", amb: "#7a2a4a", sun: "#f8c8a0", fogAmt: 1 });

  // Pyramid: four faces, an edge toward the camera so one face catches the light and one falls dark.
  const PZ = -26, PH = 6.8, PR = 1.9;
  R.add(kit.facet(new THREE.ConeGeometry(PR, PH, 4, 1, true)), mPyr, 0, PH / 2, PZ);
  R.add(kit.facet(new THREE.ConeGeometry(PR * 0.16, PH * 0.16, 4, 1, true)), mCap, 0, PH - PH * 0.08 + 0.01, PZ);
  R.shadow(0, PZ, PR * 1.1, 34, 0.55);

  // Small pyramids far out, near the haze.
  const cones: [number, number, number, number][] = [[0, PZ, PR, PH]];
  for (let i = 0; i < 5; i++) {
    const x = (rnd() > 0.5 ? 1 : -1) * (40 + rnd() * 120), z = -150 - rnd() * 140, h = 4 + rnd() * 8;
    R.add(kit.facet(new THREE.ConeGeometry(h * 0.3, h, 4)), mFar, x, h / 2, z, 0, rnd() * 0.6, 0);
    cones.push([x, z, h * 0.3, h]);
    if (i < 2) R.shadow(x, z, h * 0.3, h * 6, 0.3);
  }

  // The orb, and two moons on tilted orbits.
  const ORB = new THREE.Vector3(0, 17.2, -34), OR = 5.4;
  const [orbA, orbB] = R.add(new THREE.SphereGeometry(OR, 48, 32), R.chrome({ cones, marble: 0.85, scale: 1.7, tint: "#f4e0d4" }));
  const moonMat = R.chrome({ cones, marble: 0.35, scale: 2.4, tint: "#f0dcd0" });
  const moonGeo = new THREE.SphereGeometry(1, 20, 14);
  const moons = [
    { r: 9.5, s: 0.85, sp: 0.32, tilt: 0.38, ph: 0 },
    { r: 12.5, s: 0.5, sp: -0.21, tilt: -0.22, ph: 2.4 },
  ].map((m) => ({ ...m, pair: R.add(moonGeo, moonMat, 0, 0, 0, 0, 0, 0, m.s) }));

  /* ---- apex beam for the egg ---- */
  const beamLen = Math.hypot(ORB.y - PH, ORB.z - PZ) - OR + 1;
  const beamMat = R.glow("#fff4d8", 0);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.7, beamLen, 6, 1, true), beamMat);
  const tilt = Math.atan2(ORB.z - PZ, ORB.y - PH);
  beam.position.set(0, PH + (Math.cos(tilt) * beamLen) / 2, PZ + (Math.sin(tilt) * beamLen) / 2);
  beam.rotation.x = tilt;
  beam.visible = false;
  scene.add(beam);

  let tSpin = -99, tApex = -99;
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

      cam.position.set(CAM.x + Math.sin(t * 0.03) * 0.6 + view.px * 0.6, CAM.y + Math.sin(t * 0.2) * 0.04 - view.py * 0.3, CAM.z);
      cam.lookAt(view.px * 3, 9.6 - view.py * 3, PZ);
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
