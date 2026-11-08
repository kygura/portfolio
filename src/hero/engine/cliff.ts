/** Sheet 09 · Cliffs: a flooded mountain valley, as an early raytracer would
 *  have staged it. A pale tower stands on a round mesa in the middle of a
 *  mirror river and climbs through a cloud ceiling, with long arched bridges
 *  reaching it from slab cliffs at different heights; one has fallen in. A
 *  Titan lies half-sunk in the water, four seal pillars send cyan beams up into
 *  the cloud and the tower's crown bleeds magenta through it. Birds circle the
 *  tower, a small red figure waits on the near bridge, and past the end of the
 *  valley the horizon is clear white.
 *
 *  The palette is fixed (cyan, with magenta for the crown; not the site accent).
 *  Tap where the tower meets the cloud to light it, the Titan to wake it, the
 *  figure to dash. */
import * as THREE from "three";
import { pulse, type PsxKit, type SceneDef, type V3 } from "./psx";
import { createRay, RAY_GLSL } from "./ray";

const PINK = "#ff3ca0", CYAN = "#5ff4ff", RED = "#e8283c";

// The cloud ceiling: drifting fbm, thinned out past a radius so the horizon stays clear,
// with the crown's light leaking through around the tower. Unsnapped: it is one big quad.
const VEIL_V = `varying vec3 vWP; varying float vDepth;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vec4 mv = viewMatrix * wp; gl_Position = projectionMatrix * mv; vDepth = -mv.z; }`;
const VEIL_F = `${RAY_GLSL}
uniform float uTime; uniform vec3 uCol; uniform vec3 uPink; uniform float uAlpha; uniform float uGlow;
varying vec3 vWP; varying float vDepth;
void main(){
  vec3 q = vec3(vWP.xz * 0.006 + uTime * vec2(0.02, 0.012), uTime * 0.01);
  float n = fbm(q + fbm(q * 0.5) * 1.2);
  float r = length(vWP.xz);
  float a = smoothstep(0.38, 0.6, n) * uAlpha * (1.0 - smoothstep(300.0, 760.0, r));
  float ring = exp(-max(r - 8.0, 0.0) * 0.04) * uGlow;
  vec3 c = uCol * (0.9 + n * 0.2) + uPink * ring * 0.8;
  c = mix(c, vec3(1.0), step(vWP.y, cameraPosition.y) * 0.4);
  gl_FragColor = vec4(c, clamp(a + ring * 0.5 * uAlpha, 0.0, 1.0));
}`;

export function buildCliff(kit: PsxKit): SceneDef {
  const { U, rnd, facet } = kit;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(52, 16 / 9, 0.5, 4000);
  const R = createRay(kit, scene, {
    zen: "#063c4c", mid: "#12a6c0", low: "#a6eef2", hor: "#ffffff", fog: "#d4f4f6",
    ice: "#c4f6f8", sea: "#2a7c90", ink: "#06202a", light: [-0.55, 0.5, 0.62],
  });
  R.floor({ fogNear: 220, fogFar: 1200 });

  const mStone = R.flat({ tint: "#f4fcfc", amb: "#0c4656", sun: "#ffffff" });
  const mStone2 = R.flat({ tint: "#c8e8ec", amb: "#0a3a48", sun: "#ffffff" });
  const mCliff = R.flat({ tint: "#84d4e0", amb: "#04323e", sun: "#f0ffff" });
  const mFar = R.flat({ tint: "#b8e8f0", amb: "#3a8a9c", sun: "#e0fcff", fogAmt: 1 });
  const mPine = R.flat({ tint: "#2a7a78", amb: "#04262a", sun: "#c8fff4" });
  const mBone = R.flat({ tint: "#e8f0ec", amb: "#1a4a52", sun: "#ffffff" });
  const mSeal = R.flat({ tint: "#8ab0c0", amb: "#0a2a3a", sun: "#e8fcff" });
  const mCyan = R.flat({ tint: "#000000", amb: "#000000", sun: "#000000", emit: CYAN, emitAmt: 1, fogAmt: 0.2 });
  const mEye = R.flat({ tint: "#000000", amb: "#06202a", sun: "#000000", emit: CYAN, emitAmt: 0, fogAmt: 0.2 });
  const mCloak = R.flat({ tint: RED, amb: "#5a0818", sun: "#ffb0b8", fogAmt: 0.3 });
  const mInk = R.flat({ tint: "#14283a", amb: "#0a1420", sun: "#405870", fogAmt: 0.3 });

  /* Static parts are batched per material, then shown twice: real and mirrored. */
  const b = kit.batcher();
  const flushBoth = () => {
    const g = new THREE.Group();
    b.flush(g);
    R.world.add(g);
    R.mirror.add(g.clone());
  };
  const box = (w: number, h: number, d: number) => facet(new THREE.BoxGeometry(w, h, d));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  const place = (geo: THREE.BufferGeometry, mat: THREE.Material, p: [number, number, number], r: [number, number, number], sc: [number, number, number]) =>
    b.add(geo.clone().applyMatrix4(m4.compose(pv.set(...p), q.setFromEuler(eu.set(...r)), sv.set(...sc))), mat);

  /* ---- the valley: slab cliffs either side, open at the far end to a clear horizon ---- */
  const W = (z: number) => 165 + 26 * Math.sin(z * 0.0065 + 0.8) + 10 * Math.sin(z * 0.019);
  const unit = box(1, 1, 1);
  for (const s of [-1, 1]) {
    for (let row = 0; row < 2; row++) {
      for (let z = 330 - row * 60; z > -520; z -= 50 + rnd() * 40) {
        const h = (70 + row * 70) * (0.7 + rnd() * 0.5), w = 40 + rnd() * 30;
        place(unit, row ? mStone2 : mCliff, [s * (W(z) + 20 + row * 50 + rnd() * 10), h / 2, z], [0, (rnd() - 0.5) * 0.3, 0], [w, h, 60 + rnd() * 30]);
      }
    }
  }
  // Far ranges past the valley's mouth, faded into the haze.
  for (let i = 0; i < 16; i++) {
    const x = (rnd() - 0.5) * 1400, z = -800 - rnd() * 300, h = 60 + rnd() * 120;
    b.add(facet(new THREE.ConeGeometry(h * 0.6, h, 4)), mFar, x, h / 2, z, 0, rnd(), 0);
  }

  /* ---- the mesas and the tower ---- */
  const MESA = 36, BASE = 64, TOP = 450, CEIL = 240;
  const rAt = (y: number) => 10 - (3 * (y - BASE)) / (TOP - BASE);
  b.add(facet(new THREE.CylinderGeometry(30, 34, MESA, 8)), mCliff, 0, MESA / 2, 0, 0, 0.2, 0);
  b.add(facet(new THREE.CylinderGeometry(34, 38, 70, 8)), mCliff, 96, 35, 250, 0, 0.5, 0);
  R.shadow(0, 0, 32, 140, 0.4);
  R.shadow(96, 250, 36, 200, 0.4);
  [[44, 10, MESA + 5], [34, 10, MESA + 15], [24, 8, MESA + 24]].forEach(([w, h, y], i) => b.add(box(w, h, w), i === 1 ? mStone2 : mStone, 0, y, 0));
  b.add(facet(new THREE.CylinderGeometry(rAt(TOP), rAt(BASE), TOP - BASE, 8)), mStone, 0, (BASE + TOP) / 2, 0);
  for (let y = 92; y < TOP; y += 34) b.add(facet(new THREE.CylinderGeometry(rAt(y) + 1.2, rAt(y) + 1.2, 2, 8)), mStone2, 0, y, 0);
  b.add(facet(new THREE.CylinderGeometry(13, rAt(TOP), 7, 8)), mStone2, 0, TOP + 3, 0);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    b.add(facet(new THREE.ConeGeometry(2.2, 24, 4)), mStone, Math.cos(a) * 10.5, TOP + 18, Math.sin(a) * 10.5, Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
  }
  R.shadow(0, 0, 9, 520, 0.35);

  // Cone trees on the near mesa and on a few low islands under the cliffs.
  const pine = facet(new THREE.ConeGeometry(3, 12, 6).translate(0, 6, 0));
  for (let i = 0; i < 12; i++) {
    const a = rnd() * 6.28, r = 8 + rnd() * 22;
    b.add(pine, mPine, 96 + Math.cos(a) * r, 70, 250 + Math.sin(a) * r, 0, rnd(), 0, 0.8 + rnd() * 0.6);
  }
  for (let i = 0; i < 7; i++) {
    const z = -400 + i * 120 + rnd() * 40, s = i % 2 ? 1 : -1, x = s * (W(z) - 6 - rnd() * 20);
    b.add(facet(new THREE.CylinderGeometry(16, 18, 3, 7)), mCliff, x, 1.5, z);
    for (let j = 0; j < 4; j++) b.add(pine, mPine, x + (rnd() - 0.5) * 22, 3, z + (rnd() - 0.5) * 22, 0, rnd(), 0, 0.7 + rnd() * 0.6);
  }

  /* ---- bridges: arched spans on piers, from a cliff block to the shaft ---- */
  const bridge = (sx: number, sz: number, ey: number, gap?: [number, number]) => {
    const sy = ey + 6, a = Math.atan2(sz, sx), er = rAt(ey) + 0.5;
    const ex = Math.cos(a) * er, ez = Math.sin(a) * er;
    const dx = ex - sx, dz = ez - sz, dy = ey - sy, hl = Math.hypot(dx, dz);
    const n = Math.max(3, Math.round(hl / 22)), L = hl / n;
    const ry = Math.atan2(-dz, dx), rz = Math.atan2(dy, hl);
    const at = (u: number, o: V3) => o.set(sx + dx * u, sy + dy * u, sz + dz * u);
    const deck = box(L / Math.cos(rz) + 0.3, 2.6, 6);
    const arch = facet(new THREE.TorusGeometry(L / 2 - 3, 2.2, 4, 8, Math.PI));
    const p = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      const broken = gap && k >= gap[0] && k <= gap[1];
      at((k + 0.5) / n, p);
      if (broken) {
        // Fallen spans lie in the water below.
        for (let j = 0; j < 2; j++) b.add(box(10 + rnd() * 6, 2, 5), mStone2, p.x + (rnd() - 0.5) * 12, 0.6, p.z + (rnd() - 0.5) * 12, rnd() * 0.3, rnd() * 3, rnd() * 0.3);
      } else {
        b.add(deck, mStone, p.x, p.y, p.z, 0, ry, rz);
        b.add(arch, mStone2, p.x, p.y - L / 2 + 0.6, p.z, 0, ry, 0);
      }
      if (k < n - 1) {
        at((k + 1) / n, p);
        const h = broken && gap && k === gap[1] ? p.y * 0.5 : p.y;
        b.add(box(6, h, 7), mStone2, p.x, h / 2, p.z, 0, ry, 0);
      }
    }
    b.add(box(24, sy, 24), mCliff, sx - Math.cos(a) * 10, sy / 2, sz - Math.sin(a) * 10, 0, ry, 0);
    b.add(box(7, 10, 7), mStone2, ex + Math.cos(a) * 2.5, ey + 3.5, ez + Math.sin(a) * 2.5, 0, ry, 0);
    return { at, n, ry, dir: new THREE.Vector3(dx, dy, dz).normalize() };
  };
  const near = bridge(96, 250, 88);
  bridge(-150, -40, 114);
  bridge(165, -170, 142, [5, 7]);
  bridge(-120, -300, 168);

  /* ---- four seal pillars in the water, cyan glyphs and caps, beams into the ceiling ---- */
  const caps: THREE.Mesh[] = [];
  const beams: THREE.MeshBasicMaterial[] = [];
  const glyph = box(1.6, 3, 0.3);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, x = Math.cos(a) * 58, z = Math.sin(a) * 58;
    b.add(box(7, 2, 7), mSeal, x, 1, z, 0, -a, 0);
    b.add(box(3.4, 30, 3.4), mSeal, x, 16, z, 0, -a, 0);
    b.add(facet(new THREE.ConeGeometry(2.4, 3, 4)), mSeal, x, 32.5, z, 0, -a + Math.PI / 4, 0);
    for (let j = 0; j < 4; j++) b.add(glyph, mCyan, x - Math.cos(a) * 1.8, 7 + j * 5.5, z - Math.sin(a) * 1.8, 0, Math.PI / 2 - a, 0);
    caps.push(...R.add(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: CYAN }), x, 37, z, 0, 0, 0, 1.2));
    const m = R.glow(CYAN, 0.16);
    beams.push(m);
    kit.mesh(new THREE.CylinderGeometry(0.5, 0.5, CEIL - 37, 5, 1, true), m, scene, x, (CEIL + 37) / 2, z);
    R.shadow(x, z, 2, 50, 0.4);
  }
  flushBoth();

  /* ---- the Titan, half-sunk: skull, horns, ribs and one arm out of the water ---- */
  const titanEye = new THREE.Vector3();
  const titans = R.both(() => {
    const g = new THREE.Group();
    const tb = kit.batcher();
    tb.add(box(14, 11, 15), mBone, 0, 5, 0);
    tb.add(box(11, 4, 9), mBone, 0, -0.5, 6, 0.3);
    tb.add(facet(new THREE.ConeGeometry(1.6, 12, 4)), mBone, -7, 13, -1, 0, 0, 0.6);
    tb.add(facet(new THREE.ConeGeometry(1.6, 10, 4)), mBone, 7, 12, -1, 0, 0, -0.75);
    for (let r = 0; r < 5; r++) tb.add(facet(new THREE.TorusGeometry(9 - r * 0.7, 0.8, 4, 8, Math.PI)), mBone, 0, -1, -12 - r * 5, 0, Math.PI / 2, 0);
    tb.add(facet(new THREE.CylinderGeometry(1.8, 2.3, 16, 6)), mBone, 18, 4, 4, 0, 0, -0.5);
    tb.add(box(4, 3, 4), mBone, 22.5, 11, 4);
    [-3.2, 3.2].forEach((ex) => tb.add(box(3, 1.4, 0.6), mEye, ex, 6.5, 7.6));
    tb.flush(g);
    g.position.set(-56, -8, 60);
    g.rotation.set(0.1, 0.6, 0.25);
    g.scale.setScalar(2);
    return g;
  });

  /* ---- the crown: a magenta cell over the horns, a beam up, light into the cloud ---- */
  const CELL = new THREE.Vector3(0, TOP + 32, 0);
  const cell = kit.mesh(new THREE.OctahedronGeometry(3, 0).scale(1, 1.7, 1), new THREE.MeshBasicMaterial({ color: PINK }), scene, CELL.x, CELL.y, CELL.z);
  const haloMat = R.glow(PINK, 0.3);
  const halo = new THREE.Group();
  halo.position.copy(CELL);
  [9, 20].forEach((r) => halo.add(new THREE.Mesh(new THREE.CircleGeometry(r, 16), haloMat)));
  scene.add(halo);
  const beamMat = R.glow(PINK, 0.1);
  kit.mesh(new THREE.CylinderGeometry(1.4, 1.4, 900, 6, 1, true), beamMat, scene, 0, CELL.y + 450, 0);

  const glowU = { value: 0.35 };
  const veil = (y: number, col: string, alpha: number, order: number) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...R.uniforms.sky, uTime: U.uTime, uCol: { value: new THREE.Color(col) }, uPink: { value: new THREE.Color(PINK) }, uAlpha: { value: alpha }, uGlow: glowU },
      vertexShader: VEIL_V, fragmentShader: VEIL_F, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    kit.mesh(new THREE.PlaneGeometry(2400, 2400), m, scene, 0, y, -150, -Math.PI / 2).renderOrder = order;
  };
  veil(CEIL, "#e8f8fa", 0.8, 6);
  veil(CEIL + 18, "#ffffff", 0.5, 7);

  /* ---- the figure on the near bridge ---- */
  const drifterAt = near.at(0.22, new THREE.Vector3());
  drifterAt.y += 0.9;
  const figure = (mats: THREE.Material[]) => {
    const g = new THREE.Group();
    kit.mesh(facet(new THREE.ConeGeometry(0.42, 1.0, 5)), mats[0], g, 0, 0.5, 0);
    kit.mesh(facet(new THREE.BoxGeometry(0.34, 0.3, 0.32)), mats[1], g, 0, 1.12, 0);
    kit.mesh(new THREE.BoxGeometry(0.05, 0.05, 0.8), mats[2], g, 0.32, 0.55, 0.3, -0.5);
    g.scale.setScalar(2.4);
    g.rotation.y = near.ry - Math.PI / 2;
    scene.add(g);
    return g;
  };
  const drifter = figure([mCloak, mInk, mCyan]);
  drifter.position.copy(drifterAt);
  const ghostMat = R.glow(CYAN, 0);
  const ghosts = [0, 1, 2].map(() => figure([ghostMat, ghostMat, ghostMat]));

  /* ---- birds circling the tower ---- */
  const BIRDS = 16;
  const birdPos = new Float32Array(BIRDS * 4 * 3);
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute("position", new THREE.BufferAttribute(birdPos, 3));
  const birdMat = kit.lineMat({ value: new THREE.Color("#0a2a36") }, 500);
  birdMat.uniforms.uFogColor = R.uniforms.fog;
  const birdLines = new THREE.LineSegments(birdGeo, birdMat);
  birdLines.frustumCulled = false;
  scene.add(birdLines);
  const bird = Array.from({ length: BIRDS }, () => ({
    r: 26 + rnd() * 50, y: 130 + rnd() * 80, w: (0.1 + rnd() * 0.12) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6.28,
  }));

  /* ---- eggs ---- */
  const PIERCE = new THREE.Vector3(0, CEIL, 0);
  let surgeT = -99, titanT = -99, dashT = -99;
  const eggs = [
    { id: "cliff-spire", r: 40, at: (o: V3) => o.copy(PIERCE), fire: (t: number) => { surgeT = t; } },
    { id: "cliff-titan", r: 34, at: (o: V3) => o.copy(titanEye), fire: (t: number) => { titanT = t; } },
    { id: "cliff-drifter", r: 22, at: (o: V3) => o.copy(drifterAt).setY(drifterAt.y + 1.5), fire: (t: number) => { dashT = t; } },
  ];

  /* ---- camera: high over the valley's mouth, looking up the near bridge to the tower ---- */
  const view = kit.view;
  const pivotWide = new THREE.Vector3(0, 122, 0);
  // Portrait crops the sides; aim a little higher so the ceiling and the crossing stay in frame.
  const pivotTall = new THREE.Vector3(0, 138, 0);
  const base = new THREE.Vector3(50, 28, 400);
  const ZOOM_MIN = 0.45, FOG: [number, number] = [120, 1100];
  const fog: [number, number] = [...FOG];
  const pivot = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const nearMid = near.at(0.5, new THREE.Vector3());
  let tNow = 0;

  return {
    scene,
    cam,
    fog,
    fov: [52, 72],
    limits: { pitch: [-0.35, 0.12], zoom: [ZOOM_MIN, 2.6], yaw: 0.55 },
    labels: [
      { name: "Spire", sub: "THROUGH THE VEIL", at: (o) => o.copy(PIERCE).setY(PIERCE.y + 14) },
      { name: "Bridge", sub: `${near.n} SPANS`, at: (o) => o.copy(nearMid).setY(nearMid.y + 8) },
      { name: "Titan", sub: "FALLEN", at: (o) => o.copy(titanEye).setY(titanEye.y + 14) },
    ],
    eggs,
    update(t) {
      tNow = t;
      const es = pulse(t - surgeT, 5), et = pulse(t - titanT, 3), ed = pulse(t - dashT, 0.8);

      // The crown: a slow breath, and a surge on tap that floods the ceiling and the seals.
      const breath = 0.5 + 0.5 * Math.sin(t * 0.9);
      glowU.value = 0.3 + breath * 0.12 + es * 1.4;
      beamMat.opacity = 0.08 + breath * 0.04 + es * 0.4;
      haloMat.opacity = 0.2 + breath * 0.1 + es * 0.4;
      halo.quaternion.copy(cam.quaternion);
      cell.rotation.y = t * 0.4;
      cell.position.y = CELL.y + Math.sin(t * 0.6) * 1.2;
      beams.forEach((m, i) => { m.opacity = 0.14 + 0.05 * Math.sin(t * 1.6 + i) + es * 0.3; });
      caps.forEach((m, i) => { m.rotation.y = t * 0.8 + i; });
      mCyan.uniforms.uEmit.value = 0.9 + es * 0.6;

      // Titan wakes: eyes flare cyan, head lifts a little.
      mEye.uniforms.uEmit.value = 0.15 + et * 1.4;
      for (const g of titans) g.rotation.x = 0.1 - et * 0.06;
      titans[0].updateMatrixWorld();
      titanEye.set(0, 6.5, 7.6).applyMatrix4(titans[0].matrixWorld);

      // The figure dashes up the bridge and back, leaving afterimages.
      const step = ed * 7;
      drifter.position.copy(drifterAt).addScaledVector(near.dir, step);
      ghosts.forEach((g, i) => {
        g.visible = ed > 0.02;
        g.position.copy(drifterAt).addScaledVector(near.dir, step * (1 - (i + 1) * 0.28));
      });
      ghostMat.opacity = ed * 0.35;

      bird.forEach((g, i) => {
        const a = g.ph + t * g.w, x = Math.cos(a) * g.r, z = Math.sin(a) * g.r, y = g.y + Math.sin(t * 0.5 + i) * 3;
        const dx = -Math.sin(a) * Math.sign(g.w), dz = Math.cos(a) * Math.sign(g.w);
        const flap = Math.sin(t * 5 + i * 2) * 0.5, sx = -dz * 1.3, sz = dx * 1.3;
        birdPos.set([x + sx, y + 0.4 + flap, z + sz, x, y, z, x, y, z, x - sx, y + 0.4 + flap, z - sz], i * 12);
      });
      birdGeo.attributes.position.needsUpdate = true;

      // Zooming out cranes up as well as back: past the ceiling the valley becomes a sea of
      // cloud with the tower standing out of it. Fog recedes with the camera.
      const lift = THREE.MathUtils.clamp((1 - view.zoom) / (1 - ZOOM_MIN), 0, 1);
      const ang = view.yaw + Math.sin(t * 0.03) * 0.05 + view.px * 0.2;
      pivot.copy(cam.aspect < 1 ? pivotTall : pivotWide);
      pivot.y += lift * 180;
      tmp.copy(base).applyAxisAngle(THREE.Object3D.DEFAULT_UP, ang);
      tmp.y += lift * 60;
      cam.position.copy(pivot).add(tmp);
      cam.position.y -= view.py * 2;
      cam.lookAt(pivot);
      kit.orbit(cam, pivot);
      cam.position.y = Math.max(cam.position.y, 14);
      const k = Math.max(1, 1 / view.zoom);
      fog[0] = FOG[0] * k;
      fog[1] = FOG[1] * k;
      R.follow(cam);
    },
    readout: () => {
      const surge = pulse(tNow - surgeT, 5) > 0.05;
      return [
        ["ALT", `${Math.round(cam.position.y * 9.5).toLocaleString("en-US")} m`],
        ["MIST", `${Math.round(62 + 8 * Math.sin(tNow * 0.07))}%`],
        ["CEILING", "2,280 m"],
        ["BEARING", `${kit.pad(Math.round(kit.bearing(cam)), 3)}°`],
        ["SPIRE", surge ? "LIT" : "DORMANT"],
      ];
    },
  };
}
