/** Sheet 03 · Astral: a night still life over a mirror sea. A chrome halo ring
 *  stands tilted over the water with six small chrome glyphs circling it and
 *  a chrome core turning inside two gimballed rings. Wireframe and chrome
 *  polyhedra drift around it, a star tetrahedron hangs to one side, a great
 *  flat eye watches from the sky, and a chrome moon carries a satellite.
 *  Indigo zenith down to a lilac haze, a sparse sprinkle of stars, and
 *  everything doubled in the water.
 *
 *  The night follows the site palette: the hand-set look below is Iris's, and
 *  any other palette turns it round to its own deep accent (Graphite goes grey).
 *  Tap the core to spin it, the eye to blink, the satellite to send it round,
 *  the star tetrahedron to counter-turn it, the moon to lift it. */
import * as THREE from "three";
import { burst, pulse, type PsxKit, type SceneDef } from "./psx";
import { createRay } from "./ray";

export function buildAstral(k: PsxKit): SceneDef {
  const { rnd, facet, view, circle } = k;
  const PIVOT = new THREE.Vector3(0, 11, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 420);
  const R = createRay(k, scene, {
    zen: "#06051a", mid: "#2b1766", low: "#8c76cc", hor: "#ecdff8", fog: "#bfaee0",
    ice: "#7462c4", sea: "#1a1248", ink: "#0d0824", light: [-0.55, 0.5, 0.45],
  });
  // A calmer, glassier sea than the kit's default, so the night doubles in it.
  const sea = R.floor({ fogNear: 60, fogFar: 280, flow: 0.5 }).material as THREE.ShaderMaterial;
  sea.fragmentShader = sea.fragmentShader.replace("vec4(c, mix(a, 1.0, fg))", "vec4(c, mix(a * 0.72, 1.0, fg))");

  // Stars: a sparse sprinkle high in the dome, riding with the camera like the sky.
  const starPos: number[] = [];
  for (let i = 0; i < 160; i++) {
    const az = rnd() * Math.PI * 2, el = 0.28 + Math.pow(rnd(), 0.7) * 1.25;
    starPos.push(Math.cos(az) * Math.cos(el) * 180, Math.sin(el) * 180, Math.sin(az) * Math.cos(el) * 180);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: "#f2eaff", size: 1.5, sizeAttenuation: false, depthWrite: false, transparent: true });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = 0;
  scene.add(stars);

  const chrome = R.chrome({ marble: 0.55, scale: 1.4, tint: "#e4dcf6" });
  const clean = R.chrome({ marble: 0.15, scale: 2.2, tint: "#ece4ff" });
  // Night chrome reflects a dark sky; push it past white so it still reads as polished metal.
  chrome.uniforms.uTint.value.setRGB(1.55, 1.45, 1.75);
  clean.uniforms.uTint.value.setRGB(1.7, 1.6, 1.9);
  const mDark = R.flat({ tint: "#3a2a78", amb: "#0c0726", sun: "#b4a0ec", fogAmt: 0.6 });
  const mRing = R.flat({ tint: "#c8b8f0", amb: "#3e2c8a", sun: "#f0e6ff", fogAmt: 0.5 });
  const lilac = k.lineMat({ value: new THREE.Color("#efe4ff") }, 160);
  const violet = k.lineMat({ value: new THREE.Color("#a98cf0") }, 160);
  for (const m of [lilac, violet]) m.uniforms.uFogColor = R.uniforms.fog;

  /** A pair (real + reflection) built by `make`, placed at p; both copies are returned for animation. */
  const pair = (make: () => THREE.Object3D, x: number, y: number, z: number) => {
    const [a, b] = R.both(make);
    a.position.set(x, y, z);
    b.position.set(x, y, z);
    return [a, b] as const;
  };
  const sync = (ps: readonly THREE.Object3D[]) => {
    ps[1].position.copy(ps[0].position);
    ps[1].quaternion.copy(ps[0].quaternion);
    ps[1].scale.copy(ps[0].scale);
  };

  /* ---- halo: a chrome ring with tick blocks every 30°, six glyphs circling it ---- */
  const HR = 11.5;
  const halo = pair(() => {
    const g = new THREE.Group();
    g.rotation.set(Math.PI / 2 - 0.45, 0, 0.2);
    const spin = new THREE.Group();
    spin.name = "spin";
    g.add(spin);
    spin.add(new THREE.Mesh(new THREE.TorusGeometry(HR, 0.5, 6, 72), mRing));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, tick = new THREE.Mesh(new THREE.BoxGeometry(i % 3 ? 0.9 : 1.8, 0.3, 0.3), mRing);
      tick.position.set(Math.cos(a) * (HR + (i % 3 ? 0.7 : 1.1)), Math.sin(a) * (HR + (i % 3 ? 0.7 : 1.1)), 0);
      tick.rotation.z = a;
      spin.add(tick);
    }
    spin.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(circle(HR - 1.4, 96)), violet));
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), i % 2 ? mRing : clean);
      m.name = "glyph";
      g.add(m);
    }
    return g;
  }, PIVOT.x, PIVOT.y, PIVOT.z);
  const spins = halo.map((h) => h.getObjectByName("spin") as THREE.Group);
  const glyphs = halo.map((h) => h.children.filter((c) => c.name === "glyph"));
  const glyphDef = Array.from({ length: 6 }, (_, i) => ({ off: (i / 6) * Math.PI * 2, sp: 0.06 + (i % 3) * 0.025, r: HR + (i % 2 ? 1.1 : -0.9) }));

  /* ---- core: a chrome icosahedron inside two gimballed flat rings ---- */
  const core = R.add(facet(new THREE.IcosahedronGeometry(2, 0)), clean, PIVOT.x, PIVOT.y, PIVOT.z);
  const armillary = [3.4, 4.3].flatMap((r, i) =>
    R.add(new THREE.TorusGeometry(r, 0.16, 4, 48), mRing, PIVOT.x, PIVOT.y, PIVOT.z, i * 1.1, i * 0.7, 0).map((m) => ({ m, i })),
  );

  /* ---- polyhedra: two chrome solids, three wireframes around a dark core ---- */
  const wire = (geo: THREE.BufferGeometry, line: THREE.Material) => () => {
    const g = new THREE.Group();
    const c = new THREE.Mesh(facet(geo.clone()), mDark);
    c.scale.setScalar(0.9);
    g.add(c, new THREE.LineSegments(new THREE.EdgesGeometry(geo), line));
    return g;
  };
  const polyDefs: [() => THREE.Object3D, number, number, number][] = [
    [wire(new THREE.IcosahedronGeometry(2.6, 0), lilac), -16, 15, -6],
    [() => new THREE.Mesh(facet(new THREE.OctahedronGeometry(2.1, 0)), chrome), 15, 17, -10],
    [wire(new THREE.DodecahedronGeometry(1.9, 0), violet), 13, 6, 7],
    [() => new THREE.Mesh(facet(new THREE.TetrahedronGeometry(2.1, 0)), chrome), -13, 6, 6],
    [wire(new THREE.IcosahedronGeometry(1.4, 1), lilac), -7, 25, 12],
  ];
  const polys = polyDefs.map(([make, x, y, z]) => ({ ps: pair(make, x, y, z), y, sx: 0.05 + rnd() * 0.12, sy: 0.08 + rnd() * 0.15, bob: rnd() * 6 }));

  /* ---- star tetrahedron: chrome and wire halves, counter-turning on a tap ---- */
  const tetra = new THREE.TetrahedronGeometry(2.6, 0);
  const stella = pair(() => {
    const g = new THREE.Group();
    const a = new THREE.Mesh(facet(tetra.clone()), chrome);
    const b = new THREE.Group();
    b.add(new THREE.Mesh(facet(tetra.clone()), mDark), new THREE.LineSegments(new THREE.EdgesGeometry(tetra), lilac));
    b.children[0].scale.setScalar(0.92);
    b.rotation.y = Math.PI / 2;
    a.name = "a";
    b.name = "b";
    g.add(a, b);
    return g;
  }, 8, 7, -15);
  const stellaHalves = stella.map((s) => [s.getObjectByName("a")!, s.getObjectByName("b")!]);

  /* ---- the watcher: a flat almond eye with a chrome pupil and a crown of rays ---- */
  const lid = new THREE.Shape();
  lid.moveTo(-10, 0);
  lid.quadraticCurveTo(0, 8.5, 10, 0);
  lid.quadraticCurveTo(0, -8.5, -10, 0);
  const eyeWhite = new THREE.MeshBasicMaterial({ color: "#efe6ff" });
  const eyeIris = new THREE.MeshBasicMaterial({ color: "#3b1f8a" });
  const eyeRay = new THREE.MeshBasicMaterial({ color: "#b8a2ee", side: THREE.DoubleSide });
  const watcher = pair(() => {
    const g = new THREE.Group();
    const lids = new THREE.Group();
    lids.name = "lids";
    g.add(lids);
    lids.add(new THREE.Mesh(new THREE.ShapeGeometry(lid, 12), eyeWhite));
    const iris = new THREE.Mesh(new THREE.CircleGeometry(3.1, 20), eyeIris);
    iris.position.z = 0.1;
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12), clean);
    pupil.position.z = 0.4;
    lids.add(iris, pupil);
    g.add(new THREE.Mesh(new THREE.RingGeometry(11, 11.8, 40), eyeRay));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r0 = 11.8, r1 = i % 2 ? 14.5 : 17.5, w = 1.3;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(Math.cos(a - w / r0) * r0, Math.sin(a - w / r0) * r0, 0),
        new THREE.Vector3(Math.cos(a + w / r0) * r0, Math.sin(a + w / r0) * r0, 0),
        new THREE.Vector3(Math.cos(a) * r1, Math.sin(a) * r1, 0),
      ]);
      g.add(new THREE.Mesh(geo, eyeRay));
    }
    g.scale.setScalar(1.15);
    return g;
  }, 4, 40, -50);
  const lids = watcher.map((w) => w.getObjectByName("lids")!);

  /* ---- moon: a chrome sphere with a satellite on a tilted orbit ---- */
  const MOON = new THREE.Vector3(-30, 24, -30);
  const moon = R.add(new THREE.SphereGeometry(5, 40, 28), chrome, MOON.x, MOON.y, MOON.z);
  const orbit = pair(() => {
    const o = new THREE.Group();
    o.rotation.set(1.15, 0.3, 0);
    o.add(new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.08, 3, 64), mRing));
    const sat = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), clean);
    sat.name = "sat";
    o.add(sat);
    return o;
  }, MOON.x, MOON.y, MOON.z);
  const sats = orbit.map((o) => o.getObjectByName("sat")!);

  // A few far pyramids on the horizon so the sea has scale.
  const mFar = R.flat({ tint: "#9a88d0", amb: "#2a1c66", sun: "#d8ccf4", fogAmt: 1 });
  const shadowMats = new Set<THREE.MeshBasicMaterial>();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.6, r = 150 + rnd() * 60, h = 6 + rnd() * 10;
    R.add(facet(new THREE.ConeGeometry(h * 0.32, h, 4)), mFar, Math.cos(a) * r, h / 2, Math.sin(a) * r, 0, rnd(), 0);
    shadowMats.add(R.shadow(Math.cos(a) * r, Math.sin(a) * r, h * 0.3, h * 5, 0.35).material as THREE.MeshBasicMaterial);
  }

  /* ---- palette ----
     Every colour above is Iris's look. Another palette turns each one round the
     wheel by the gap between its deep accent and Iris's, and mutes it to match
     a quieter accent. Lightness stays, so the night stays a night. */
  const sky = R.uniforms.sky;
  const flatCols = (m: THREE.ShaderMaterial) => [m.uniforms.uTint.value, m.uniforms.uAmbient.value, m.uniforms.uSun.value] as THREE.Color[];
  const cols: THREE.Color[] = [
    sky.uZen.value, sky.uMid.value, sky.uLow.value, sky.uHor.value,
    R.uniforms.fog.value, R.uniforms.ice.value, R.uniforms.sea.value, R.uniforms.ink.value,
    starMat.color, chrome.uniforms.uTint.value, clean.uniforms.uTint.value,
    ...flatCols(mDark), ...flatCols(mRing), ...flatCols(mFar),
    lilac.uniforms.uColor.value, violet.uniforms.uColor.value,
    eyeWhite.color, eyeIris.color, eyeRay.color,
    ...[...shadowMats].map((m) => m.color),
  ];
  const base = cols.map((c) => c.clone());
  const IRIS = new THREE.Color("#5543b0").getHSL({ h: 0, s: 0, l: 0 });
  const hueGap = (a: number, b: number) => ((((a - b) % 1) + 1.5) % 1) - 0.5;
  const hsl = { h: 0, s: 0, l: 0 };
  let applied = -1;
  const recolour = () => {
    const deep = k.U.uAccent2.value;
    if (deep.getHex() === applied) return;
    applied = deep.getHex();
    deep.getHSL(hsl);
    const grey = hsl.s < 0.05;
    const dh = grey ? 0 : hueGap(hsl.h, IRIS.h);
    const sk = grey ? 0 : Math.max(0.45, Math.min(1, hsl.s / IRIS.s));
    cols.forEach((c, i) => {
      // The chrome tints run past white; turn their hue at unit brightness, then scale back.
      const b = base[i], top = Math.max(1, b.r, b.g, b.b);
      c.copy(b).multiplyScalar(1 / top).getHSL(hsl);
      c.setHSL((((hsl.h + dh) % 1) + 1) % 1, Math.min(1, hsl.s * sk), hsl.l).multiplyScalar(top);
    });
  };

  const dir = new THREE.Vector3();
  let tCore = -99, tWatch = -99, tSat = -99, tMoon = -99, tStella = -99;

  return {
    scene, cam, fog: [80, 260], fov: [60, 72], limits: { pitch: [-0.12, 0.8], zoom: [0.5, 1.6] },
    labels: [
      { name: "Halo", sub: "r 11.5 · 360°", at: (v) => { v.set(HR + 1.6, 0, 0); halo[0].localToWorld(v); } },
      { name: "Watcher", sub: "fixed, faces observer", at: (v) => { v.set(0, 16, 0); watcher[0].localToWorld(v); } },
      { name: "Moon", sub: "1 satellite", at: (v) => { v.copy(MOON).y += 6.5; } },
      { name: "Icosahedron", sub: "20 faces", at: (v) => { v.copy(polys[0].ps[0].position).y += 3.2; } },
    ],
    eggs: [
      { id: "astral-core", r: 38, at: (v) => { v.copy(PIVOT); }, fire: (t) => { tCore = t; } },
      { id: "astral-watcher", r: 48, at: (v) => { v.copy(watcher[0].position); }, fire: (t) => { tWatch = t; } },
      { id: "astral-satellite", r: 30, at: (v) => { sats[0].getWorldPosition(v); }, fire: (t) => { tSat = t; } },
      { id: "astral-stella", r: 32, at: (v) => { v.copy(stella[0].position); }, fire: (t) => { tStella = t; } },
      { id: "astral-moon", r: 46, at: (v) => { v.copy(moon[0].position); }, fire: (t) => { tMoon = t; } },
    ],
    update(t) {
      recolour();
      const a = 1.4 + t * 0.02 + view.px * 0.2 + view.yaw, r = 38;
      cam.position.set(Math.cos(a) * r, 6.5 + Math.sin(t * 0.09) * 1.5 - view.py * 3, Math.sin(a) * r);
      cam.lookAt(0, PIVOT.y + 1 - view.py * 2, 0);
      k.orbit(cam, PIVOT);
      if (cam.position.y < 1) cam.position.y = 1;

      for (const s of spins) s.rotation.z = t * 0.02;
      glyphs.forEach((gs) => gs.forEach((m, i) => {
        const g = glyphDef[i], ga = g.off + t * g.sp;
        m.position.set(Math.cos(ga) * g.r, Math.sin(ga) * g.r, 0);
        m.rotation.set(t * 0.7, t * 0.5, 0);
      }));

      const ec = burst(t - tCore, 7, 3.5);
      core[0].rotation.set(t * 0.1 + ec, t * 0.13 + ec * 0.7, 0);
      sync(core);
      armillary.forEach(({ m, i }) => { m.rotation.z = t * (i ? -0.1 : 0.07) + ec * 0.4; });
      R.uniforms.flash.value = 0.2 * pulse(t - tCore, 1.2) + 0.25 * pulse(t - tMoon - 0.3, 1.6);

      polys.forEach((p) => {
        p.ps[0].rotation.set(t * p.sx, t * p.sy, 0);
        p.ps[0].position.y = p.y + Math.sin(t * 0.3 + p.bob) * 0.5;
        sync(p.ps);
      });

      const es = burst(t - tStella, 6, 3);
      stella[0].rotation.set(t * 0.05, t * 0.09, 0);
      stella[0].position.y = 7 + Math.sin(t * 0.25 + 1.3) * 0.5;
      sync(stella);
      for (const [h0, h1] of stellaHalves) {
        h0.rotation.y = es;
        h1.rotation.y = Math.PI / 2 - es;
      }

      watcher[0].lookAt(cam.position);
      watcher[0].rotateZ(t * 0.01);
      sync(watcher);
      const ew = t - tWatch, blink = 1 - 0.95 * Math.max(pulse(ew, 0.35), pulse(ew - 0.5, 0.35));
      for (const l of lids) l.scale.y = blink;

      const em = t - tMoon;
      moon[0].rotation.y = t * 0.02 + burst(em, 3, 3);
      moon[0].position.y = MOON.y + 2.2 * pulse(em, 2.4);
      sync(moon);
      orbit[0].position.copy(moon[0].position);
      sync(orbit);
      const sa = t * 0.25 + burst(t - tSat, 5, 3);
      for (const s of sats) {
        s.position.set(Math.cos(sa) * 8.5, Math.sin(sa) * 8.5, 0);
        s.rotation.y = t;
      }

      stars.position.copy(cam.position);
      starMat.opacity = 0.75 + 0.25 * Math.sin(t * 1.3);
      R.follow(cam);
    },
    readout() {
      const b = k.bearing(cam), ra = b / 15, h = Math.floor(ra), m = Math.floor((ra - h) * 60);
      cam.getWorldDirection(dir);
      const dec = (Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180) / Math.PI;
      return [
        ["RA", `${k.pad(h)}h ${k.pad(m)}m`],
        ["Dec", `${dec < 0 ? "−" : "+"}${k.pad(Math.abs(dec).toFixed(1), 4)}°`],
        ["Epoch", "J2026.8"],
        ["Brg", `${k.pad(Math.round(b), 3)}°`],
        ["Field", "60′"],
      ];
    },
  };
}
