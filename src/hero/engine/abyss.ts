/** Sheet 08 · Abyss: after Hyper Light Drifter's final chamber. The Immortal
 *  Cell (the four-sided magenta crystal, Judgement's true form) hangs over a
 *  rhombus dais, held by black roots that grip it from the ceiling and crawl
 *  out across flooded paving. Pink light pulses along the roots like the fuel
 *  the Drifter coughs up. Four seal pillars stand at the cardinal points with
 *  cyan glyphs and beams; a Titan's head and arm lie half-sunk in the water,
 *  with ribs, broken columns and stasis tubes from the southern labs.
 *
 *  The palette is fixed (the game's, not the site accent): near-black indigo,
 *  hot magenta for Hyper Light, cyan-teal for old tech, and the Drifter's red.
 *  Tap the crystal for a vision, the Titan's eyes to wake them, the Drifter to dash. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pulse, type PsxKit, type SceneDef, type V3 } from "./psx";

const P = {
  zen: "#05040b",
  fog: "#151026",
  floor: "#0b0914",
  root: "#0d0a14",
  pink: "#ff2f8f",
  pinkHot: "#ffc2e2",
  pinkDeep: "#6e0a45",
  cyan: "#4ff0e0",
  teal: "#1f6f78",
  red: "#e0324f",
};

const SNAP = `p.xy = floor(p.xy / p.w * uSnap + 0.5) / uSnap * p.w;`;

const ROOT_V = `
uniform vec2 uSnap; uniform vec3 uCore;
attribute float aDist; attribute float aSeed;
varying float vDist; varying float vSeed; varying float vLit; varying float vDepth;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vec3 tl = uCore - wp.xyz; float d = length(tl);
  vLit = max(dot(n, tl / d), 0.0) * 6.0 / (1.0 + d * d * 0.05) + max(n.y, 0.0) * 0.08;
  vDist = aDist; vSeed = aSeed;
  vec4 mv = viewMatrix * wp; vec4 p = projectionMatrix * mv;
  ${SNAP}
  gl_Position = p; vDepth = -mv.z;
}`;
const ROOT_F = `
uniform float uTime; uniform float uBeat; uniform float uSurge; uniform vec3 uBase; uniform vec3 uPink; uniform vec3 uFog;
uniform float uFogNear; uniform float uFogFar;
varying float vDist; varying float vSeed; varying float vLit; varying float vDepth;
void main(){
  vec3 c = uBase * (0.6 + vLit) + uPink * vLit * 0.05;
  float sp = 4.0 + uSurge * 10.0;
  float vein = smoothstep(0.82, 1.0, fract((vDist - uTime * sp) / 9.0 + vSeed));
  float near = exp(-vDist * 0.16) * (0.35 + uBeat * 0.65);
  float far = exp(-vDist * 0.035);
  c += uPink * (vein * far * (0.9 + uSurge) + near);
  float fg = smoothstep(uFogNear, uFogFar, vDepth);
  gl_FragColor = vec4(mix(c, uFog, fg * 0.9), 1.0);
}`;

// Flat-faceted crystal: each face takes a shade from a fixed key, plus a hot rim toward the camera.
const CRY_V = `
uniform vec2 uSnap; varying vec3 vN; varying vec3 vV; varying float vY;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); vY = position.y;
  vec4 p = projectionMatrix * viewMatrix * wp;
  ${SNAP}
  gl_Position = p;
}`;
const CRY_F = `
uniform vec3 uDeep; uniform vec3 uPink; uniform vec3 uHot; uniform float uBeat; uniform float uFlash;
varying vec3 vN; varying vec3 vV; varying float vY;
void main(){
  float k = max(dot(vN, normalize(vec3(-0.4, 0.8, 0.45))), 0.0);
  float rim = pow(1.0 - max(dot(vN, vV), 0.0), 2.0);
  vec3 c = mix(uDeep, uPink, 0.35 + k * 0.65);
  c = mix(c, uHot, smoothstep(0.55, 1.0, k) * 0.6 + rim * 0.35);
  c *= 0.85 + uBeat * 0.35 + uFlash;
  gl_FragColor = vec4(c, 1.0);
}`;

// Broad soft gradient vault, the game's signature: indigo haze low, black overhead, a magenta bloom behind the cell.
const SKY_V = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_F = `
uniform vec3 uFog; uniform vec3 uZen; uniform vec3 uPink; uniform float uBeat; varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir); float h = clamp(d.y, -1.0, 1.0);
  vec3 c = mix(uFog, uZen, smoothstep(-0.05, 0.55, h));
  c = mix(c, uZen, smoothstep(0.0, -0.4, h));
  c += uPink * exp(-abs(h - 0.08) * 7.0) * (0.06 + uBeat * 0.03);
  gl_FragColor = vec4(c, 1.0);
}`;

export function buildAbyss(kit: PsxKit): SceneDef {
  const { U, rnd } = kit;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 400);

  const fogBase = new THREE.Color(P.fog);
  const fogU = { value: fogBase.clone() };
  const zenBase = new THREE.Color(P.zen);
  const zenU = { value: zenBase.clone() };
  const beatU = { value: 0 };
  const surgeU = { value: 0 };
  const flashU = { value: 0 };
  const CORE = new THREE.Vector3(0, 6.2, 0);

  // Kit materials, re-pointed at this scene's own fog so the accent switch leaves the palette alone.
  const own = (m: THREE.ShaderMaterial) => {
    m.uniforms.uFogColor = fogU;
    return m;
  };
  const dark = { amb: "#1d1a33", sun: "#5c3a6e" };
  const mStone = own(kit.psx({ map: kit.tex.tStone, tint: "#6e6a86", moss: 0.12, ...dark }));
  const mStone2 = own(kit.psx({ map: kit.tex.tStone, tint: "#4d4a66", uv: 1.5, ...dark }));
  const mDais = own(kit.psx({ map: kit.tex.tStone, tint: "#7a7092", uv: 2, ...dark }));
  const mWater = own(kit.psx({ map: kit.tex.tWater, tint: "#28394f", uv: 6, amb: "#1a1a32", sun: "#2a2a48" }));
  const mTitan = own(kit.psx({ map: kit.tex.tStone, tint: "#6a5560", moss: 0.25, uv: 0.6, ...dark }));
  const mRust = own(kit.psx({ map: kit.tex.tBark, tint: "#7a5248", ...dark }));
  const mBone = own(kit.psx({ map: kit.tex.tPlain, tint: "#8a8496", ...dark }));
  const mShard = own(kit.psx({ map: kit.tex.tPlain, tint: "#3ab8b4", amb: "#2a5560", sun: "#6ad8d0", fogAmt: 0.6 }));
  const mCloak = own(kit.psx({ map: kit.tex.tPlain, tint: P.red, amb: "#6a3040", sun: "#c06070", fogAmt: 0.3 }));
  const mInk = own(kit.psx({ map: kit.tex.tPlain, tint: "#2a2c48", amb: "#3a3c60", sun: "#5a5c80", fogAmt: 0.3 }));
  const mPale = own(kit.psx({ map: kit.tex.tPlain, tint: "#d8f4f4", amb: "#7a8ca0", sun: "#a0b0c0", fogAmt: 0.3 }));

  const add = (color: string, opacity: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const lCyan = kit.lineMat({ value: new THREE.Color(P.cyan) }, 160);
  const lPink = kit.lineMat({ value: new THREE.Color(P.pinkHot) }, 160);

  /* ---- vault ---- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(200, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uFog: fogU, uZen: zenU, uPink: { value: new THREE.Color(P.pink) }, uBeat: beatU },
      vertexShader: SKY_V,
      fragmentShader: SKY_F,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  /* ---- flooded floor, rhombus dais, causeways ---- */
  const b = kit.batcher();
  kit.mesh(new THREE.PlaneGeometry(240, 240, 1, 1), mWater, scene, 0, 0, 0, -Math.PI / 2);
  const box = (w: number, h: number, d: number, r = 0.08) => kit.facet(new THREE.BoxGeometry(w, h, d, 2, 2, 2), r);
  b.add(box(9.5, 0.7, 9.5, 0.1), mDais, 0, 0.3, 0, 0, Math.PI / 4);
  b.add(box(6.6, 0.5, 6.6, 0.06), mDais, 0, 0.9, 0, 0, Math.PI / 4);
  b.add(box(3.4, 0.35, 3.4, 0.04), mStone, 0, 1.3, 0, 0, Math.PI / 4);
  const DAIS = 1.48;
  // Paving slabs out to each seal, some tipped and sinking.
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    for (let s = 0; s < 4; s++) {
      if (rnd() < 0.18) continue;
      const r = 5.6 + s * 1.9, tip = rnd() < 0.3 ? (rnd() - 0.5) * 0.35 : 0;
      b.add(box(1.7, 0.35, 1.7, 0.12), mStone2, Math.sin(a) * r, 0.1 - (tip ? 0.15 : 0), Math.cos(a) * r, tip, a + (rnd() - 0.5) * 0.2, tip * 0.5);
    }
  }

  /* ---- the four seals ---- */
  const SEAL_R = 13.5;
  const beams: THREE.Mesh[] = [];
  const caps: THREE.Mesh[] = [];
  const glyphs: V3[] = [];
  const dia = (cx: number, cy: number, cz: number, w: number, h: number, ux: number, uz: number) => {
    const q = [
      new THREE.Vector3(cx, cy + h, cz), new THREE.Vector3(cx + ux * w, cy, cz + uz * w),
      new THREE.Vector3(cx, cy - h, cz), new THREE.Vector3(cx - ux * w, cy, cz - uz * w),
    ];
    for (let i = 0; i < 4; i++) glyphs.push(q[i], q[(i + 1) % 4]);
  };
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2, x = Math.sin(a) * SEAL_R, z = Math.cos(a) * SEAL_R;
    b.add(box(3.2, 1.1, 3.2, 0.15), mStone2, x, 0.45, z, 0, a);
    b.add(box(1.7, 11, 1.7, 0.1), mStone, x, 6.4, z, 0, a);
    b.add(kit.facet(new THREE.ConeGeometry(1.25, 1.4, 4, 1), 0.05), mStone, x, 12.6, z, 0, a + Math.PI / 4);
    const cap = kit.mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: P.cyan }), scene, x, 14, z);
    cap.scale.y = 1.6;
    caps.push(cap);
    const beam = kit.mesh(new THREE.CylinderGeometry(0.16, 0.16, 120, 6, 1, true), add(P.cyan, 0.22), scene, x, 74, z);
    beams.push(beam);
    // Glyph column on the inward face: stacked rhombuses and a spine.
    const ux = Math.cos(a), uz = -Math.sin(a), fx = x - Math.sin(a) * 0.87, fz = z - Math.cos(a) * 0.87;
    for (let g = 0; g < 4; g++) dia(fx, 3 + g * 2.2, fz, 0.42, 0.62, ux, uz);
    glyphs.push(new THREE.Vector3(fx, 1.6, fz), new THREE.Vector3(fx, 2.3, fz));
  }
  scene.add(kit.segs(glyphs, lCyan));
  // Inlaid rhombus ring around the dais.
  const inlay: V3[] = [];
  for (const r of [5.3, 11.5]) {
    const c = [0, 1, 2, 3].map((i) => new THREE.Vector3(Math.sin((i * Math.PI) / 2) * r, 0.04, Math.cos((i * Math.PI) / 2) * r));
    for (let i = 0; i < 4; i++) inlay.push(c[i], c[(i + 1) % 4]);
  }
  scene.add(kit.segs(inlay, lCyan));

  /* ---- ruins: broken colonnade, a fallen arch, scattered blocks ---- */
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rnd() * 0.2, r = 31 + rnd() * 6;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (rnd() < 0.3) {
      b.add(kit.facet(new THREE.CylinderGeometry(0.75, 0.8, 6, 6, 2), 0.12), mStone2, x, 0.4, z, Math.PI / 2, a + rnd(), 0.1);
    } else {
      const h = 3 + rnd() * 8;
      b.add(box(2.2, 0.7, 2.2, 0.12), mStone2, x, 0.2, z, 0, a);
      b.add(kit.facet(new THREE.CylinderGeometry(0.7, 0.8, h, 6, 3), 0.18), mStone, x, h / 2 + 0.5, z, (rnd() - 0.5) * 0.08, a, (rnd() - 0.5) * 0.08);
    }
    if (rnd() < 0.6) b.add(box(1 + rnd() * 1.5, 0.8 + rnd(), 1 + rnd(), 0.2), mStone2, x + (rnd() - 0.5) * 4, 0.2, z + (rnd() - 0.5) * 4, rnd() * 0.4, rnd() * 3, rnd() * 0.3);
  }
  {
    const ax = -8, az = 33;
    b.add(box(1.4, 9, 1.4, 0.12), mStone, ax - 3.5, 4.5, az);
    b.add(box(1.4, 6.5, 1.4, 0.12), mStone, ax + 3.5, 3.2, az, 0, 0, -0.05);
    b.add(box(9.5, 1.3, 1.6, 0.12), mStone, ax - 0.6, 8.8, az, 0, 0, -0.12);
    b.add(box(4, 1.2, 1.6, 0.2), mStone2, ax + 6.5, 0.3, az + 1.5, 0.1, 0.5, 0.2);
  }

  /* ---- titan remains: a sunken head, an arm reaching out of the water, ribs ---- */
  const titan = new THREE.Group();
  titan.position.set(-21, -0.8, -20);
  titan.rotation.set(0.05, 0.75, 0.22);
  scene.add(titan);
  const tb = kit.batcher();
  tb.add(box(8, 6.5, 8.5, 0.35), mTitan, 0, 3.2, 0);
  tb.add(box(8.6, 1.4, 3, 0.2), mRust, 0, 6.2, 3.4, -0.15);
  tb.add(box(6.8, 2.2, 6, 0.3), mTitan, 0, -0.2, 2.6, 0.3);
  tb.add(kit.facet(new THREE.ConeGeometry(0.9, 6, 4), 0.2), mRust, -4.2, 8.2, -0.5, 0, 0, 0.55);
  tb.add(kit.facet(new THREE.ConeGeometry(0.9, 5, 4), 0.2), mRust, 4.2, 7.4, -0.5, 0, 0, -0.75);
  tb.add(box(1.2, 3, 1.2, 0.1), mRust, 0, 7.6, -1.5);
  tb.flush(titan);
  const eyeMat = new THREE.MeshBasicMaterial({ color: P.pink });
  [-1.9, 1.9].forEach((ex) => kit.mesh(new THREE.BoxGeometry(1.7, 0.8, 0.3), eyeMat, titan, ex, 4.3, 4.3));
  const titanEye = new THREE.Vector3();
  const arm = new THREE.Group();
  arm.position.set(30, -0.5, -12);
  arm.rotation.y = -0.9;
  scene.add(arm);
  const ab = kit.batcher();
  ab.add(kit.facet(new THREE.CylinderGeometry(1.1, 1.4, 9, 6, 2), 0.2), mTitan, 0, 3.5, 0, 0, 0, 0.35);
  ab.add(box(2.4, 2.4, 2.4, 0.2), mRust, -1.6, 7.6, 0);
  ab.add(kit.facet(new THREE.CylinderGeometry(0.8, 1.05, 7, 6, 2), 0.18), mTitan, -0.4, 10.6, 0, 0, 0, -0.55);
  ab.add(box(2.6, 2, 1.6, 0.15), mRust, 1.6, 13.4, 0, 0, 0, -0.3);
  for (let f = 0; f < 3; f++) ab.add(box(0.55, 2.4, 0.55, 0.06), mRust, 2.6 + f * 0.05, 14.9, -0.6 + f * 0.6, 0, 0, -0.9 - f * 0.15);
  ab.flush(arm);
  for (let r = 0; r < 5; r++) {
    const rib = new THREE.TorusGeometry(4.6 - r * 0.35, 0.32, 4, 9, Math.PI * 0.9);
    b.add(kit.facet(rib, 0.1), mBone, 21 + r * 2.1, -0.6, 25 - r * 1.5, 0, 0.95, 0.3);
  }
  b.add(box(11, 0.7, 0.7, 0.08), mBone, 25, 0.1, 22, 0, 0.95, 0);

  /* ---- stasis tubes, glowing pink fuel ---- */
  const tubes: THREE.MeshBasicMaterial[] = [];
  [[-15, 9], [-17.2, 11.5], [-13, 12.6]].forEach(([x, z], i) => {
    const tilt = i === 1 ? 0.18 : 0;
    b.add(kit.facet(new THREE.CylinderGeometry(1.1, 1.3, 0.8, 6), 0.05), mRust, x, 0.4, z);
    b.add(kit.facet(new THREE.CylinderGeometry(1.15, 1.15, 0.5, 6), 0.05), mRust, x + tilt * 4.2, 5.2, z, 0, 0, -tilt);
    b.add(kit.facet(new THREE.CapsuleGeometry(0.42, 1.6, 2, 5), 0.05), mInk, x + tilt * 1.6, 2.6, z, 0, 0, -tilt);
    const m = add(P.pink, 0.2);
    tubes.push(m);
    kit.mesh(new THREE.CylinderGeometry(1, 1, 4.4, 6, 1, true), m, scene, x + tilt * 2.4, 2.9, z, 0, 0, -tilt);
  });

  /* ---- teal crystal growths ---- */
  const shard = new THREE.OctahedronGeometry(0.5, 0);
  for (let i = 0; i < 11; i++) {
    const a = rnd() * Math.PI * 2, r = 7 + rnd() * 12, x = Math.sin(a) * r, z = Math.cos(a) * r;
    for (let j = 0; j < 3 + Math.floor(rnd() * 3); j++) {
      const s = 0.6 + rnd() * 1.4;
      const g = shard.clone().scale(1, 2.4, 1);
      b.add(g, mShard, x + (rnd() - 0.5) * 1.6, 0.4 * s, z + (rnd() - 0.5) * 1.6, (rnd() - 0.5) * 0.9, rnd() * 3, (rnd() - 0.5) * 0.9, s);
    }
  }
  b.flush(scene);

  /* ---- the Immortal Cell ---- */
  const cell = new THREE.Group();
  cell.position.copy(CORE);
  scene.add(cell);
  const cryGeo = kit.facet(new THREE.OctahedronGeometry(1.6, 0).scale(1, 1.75, 1), 0.04);
  const cryMat = new THREE.ShaderMaterial({
    uniforms: {
      uSnap: U.uSnap, uDeep: { value: new THREE.Color(P.pinkDeep) }, uPink: { value: new THREE.Color(P.pink) },
      uHot: { value: new THREE.Color(P.pinkHot) }, uBeat: beatU, uFlash: flashU,
    },
    vertexShader: CRY_V,
    fragmentShader: CRY_F,
  });
  const crystal = kit.mesh(cryGeo, cryMat, cell);
  crystal.add(new THREE.LineSegments(new THREE.EdgesGeometry(cryGeo, 1), lPink));
  const shardGeo = new THREE.OctahedronGeometry(0.28, 0).scale(1, 1.6, 1);
  const shards = [0, 1, 2, 3].map(() => kit.mesh(shardGeo, cryMat, cell));
  const halo = new THREE.Group();
  cell.add(halo);
  const haloMats = [[3.2, 0.2], [5.5, 0.09], [10, 0.035]].map(([r, o], i) => {
    const m = add(P.pink, o);
    const h = kit.mesh(new THREE.CircleGeometry(r, 16), m, halo, 0, 0, -0.6 - i * 0.4);
    h.renderOrder = 2;
    return { m, o };
  });
  const pool = add(P.pink, 0.18);
  kit.mesh(new THREE.CircleGeometry(6, 4), pool, scene, 0, DAIS + 0.02, 0, -Math.PI / 2);
  kit.mesh(new THREE.CircleGeometry(16, 20), add(P.pink, 0.05), scene, 0, 0.03, 0, -Math.PI / 2);
  kit.mesh(new THREE.CylinderGeometry(1.3, 2.2, 60, 8, 1, true), add(P.pink, 0.04), scene, 0, 38, 0);

  /* ---- roots: tapered low-poly tubes, distance-from-cell baked in so pulses travel outward ---- */
  const rootGeos: THREE.BufferGeometry[] = [];
  const tube = (pts: V3[], r0: number, r1: number, d0: number, seed: number) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const len = curve.getLength(), n = Math.max(6, Math.round(len * 1.1)), sides = 5;
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
        dist.push(d0 + u * len);
        sd.push(seed);
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < sides; j++) {
      const a = i * sides + j, bq = i * sides + ((j + 1) % sides), c2 = a + sides, d = bq + sides;
      idx.push(a, c2, bq, bq, c2, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aDist", new THREE.Float32BufferAttribute(dist, 1));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(sd, 1));
    g.setIndex(idx);
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    rootGeos.push(flat);
    return curve;
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // Floor roots: out of the cell's lower point, over the dais lip, across the water.
  for (let i = 0; i < 9; i++) {
    let a = (i / 9) * Math.PI * 2 + rnd() * 0.3;
    const toSeal = i % 4 === 1 ? Math.round(a / (Math.PI / 2)) * (Math.PI / 2) : null;
    if (toSeal !== null) a = toSeal + 0.06;
    const sx = Math.sin(a), sz = Math.cos(a);
    const pts = [v(0, CORE.y - 2.2, 0), v(sx * 1.3, 2.4, sz * 1.3), v(sx * 3, DAIS + 0.15, sz * 3), v(sx * 4.9, 1.0, sz * 4.9), v(sx * 6.6, 0.2, sz * 6.6)];
    let r = 6.6, wa = a;
    const reach = toSeal !== null ? SEAL_R - 1.2 : 17 + rnd() * 18;
    while (r < reach) {
      r += 2.6 + rnd();
      wa += toSeal !== null ? 0 : (rnd() - 0.5) * 0.35;
      pts.push(v(Math.sin(wa) * Math.min(r, reach), 0.1 + rnd() * 0.45, Math.cos(wa) * Math.min(r, reach)));
    }
    if (toSeal !== null) {
      // Climb the seal's inward face.
      const fx = Math.sin(toSeal) * (SEAL_R - 0.9), fz = Math.cos(toSeal) * (SEAL_R - 0.9);
      pts.push(v(fx, 1.6, fz), v(fx + 0.4, 4, fz), v(fx - 0.3, 6.8, fz), v(fx + 0.2, 8.6, fz));
    } else pts.push(v(Math.sin(wa) * (r + 2), -0.8, Math.cos(wa) * (r + 2)));
    const seed = rnd();
    const curve = tube(pts, 0.42, 0.07, 0, seed);
    const len = curve.getLength();
    for (let k = 0; k < 2; k++) {
      const u = 0.35 + rnd() * 0.45, o = curve.getPointAt(u);
      const ba = wa + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.6);
      const bp = [o, o.clone().add(v(Math.sin(ba) * 2.5, 0.35, Math.cos(ba) * 2.5))];
      for (let s = 2; s < 5; s++) bp.push(o.clone().add(v(Math.sin(ba + s * 0.15) * s * 2.4, rnd() * 0.3, Math.cos(ba + s * 0.15) * s * 2.4)));
      bp.push(bp[bp.length - 1].clone().setY(-0.6));
      tube(bp, 0.16, 0.04, u * len, seed);
    }
  }
  // Ceiling roots: the cell hangs from them like a fruit.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.4, sx = Math.sin(a), sz = Math.cos(a);
    const sp = 4 + rnd() * 9;
    tube(
      [v(0, CORE.y + 2.3, 0), v(sx * 0.9, CORE.y + 4, sz * 0.9), v(sx * sp * 0.3, 15, sz * sp * 0.3), v(sx * sp * 0.7 + rnd() * 2, 24, sz * sp * 0.7), v(sx * sp, 38, sz * sp), v(sx * sp * 1.2, 60, sz * sp * 1.2)],
      0.22, 0.85, 0, rnd(),
    );
  }
  // A few that hug the crystal's facets.
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4, sx = Math.sin(a), sz = Math.cos(a);
    tube([v(sx * 0.2, CORE.y + 2.9, sz * 0.2), v(sx * 1.0, CORE.y + 1.4, sz * 1.0), v(sx * 1.55, CORE.y, sz * 1.55), v(sx * 0.9, CORE.y - 1.5, sz * 0.9), v(0, CORE.y - 2.6, 0)], 0.13, 0.1, 0.5, rnd());
  }
  const rootMat = new THREE.ShaderMaterial({
    uniforms: {
      uSnap: U.uSnap, uTime: U.uTime, uCore: { value: CORE }, uBeat: beatU, uSurge: surgeU,
      uBase: { value: new THREE.Color(P.root) }, uPink: { value: new THREE.Color(P.pink) }, uFog: fogU,
      uFogNear: U.uFogNear, uFogFar: U.uFogFar,
    },
    vertexShader: ROOT_V,
    fragmentShader: ROOT_F,
  });
  const roots = mergeGeometries(rootGeos);
  if (roots) kit.mesh(roots, rootMat, scene);

  /* ---- the Drifter: red cloak, dark head, a cyan blade ---- */
  const drifter = new THREE.Group();
  drifter.position.set(0, DAIS, 4.4);
  drifter.rotation.y = Math.PI;
  scene.add(drifter);
  const build = (mats: [THREE.Material, THREE.Material, THREE.Material, THREE.Material], into: THREE.Group) => {
    kit.mesh(kit.facet(new THREE.ConeGeometry(0.42, 1.0, 5)), mats[0], into, 0, 0.5, 0);
    kit.mesh(kit.facet(new THREE.BoxGeometry(0.34, 0.3, 0.32)), mats[1], into, 0, 1.12, 0);
    kit.mesh(kit.facet(new THREE.BoxGeometry(0.26, 0.06, 0.05)), mats[2], into, 0, 1.13, 0.17);
    kit.mesh(new THREE.BoxGeometry(0.05, 0.05, 0.8), mats[3], into, 0.32, 0.55, 0.3, -0.5);
  };
  build([mCloak, mInk, mPale, new THREE.MeshBasicMaterial({ color: P.cyan })], drifter);
  const ghostMat = add(P.cyan, 0);
  const ghosts = [0, 1, 2].map(() => {
    const g = new THREE.Group();
    g.rotation.y = Math.PI;
    g.visible = false;
    build([ghostMat, ghostMat, ghostMat, ghostMat], g);
    scene.add(g);
    return g;
  });

  /* ---- Judgement: a shadow with a diamond eye, behind the cell, for a moment ---- */
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
  // Black on a black vault needs an edge: a slightly larger magenta copy just behind.
  const rimMat = add(P.pink, 0);
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
    { id: "abyss-drifter", r: 22, at: (o: V3) => o.set(drifter.position.x, DAIS + 0.7, drifter.position.z), fire: (t: number) => { dashT = t; } },
  ];

  /* ---- camera ---- */
  const view = kit.view;
  const pivot = new THREE.Vector3(0, 5, 0);
  const tmp = new THREE.Vector3();
  let tNow = 0, beatNow = 0;

  return {
    scene,
    cam,
    fog: [20, 75],
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
      flashU.value = Math.max(0, 1 - (t - visT) * 3) * 0.8 * (t >= visT ? 1 : 0);

      // The vision drains the room toward black.
      fogU.value.copy(fogBase).multiplyScalar(1 - ev * 0.85);
      zenU.value.copy(zenBase).multiplyScalar(1 - ev);

      cell.position.y = CORE.y + Math.sin(t * 0.6) * 0.18;
      crystal.rotation.y = t * 0.12;
      const s = 1 + beatNow * 0.035;
      crystal.scale.set(s, s, s);
      shards.forEach((m, i) => {
        const a = t * 0.5 + (i * Math.PI) / 2;
        m.position.set(Math.cos(a) * 3, Math.sin(t * 0.9 + i) * 0.6, Math.sin(a) * 3);
        m.rotation.y = t * 1.2 + i;
      });
      halo.quaternion.copy(cam.quaternion);
      haloMats.forEach((h) => { h.m.opacity = h.o * (0.75 + beatNow * 0.6 + ev * 1.5); });
      pool.opacity = 0.14 + beatNow * 0.1;
      tubes.forEach((m, i) => { m.opacity = 0.14 + 0.06 * Math.sin(t * 1.3 + i * 2); });
      beams.forEach((m, i) => { (m.material as THREE.MeshBasicMaterial).opacity = (0.16 + 0.05 * Math.sin(t * 2 + i)) * (1 - ev * 0.8); });
      caps.forEach((m, i) => { m.rotation.y = t * 0.8 + i; m.position.y = 14 + Math.sin(t * 1.1 + i) * 0.15; });

      // Titan wakes: eyes flare, head lifts a little.
      const glow = 0.25 + 0.1 * Math.sin(t * 0.7) + et * 1.2;
      eyeMat.color.setRGB(1 * glow, 0.18 * glow, 0.56 * glow);
      titan.rotation.x = 0.05 - et * 0.08;
      titan.updateMatrixWorld();
      titanEye.set(0, 4.3, 4.4).applyMatrix4(titan.matrixWorld);

      // Drifter: cloak sways; a tap dashes out and back with cyan afterimages.
      const dx = ed * 2.6;
      drifter.position.x = dx;
      drifter.rotation.z = Math.sin(t * 1.4) * 0.03;
      ghosts.forEach((g, i) => {
        g.visible = ed > 0.02;
        g.position.set(dx * (1 - (i + 1) * 0.28), DAIS, 4.4);
      });
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
        const vs = 0.7 + ev * 0.5;
        vision.scale.set(vs, vs, vs);
        shade.opacity = Math.min(1, ev * 1.6);
        rimMat.opacity = Math.min(1, ev * 1.6) * (0.45 + beatNow * 0.3);
        visEye.opacity = Math.min(1, ev * 1.8) * (0.7 + beatNow * 0.3);
      }
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
