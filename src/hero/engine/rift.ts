/** Sheet · Rift: a mountain valley at the end of the day, as an early
 *  raytracer would have staged it. Two walls of big faceted slabs run away
 *  from the eye toward a low sun in the notch at the far end; spires crown
 *  them and blades as tall as the walls lean in over a floor of stacked-cone
 *  conifers. Down the middle runs the river of glass, a mirror strip that
 *  doubles everything, and a colossal chrome shard lies wedged from wall to
 *  wall with glowing seams. Stones hang in the gap, a few islands float
 *  upside down, and ash drifts down.
 *
 *  The palette is fixed (ember, not the site accent).
 *  Tap the wedged shard to wake its seams, the river to light it, the sun to
 *  flare it. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pulse, type PsxKit, type SceneDef } from "./psx";
import { createRay } from "./ray";

export function buildRift(kit: PsxKit): SceneDef {
  const { rnd, facet, view } = kit;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(54, 16 / 9, 0.5, 3000);
  const fog: [number, number] = [80, 760];
  const R = createRay(kit, scene, {
    zen: "#4a0812", mid: "#c2401a", low: "#f29a3c", hor: "#fff0c4", fog: "#f4c890",
    ice: "#ffd8a0", sea: "#7a2814", ink: "#240406", light: [0.72, 0.42, -0.55],
  });
  const floor = R.floor({ fogNear: 80, fogFar: 760, flow: 0.6 });
  const between = (a: number, b: number) => a + rnd() * (b - a);

  const mWall = R.flat({ tint: "#f0b48a", amb: "#3a0a12", sun: "#fff0dc" });
  const mWall2 = R.flat({ tint: "#c8805e", amb: "#2c060c", sun: "#ffe4c8" });
  const mSpire = R.flat({ tint: "#8a4a48", amb: "#1e0408", sun: "#ffd0a8" });
  const mBank = R.flat({ tint: "#d88a5a", amb: "#3a0a0c", sun: "#ffd0a0" });
  mBank.transparent = true;
  const mPine = R.flat({ tint: "#5a3a24", amb: "#1a0406", sun: "#ffb878" });
  const mPine2 = R.flat({ tint: "#7a4a2a", amb: "#220608", sun: "#ffc088" });
  const mSeam = R.flat({ tint: "#000000", amb: "#000000", sun: "#000000", emit: "#ffd070", emitAmt: 0.8, fogAmt: 0.3 });

  /* Static parts are batched per material, then shown twice: real and mirrored. */
  const b = kit.batcher();
  const flushBoth = () => {
    const g = new THREE.Group();
    b.flush(g);
    R.world.add(g);
    R.mirror.add(g.clone());
  };

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  const place = (geo: THREE.BufferGeometry, mat: THREE.Material, p: [number, number, number], r: [number, number, number], sc: [number, number, number]) =>
    b.add(geo.clone().applyMatrix4(m4.compose(pv.set(...p), q.setFromEuler(eu.set(...r)), sv.set(...sc))), mat);

  /* ---- the valley: half-width Wv(z); the river winds down the middle ---- */
  const Wv = (z: number) => 66 + 12 * Math.sin(z * 0.012 + 1) + 5 * Math.sin(z * 0.031);
  const riverX = (z: number) => 6 * Math.sin(z * 0.02);
  const riverW = (z: number) => 9 + -z * 0.012;

  // Banks: flat dark ground from the river's edge out under the walls, hiding the mirror there.
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(1, 1, 1, 120).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = (p.getZ(i) + 0.5) * 1060 - 1000, edge = riverX(z) + s * riverW(z);
      p.setXYZ(i, p.getX(i) * s > 0 ? s * 400 : edge, 0.05, z);
    }
    g.computeVertexNormals();
    // Drawn after the sea (like the kit's shadows): vertex snapping bends the one-quad sea enough to poke through otherwise.
    kit.mesh(g, mBank, scene).renderOrder = 2;
  }

  // Walls: rows of big leaning slabs on each side, taller further out.
  const slab = facet(new THREE.BoxGeometry(1, 1, 1));
  for (const s of [-1, 1]) {
    for (let row = 0; row < 3; row++) {
      for (let z = 10 - row * 30; z > -1000; z -= between(40, 70)) {
        const x = s * (Wv(z) + 18 + row * 46 + between(-6, 6)), h = (36 + row * 40) * between(0.7, 1.3);
        const w = between(26, 44), d = between(40, 70);
        place(slab, row % 2 ? mWall2 : mWall, [x, h / 2 - 4, z], [between(-0.05, 0.05), between(-0.25, 0.25), s * between(0, 0.12)], [w, h, d]);
        // Spires on the crests.
        if (row === 2 && rnd() < 0.5) {
          const sh = between(30, 70);
          b.add(facet(new THREE.ConeGeometry(between(3, 6), sh, 4)), mSpire, x - s * 6, h + sh / 2 - 8, z, 0, rnd(), -s * between(0, 0.15));
        }
      }
    }
  }

  // Blades as tall as the walls, driven into them and leaning in over the floor.
  const blade = facet(new THREE.ConeGeometry(1, 1, 4).scale(1, 1, 0.18));
  for (let i = 0; i < 16; i++) {
    const s = i % 2 ? 1 : -1, z = between(-760, -60), h = between(50, 100);
    place(blade, mSpire, [s * (Wv(z) + between(4, 20)), h * 0.42, z], [between(-0.1, 0.1), between(-0.4, 0.4), s * between(0.35, 0.7)], [h * 0.12, h, h * 0.12]);
  }

  // Conifers: three stacked cones on a stick, filling the banks; a few spires rise among them.
  const pine = facet(
    mergeGeometries([
      new THREE.CylinderGeometry(0.3, 0.4, 3, 5).translate(0, 1.5, 0),
      new THREE.ConeGeometry(2.6, 5, 6).translate(0, 5, 0),
      new THREE.ConeGeometry(2, 4.2, 6).translate(0, 7.6, 0),
      new THREE.ConeGeometry(1.3, 3.6, 6).translate(0, 10, 0),
    ])!,
  );
  for (let i = 0; i < 520; i++) {
    const z = between(-700, 40), x = (rnd() - 0.5) * 2 * (Wv(z) + 8);
    if (Math.abs(x - riverX(z)) < riverW(z) + 3) continue;
    b.add(pine, i % 3 ? mPine : mPine2, x, 0, z, 0, rnd() * 6, 0, between(0.9, 1.8));
  }
  for (let i = 0; i < 10; i++) {
    const z = between(-650, -120), x = (rnd() - 0.5) * 1.6 * Wv(z);
    if (Math.abs(x - riverX(z)) < riverW(z) + 6) continue;
    const h = between(30, 60);
    b.add(facet(new THREE.ConeGeometry(h * 0.08, h, 4)), mSpire, x, h / 2, z, 0, rnd(), 0);
  }

  // Upside-down islands: a flat top over an inverted cone.
  for (let i = 0; i < 4; i++) {
    const r = between(7, 13), x = between(-40, 40), y = between(120, 170), z = between(-300, -650);
    b.add(facet(new THREE.CylinderGeometry(r, r * 0.9, 2, 7)), mWall2, x, y, z);
    b.add(facet(new THREE.ConeGeometry(r * 0.9, r * 2.2, 7)), mSpire, x, y - 1 - r * 1.1, z, Math.PI, 0, 0);
  }
  flushBoth();

  /* ---- the wedge: a colossal chrome shard from wall to wall, seams lit ---- */
  const WZ = -270, WY = 32, span = 2 * (Wv(WZ) + 50);
  const wedge = R.both(() => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(1, 0).scale(span / 2, 12, 12), R.chrome({ tint: "#fff0e0", marble: 0.5, scale: 1.2 })));
    const sb = kit.batcher();
    sb.add(new THREE.BoxGeometry(span * 0.6, 1.4, 1.4), mSeam, 0, 0, 8.6);
    sb.add(new THREE.BoxGeometry(span * 0.36, 1.4, 1.4), mSeam, -span * 0.08, 4.4, 6);
    sb.flush(g);
    return g;
  });
  for (const g of wedge) {
    g.position.set(0, WY, WZ);
    g.rotation.set(0.06, 0.12, 0.08);
  }

  /* ---- hanging stones in the gap ---- */
  const stoneGeo = facet(new THREE.OctahedronGeometry(1, 0));
  const hang = Array.from({ length: 16 }, () => {
    const z = between(-240, -30), s = between(1.5, 4.5);
    return { pair: R.add(stoneGeo, rnd() < 0.5 ? mWall : mWall2, (rnd() - 0.5) * 1.4 * Wv(z), between(28, 60), z, rnd(), rnd(), rnd(), s), y: 0, ph: rnd() * 6 };
  });
  hang.forEach((h) => { h.y = h.pair[0].position.y; });

  /* ---- the sun, low in the notch, and the river's glow ---- */
  const SUN = new THREE.Vector3(30, 100, -1300);
  const sun = kit.sunDisc(scene, SUN.x, SUN.y, SUN.z, 46, "#fff8e0", "#ffc070");
  const riverGlow = R.glow("#ffd890", 0);
  {
    const g = new THREE.PlaneGeometry(1, 1, 1, 100).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = 50 - (p.getZ(i) + 0.5) * 800;
      p.setXYZ(i, riverX(z) + Math.sign(p.getX(i)) * riverW(z) * 0.5, 0.3, z);
    }
    kit.mesh(g, riverGlow, scene).renderOrder = 3;
  }

  /* ---- falling ash ---- */
  const NA = 90, ash = new Float32Array(NA * 3), ashBase = new Float32Array(NA * 3);
  for (let i = 0; i < NA; i++) ashBase.set([between(-70, 70), between(0, 90), between(-200, 50)], i * 3);
  const ashGeo = new THREE.BufferGeometry();
  ashGeo.setAttribute("position", new THREE.BufferAttribute(ash, 3));
  const ashPts = new THREE.Points(ashGeo, new THREE.PointsMaterial({ color: "#fff0d0", size: 1, sizeAttenuation: false }));
  ashPts.frustumCulled = false;
  scene.add(ashPts);

  let wedgeT = -99, riverT = -99, sunT = -99, tNow = 0;

  return {
    scene,
    cam,
    fog,
    fov: [54, 70],
    limits: { pitch: [-0.3, 0.5], zoom: [0.8, 2.8], yaw: 0.7 },
    labels: [
      { name: "Wedge", sub: "WALL TO WALL", at: (v) => { v.set(0, WY + 16, WZ); } },
      { name: "River", sub: "GLASS, IN A CLEARING", at: (v) => { v.set(riverX(-90), 4, -90); } },
    ],
    eggs: [
      { id: "rift-wedge", r: 60, at: (v) => { v.set(0, WY, WZ); }, fire: (t) => { wedgeT = t; } },
      { id: "rift-river", r: 40, at: (v) => { v.set(riverX(-60), 1, -60); }, fire: (t) => { riverT = t; } },
      { id: "rift-sun", r: 46, at: (v) => { v.copy(SUN); }, fire: (t) => { sunT = t; } },
    ],
    update(t) {
      tNow = t;
      const ew = pulse(t - wedgeT, 4), er = pulse(t - riverT, 3), es = pulse(t - sunT, 2.4);
      mSeam.uniforms.uEmit.value = 0.7 + 0.25 * Math.sin(t * 0.9) + ew * 2;
      R.uniforms.flash.value = 0.3 * ew + 0.25 * es;
      riverGlow.opacity = 0.02 + 0.02 * Math.sin(t * 2.3) + er * 0.45;
      floor.material.uniforms.uFlow.value = 0.6 + er * 3;
      sun.scale.setScalar(1 + 0.5 * es);

      hang.forEach((h, i) => {
        for (const m of h.pair) {
          m.position.y = h.y + Math.sin(t * 0.4 + h.ph) * 1.2;
          m.rotation.y = t * 0.05 * (i % 2 ? 1 : -1) + h.ph;
        }
      });
      for (let i = 0; i < NA; i++) {
        ash[i * 3] = ashBase[i * 3] + Math.sin(t * 0.3 + i) * 3;
        ash[i * 3 + 1] = (((ashBase[i * 3 + 1] - t * 2.2) % 90) + 90) % 90;
        ash[i * 3 + 2] = ashBase[i * 3 + 2];
      }
      ashGeo.attributes.position.needsUpdate = true;

      // Above the canopy, looking down the valley toward the notch.
      const x = Math.sin(t * 0.03) * 4 + view.px * 2, z = 64 + Math.sin(t * 0.02) * 6;
      cam.position.set(x, 40 - view.py * 0.5, z);
      cam.lookAt(view.px * 8 + Math.sin(t * 0.025) * 6, 26 - view.py * 6, -400);
      kit.look(cam);
      sun.lookAt(cam.position);
      R.follow(cam);
    },
    readout: () => [
      ["ALT", `${Math.round(1240 + cam.position.y * 6)} m`],
      ["ASH", `${Math.round(20 + 6 * Math.sin(tNow * 0.11))} g/m²`],
      ["WALLS", "170 m"],
      ["BRG", `${kit.pad(Math.round(kit.bearing(cam)), 3)}°`],
      ["SUN", "IN THE NOTCH"],
    ],
  };
}
