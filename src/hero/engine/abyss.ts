/** Sheet 08 · Abyss: a sunken chamber in the early raytracer look. A faceted
 *  rose-chrome crystal hangs over a stepped rhombus dais on flooded checker
 *  paving, held by black roots from the vault that also crawl out across the
 *  floor, pink light pulsing along them like a slow heartbeat. Four seal
 *  pillars stand at the cardinal points with cyan glyphs and beams; a titan's
 *  head and arm lie half-sunk as plain blocks and cylinders, with ribs, broken
 *  columns and stasis tubes around, and a small red-cloaked figure on the dais.
 *  The vault is a gradient dome: black-violet overhead, deep magenta, a hot
 *  pink band and a pale pink glow at the waterline.
 *
 *  The palette is fixed (not the site accent).
 *  Tap the crystal for a vision, the titan's eyes to wake them, the figure to dash. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pulse, type PsxKit, type SceneDef, type V3 } from "./psx";
import { createRay, SNAP } from "./ray";

const P = { pink: "#ff2f8f", pinkHot: "#ffc2e2", cyan: "#4ff0e0", red: "#e0324f", root: "#120a18" };

const ROOT_V = `
uniform vec2 uSnap; uniform vec3 uCore;
attribute float aDist; attribute float aSeed;
varying float vDist; varying float vSeed; varying float vLit; varying float vDepth;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vec3 tl = uCore - wp.xyz; float d = length(tl);
  vLit = max(dot(n, tl / d), 0.0) * 6.0 / (1.0 + d * d * 0.05) + max(n.y, 0.0) * 0.12;
  vDist = aDist; vSeed = aSeed;
  vec4 mv = viewMatrix * wp; vec4 p = projectionMatrix * mv;
  ${SNAP}
  gl_Position = p; vDepth = -mv.z;
}`;
// Black roots, lit pink toward the crystal, with pulses running outward along them.
const ROOT_F = `
uniform float uTime; uniform float uBeat; uniform float uSurge; uniform vec3 uBase; uniform vec3 uPink; uniform vec3 uFog;
uniform float uFogNear; uniform float uFogFar;
varying float vDist; varying float vSeed; varying float vLit; varying float vDepth;
void main(){
  vec3 c = uBase * (0.6 + vLit) + uPink * vLit * 0.08;
  float vein = smoothstep(0.8, 1.0, fract((vDist - uTime * (4.0 + uSurge * 10.0)) / 9.0 + vSeed));
  c += uPink * (vein * exp(-vDist * 0.035) * (0.9 + uSurge) + exp(-vDist * 0.16) * (0.35 + uBeat * 0.65));
  gl_FragColor = vec4(mix(c, uFog, smoothstep(uFogNear, uFogFar, vDepth) * 0.9), 1.0);
}`;

export function buildAbyss(kit: PsxKit): SceneDef {
  const { U, rnd, facet } = kit;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 400);
  const SKY = { zen: "#0b0414", mid: "#4e0a44", low: "#e8308c", hor: "#ffd2e8" };
  const R = createRay(kit, scene, {
    ...SKY, fog: "#c86a9e", ice: "#3c1a3e", sea: "#0c050f", ink: "#040108", light: [0.45, 0.7, 0.55],
  });
  // Flooded paving: a touch glassier than the kit's checker so the chamber doubles in it.
  const paving = R.floor({ checker: 2.4, fogNear: 22, fogFar: 95 }).material as THREE.ShaderMaterial;
  paving.fragmentShader = paving.fragmentShader.replace("vec4(c, mix(a, 1.0, fg))", "vec4(c, mix(a * 0.75, 1.0, fg))");
  const skyBase = Object.fromEntries(Object.entries(SKY).map(([k, v]) => [k, new THREE.Color(v)]));

  const CORE = new THREE.Vector3(0, 6.2, 0);
  const beatU = { value: 0 }, surgeU = { value: 0 };
  const DAIS = 1.48, SEAL_R = 13.5;

  const dark = { amb: "#2c0c3c", sun: "#ffd0e6", fogAmt: 0.7 };
  const mStone = R.flat({ tint: "#94749e", ...dark });
  const mDais = R.flat({ tint: "#e2c8dc", ...dark });
  const mTitan = R.flat({ tint: "#8a6a86", ...dark });
  const mBone = R.flat({ tint: "#e8d8e4", ...dark });
  const mInk = R.flat({ tint: "#2a1830", amb: "#0a040c", sun: "#806080" });
  const mCloak = R.flat({ tint: P.red, amb: "#4a0c1c", sun: "#ffb0b8", fogAmt: 0.3 });
  const cyan = new THREE.MeshBasicMaterial({ color: P.cyan });
  const crystalMat = R.chrome({ tint: "#ff8cc6", marble: 0.25, scale: 1.2, ink: "#3a0626" });
  crystalMat.uniforms.uTint.value.setRGB(1.9, 0.75, 1.3);
  // The crystal lights itself: a rose glow under the chrome that swells with the heartbeat.
  crystalMat.uniforms.uBeat = beatU;
  crystalMat.fragmentShader = "uniform float uBeat;\n" + crystalMat.fragmentShader.replace(
    "gl_FragColor = vec4(c, 1.0);", "gl_FragColor = vec4(c + vec3(0.62, 0.06, 0.32) * (0.55 + 0.6 * uBeat), 1.0);");
  const box = (w: number, h: number, d: number) => facet(new THREE.BoxGeometry(w, h, d));
  const glow = (c: string, o: number) => R.glow(c, o);

  /* ---- rhombus dais ---- */
  R.add(box(9.5, 0.7, 9.5), mStone, 0, 0.35, 0, 0, Math.PI / 4);
  R.add(box(6.6, 0.5, 6.6), mDais, 0, 0.95, 0, 0, Math.PI / 4);
  R.add(box(3.4, 0.3, 3.4), mDais, 0, 1.33, 0, 0, Math.PI / 4);
  R.shadow(0, 0, 4.5, 16, 0.45);

  /* ---- the four seals: pillar, pyramid cap, a cyan gem, a beam to the vault, glyphs on the inward face ---- */
  const V2 = THREE.Vector2;
  const diamond = new THREE.ShapeGeometry(new THREE.Shape([new V2(0, 0.62), new V2(0.42, 0), new V2(0, -0.62), new V2(-0.42, 0)]));
  const beamMat = glow(P.cyan, 0.22);
  const gems: (readonly [THREE.Mesh, THREE.Mesh])[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2, x = Math.sin(a) * SEAL_R, z = Math.cos(a) * SEAL_R;
    R.add(box(3.2, 1.1, 3.2), mStone, x, 0.55, z, 0, a);
    R.add(box(1.7, 11, 1.7), mStone, x, 6.6, z, 0, a);
    R.add(facet(new THREE.ConeGeometry(1.25, 1.4, 4, 1)), mStone, x, 12.8, z, 0, a + Math.PI / 4);
    const gem = R.add(new THREE.OctahedronGeometry(0.45, 0), cyan, x, 14, z);
    for (const g of gem) g.scale.y = 1.6;
    gems.push(gem);
    R.add(new THREE.CylinderGeometry(0.18, 0.18, 120, 6, 1, true), beamMat, x, 74, z);
    for (let g = 0; g < 4; g++) R.add(diamond, cyan, x - Math.sin(a) * 0.87, 3 + g * 2.2, z - Math.cos(a) * 0.87, 0, a + Math.PI, 0);
    R.shadow(x, z, 1.2, 18, 0.5);
  }
  // Inlaid rhombus rings around the dais.
  const inlay: V3[] = [];
  for (const r of [5.3, 11.5]) {
    const c = [0, 1, 2, 3].map((i) => new THREE.Vector3(Math.sin((i * Math.PI) / 2) * r, 0.04, Math.cos((i * Math.PI) / 2) * r));
    for (let i = 0; i < 4; i++) inlay.push(c[i], c[(i + 1) % 4]);
  }
  const lCyan = kit.lineMat({ value: new THREE.Color(P.cyan) }, 160);
  lCyan.uniforms.uFogColor = R.uniforms.fog;
  scene.add(kit.segs(inlay, lCyan));

  /* ---- broken colonnade ---- */
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3 + rnd() * 0.2, r = 34 + rnd() * 6, x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (i % 4 === 2) {
      R.add(facet(new THREE.CylinderGeometry(0.8, 0.8, 6, 8)), mStone, x, 0.8, z, Math.PI / 2, a + rnd(), 0);
    } else {
      const h = 4 + rnd() * 8;
      R.add(box(2.2, 0.7, 2.2), mStone, x, 0.35, z, 0, a);
      R.add(facet(new THREE.CylinderGeometry(0.75, 0.8, h, 8)), mStone, x, h / 2 + 0.7, z, 0, a);
      R.shadow(x, z, 0.8, h * 2.5, 0.45);
    }
  }

  /* ---- titan remains: a sunken head with horns and pink eyes, an arm reaching out of the water, ribs ---- */
  const titanAt = new THREE.Vector3(-21, -0.8, -20), titanRot = new THREE.Euler(0.05, 0.75, 0.22);
  const eyeMat = new THREE.MeshBasicMaterial({ color: P.pink });
  const titan = R.both(() => {
    const g = new THREE.Group();
    g.position.copy(titanAt);
    g.rotation.copy(titanRot);
    const tb = kit.batcher();
    tb.add(box(8, 6.5, 8.5), mTitan, 0, 3.2, 0);
    tb.add(box(8.6, 1.4, 3), mTitan, 0, 6.2, 3.4, -0.15);
    tb.add(box(6.8, 2.2, 6), mTitan, 0, -0.2, 2.6, 0.3);
    tb.add(facet(new THREE.ConeGeometry(0.9, 6, 4)), mBone, -4.2, 8.2, -0.5, 0, 0, 0.55);
    tb.add(facet(new THREE.ConeGeometry(0.9, 5, 4)), mBone, 4.2, 7.4, -0.5, 0, 0, -0.75);
    tb.add(new THREE.BoxGeometry(1.7, 0.8, 0.3), eyeMat, -1.9, 4.3, 4.3);
    tb.add(new THREE.BoxGeometry(1.7, 0.8, 0.3), eyeMat, 1.9, 4.3, 4.3);
    tb.flush(g);
    return g;
  });
  R.shadow(titanAt.x, titanAt.z, 5, 22, 0.5);
  const titanEye = new THREE.Vector3();
  R.both(() => {
    const g = new THREE.Group();
    g.position.set(30, -0.5, -12);
    g.rotation.y = -0.9;
    const ab = kit.batcher();
    ab.add(facet(new THREE.CylinderGeometry(1.1, 1.4, 9, 8)), mTitan, 0, 3.5, 0, 0, 0, 0.35);
    ab.add(box(2.4, 2.4, 2.4), mTitan, -1.6, 7.6, 0);
    ab.add(facet(new THREE.CylinderGeometry(0.8, 1.05, 7, 8)), mTitan, -0.4, 10.6, 0, 0, 0, -0.55);
    ab.add(box(2.6, 2, 1.6), mTitan, 1.6, 13.4, 0, 0, 0, -0.3);
    for (let f = 0; f < 3; f++) ab.add(box(0.55, 2.4, 0.55), mBone, 2.6 + f * 0.05, 14.9, -0.6 + f * 0.6, 0, 0, -0.9 - f * 0.15);
    ab.flush(g);
    return g;
  });
  R.shadow(30, -12, 1.4, 20, 0.5);
  for (let r = 0; r < 4; r++) {
    R.add(facet(new THREE.TorusGeometry(4.6 - r * 0.4, 0.32, 4, 9, Math.PI * 0.9)), mBone, 21 + r * 2.4, -0.6, 25 - r * 1.7, 0, 0.95, 0.3);
  }

  /* ---- stasis tubes: rings, a dark sleeper, a pink glass column ---- */
  const tubeMats: THREE.MeshBasicMaterial[] = [];
  [[-15, 9], [-17.2, 11.5], [-13, 12.6]].forEach(([x, z]) => {
    R.add(facet(new THREE.CylinderGeometry(1.1, 1.3, 0.8, 8)), mStone, x, 0.4, z);
    R.add(facet(new THREE.CylinderGeometry(1.15, 1.15, 0.5, 8)), mStone, x, 5.2, z);
    R.add(facet(new THREE.CapsuleGeometry(0.42, 1.6, 2, 6)), mInk, x, 2.6, z);
    const m = glow(P.pink, 0.2);
    tubeMats.push(m);
    R.add(new THREE.CylinderGeometry(1, 1, 4.4, 8, 1, true), m, x, 2.9, z);
    R.shadow(x, z, 1.1, 9, 0.4);
  });

  /* ---- the crystal, its orbiting shards and a pink bloom ---- */
  const cryGeo = facet(new THREE.OctahedronGeometry(1.6, 0).scale(1, 1.75, 1));
  const crystal = R.add(cryGeo, crystalMat, CORE.x, CORE.y, CORE.z);
  const shardGeo = facet(new THREE.OctahedronGeometry(0.3, 0).scale(1, 1.6, 1));
  const shards = [0, 1, 2, 3].map(() => R.add(shardGeo, crystalMat));
  const halo = new THREE.Group();
  scene.add(halo);
  const haloMats = [[3.2, 0.22], [5.5, 0.1], [10, 0.04]].map(([r, o], i) => {
    const m = glow(P.pink, o);
    const h = kit.mesh(new THREE.CircleGeometry(r, 20), m, halo, 0, 0, -0.6 - i * 0.4);
    h.renderOrder = 3;
    return { m, o };
  });
  const pool = glow(P.pink, 0.18);
  kit.mesh(new THREE.CircleGeometry(6, 4), pool, scene, 0, DAIS + 0.02, 0, -Math.PI / 2);
  kit.mesh(new THREE.CylinderGeometry(1.3, 2.2, 60, 8, 1, true), glow(P.pink, 0.05), scene, 0, 38, 0);

  /* ---- roots: tapered tubes, distance from the crystal baked in so pulses travel outward ---- */
  const rootGeos: THREE.BufferGeometry[] = [];
  const tube = (pts: V3[], r0: number, r1: number, seed: number) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const len = curve.getLength(), n = Math.max(6, Math.round(len * 0.9)), sides = 5;
    const fr = curve.computeFrenetFrames(n, false);
    const pos: number[] = [], dist: number[] = [], sd: number[] = [], idx: number[] = [];
    const c = new THREE.Vector3(), nv = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const u = i / n, r = r0 + (r1 - r0) * Math.pow(u, 0.8);
      curve.getPointAt(u, c);
      for (let j = 0; j < sides; j++) {
        const a = (j / sides) * Math.PI * 2;
        nv.copy(fr.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a));
        pos.push(c.x + nv.x * r, c.y + nv.y * r, c.z + nv.z * r);
        dist.push(u * len);
        sd.push(seed);
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + ((j + 1) % sides);
      idx.push(a, a + sides, b, b, a + sides, b + sides);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aDist", new THREE.Float32BufferAttribute(dist, 1));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(sd, 1));
    g.setIndex(idx);
    rootGeos.push(facet(g));
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // Floor roots: out of the crystal's lower point, over the dais lip, across the paving; two climb a seal.
  for (let i = 0; i < 8; i++) {
    const toSeal = i % 4 === 1;
    let a = (i / 8) * Math.PI * 2 + rnd() * 0.3;
    if (toSeal) a = Math.round(a / (Math.PI / 2)) * (Math.PI / 2) + 0.06;
    const sx = Math.sin(a), sz = Math.cos(a);
    const pts = [v(0, CORE.y - 2.2, 0), v(sx * 1.3, 2.4, sz * 1.3), v(sx * 3, DAIS + 0.15, sz * 3), v(sx * 4.9, 1.0, sz * 4.9), v(sx * 6.6, 0.25, sz * 6.6)];
    let r = 6.6, wa = a;
    const reach = toSeal ? SEAL_R - 1.2 : 16 + rnd() * 14;
    while (r < reach) {
      r += 2.8 + rnd();
      if (!toSeal) wa += (rnd() - 0.5) * 0.35;
      pts.push(v(Math.sin(wa) * Math.min(r, reach), 0.2 + rnd() * 0.3, Math.cos(wa) * Math.min(r, reach)));
    }
    if (toSeal) {
      const fx = Math.sin(a) * (SEAL_R - 0.9), fz = Math.cos(a) * (SEAL_R - 0.9);
      pts.push(v(fx, 1.6, fz), v(fx + 0.4, 4, fz), v(fx - 0.3, 6.8, fz), v(fx + 0.2, 8.6, fz));
    } else pts.push(v(Math.sin(wa) * (r + 2), 0.05, Math.cos(wa) * (r + 2)));
    tube(pts, 0.45, 0.08, rnd());
  }
  // Vault roots: the crystal hangs from them like a fruit.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.4, sx = Math.sin(a), sz = Math.cos(a), sp = 4 + rnd() * 9;
    tube([v(0, CORE.y + 2.3, 0), v(sx * 0.9, CORE.y + 4, sz * 0.9), v(sx * sp * 0.3, 15, sz * sp * 0.3), v(sx * sp * 0.7, 24, sz * sp * 0.7), v(sx * sp, 38, sz * sp), v(sx * sp * 1.2, 60, sz * sp * 1.2)], 0.24, 0.9, rnd());
  }
  // Four that grip the crystal's facets.
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4, sx = Math.sin(a), sz = Math.cos(a);
    tube([v(sx * 0.2, CORE.y + 2.9, sz * 0.2), v(sx * 1.0, CORE.y + 1.4, sz * 1.0), v(sx * 1.55, CORE.y, sz * 1.55), v(sx * 0.9, CORE.y - 1.5, sz * 0.9), v(0, CORE.y - 2.6, 0)], 0.14, 0.1, rnd());
  }
  const rootMat = new THREE.ShaderMaterial({
    uniforms: {
      uSnap: U.uSnap, uTime: U.uTime, uCore: { value: CORE }, uBeat: beatU, uSurge: surgeU,
      uBase: { value: new THREE.Color(P.root) }, uPink: { value: new THREE.Color(P.pink) }, uFog: R.uniforms.fog,
      uFogNear: U.uFogNear, uFogFar: U.uFogFar,
    },
    vertexShader: ROOT_V,
    fragmentShader: ROOT_F,
  });
  const roots = mergeGeometries(rootGeos);
  if (roots) R.add(roots, rootMat);

  /* ---- the figure: red cloak, dark head, pale visor, cyan blade; a tap dashes with afterimages ---- */
  const figure = (mats: THREE.Material[]) => () => {
    const g = new THREE.Group();
    kit.mesh(facet(new THREE.ConeGeometry(0.42, 1.0, 5)), mats[0], g, 0, 0.5, 0);
    kit.mesh(facet(new THREE.BoxGeometry(0.34, 0.3, 0.32)), mats[1], g, 0, 1.12, 0);
    kit.mesh(facet(new THREE.BoxGeometry(0.26, 0.06, 0.05)), mats[2], g, 0, 1.13, 0.17);
    kit.mesh(new THREE.BoxGeometry(0.05, 0.05, 0.8), mats[3], g, 0.32, 0.55, 0.3, -0.5);
    g.rotation.y = Math.PI;
    return g;
  };
  const drifter = R.both(figure([mCloak, mInk, mBone, cyan]));
  const ghostMat = glow(P.cyan, 0);
  const ghosts = [0, 1, 2].map(() => R.both(figure([ghostMat, ghostMat, ghostMat, ghostMat])));

  /* ---- the vision: a black shade with a pink rim and a diamond eye, behind the crystal for a moment ---- */
  const vision = new THREE.Group();
  vision.visible = false;
  scene.add(vision);
  const shade = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0, depthWrite: false });
  const tri = (pts: [number, number][]) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))));
  const body = [
    tri([[-5.5, 5], [5.5, 5], [3, -1], [0, -9], [-3, -1]]),
    tri([[-4.5, 4.5], [-2.5, 5.5], [-8, 11]]),
    tri([[4.5, 4.5], [2.5, 5.5], [8, 11]]),
    ...[0, 1, 2, 3, 4, 5].map((k) => {
      const x = -4 + k * 1.6;
      return tri([[x - 0.4, 0], [x + 0.4, 0], [x * 1.9 + Math.sin(k) * 2, -10]]);
    }),
  ];
  body.forEach((g) => kit.mesh(g, shade, vision));
  const rimMat = glow(P.pink, 0);
  const rim = new THREE.Group();
  rim.position.z = -0.3;
  rim.scale.setScalar(1.07);
  vision.add(rim);
  body.forEach((g) => kit.mesh(g, rimMat, rim));
  const visEye = new THREE.MeshBasicMaterial({ color: P.pink, transparent: true, opacity: 0, depthWrite: false });
  kit.mesh(tri([[0, 4.6], [1.1, 3], [0, 1.4], [-1.1, 3]]), visEye, vision, 0, 0, 0.05);

  /* ---- eggs ---- */
  let visT = -99, titanT = -99, dashT = -99;
  const eggs = [
    { id: "abyss-judgement", r: 44, at: (o: V3) => o.copy(CORE), fire: (t: number) => { visT = t; } },
    { id: "abyss-titan", r: 34, at: (o: V3) => o.copy(titanEye), fire: (t: number) => { titanT = t; } },
    { id: "abyss-drifter", r: 22, at: (o: V3) => o.set(drifter[0].position.x, DAIS + 0.7, drifter[0].position.z), fire: (t: number) => { dashT = t; } },
  ];

  const view = kit.view;
  const pivot = new THREE.Vector3(0, 5, 0);
  const tmp = new THREE.Vector3();
  const sky = R.uniforms.sky;
  let tNow = 0, beatNow = 0;

  return {
    scene,
    cam,
    fog: [22, 95],
    fov: [50, 66],
    limits: { pitch: [-0.22, 0.55], zoom: [0.6, 2.4] },
    labels: [
      { name: "Immortal Cell", sub: "JUDGEMENT", at: (o) => o.copy(CORE).add(tmp.set(2.2, 2.2, 0)) },
      { name: "Seal", sub: "N · LIT", at: (o) => o.set(0, 14.8, SEAL_R) },
      { name: "Titan", sub: "REMAINS", at: (o) => o.copy(titanEye).setY(titanEye.y + 5) },
    ],
    eggs,
    update(t) {
      tNow = t;
      // Two-beat pulse, a slow heart.
      const ph = (t * 0.8) % 1;
      beatNow = Math.pow(Math.max(0, Math.sin(ph * Math.PI * 2)), 10) + 0.55 * Math.pow(Math.max(0, Math.sin((ph - 0.16) * Math.PI * 2)), 14);
      const ev = pulse(t - visT, 3.2), et = pulse(t - titanT, 2.6), ed = pulse(t - dashT, 0.7);
      beatU.value = beatNow + ev;
      surgeU.value = ev * 1.5;
      R.uniforms.flash.value = (t >= visT ? Math.max(0, 1 - (t - visT) * 3) * 0.5 : 0) + beatNow * 0.06;

      // The vision drains the vault toward black.
      sky.uZen.value.copy(skyBase.zen).multiplyScalar(1 - ev);
      sky.uMid.value.copy(skyBase.mid).multiplyScalar(1 - ev * 0.9);
      sky.uLow.value.copy(skyBase.low).multiplyScalar(1 - ev * 0.75);
      sky.uHor.value.copy(skyBase.hor).multiplyScalar(1 - ev * 0.6);

      const s = 1 + beatNow * 0.035;
      for (const c of crystal) {
        c.position.y = CORE.y + Math.sin(t * 0.6) * 0.18;
        c.rotation.y = t * 0.12;
        c.scale.setScalar(s);
      }
      shards.forEach((pair, i) => {
        const a = t * 0.5 + (i * Math.PI) / 2;
        for (const m of pair) {
          m.position.set(Math.cos(a) * 3, crystal[0].position.y + Math.sin(t * 0.9 + i) * 0.6, Math.sin(a) * 3);
          m.rotation.y = t * 1.2 + i;
        }
      });
      halo.position.copy(crystal[0].position);
      halo.quaternion.copy(cam.quaternion);
      haloMats.forEach((h) => { h.m.opacity = h.o * (0.75 + beatNow * 0.6 + ev * 1.5); });
      pool.opacity = 0.14 + beatNow * 0.1;
      tubeMats.forEach((m, i) => { m.opacity = 0.16 + 0.06 * Math.sin(t * 1.3 + i * 2); });
      beamMat.opacity = (0.18 + 0.05 * Math.sin(t * 2)) * (1 - ev * 0.8);
      gems.forEach((pair, i) => { for (const m of pair) { m.rotation.y = t * 0.8 + i; m.position.y = 14 + Math.sin(t * 1.1 + i) * 0.15; } });

      // Titan wakes: eyes flare, head lifts a little.
      const g = 0.35 + 0.1 * Math.sin(t * 0.7) + et * 1.2;
      eyeMat.color.setRGB(1 * g, 0.18 * g, 0.56 * g);
      for (const h of titan) h.rotation.x = titanRot.x - et * 0.08;
      titan[0].updateMatrixWorld();
      titanEye.set(0, 4.3, 4.4).applyMatrix4(titan[0].matrixWorld);

      // Figure: cloak sways; a tap dashes out and back with cyan afterimages.
      const dx = ed * 2.6;
      for (const d of drifter) {
        d.position.set(dx, DAIS, 4.4);
        d.rotation.z = Math.sin(t * 1.4) * 0.03;
      }
      ghosts.forEach((pair, i) => { for (const gh of pair) { gh.visible = ed > 0.02; gh.position.set(dx * (1 - (i + 1) * 0.28), DAIS, 4.4); } });
      ghostMat.opacity = ed * 0.35;

      const ang = t * 0.035 + view.yaw + view.px * 0.25;
      cam.position.set(Math.sin(ang) * 23, 7.5 - view.py * 2, Math.cos(ang) * 23);
      cam.lookAt(pivot);
      kit.orbit(cam, pivot);

      vision.visible = ev > 0.01;
      if (vision.visible) {
        tmp.copy(CORE).sub(cam.position).setY(0).normalize();
        vision.position.copy(CORE).addScaledVector(tmp, 5).setY(CORE.y + 1);
        vision.quaternion.copy(cam.quaternion);
        vision.scale.setScalar(0.7 + ev * 0.5);
        shade.opacity = Math.min(1, ev * 1.6);
        rimMat.opacity = Math.min(1, ev * 1.6) * (0.45 + beatNow * 0.3);
        visEye.opacity = Math.min(1, ev * 1.8) * (0.7 + beatNow * 0.3);
      }
      R.follow(cam);
    },
    readout: () => {
      const breach = pulse(tNow - visT, 3.2) > 0.05;
      return [
        ["DEPTH", "−1,204 m"],
        ["CELL", `${Math.round(48 + beatNow * 6)} BPM`],
        ["SEALS", breach ? "0/4 LIT" : "4/4 LIT"],
        ["BEARING", `${kit.pad(Math.round(kit.bearing(cam)), 3)}°`],
        ["STATE", breach ? "JUDGEMENT" : "DORMANT"],
      ];
    },
  };
}
