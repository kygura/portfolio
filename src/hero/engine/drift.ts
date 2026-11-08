/** Sheet · Drift: a dream, seen side-on, as an early raytracer would draw it.
 *  Far out on a mirror sea under a plum-to-lilac sky, a long lit train crosses
 *  the horizon on rails a hand's breadth under the surface. Shard towers stand
 *  in the water at every distance, chrome rings rise half out of it and door
 *  frames open onto nothing; stones hang in the air, islands float upside down
 *  beyond the line, and a low sun never sets. Everything doubles in the sea.
 *
 *  The palette is fixed (plum, lilac and pink), not the site accent.
 *  Tap the cab to sound the horn, a middle car to put its lights out, the tail
 *  lamp to swing it, the sun to flare it. */
import * as THREE from "three";
import { pulse, type PsxKit, type SceneDef } from "./psx";
import { createRay } from "./ray";

const LAMP = "#ffe2a8", TAIL = "#ff5c5c";
/** Train speed, m/s, and the line it runs on, far out from the eye. */
const V = 8;
const TZ = -140;

export function buildDrift(kit: PsxKit): SceneDef {
  const { rnd, facet, view } = kit;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 3200);
  const R = createRay(kit, scene, {
    zen: "#3a1450", mid: "#ae8ad0", low: "#f6c2d6", hor: "#fff6f8", fog: "#f4dce8",
    ice: "#f6dcf2", sea: "#8a68a2", ink: "#2a1238", light: [0.75, 0.35, 0.45],
  });
  // One huge quad: unsnapped, or its corners behind the lens tilt the whole plane.
  R.floor({ size: 3000, fogNear: 140, fogFar: 900 });
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const box = (w: number, h: number, d: number) => facet(new THREE.BoxGeometry(w, h, d));

  const amb = "#24082e";
  const mat = {
    shard: R.flat({ tint: "#f2d8f0", amb, sun: "#ffffff" }),
    shard2: R.flat({ tint: "#c8a0d8", amb: "#1c0628", sun: "#fff4fa" }),
    far: R.flat({ tint: "#d8b8e0", amb: "#6a4a88", sun: "#fff0f6", fogAmt: 1 }),
    stone: R.flat({ tint: "#ffd8e0", amb: "#3a1440", sun: "#ffffff" }),
    body: R.flat({ tint: "#c83a5a", amb: "#3a0820", sun: "#fff0f0" }),
    cream: R.flat({ tint: "#fff4e4", amb: "#4a3050" }),
    roof: R.flat({ tint: "#6a4a80", amb: "#1a0828" }),
    iron: R.flat({ tint: "#3a2c48", amb: "#140a1c" }),
    win: R.flat({ tint: "#000000", amb: "#000000", sun: "#000000", emit: LAMP, emitAmt: 1, fogAmt: 0.3 }),
    pax: R.flat({ tint: "#1c1028", amb: "#1c1028", sun: "#000000", fogAmt: 0.3 }),
    lamp: R.flat({ tint: "#000000", emit: LAMP, emitAmt: 1.4, fogAmt: 0.2 }),
    tail: R.flat({ tint: "#000000", emit: TAIL, emitAmt: 1.2, fogAmt: 0.2 }),
  };
  for (const m of [mat.shard, mat.shard2, mat.stone, mat.body, mat.cream]) (m.uniforms.uSun.value as THREE.Color).multiplyScalar(1.5);

  /* A batch of static parts, merged per material, then put in the world and in its mirror. */
  const twin = <T extends THREE.Object3D>(o: T) => {
    R.world.add(o);
    const c = o.clone() as T;
    R.mirror.add(c);
    return [o, c] as const;
  };
  const bake = (b: ReturnType<PsxKit["batcher"]>) => {
    const g = new THREE.Group();
    b.flush(g);
    return twin(g);
  };

  /* ---- the sea of shards, rings and door frames ---- */
  const sx = (half: number) => (rnd() - 0.5) * 2 * half;
  const wb = kit.batcher();
  const cones: [number, number, number, number][] = [];
  const shard = (x: number, z: number, h: number, m: THREE.Material, shadow = false) => {
    const r = h * between(0.07, 0.13), kind = rnd();
    if (kind < 0.5) {
      // obelisk, sometimes with a smaller one leaning off it
      wb.add(facet(new THREE.ConeGeometry(r, h, 4)), m, x, h / 2, z, 0, rnd() * 3, 0);
      if (rnd() > 0.5) wb.add(facet(new THREE.ConeGeometry(r * 0.6, h * 0.5, 4)), m, x + r * 1.6, h * 0.25, z, 0, rnd() * 3, -0.2);
    } else if (kind < 0.8) {
      // slant-cut blade: a thin slab with its top sheared off
      const g = new THREE.BoxGeometry(r * 2, h, r * 0.6);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) - (p.getX(i) / r + 1) * h * 0.2);
      wb.add(facet(g), m, x, h / 2, z, 0, rnd() * 3, 0);
    } else {
      // broken stack: blocks set crooked on each other
      let y = 0;
      for (let i = 0; i < 3; i++) {
        const bh = (h / 3) * between(0.8, 1.1), bw = r * 2 * (1 - i * 0.18);
        wb.add(box(bw, bh, bw), m, x, y + bh / 2, z, 0, rnd() * 0.6, (rnd() - 0.5) * 0.1);
        y += bh;
      }
    }
    if (shadow) R.shadow(x, z, r, h * 1.6, 0.4);
    if (cones.length < 8) cones.push([x, z, r, h]);
  };
  // between the eye and the line: a few the train passes behind
  for (let i = 0; i < 6; i++) shard(sx(110), between(-30, -110), between(8, 26), i % 2 ? mat.shard : mat.shard2, true);
  // beyond the line: a denser stand, islands upside down over it
  for (let i = 0; i < 12; i++) shard(sx(420), between(-180, -330), between(20, 70), i % 3 ? mat.shard2 : mat.shard);
  for (let i = 0; i < 4; i++) {
    const s = between(5, 10), x = sx(380), y = between(80, 130), z = between(-200, -320);
    wb.add(facet(new THREE.ConeGeometry(s, s * 2.2, 5).rotateX(Math.PI)), mat.shard2, x, y - s * 1.1, z, 0, rnd() * 3, 0);
    wb.add(facet(new THREE.CylinderGeometry(s, s, 0.8, 5)), mat.stone, x, y, z, 0, rnd() * 3, 0);
  }
  // horizon: tall hazed silhouettes
  for (let i = 0; i < 16; i++) {
    const h = between(50, 160);
    wb.add(facet(new THREE.ConeGeometry(h * 0.08, h, 4)), mat.far, sx(900), h / 2, between(-450, -700), 0, rnd() * 3, 0);
  }
  // door frames to nowhere
  for (const [x, z, h] of [[-26, -60, 7], [34, -92, 9], [-70, -170, 12]]) {
    wb.add(box(0.9, h, 0.9), mat.shard, x - h * 0.3, h / 2, z);
    wb.add(box(0.9, h, 0.9), mat.shard, x + h * 0.3, h / 2, z);
    wb.add(box(h * 0.6 + 1.6, 1, 1.2), mat.shard, x, h + 0.5, z);
    R.shadow(x, z, h * 0.35, h * 1.4, 0.35);
  }
  bake(wb);

  // chrome rings rising half out of the water; the sea draws the other half
  const chrome = R.chrome({ tint: "#ffffff", marble: 0.3, scale: 2, ink: "#3a1450", cones });
  for (const [x, z, r, ry] of [[-14, -40, 5, 0.5], [46, -120, 9, -0.3], [-110, -230, 16, 0.2]]) {
    R.add(new THREE.TorusGeometry(r, r * 0.16, 8, 28), chrome, x, 0, z, 0, ry, 0);
  }

  /* ---- stones hanging in the air, one of them chrome ---- */
  const stoneGeo = [facet(new THREE.OctahedronGeometry(1, 0)), facet(new THREE.IcosahedronGeometry(1, 0))];
  const stones = Array.from({ length: 9 }, (_, i) => {
    const s = between(0.5, 1.8), x = sx(90), y = between(3, 12), z = between(-12, -120);
    const pair = i === 0 ? R.add(new THREE.SphereGeometry(1, 24, 16), chrome, 8, 9, -48, 0, 0, 0, 3) : R.add(stoneGeo[i % 2], mat.stone, x, y, z, rnd() * 3, rnd() * 3, 0, s);
    return { pair, y: i === 0 ? 9 : y, ph: rnd() * 6, sp: between(0.15, 0.35) };
  });

  /* ---- the low sun, and its double ---- */
  const SUN = new THREE.Vector3(330, 64, -1280);
  const sun = kit.sunDisc(scene, SUN.x, SUN.y, SUN.z, 38, "#fff8ee", "#ffb8c8");
  const sunM = kit.sunDisc(scene, SUN.x, -SUN.y, SUN.z, 38, "#fff8ee", "#ffb8c8");

  /* ---- the train: eight cars, cab leading to the right, running toward the sun ---- */
  const CAR = 11, GAP = 1, D = 2.6, N = 8, PITCH = CAR + GAP;
  const HALF = ((N - 1) / 2) * PITCH + CAR / 2 + D / 2;
  // The line wraps out of sight at both ends, even with the view turned all the way.
  const LOOP = 620;
  const train = new THREE.Group();
  train.position.z = TZ;
  const pb = kit.batcher();
  const tb = kit.batcher();
  const bogX: number[] = [];
  for (let i = 0; i < N; i++) {
    const cx = (i - (N - 1) / 2) * PITCH;
    tb.add(box(CAR, 1.25, D), mat.body, cx, 1.62, 0);
    tb.add(box(CAR, 1.35, D), mat.cream, cx, 2.945, 0);
    tb.add(box(CAR + 0.1, 0.4, D + 0.1), mat.roof, cx, 3.8, 0);
    tb.add(box(CAR - 1.2, 0.5, D - 0.5), mat.iron, cx, 0.75, 0);
    if (i < N - 1) tb.add(box(GAP + 0.4, 2.2, 1.7), mat.iron, cx + PITCH / 2, 2.3, 0);
    for (const bx of [-(CAR / 2 - 2.1), CAR / 2 - 2.1]) bogX.push(cx + bx);
    // windows go right through the body, so both sides are lit; some have a figure against the light
    for (let j = 0; j < 6; j++) {
      const wx = cx - CAR / 2 + 1.3 + (j * (CAR - 2.6)) / 5;
      tb.add(box(1.1, 0.8, D + 0.04), mat.win, wx, 2.95, 0);
      if (rnd() < 0.55) pb.add(box(0.44, 0.7, D + 0.06), mat.pax, wx + (rnd() - 0.5) * 0.3, 2.9, 0);
    }
  }
  // the cab: a raked nose with a lamp
  tb.add(facet(new THREE.ConeGeometry(D * 0.75, 2.6, 4).rotateZ(-Math.PI / 2).rotateX(Math.PI / 4)), mat.body, HALF - D / 2 + 1.3, 2.3, 0);
  tb.add(box(0.2, 0.4, 0.6), mat.lamp, HALF + 0.9, 1.6, 0);
  tb.flush(train);
  const paxG = new THREE.Group();
  paxG.name = "pax";
  pb.flush(paxG);
  train.add(paxG);
  // tail lamp on a hook off the last car
  const lantern = new THREE.Group();
  lantern.name = "lantern";
  lantern.position.set(-HALF - 0.1, 2.6, 0);
  train.add(lantern);
  kit.mesh(box(0.08, 0.32, 0.08), mat.iron, lantern, 0, -0.16, 0);
  kit.mesh(box(0.3, 0.36, 0.3), mat.tail, lantern, 0, -0.48, 0);
  const trains = twin(train);
  const paxes = trains.map((t) => t.getObjectByName("pax")!);
  const lanterns = trains.map((t) => t.getObjectByName("lantern")!);

  /* ---- not mirrored: the rails just under the surface, the lamp's beam, glows, spray and the horn ---- */
  {
    const rb = kit.batcher();
    for (const z of [-0.72, 0.72]) rb.add(box(LOOP + 120, 0.1, 0.12), mat.iron, 0, -0.14, TZ + z);
    for (let x = -LOOP / 2 - 60; x < LOOP / 2 + 60; x += 1.5) rb.add(box(0.25, 0.06, 1.9), mat.iron, x, -0.22, TZ);
    rb.flush(scene);
  }
  const beamMat = R.glow(LAMP, 0.1);
  beamMat.side = THREE.DoubleSide;
  const beam = kit.mesh(new THREE.ConeGeometry(1.5, 16, 10, 1, true).rotateZ(Math.PI / 2), beamMat, scene, 0, 1.6, TZ);
  beam.renderOrder = 2;
  const lampGlow = kit.flare(scene, 0, 1.6, TZ, 0.9);
  lampGlow.mat.color.set(LAMP);
  const tailGlow = kit.flare(scene, 0, 0, 0, 0.6);
  tailGlow.mat.color.set(TAIL);
  for (const f of [lampGlow, tailGlow]) {
    f.g.visible = true;
    f.g.children.forEach((c) => { c.renderOrder = 2; });
  }
  const hornMat = R.glow("#ffffff", 0);
  const horn = kit.mesh(new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2), hornMat, scene, 0, 0.05, TZ);
  horn.renderOrder = 2;

  // spray thrown off the bow and the wheels
  const NS = 96, sprayPos = new Float32Array(NS * 3), spraySeed = Array.from({ length: NS }, () => [rnd(), rnd(), rnd()]);
  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute("position", new THREE.BufferAttribute(sprayPos, 3));
  const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: "#fff4fa", size: 1.4, sizeAttenuation: false }));
  spray.frustumCulled = false;
  scene.add(spray);

  /* ---- eggs ---- */
  let hornT = -99, lightsT = -99, lanternT = -99, sunT = -99, tNow = 0;
  const onTrain = (v: THREE.Vector3, x: number, y: number) => v.set(train.position.x + x, y, TZ);
  const wrap = (v: number, s: number) => ((v % s) + s) % s;

  return {
    scene,
    cam,
    fog: [60, 700],
    fov: [50, 66],
    limits: { pitch: [-0.22, 0.3], zoom: [0.85, 3.2], yaw: 0.25 },
    labels: [
      { name: "Train", sub: `${N} CARS, NO STOPS`, at: (v) => { onTrain(v, HALF - 6, 6); } },
      { name: "Sun", sub: "NOT SETTING", at: (v) => { v.copy(SUN).y += 60; } },
    ],
    eggs: [
      { id: "drift-horn", r: 34, at: (v) => { onTrain(v, HALF - 5, 3); }, fire: (t) => { hornT = t; } },
      { id: "drift-lights", r: 30, at: (v) => { onTrain(v, -PITCH / 2, 3); }, fire: (t) => { lightsT = t; } },
      { id: "drift-lantern", r: 24, at: (v) => { lanterns[0].getWorldPosition(v).y -= 0.45; }, fire: (t) => { lanternT = t; } },
      { id: "drift-sun", r: 50, at: (v) => { v.copy(SUN); }, fire: (t) => { sunT = t; } },
    ],
    update(t) {
      tNow = t;
      for (const s of stones) {
        const y = s.y + Math.sin(t * s.sp + s.ph) * 0.5;
        for (const o of s.pair) {
          o.position.y = y;
          o.rotation.y = t * s.sp * 0.4 + s.ph;
        }
      }

      // The ride: the train runs the line and wraps out of sight.
      const tx = wrap(V * t, LOOP) - LOOP / 2;
      for (const tr of trains) tr.position.set(tx, 0.02 * Math.sin(t * 6.3), TZ);

      // Horn: two blasts of the lamp and a ring running out over the water from the cab.
      const eh = t - hornT, blast = pulse(eh, 0.5) + pulse(eh - 0.7, 0.5);
      lampGlow.g.position.set(tx + HALF + 1, 1.6, TZ);
      lampGlow.mat.opacity = 0.5 + 0.9 * blast;
      lampGlow.g.lookAt(cam.position);
      beam.position.x = tx + HALF + 9;
      beamMat.opacity = 0.12 + 0.22 * blast;
      horn.visible = eh > 0 && eh < 4;
      horn.position.x = tx + HALF - 3;
      horn.scale.setScalar(1 + eh * 16);
      hornMat.opacity = 0.7 * (1 - eh / 4);

      // Lights: they flicker and go out; when they come back the seats are empty, for a while.
      const el = t - lightsT;
      let lamp = 1, seated = true;
      if (el > 0 && el < 5.5) {
        if (el < 0.7) lamp = Math.sin(el * 40) > 0 ? 1 : 0.15;
        else if (el < 2.2) lamp = 0.06;
        else seated = false;
      }
      mat.win.uniforms.uEmit.value = lamp;
      for (const p of paxes) p.visible = seated;

      // Tail lamp: swings on its hook and brightens.
      const et = t - lanternT, swing = et > 0 && et < 7 ? Math.sin(et * 5.5) * 0.7 * Math.exp(-et * 0.7) : 0;
      for (const l of lanterns) l.rotation.z = swing;
      lanterns[0].updateWorldMatrix(true, false);
      tailGlow.g.position.set(0, -0.48, 0).applyMatrix4(lanterns[0].matrixWorld);
      tailGlow.mat.opacity = 0.35 + 0.7 * pulse(et, 2.2);
      tailGlow.g.lookAt(cam.position);

      const es = t - sunT;
      for (const s of [sun, sunM]) s.scale.setScalar(1 + 0.4 * pulse(es, 1.6));
      R.uniforms.flash.value = 0.25 * pulse(es - 0.3, 2);

      for (let i = 0; i < NS; i++) {
        const [a, b, c] = spraySeed[i];
        const ph = (t * (1.1 + a * 0.6) + b) % 1, bow = i < 16;
        const bx = bow ? HALF + 0.6 : bogX[i % bogX.length], side = Math.floor(i / bogX.length) % 2 ? 1 : -1;
        sprayPos[i * 3] = tx + bx + 0.5 - ph * (bow ? 3.5 : 2.2 + c * 1.5);
        sprayPos[i * 3 + 1] = 0.04 + Math.sin(ph * Math.PI) * (bow ? 0.3 + c * 0.7 : 0.15 + c * 0.45);
        sprayPos[i * 3 + 2] = TZ + side * (bow ? 0.3 + ph * (0.8 + a) : D / 2 - 0.1 + ph * (0.4 + a * 0.8));
      }
      sprayGeo.attributes.position.needsUpdate = true;

      // Standing at the water's edge, looking out at the line; drag turns the head, zoom is the lens.
      cam.position.set(Math.sin(t * 0.05) * 2 + view.px * 1.5, 3.4 - view.py * 0.4, 34);
      cam.lookAt(6 + view.px * 6 + Math.sin(t * 0.04) * 2, 4.6 - view.py * 3, TZ);
      kit.look(cam);
      sun.lookAt(cam.position);
      sunM.lookAt(cam.position);
      R.follow(cam);
    },
    readout: () => [
      ["LINE", "OPEN SEA"],
      ["SPEED", `${Math.round(V * 3.6)} km/h`],
      ["DEPTH", `${(0.12 + 0.03 * Math.sin(tNow * 0.4)).toFixed(2)} m`],
      ["BRG", `${kit.pad(Math.round(kit.bearing(cam)), 3)}°`],
      ["TRAIN", Math.abs(train.position.x) < 200 ? "IN SIGHT" : "PAST"],
    ],
  };
}
