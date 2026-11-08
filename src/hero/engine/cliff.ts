/** Sheet 09 · Cliffs: a misty mountain valley after Shadow of the Colossus and
 *  Hyper Light Drifter. A pale stone tower stands on a mesa in the middle of
 *  the valley and climbs through the cloud ceiling, with long arched bridges
 *  reaching it from the cliffs at different heights; one has fallen in. The
 *  ceiling thins out toward the horizon, where the sky is clear and overexposed.
 *  Mist lies in layers over a braided river, a Titan lies dead in the valley,
 *  four seal pillars send cyan beams up into the cloud and the tower's crown
 *  bleeds magenta through it. A small red drifter waits on the near bridge.
 *
 *  The palette is fixed (not the site accent): Ueda's washed-out teal mist and
 *  bleached stone, with Hyper Light magenta and old-tech cyan as the only colour.
 *  Tap where the tower meets the cloud to light it, the Titan to wake it, the
 *  drifter to dash. */
import * as THREE from "three";
import { pulse, type PsxKit, type SceneDef, type V3 } from "./psx";

const P = {
  fog: "#b3c5c3",
  zen: "#7ea6c8",
  glow: "#fbf3e6",
  rose: "#f3b4c8",
  mist: "#e6eeec",
  cloud: "#cdd5da",
  pink: "#ff4f9e",
  pinkHot: "#ffd0e6",
  cyan: "#62f0de",
  red: "#e0324f",
};

const NOISE = `
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ return vn(p) * 0.55 + vn(p * 2.03 + 7.1) * 0.3 + vn(p * 4.1 + 3.3) * 0.15; }`;

// Mist below the horizon, an overexposed clear band on it, blue overhead, rose where the sun sits.
const SKY_V = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_F = `
uniform vec3 uFog; uniform vec3 uZen; uniform vec3 uGlow; uniform vec3 uRose; uniform vec3 uSunDir; varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 c = mix(uGlow, uZen, smoothstep(0.0, 0.32, h));
  float s = max(dot(d, uSunDir), 0.0);
  c += uRose * exp(-abs(h) * 14.0) * (0.2 + 0.55 * pow(s, 6.0));
  c = mix(c, uGlow, pow(s, 40.0) * 0.6);
  c = mix(c, uFog, smoothstep(0.02, -0.06, h));
  gl_FragColor = vec4(c, 1.0);
}`;

// Mist layers and the cloud ceiling: drifting fbm, faded out past a radius so the horizon stays clear.
// Unsnapped: each sheet is one quad, and snapping a vertex far behind the lens throws the whole plane.
const VEIL_V = `
varying vec3 vWP; varying float vDepth;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vec4 mv = viewMatrix * wp; gl_Position = projectionMatrix * mv; vDepth = -mv.z; }`;
const VEIL_F = `
uniform float uTime; uniform vec3 uCol; uniform vec3 uFog; uniform vec3 uPink; uniform float uAlpha; uniform float uScale;
uniform vec2 uDrift; uniform vec2 uCut; uniform vec2 uR; uniform float uGlow; uniform float uFogNear; uniform float uFogFar;
varying vec3 vWP; varying float vDepth;
${NOISE}
void main(){
  vec2 q = vWP.xz * uScale + uDrift * uTime;
  float n = fbm(q + fbm(q * 0.5 + uTime * 0.02) * 1.5);
  float r = length(vWP.xz);
  float a = smoothstep(uCut.x, uCut.y, n) * uAlpha * (1.0 - smoothstep(uR.x, uR.y, r)) * smoothstep(6.0, 50.0, vDepth);
  vec3 c = mix(uCol * (0.86 + n * 0.2), uFog, smoothstep(uFogNear, uFogFar, vDepth) * 0.6);
  // The crown's light leaking down where the tower goes through.
  float ring = exp(-max(r - 8.0, 0.0) * 0.04) * uGlow;
  c += uPink * ring * 0.7;
  // Seen from above, the sunlit top: brighter and denser.
  float above = step(vWP.y, cameraPosition.y);
  c = mix(c, vec3(1.0, 0.98, 0.95), above * 0.5);
  a = min(1.0, a * (1.0 + above * 0.35));
  gl_FragColor = vec4(c, clamp(a + ring * 0.45 * uAlpha, 0.0, 1.0));
}`;

export function buildCliff(kit: PsxKit): SceneDef {
  const { U, rnd } = kit;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(52, 16 / 9, 0.5, 4000);

  const fogU = { value: new THREE.Color(P.fog) };
  const glowU = { value: 0.35 };
  // Kit materials, re-pointed at this scene's own fog so the accent switch leaves the palette alone.
  const own = <M extends THREE.ShaderMaterial>(m: M) => {
    m.uniforms.uFogColor = fogU;
    return m;
  };
  const lit = { amb: "#73838e", sun: "#f4ead6" };
  const mRock = own(kit.psx({ map: kit.tex.tStone, tint: "#93a5a2", moss: 0.9, uv: 1, ...lit }));
  const mFar = own(kit.psx({ map: kit.tex.tStone, tint: "#7d93a0", moss: 0.4, fogAmt: 0.72, ...lit }));
  const mWater = own(kit.psx({ map: kit.tex.tWater, tint: "#b4cccc", uv: 40, ...lit }));
  const mBark = own(kit.psx({ map: kit.tex.tBark, tint: "#8a8478", ...lit }));
  const mPine = [own(kit.psx({ map: kit.tex.tLeaf, tint: "#7a9a88", uv: 1.5, ...lit })), own(kit.psx({ map: kit.tex.tLeaf, tint: "#5f8070", uv: 1.5, ...lit }))];
  const mBone = own(kit.psx({ map: kit.tex.tPlain, tint: "#c8c2b4", moss: 0.5, ...lit }));
  const mSeal = own(kit.psx({ map: kit.tex.tStone, tint: "#8c8aa0", moss: 0.3, uv: 1.5, ...lit }));
  const mCloak = own(kit.psx({ map: kit.tex.tPlain, tint: P.red, amb: "#8a4050", sun: "#e07080", fogAmt: 0.3 }));
  const mInk = own(kit.psx({ map: kit.tex.tPlain, tint: "#2a2c48", amb: "#4a4c70", sun: "#6a6c90", fogAmt: 0.3 }));

  // Bleached ashlar in 4px courses with a dark slit window per half tile.
  const towerTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    if (!g) throw new Error("2d canvas unavailable");
    const img = g.createImageData(32, 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const row = Math.floor(y / 4), off = (row % 2) * 5, k = 0.84 + rnd() * 0.2;
      const joint = y % 4 === 0 || (x + off) % 10 === 0 ? 0.78 : 1;
      const slit = x % 16 >= 7 && x % 16 <= 8 && y >= 8 && y <= 22;
      const i = (y * 32 + x) * 4;
      if (slit) { img.data[i] = 40; img.data[i + 1] = 44; img.data[i + 2] = 52; }
      else { img.data[i] = 214 * k * joint; img.data[i + 1] = 206 * k * joint; img.data[i + 2] = 190 * k * joint; }
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  const mTower = own(kit.psx({ map: towerTex, tint: "#ece4d3", moss: 0.3, fogAmt: 0.8, amb: "#808e98", sun: "#fff0d8" }));
  const mTower2 = own(kit.psx({ map: towerTex, tint: "#cfc7b4", moss: 0.5, fogAmt: 0.8, amb: "#808e98", sun: "#fff0d8" }));

  const add = (color: string, opacity: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const ownLine = (color: string, fade: number) => own(kit.lineMat({ value: new THREE.Color(color) }, fade));

  /* ---- sky ---- */
  const SUN = new THREE.Vector3(-280, 110, -760);
  const sunDir = new THREE.Vector3();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1400, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uFog: fogU, uZen: { value: new THREE.Color(P.zen) }, uGlow: { value: new THREE.Color(P.glow) },
        uRose: { value: new THREE.Color(P.rose) }, uSunDir: { value: sunDir },
      },
      vertexShader: SKY_V,
      fragmentShader: SKY_F,
    }),
  );
  sky.renderOrder = -1;
  // Follows the camera, so pulling far back never leaves the dome.
  scene.add(sky);
  const sun = kit.sunDisc(scene, SUN.x, SUN.y, SUN.z, 20, "#fff7ea", "#ffd8c4");

  /* ---- valley: a river floor between two mountain walls, closed at both ends ---- */
  const W = (z: number) => 78 + 26 * Math.sin(z * 0.0065 + 0.8) + 10 * Math.sin(z * 0.019);
  const noise = (x: number, z: number) =>
    16 * Math.sin(x * 0.021 + z * 0.013) * Math.cos(z * 0.017 - x * 0.006) + 8 * Math.sin(x * 0.052 - z * 0.041) + 3.5 * Math.sin(x * 0.13 + z * 0.11);
  // Flat top, sheer sides.
  const mesa = (x: number, z: number, cx: number, cz: number, r: number, top: number) => top - Math.max(0, Math.hypot(x - cx, z - cz) - r) * 3.2;
  const wall = (d: number, side: number, z: number) =>
    d <= 0 ? 0 :
      250 * (1 - Math.exp(-d / 160)) * (0.66 + 0.24 * Math.sin(z * 0.011 + side * 1.7) + 0.18 * Math.sin(d * 0.009 - z * 0.004)) +
      80 * Math.max(0, Math.sin(d * 0.017 + 1) * Math.sin(z * 0.014 + side)) * Math.min(1, d / 120);
  const groundH = (x: number, z: number) => {
    const n = noise(x, z), w = W(z), d = Math.abs(x) - w;
    let h = -30 + Math.pow(Math.min(1, Math.abs(x) / w), 2) * 10 + n * 0.12;
    if (d > 0) h += wall(d, Math.sign(x), z) + n * Math.min(1.4, d / 30);
    // Both ends close off with the same saturating ridges as the sides.
    h = Math.max(h, -30 + wall(-z - 430, 1, x * 0.6) + n, -30 + wall(z - 540, -1, x * 0.6) + n);
    return Math.max(h, mesa(x, z, 0, 0, 30, 6), mesa(x, z, 96, 250, 34, 40));
  };
  {
    // Wide enough to stay under the camera at full zoom-out.
    const geo = new THREE.PlaneGeometry(2200, 2300, 180, 190);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, 100);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = groundH(x, z);
      p.setY(i, y);
      // Skewed planar UVs, with height in v, so sheer faces keep their texture instead of smearing it.
      uv.setXY(i, (x + z * 0.6) * 0.06, (z - x * 0.6) * 0.06 + y * 0.08);
    }
    kit.mesh(kit.facet(geo, 1.2), mRock, scene);
  }
  kit.mesh(new THREE.PlaneGeometry(2200, 2300, 1, 1), mWater, scene, 0, -27, 100, -Math.PI / 2);

  const b = kit.batcher();
  const box = (w: number, h: number, d: number, r = 0.1) => kit.facet(new THREE.BoxGeometry(w, h, d, 2, 2, 2), r);

  // Far ranges: fogged silhouettes in layers, some clearing the ceiling.
  for (let i = 0; i < 34; i++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 2.8, r = 620 + rnd() * 230;
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 100, h = 120 + rnd() * 150, rad = 70 + rnd() * 70;
    b.add(kit.facet(new THREE.ConeGeometry(rad, h, 5 + Math.floor(rnd() * 3), 3), rad * 0.12), mFar, x, h / 2 - 30, z, 0, rnd() * 3);
  }

  // Sparse pines on the lower slopes and boulders on the floor.
  for (let i = 0; i < 160; i++) {
    const z = -420 + rnd() * 760, x = (rnd() - 0.5) * 2 * (W(z) + 70), y = groundH(x, z);
    if (y < -25 || y > 50 || z > 190 || Math.hypot(x, z) < 40) continue;
    const s = 1.4 + rnd() * 1.6;
    b.add(kit.facet(new THREE.CylinderGeometry(0.3, 0.45, 3 * s, 5)), mBark, x, y + 1.2 * s, z);
    b.add(kit.facet(new THREE.ConeGeometry(1.8 * s, 7 * s, 6), 0.3), mPine[i % 2], x, y + 5.5 * s, z, 0, rnd() * 3);
  }
  for (let i = 0; i < 40; i++) {
    const z = -380 + rnd() * 620, x = (rnd() - 0.5) * 1.6 * W(z), r = 1.5 + rnd() * 4;
    b.add(kit.facet(new THREE.IcosahedronGeometry(r, 0), r * 0.3), mRock, x, groundH(x, z) + r * 0.3, z, rnd() * 3, rnd() * 3, 0);
  }

  /* ---- the tower ---- */
  const BASE = 34, TOP = 420, CEIL = 210;
  const rAt = (y: number) => 10 - (3 * (y - BASE)) / (TOP - BASE);
  // Stepped shrine plinth.
  [[44, 10, 11], [34, 10, 21], [24, 8, 30]].forEach(([w, h, y], i) => {
    b.add(kit.wallUV(kit.facet(new THREE.BoxGeometry(w, h, w, 2, 2, 2), 0.15), 0.09), i === 1 ? mTower2 : mTower, 0, y, 0);
  });
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    b.add(box(5, 7, 1, 0), mInk, Math.sin(a) * 22.2, 9.5, Math.cos(a) * 22.2, 0, a);
  }
  {
    const geo = new THREE.CylinderGeometry(rAt(TOP), rAt(BASE), TOP - BASE, 8, 24, true);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 30);
    b.add(kit.facet(geo, 0.2), mTower, 0, (BASE + TOP) / 2, 0);
  }
  for (let y = 62; y < TOP; y += 34) {
    const r = rAt(y) + 1.1;
    b.add(kit.facet(new THREE.CylinderGeometry(r, r, 1.8, 8)), mTower2, 0, y, 0);
  }
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    b.add(box(2.2, 74, 5, 0.1), mTower2, Math.cos(a) * 11, BASE + 37, Math.sin(a) * 11, 0, -a);
  }
  // A spiral ramp around the lower shaft, three turns.
  for (let i = 0; i < 90; i++) {
    const a = i * 0.21, y = BASE + 2 + i * 0.95, R = rAt(y) + 3.4;
    b.add(box(5, 0.8, 3.4, 0.05), mTower2, Math.cos(a) * R, y, Math.sin(a) * R, 0, Math.atan2(-Math.cos(a), -Math.sin(a)));
  }
  // Crown: a flared collar and four horns around a floating cell.
  b.add(kit.facet(new THREE.CylinderGeometry(13, rAt(TOP), 7, 8), 0.2), mTower2, 0, TOP + 3, 0);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    b.add(kit.facet(new THREE.ConeGeometry(2.2, 24, 4), 0.2), mTower, Math.cos(a) * 10.5, TOP + 18, Math.sin(a) * 10.5, Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
  }
  const CELL = new THREE.Vector3(0, TOP + 32, 0);
  const cellMat = new THREE.MeshBasicMaterial({ color: P.pink });
  const cell = kit.mesh(new THREE.OctahedronGeometry(3, 0).scale(1, 1.7, 1), cellMat, scene, CELL.x, CELL.y, CELL.z);
  const cellGlow = kit.flare(scene, CELL.x, CELL.y, CELL.z, 9);
  cellGlow.g.visible = true;
  cellGlow.mat.color.set(P.pink);
  const beamMat = add(P.pink, 0.1);
  kit.mesh(new THREE.CylinderGeometry(1.4, 1.4, 900, 6, 1, true), beamMat, scene, 0, CELL.y + 450, 0);

  /* ---- bridges: arched spans on tall piers, from the cliffs to the shaft ---- */
  const bridge = (sx: number, sz: number, ey: number, gap?: [number, number]) => {
    const sy = groundH(sx, sz) + 2;
    const a = Math.atan2(sz, sx), er = rAt(ey) + 0.5;
    const ex = Math.cos(a) * er, ez = Math.sin(a) * er;
    const dx = ex - sx, dz = ez - sz, dy = ey - sy, hl = Math.hypot(dx, dz);
    const n = Math.max(3, Math.round(hl / 22)), L = hl / n;
    const ry = Math.atan2(-dz, dx), rz = Math.atan2(dy, hl), slope = L / Math.cos(rz);
    const at = (u: number, o: V3) => o.set(sx + dx * u, sy + dy * u, sz + dz * u);
    const deck = box(slope + 0.3, 1.6, 5, 0.08);
    const rails = [-2.3, 2.3].map((o) => box(slope + 0.3, 1, 0.5, 0.05).translate(0, 1.2, o));
    const pierGeo = (h: number) => box(3, h, 3.6, 0.15);
    const R = L / 2 - 1.5;
    const arch = kit.facet(new THREE.TorusGeometry(R, 1.1, 4, 8, Math.PI), 0.1);
    const tie = box(L, 1.6, 2.6, 0.06);
    const p = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      const broken = gap && k >= gap[0] && k <= gap[1];
      at((k + 0.5) / n, p);
      const gm = groundH(p.x, p.z);
      if (broken) {
        // Fallen spans lie on the floor below.
        for (let j = 0; j < 3; j++) b.add(box(4 + rnd() * 6, 1.6, 4, 0.4), mTower2, p.x + (rnd() - 0.5) * 10, gm + 0.5, p.z + (rnd() - 0.5) * 10, rnd() * 0.5, rnd() * 3, rnd() * 0.5);
      } else {
        b.add(deck, mTower, p.x, p.y, p.z, 0, ry, rz);
        rails.forEach((g) => b.add(g, mTower2, p.x, p.y, p.z, 0, ry, rz));
        // Stacked arches, as many tiers as the drop allows.
        // Stacked arches, as many tiers as the drop allows; the lower ones carry a tie beam.
        for (let tier = 0, ay = p.y - 0.8 - R; tier < 3 && ay > gm + 4; tier++, ay -= R + 14) {
          b.add(arch, mTower2, p.x, ay, p.z, 0, ry, 0);
          if (tier) b.add(tie, mTower2, p.x, ay + R + 0.4, p.z, 0, ry, 0);
        }
      }
      if (k < n - 1) {
        at((k + 1) / n, p);
        const g = groundH(p.x, p.z), h = p.y - g + 4;
        if (h > 3) b.add(pierGeo(broken && gap && k === gap[1] ? h * 0.55 : h), mTower2, p.x, g - 4 + (broken && gap && k === gap[1] ? h * 0.275 : h / 2), p.z, 0, ry);
      }
    }
    // Gatehouse where it meets the tower, and an abutment at the cliff.
    b.add(box(7, 10, 7, 0.1), mTower2, ex + Math.cos(a) * 2.5, ey + 3.5, ez + Math.sin(a) * 2.5, 0, ry);
    b.add(box(3, 6, 1, 0), mInk, ex + Math.cos(a) * 6.1, ey + 2.2, ez + Math.sin(a) * 6.1, 0, ry + Math.PI / 2);
    b.add(box(8, 6, 8, 0.3), mTower2, sx, sy - 2, sz, 0, ry);
    return { at, n, ry, dir: new THREE.Vector3(dx, dy, dz).normalize() };
  };
  const near = bridge(96, 250, 58);
  bridge(-150, -40, 84);
  bridge(165, -170, 112, [5, 7]);
  bridge(-120, -300, 138);

  /* ---- four seal pillars on the floor, glyphs and beams into the ceiling ---- */
  const glyphs: V3[] = [];
  const beams: THREE.MeshBasicMaterial[] = [];
  const caps: THREE.Mesh[] = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, x = Math.cos(a) * 58, z = Math.sin(a) * 58, g = groundH(x, z);
    b.add(box(6, 2, 6, 0.2), mSeal, x, g + 0.6, z, 0, a);
    b.add(box(3, 30, 3, 0.15), mSeal, x, g + 15, z, 0, a);
    b.add(kit.facet(new THREE.ConeGeometry(2.2, 3, 4)), mSeal, x, g + 31.5, z, 0, a + Math.PI / 4);
    caps.push(kit.mesh(new THREE.OctahedronGeometry(0.9, 0).scale(1, 1.6, 1), new THREE.MeshBasicMaterial({ color: P.cyan }), scene, x, g + 36, z));
    const m = add(P.cyan, 0.16);
    beams.push(m);
    kit.mesh(new THREE.CylinderGeometry(0.35, 0.35, CEIL - g, 5, 1, true), m, scene, x, (CEIL + g) / 2, z);
    // Stacked rhombus glyphs on the face toward the tower.
    const fx = x - Math.cos(a) * 1.55, fz = z - Math.sin(a) * 1.55, ux = -Math.sin(a), uz = Math.cos(a);
    for (let j = 0; j < 4; j++) {
      const cy = g + 7 + j * 5;
      const q = [[0, 1.4], [0.9, 0], [0, -1.4], [-0.9, 0]].map(([s, h]) => new THREE.Vector3(fx + ux * s, cy + h, fz + uz * s));
      for (let i = 0; i < 4; i++) glyphs.push(q[i], q[(i + 1) % 4]);
    }
  }
  scene.add(kit.segs(glyphs, ownLine(P.cyan, 400)));

  /* ---- a dead Titan in the valley: skull and ribs half-sunk, one arm out ---- */
  const titan = new THREE.Group();
  titan.position.set(-46, groundH(-46, 44) - 4, 44);
  titan.rotation.set(0.1, 0.6, 0.25);
  scene.add(titan);
  const tb = kit.batcher();
  tb.add(box(14, 11, 15, 0.8), mBone, 0, 5, 0);
  tb.add(box(11, 4, 9, 0.5), mBone, 0, -0.5, 6, 0.3);
  tb.add(kit.facet(new THREE.ConeGeometry(1.6, 12, 4), 0.3), mBone, -7, 13, -1, 0, 0, 0.6);
  tb.add(kit.facet(new THREE.ConeGeometry(1.6, 10, 4), 0.3), mBone, 7, 12, -1, 0, 0, -0.75);
  for (let r = 0; r < 6; r++) tb.add(kit.facet(new THREE.TorusGeometry(9 - r * 0.6, 0.7, 4, 9, Math.PI * 0.9), 0.2), mBone, 0, -1, -12 - r * 4, 0, Math.PI / 2, 0.2);
  tb.add(box(1.4, 1.4, 26, 0.1), mBone, 0, 0, -20);
  tb.flush(titan);
  const arm = kit.batcher();
  arm.add(kit.facet(new THREE.CylinderGeometry(1.8, 2.3, 16, 6, 2), 0.3), mBone, 18, 4, 4, 0, 0, -0.5);
  arm.add(box(4, 3, 4, 0.3), mBone, 22.5, 11, 4);
  for (let f = 0; f < 4; f++) arm.add(box(0.8, 4, 0.8, 0.1), mBone, 22 + f * 0.9, 14, 2.8 + f * 0.8, 0, 0, -0.3 + f * 0.15);
  arm.flush(titan);
  const eyeMat = new THREE.MeshBasicMaterial({ color: "#2a2e3c" });
  [-3.2, 3.2].forEach((ex) => kit.mesh(new THREE.BoxGeometry(3, 1.4, 0.6), eyeMat, titan, ex, 6.5, 7.6));
  const titanEye = new THREE.Vector3();

  b.flush(scene);

  /* ---- the drifter on the near bridge ---- */
  const DRIFT_U = 0.22;
  const drifterAt = near.at(DRIFT_U, new THREE.Vector3());
  drifterAt.y += 0.8;
  const figure = (mats: THREE.Material[], into: THREE.Group) => {
    kit.mesh(kit.facet(new THREE.ConeGeometry(0.42, 1.0, 5)), mats[0], into, 0, 0.5, 0);
    kit.mesh(kit.facet(new THREE.BoxGeometry(0.34, 0.3, 0.32)), mats[1], into, 0, 1.12, 0);
    kit.mesh(new THREE.BoxGeometry(0.05, 0.05, 0.8), mats[2], into, 0.32, 0.55, 0.3, -0.5);
    into.scale.setScalar(2.2);
    into.rotation.y = near.ry - Math.PI / 2;
  };
  const drifter = new THREE.Group();
  drifter.position.copy(drifterAt);
  scene.add(drifter);
  figure([mCloak, mInk, new THREE.MeshBasicMaterial({ color: P.cyan })], drifter);
  const ghostMat = add(P.cyan, 0);
  const ghosts = [0, 1, 2].map(() => {
    const g = new THREE.Group();
    g.visible = false;
    figure([ghostMat, ghostMat, ghostMat], g);
    scene.add(g);
    return g;
  });

  /* ---- mist and the ceiling ---- */
  const veil = (y: number, col: string, alpha: number, scale: number, drift: [number, number], cut: [number, number], r: [number, number], order: number, glow = { value: 0 }) => {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uTime: U.uTime, uCol: { value: new THREE.Color(col) }, uFog: fogU, uPink: { value: new THREE.Color(P.pink) },
        uAlpha: { value: alpha }, uScale: { value: scale }, uDrift: { value: new THREE.Vector2(...drift) },
        uCut: { value: new THREE.Vector2(...cut) }, uR: { value: new THREE.Vector2(...r) }, uGlow: glow,
        uFogNear: U.uFogNear, uFogFar: U.uFogFar,
      },
      vertexShader: VEIL_V,
      fragmentShader: VEIL_F,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    kit.mesh(new THREE.PlaneGeometry(2400, 2400, 1, 1), m, scene, 0, y, -150, -Math.PI / 2).renderOrder = order;
    return m;
  };
  // Lowest first: the camera looks down through them.
  veil(-16, P.mist, 0.55, 0.012, [0.05, 0.02], [0.35, 0.75], [520, 900], 1);
  veil(-2, P.mist, 0.5, 0.009, [-0.04, 0.03], [0.4, 0.8], [480, 880], 2);
  veil(14, P.mist, 0.4, 0.007, [0.03, -0.02], [0.45, 0.85], [440, 860], 3);
  veil(32, P.mist, 0.28, 0.006, [-0.02, -0.03], [0.5, 0.88], [400, 820], 4);
  // The ceiling: thick over the valley, thinning out before the horizon.
  veil(CEIL, P.cloud, 0.85, 0.005, [0.02, 0.012], [0.3, 0.66], [320, 820], 6, glowU);
  veil(CEIL + 18, P.glow, 0.45, 0.004, [0.015, 0.02], [0.38, 0.75], [280, 760], 7, glowU);

  // Shafts of light through gaps in the ceiling.
  const shafts = [[-90, -70, 0.2], [70, -150, -0.15], [-30, 130, 0.12], [40, -320, 0.18]].map(([x, z, tilt], i) => {
    const m = add("#fff2dc", 0.04);
    kit.mesh(new THREE.CylinderGeometry(8, 26, CEIL + 30, 8, 1, true), m, scene, x, (CEIL - 30) / 2, z, 0, i, tilt).renderOrder = 5;
    return m;
  });

  /* ---- birds circling the tower ---- */
  const BIRDS = 16;
  const birdPos = new Float32Array(BIRDS * 4 * 3);
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute("position", new THREE.BufferAttribute(birdPos, 3));
  const birdLines = new THREE.LineSegments(birdGeo, ownLine("#f6f3ea", 500));
  birdLines.frustumCulled = false;
  scene.add(birdLines);
  const bird = Array.from({ length: BIRDS }, () => ({
    r: 26 + rnd() * 50, y: 100 + rnd() * 80, w: (0.1 + rnd() * 0.12) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6.28,
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
  const pivotWide = new THREE.Vector3(0, 92, 0);
  // Portrait crops the sides; aim a little higher so the ceiling and the crossing stay in frame.
  const pivotTall = new THREE.Vector3(0, 108, 0);
  const base = new THREE.Vector3(50, 28, 400);
  const ZOOM_MIN = 0.45, FOG: [number, number] = [60, 950];
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
      cellGlow.mat.opacity = 0.35 + breath * 0.15 + es * 0.5;
      cellGlow.g.quaternion.copy(cam.quaternion);
      cell.rotation.y = t * 0.4;
      cell.position.y = CELL.y + Math.sin(t * 0.6) * 1.2;
      beams.forEach((m, i) => { m.opacity = 0.12 + 0.05 * Math.sin(t * 1.6 + i) + es * 0.3; });
      caps.forEach((m, i) => { m.rotation.y = t * 0.8 + i; });
      shafts.forEach((m, i) => { m.opacity = 0.03 + 0.02 * Math.sin(t * 0.25 + i * 1.7); });

      // Titan wakes: eyes flare cyan, head lifts a little.
      eyeMat.color.setRGB(0.16 + et * 0.3, 0.18 + et * 0.8, 0.24 + et * 0.7);
      titan.rotation.x = 0.1 - et * 0.06;
      titan.updateMatrixWorld();
      titanEye.set(0, 6.5, 7.6).applyMatrix4(titan.matrixWorld);

      // Drifter: dashes up the bridge and back, leaving afterimages.
      const step = ed * 7;
      drifter.position.copy(drifterAt).addScaledVector(near.dir, step);
      drifter.rotation.z = Math.sin(t * 1.4) * 0.03;
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
      // cloud with the tower standing out of it, and the aim rises with it so the clear horizon
      // stays in frame. Fog recedes with the camera so it stays legible.
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
      // Keep clear of the ridges when turning or tilting toward them.
      cam.position.y = Math.max(cam.position.y, groundH(cam.position.x, cam.position.z) + 14);
      const k = Math.max(1, 1 / view.zoom);
      fog[0] = FOG[0] * k;
      fog[1] = FOG[1] * k;
      sky.position.copy(cam.position);

      sunDir.copy(SUN).sub(cam.position).normalize();
      sun.lookAt(cam.position);
    },
    readout: () => {
      const surge = pulse(tNow - surgeT, 5) > 0.05;
      return [
        ["ALT", `${Math.round((cam.position.y + 30) * 9.5).toLocaleString("en-US")} m`],
        ["MIST", `${Math.round(62 + 8 * Math.sin(tNow * 0.07))}%`],
        ["CEILING", "1,930 m"],
        ["BEARING", `${kit.pad(Math.round(kit.bearing(cam)), 3)}°`],
        ["SPIRE", surge ? "LIT" : "DORMANT"],
      ];
    },
  };
}
