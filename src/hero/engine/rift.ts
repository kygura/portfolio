/** Sheet · Rift: the wasteland in a forested mountain valley at the end of
 *  the day. A green forest floor of broadleaf trees, bushes and ferns gives way
 *  to conifers that cover the mountainsides up to a high treeline, bare rock
 *  showing only on the sheer faces and crests, with dead snags standing
 *  grey among them; spires crown every ridge in
 *  silhouette and rise out of the canopy, blades as tall as the walls jut out
 *  of them and lean in over the trees, and a colossal shard lies wedged from
 *  wall to wall. Down a grassy clearing in the middle runs a river of broken glass.
 *  Ash drifts down, mist lies in the trees, stone hangs in the gap, islands
 *  float upside down against an ember sky, and the sun sits in the notch at
 *  the valley's far end.
 *
 *  The palette is fixed (slate violet rock, ember dusk); only the seams, the
 *  glints in the glass river and the ash take the site accent.
 *  Tap the wedged shard to wake its seams, the glass river to light it, the
 *  sun to flare it. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pulse, type PsxKit, type SceneDef } from "./psx";
import { createWaste } from "./wasteland";

const P = {
  zen: "#1a2140",
  mid: "#5a4868",
  hor: "#ec9a60",
  fog: "#86707e",
  glow: "#ffb070",
  sun: "#fff0d8",
  mist: "#a08890",
};

const SKY_V = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_F = `
uniform vec3 uZen; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uFog; uniform vec3 uGlow; uniform vec3 uSunDir; uniform float uFlare; uniform float uTime; varying vec3 vDir;
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.14, h));
  c = mix(c, uZen, smoothstep(0.12, 0.6, h));
  float s = max(dot(d, uSunDir), 0.0);
  c += uGlow * (pow(s, 6.0) * 0.35 + pow(s, 50.0) * 0.5) * (1.0 + uFlare * 1.6);
  vec3 q = floor(d * 150.0); float st = hash(q);
  c += vec3(step(0.997, st) * smoothstep(0.35, 0.7, h) * (0.5 + 0.5 * sin(uTime * 1.5 + st * 60.0))) * 0.7;
  c = mix(c, uFog, smoothstep(0.02, -0.06, h));
  gl_FragColor = vec4(c, 1.0);
}`;

export function buildRift(kit: PsxKit): SceneDef {
  const { U, rnd, facet, tex, view } = kit;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(54, 16 / 9, 0.5, 3000);
  const fog: [number, number] = [40, 640];

  const fogU = { value: new THREE.Color(P.fog) };
  const own = <M extends THREE.ShaderMaterial>(m: M) => {
    m.uniforms.uFogColor = fogU;
    return m;
  };
  const lit = { amb: "#5e5276", sun: "#ffb48a" };
  const mRock = own(kit.psx({ map: tex.tStone, tint: "#8c9088", moss: 0.85, ...lit }));
  const mFloor = own(kit.psx({ map: tex.tGround, tint: "#c4e2a0", moss: 0.45, ...lit }));
  const mSpire = own(kit.psx({ map: tex.tStone, tint: "#5a5070", ...lit }));
  const mDark = own(kit.psx({ map: tex.tPlain, tint: "#2e2a40", ...lit }));
  const mBlade = own(kit.psx({ map: tex.tPlain, tint: "#8a7c90", ...lit }));
  const mGlass = own(kit.psx({ map: tex.tGlass, tint: "#7c88a8", ...lit }));
  const mDebris = own(kit.psx({ map: tex.tStone, tint: "#968a98", ...lit }));
  const mRust = own(kit.psx({ map: tex.tBark, tint: "#9a5e4a", ...lit }));
  const mSeam = own(kit.psx({ map: tex.tPlain, tint: "#000000", emit: 1, fogAmt: 0.3 }));
  const mCore = own(kit.psx({ map: tex.tPlain, tint: "#000000", emit: 1, fogAmt: 0.25 }));
  const mRiver = own(kit.psx({ map: tex.tPlain, tint: "#000000", emit: 0.6, fogAmt: 0.4 }));
  const mBark = own(kit.psx({ map: tex.tBark, tint: "#7a6662", ...lit }));
  const mSnag = own(kit.psx({ map: tex.tBark, tint: "#a6989a", ...lit }));
  const mPine = ["#628a62", "#4c7052", "#6e8e5c"].map((tint) => own(kit.psx({ map: tex.tLeaf, tint, uv: 1.5, ...lit })));
  const mLeaf = ["#8cb062", "#76a058", "#9cb468"].map((tint) => own(kit.psx({ map: tex.tLeaf, tint, uv: 1.5, ...lit })));
  const mBush = ["#7aa25a", "#5e8a4e"].map((tint) => own(kit.psx({ map: tex.tLeaf, tint, uv: 2, ...lit })));
  const mGrass = own(kit.psx({ map: tex.tLeaf, tint: "#b4d07c", side: THREE.DoubleSide, ...lit }));
  const mBloom = own(kit.psx({ map: tex.tPlain, tint: "#ecd892", ...lit }));
  const W = createWaste(kit, { debris: mDebris, rust: mRust, seam: mSeam });
  const { between } = W;

  /* ---- sky, and the sun in the notch at the far end ---- */
  const SUN = new THREE.Vector3(40, 90, -1300);
  const sunDir = new THREE.Vector3();
  const skyU = {
    uZen: { value: new THREE.Color(P.zen) }, uMid: { value: new THREE.Color(P.mid) }, uHor: { value: new THREE.Color(P.hor) },
    uFog: fogU, uGlow: { value: new THREE.Color(P.glow) }, uSunDir: { value: sunDir }, uFlare: { value: 0 }, uTime: U.uTime,
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 16),
    new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: skyU, vertexShader: SKY_V, fragmentShader: SKY_F }),
  );
  sky.renderOrder = -1;
  scene.add(sky);
  const sun = kit.sunDisc(scene, SUN.x, SUN.y, SUN.z, 34, P.sun, P.glow);

  /* ---- the valley: a floor between two walls that run away from the eye ---- */
  const Wv = (z: number) => 52 + 12 * Math.sin(z * 0.012 + 1) + 5 * Math.sin(z * 0.031);
  const noise = (x: number, z: number) =>
    10 * Math.sin(x * 0.03 + z * 0.017) * Math.cos(z * 0.021 - x * 0.011) + 4 * Math.sin(x * 0.07 - z * 0.05) + 1.5 * Math.sin(x * 0.19 + z * 0.13);
  const wall = (d: number, side: number, z: number) =>
    190 * (1 - Math.exp(-d / 95)) * (0.7 + 0.22 * Math.sin(z * 0.013 + side * 1.9)) + 40 * Math.max(0, Math.sin(d * 0.03 + z * 0.01 + side)) * Math.min(1, d / 80);
  const groundH = (x: number, z: number) => {
    const n = noise(x, z), w = Wv(z), ax = Math.abs(x), d = ax - w;
    let h = n * 0.08 + Math.pow(Math.min(1, ax / w), 2) * 2;
    if (d > 0) h += wall(d, Math.sign(x), z) + n * Math.min(1.3, d / 25);
    return h;
  };
  {
    const geo = new THREE.PlaneGeometry(1000, 1500, 130, 180);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -550);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = groundH(x, z);
      p.setY(i, y);
      // Skewed planar UVs with height in v, so the sheer walls keep their texture.
      uv.setXY(i, (x + z * 0.6) * 0.06, (z - x * 0.6) * 0.06 + y * 0.08);
    }
    // Green forest floor on the valley bottom and the gentler lower slopes; bare rock on the
    // sheer faces and above the treeline (where the moss still catches on ledges).
    const g = facet(geo, 1), gp = g.attributes.position, gn = g.attributes.normal;
    const floor: number[] = [], rock: number[] = [];
    for (let t = 0; t < gp.count; t += 3) {
      const cx = (gp.getX(t) + gp.getX(t + 1) + gp.getX(t + 2)) / 3;
      const cy = (gp.getY(t) + gp.getY(t + 1) + gp.getY(t + 2)) / 3;
      const cz = (gp.getZ(t) + gp.getZ(t + 1) + gp.getZ(t + 2)) / 3;
      const ny = (gn.getY(t) + gn.getY(t + 1) + gn.getY(t + 2)) / 3;
      const onFloor = Math.abs(cx) < Wv(cz) + 6 || (ny > 0.4 && cy < 175 + 18 * Math.sin(cx * 0.05 + cz * 0.03));
      (onFloor ? floor : rock).push(t);
    }
    const pick = (tris: number[]) => {
      const out = new THREE.BufferGeometry();
      for (const name of ["position", "normal", "uv"] as const) {
        const a = g.attributes[name], n = a.itemSize, arr = new Float32Array(tris.length * 3 * n);
        tris.forEach((t, k) => arr.set((a.array as Float32Array).subarray(t * n, (t + 3) * n), k * 3 * n));
        out.setAttribute(name, new THREE.BufferAttribute(arr, n));
      }
      return out;
    };
    kit.mesh(pick(floor), mFloor, scene);
    kit.mesh(pick(rock), mRock, scene);
  }

  /* ---- the forest: conifers on the floor and up the walls, thinning out to a treeline,
     dead snags among them, a clearing down the middle for the river ---- */
  const riverX = (z: number) => 6 * Math.sin(z * 0.02);
  {
    const fb = W.batch();
    const trunk = facet(new THREE.CylinderGeometry(0.22, 0.4, 4, 5, 1, true).translate(0, 2, 0));
    const crown = facet(
      mergeGeometries([
        new THREE.ConeGeometry(2.6, 5, 6, 1, true).translate(0, 5, 0),
        new THREE.ConeGeometry(2.0, 4.2, 6, 1, true).translate(0, 7.6, 0),
        new THREE.ConeGeometry(1.3, 3.6, 6, 1, true).translate(0, 10, 0),
      ])!,
      0.25,
    );
    const snag = facet(
      mergeGeometries([
        new THREE.CylinderGeometry(0.12, 0.32, 10, 5, 1, true).translate(0, 5, 0),
        new THREE.CylinderGeometry(0.03, 0.09, 3, 4, 1, true).translate(0, 1.5, 0).rotateZ(0.9).translate(0, 6.5, 0),
        new THREE.CylinderGeometry(0.03, 0.08, 2.4, 4, 1, true).translate(0, 1.2, 0).rotateZ(-1.1).translate(0, 7.8, 0),
        new THREE.CylinderGeometry(0.03, 0.07, 2, 4, 1, true).translate(0, 1, 0).rotateX(0.9).translate(0, 8.6, 0),
      ])!,
    );
    // Broadleaf trees: a taller trunk under a lumpy crown of a few rough balls.
    const bTrunk = facet(new THREE.CylinderGeometry(0.2, 0.42, 5.5, 5, 1, true).translate(0, 2.75, 0));
    const bCrown = facet(
      mergeGeometries([
        new THREE.IcosahedronGeometry(2.6, 0).translate(0, 6.8, 0),
        new THREE.IcosahedronGeometry(2.0, 0).translate(1.6, 6.0, 0.6),
        new THREE.IcosahedronGeometry(1.9, 0).translate(-1.3, 6.3, -0.9),
        new THREE.IcosahedronGeometry(1.6, 0).translate(0.2, 8.6, 0.3),
      ])!,
      0.5,
    );
    // Fine grid over the floor and lower walls, a coarser one further up the mountainsides.
    const STEP = 5;
    const cols: [number, number][] = [];
    for (let gx = -280; gx < 280; ) {
      const st = Math.abs(gx) < 170 ? STEP : 8;
      cols.push([gx, st]);
      gx += st;
    }
    for (let z = 40; z > -820; z -= STEP) {
      for (const [gx, st] of cols) {
        const x = gx + (rnd() - 0.5) * st, zz = z + (rnd() - 0.5) * STEP, y = groundH(x, zz);
        const clear = Math.abs(x - riverX(zz)) - (5 + -zz * 0.006);
        // Dense on the floor, thinning with height up the walls; none in the river's clearing.
        const onFloor = Math.abs(x) < Wv(zz);
        const p = (onFloor ? 0.82 : 0.72) * THREE.MathUtils.smoothstep(205 - y, 0, 60) * THREE.MathUtils.smoothstep(clear, 0, 6);
        if (rnd() > p) continue;
        const s = between(0.8, 1.7) * (y > 130 ? 0.8 : 1), ry = rnd() * 6.28, kind = rnd();
        // Broadleaf trees crowd the warm valley bottom and thin out up the walls, where the pines take over.
        const broad = onFloor ? 0.4 : 0.4 * THREE.MathUtils.smoothstep(70 - y, 0, 50);
        if (kind < 0.035) {
          fb.add(snag, mSnag, x, y - 0.4, zz, (rnd() - 0.5) * 0.12, ry, (rnd() - 0.5) * 0.12, s * 1.3);
        } else if (kind < 0.035 + broad) {
          fb.add(bTrunk, mBark, x, y - 0.3, zz, 0, ry, 0, s);
          fb.add(bCrown, mLeaf[Math.floor(rnd() * 3)], x, y - 0.3, zz, 0, ry, 0, s * between(0.85, 1.15));
        } else {
          fb.add(trunk, mBark, x, y - 0.3, zz, 0, ry, 0, s);
          fb.add(crown, mPine[Math.floor(rnd() * 3)], x, y - 0.3, zz, 0, ry, 0, s);
        }
      }
    }
    fb.flush(scene);
  }

  /* ---- undergrowth: bushes under the trees and along the clearing, and a meadow of grass
     and a few pale flowers down the river's banks ---- */
  {
    const ub = W.batch();
    const bush = facet(
      mergeGeometries([
        new THREE.IcosahedronGeometry(1, 0).scale(1.3, 0.8, 1.2),
        new THREE.IcosahedronGeometry(0.75, 0).scale(1.2, 0.8, 1).translate(0.9, -0.1, 0.4),
      ])!,
      0.25,
    );
    const fern = facet(
      mergeGeometries(
        [0, 1.26, 2.51, 3.77, 5.03].map((a) =>
          new THREE.ConeGeometry(0.22, 1.5, 3, 1, true).translate(0, 0.75, 0).rotateX(0.7).rotateY(a),
        ),
      )!,
    );
    const tuft = facet(
      mergeGeometries(
        [0, 2.1, 4.2].map((a) => new THREE.ConeGeometry(0.12, 1.1, 3, 1, true).translate(0, 0.55, 0).rotateX(0.25).rotateY(a)),
      )!,
    );
    const bloom = facet(new THREE.TetrahedronGeometry(0.22, 0));
    for (let i = 0; i < 6500; i++) {
      // Most on the floor, the rest scattered up the lower mountainsides.
      const z = between(-560, 50), x = (rnd() - 0.5) * (i % 3 ? 2.2 * Wv(z) : 360), y = groundH(x, z);
      if (y > 150) continue;
      const clear = Math.abs(x - riverX(z)) - (5 + -z * 0.006);
      if (clear < 0.5) continue;
      if (rnd() < 0.6) ub.add(bush, mBush[i % 2], x, y - 0.3, z, 0, rnd() * 6.28, 0, between(0.7, 1.9));
      else ub.add(fern, mBush[(i + 1) % 2], x, y - 0.2, z, 0, rnd() * 6.28, 0, between(0.9, 1.6));
    }
    // The meadow fills the clearing and spills under the first trees; nearer the eye it is denser.
    for (let i = 0; i < 5200; i++) {
      const z = -Math.pow(rnd(), 1.6) * 520 + 50, half = 7 + -z * 0.006;
      const x = riverX(z) + (rnd() - 0.5) * 2 * half;
      if (Math.abs(x - riverX(z)) < 1.6) continue;
      const y = groundH(x, z), ry = rnd() * 6.28;
      if (rnd() < 0.06) ub.add(bloom, mBloom, x, y + 0.5, z, rnd(), ry, rnd());
      else ub.add(rnd() < 0.8 ? tuft : fern, rnd() < 0.8 ? mGrass : mBush[0], x, y - 0.15, z, 0, ry, 0, between(0.8, 1.6));
    }
    ub.flush(scene);
  }

  const b = W.batch();
  const side = () => (rnd() > 0.5 ? 1 : -1);
  // Spires crowning the slopes and ridges, in silhouette against the dusk.
  for (let i = 0; i < 90; i++) {
    const s = side(), z = between(-950, 60), d = between(50, 170), x = s * (Wv(z) + d), h = between(14, 50) * (1 + d / 160);
    W.spire(b, x, groundH(x, z) - 3, z, h, [mSpire, mDark, mGlass], true, { lean: 1.6 });
  }
  // Blades as tall as the walls, driven into them and leaning in over the floor.
  for (let i = 0; i < 22; i++) {
    const s = side(), z = between(-760, -60), x = s * (Wv(z) + between(10, 40)), h = between(30, 80), w = h * between(0.1, 0.16);
    b.add(W.blade(w, h, w * 0.3, Math.min(h * 0.4, w * 2)), mBlade, x, groundH(x, z) - 6, z, between(-0.15, 0.15), between(-0.3, 0.3), s * between(0.45, 0.95));
  }
  // On the floor: towers rising out of the canopy, and wreckage in the clearing and under the trees.
  for (let i = 0; i < 20; i++) {
    const z = between(-700, -110), x = (rnd() - 0.5) * 1.4 * Wv(z);
    if (Math.abs(x - riverX(z)) < 8) continue;
    W.spire(b, x, groundH(x, z) - 1, z, between(26, 64), [mSpire, mDark], true);
  }
  for (let i = 0; i < 50; i++) {
    const z = between(-640, 34), x = (rnd() - 0.5) * 1.6 * Wv(z);
    W.junk(b, x, groundH(x, z), z, between(0.5, 2));
  }
  for (let i = 0; i < 6; i++) b.add(W.island(between(6, 14)), mSpire, (rnd() - 0.5) * 80, between(110, 200), between(-220, -720), 0, rnd() * 3, 0);
  b.flush(scene);

  // The glass river: a braid of small dark shards down the middle of the floor, some of them lit.
  {
    const rb = W.batch();
    for (let i = 0; i < 240; i++) {
      const z = between(-820, 44), x = riverX(z) + (rnd() - 0.5) * (3 + -z * 0.004);
      rb.add(W.shard(between(0.25, 0.7), between(0.8, 3.6), 3), i % 7 ? mGlass : mRiver, x, groundH(x, z) - 0.2, z, (rnd() - 0.5) * 1.6, 0, (rnd() - 0.5) * 1.6);
    }
    rb.flush(scene);
  }

  // The wedge: a colossal shard lying from wall to wall, caught at the height where the walls close on it.
  const WZ = -270, WY = 46;
  const wedge = new THREE.Group();
  wedge.position.set(0, WY, WZ);
  wedge.rotation.set(0.06, 0.12, 0.1);
  scene.add(wedge);
  {
    const span = 2 * (Wv(WZ) + 60), wb = W.batch();
    wb.add(W.shard(7, span, 4).rotateZ(Math.PI / 2).translate(span / 2, 0, 0), mBlade, 0, 0, 0);
    wb.add(facet(new THREE.BoxGeometry(span * 0.6, 0.8, 0.8)), mCore, 0, 0, 3.6);
    wb.add(facet(new THREE.BoxGeometry(span * 0.4, 0.8, 0.8)), mCore, -span * 0.08, 2.4, 3.2);
    for (let i = 0; i < 9; i++) wb.add(W.shard(between(0.6, 1.4), between(4, 12), 3).rotateX(Math.PI), mBlade, between(-span * 0.35, span * 0.35), -2, between(-2, 2));
    wb.flush(wedge);
  }

  const hang = W.hanging(scene, 24, [mDebris, mDark, mRust], (s) => {
    const z = between(-300, -20);
    return [(rnd() - 0.5) * 1.6 * Wv(z), between(26, 56) + s, z];
  });

  // Mist lying in the trees.
  for (const [y, o] of [[9, 0.14], [5, 0.1]]) {
    const m = kit.mesh(
      new THREE.PlaneGeometry(500, 1400).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: P.mist, transparent: true, opacity: o, depthWrite: false }),
      scene, 0, y, -560,
    );
    m.renderOrder = 1;
  }

  /* ---- eggs ---- */
  let wedgeT = -99, riverT = -99, sunT = -99, tNow = 0;

  return {
    scene,
    cam,
    fog,
    fov: [54, 70],
    limits: { pitch: [-0.3, 0.5], zoom: [0.8, 2.8], yaw: 0.7 },
    labels: [
      { name: "Wedge", sub: "WALL TO WALL", at: (v) => { v.set(0, WY + 14, WZ); } },
      { name: "River", sub: "GLASS, IN A CLEARING", at: (v) => { v.set(0, 4, -90); } },
    ],
    eggs: [
      { id: "rift-wedge", r: 60, at: (v) => { v.set(0, WY, WZ); }, fire: (t) => { wedgeT = t; } },
      { id: "rift-river", r: 40, at: (v) => { v.set(riverX(-60), 1, -60); }, fire: (t) => { riverT = t; } },
      { id: "rift-sun", r: 46, at: (v) => { v.copy(SUN); }, fire: (t) => { sunT = t; } },
    ],
    update(t) {
      tNow = t;
      hang(t);
      const ew = pulse(t - wedgeT, 4), er = pulse(t - riverT, 3);
      mCore.uniforms.uEmit.value = 0.6 + 0.25 * Math.sin(t * 0.9) + ew * 2.4;
      mRiver.uniforms.uEmit.value = 0.45 + 0.2 * Math.sin(t * 2.3) + er * 2.5;
      const es = t - sunT;
      sun.scale.setScalar(1 + 0.4 * pulse(es, 1.6));
      skyU.uFlare.value = pulse(es, 2.4);

      // Above the canopy, looking down the valley toward the notch.
      const x = Math.sin(t * 0.03) * 4 + view.px * 2, z = 64 + Math.sin(t * 0.02) * 6;
      cam.position.set(x, groundH(x, z) + 40 - view.py * 0.5, z);
      cam.lookAt(view.px * 8 + Math.sin(t * 0.025) * 6, 30 - view.py * 6, -400);
      kit.look(cam);
      sky.position.copy(cam.position);
      sunDir.copy(SUN).sub(cam.position).normalize();
      sun.lookAt(cam.position);
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
