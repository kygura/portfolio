/** Sheet 01 · Ocean: endless swell, palm islands, the King of Red Lions moored at a pier, twin suns.
 *  Out past the islands the wasteland rings the horizon: mossed shard towers and blades, wreckage in the swell,
 *  stone hanging around the spire and islands floating upside down. */
import * as THREE from "three";
import { pulse, type PsxKit, type SceneDef, type V3 } from "./psx";
import { createWaste } from "./wasteland";

// Sail cloth with the Wind Waker crest (a hooked S curling into a spiral) near the luff.
// u runs luff to leech, v foot to head; 64px, nearest-filtered like the kit's textures.
function sailTex() {
  const S = 64, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d canvas unavailable");
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = 0.92 + ((x * 7 + y * 13) % 5) * 0.02;
    g.fillStyle = `rgb(${236 * k},${230 * k},${212 * k})`;
    g.fillRect(x, y, 1, 1);
  }
  g.strokeStyle = g.fillStyle = "#3f8c8e";
  g.lineWidth = 4.5;
  g.lineCap = "round";
  g.beginPath();
  g.arc(20, 24, 6, Math.PI * 1.15, Math.PI * 0.5);
  g.arc(20, 36, 6, Math.PI * 1.5, Math.PI * 0.1, true);
  g.arc(23, 37, 2.5, Math.PI * 0.1, Math.PI * 1.2);
  g.stroke();
  g.beginPath();
  g.moveTo(13, 21); g.lineTo(17, 13); g.lineTo(19, 20);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

export function buildOcean(k: PsxKit): SceneDef {
  const { rnd, facet, mesh, psx, M, tex, view } = k;
  const PIVOT = new THREE.Vector3(0, 6, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(64, 16 / 9, 0.1, 320);
  const sky = k.skyDome(0, 0.3, 2.2);
  scene.add(sky);

  const wave = (x: number, z: number, t: number) =>
    0.26 * Math.sin(x * 0.19 + z * 0.05 + t * 0.85) +
    0.17 * Math.sin(z * 0.23 - x * 0.07 - t * 0.66) +
    0.08 * Math.sin((x + z) * 0.47 + t * 1.5);

  const mat = {
    water: psx({ map: tex.tWater, tint: "#a6c9cc", amb: "#46606c", sun: "#c9c2a8" }),
    foam: psx({ map: tex.tPlain, tint: "#d4e2dc", amb: "#7d8c90" }),
    sand: psx({ map: tex.tSand, uv: 3 }),
    grass: psx({ map: tex.tGround, tint: "#d0dca8", moss: 0.5, uv: 2 }),
    glass2: psx({ map: tex.tGlass, tint: "#a9b9c4", moss: 0.9 }),
    trunk: psx({ map: tex.tBark, tint: "#b8a488" }),
    frond: psx({ map: tex.tLeaf, tint: "#a8c47c", uv: 1.5 }),
    wood: psx({ map: tex.tBark, tint: "#9c8a74", uv: 2 }),
    shard: psx({ map: tex.tPlain, tint: "#6d7a78", moss: 0.6, fogAmt: 0.8 }),
    rust: psx({ map: tex.tBark, tint: "#a87a64" }),
  };

  const { add, flush } = k.batcher();
  // Cylinder from a to b (geometry already in place).
  const up = new THREE.Vector3(0, 1, 0);
  const seg = (a: V3, b: V3, r0: number, r1: number, n = 5) => {
    const g = new THREE.CylinderGeometry(r1, r0, a.distanceTo(b) * 1.08, n, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return facet(g, 0.03);
  };

  /* ---- ocean: a grid denser near the camera, displaced every frame ---- */
  const WN = 72, WH = 170, WCX = 10, WCZ = -18;
  const warp = (u: number) => Math.sign(u) * Math.pow(Math.abs(u), 1.8) * WH;
  const wg = new THREE.PlaneGeometry(2, 2, WN, WN);
  wg.rotateX(-Math.PI / 2);
  const wp0 = wg.attributes.position;
  for (let i = 0; i < wp0.count; i++) wp0.setXYZ(i, WCX + warp(wp0.getX(i)), 0, WCZ + warp(wp0.getZ(i)));
  const water = facet(wg);
  const wpos = water.attributes.position, wuv = water.attributes.uv;
  const wx = new Float32Array(wpos.count), wz = new Float32Array(wpos.count);
  for (let i = 0; i < wpos.count; i++) {
    wx[i] = wpos.getX(i);
    wz[i] = wpos.getZ(i);
    wuv.setXY(i, wx[i] / 6, wz[i] / 6);
  }
  mesh(water, mat.water, scene).frustumCulled = false;

  /* ---- palms ---- */
  const frondG = new THREE.ConeGeometry(0.42, 3.0, 4);
  frondG.scale(0.22, 1, 1);
  frondG.translate(0, 1.5, 0);
  const frond = facet(frondG, 0.04);
  const nut = facet(new THREE.IcosahedronGeometry(0.18, 0), 0.03);
  const palm = (x: number, y: number, z: number, s: number) => {
    const H = 4.2 + rnd() * 2.2, lean = 0.6 + rnd() * 1.4, n = 6, ry = rnd() * Math.PI * 2;
    const xf = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(up, ry), new THREE.Vector3(s, s, s));
    const P = (i: number) => new THREE.Vector3(lean * (i / n) ** 2, (H * i) / n, 0);
    for (let i = 0; i < n; i++) {
      const g = seg(P(i), P(i + 1), 0.22 - i * 0.014, 0.21 - (i + 1) * 0.014);
      g.applyMatrix4(xf);
      add(g, mat.trunk);
    }
    const top = P(n).applyMatrix4(xf);
    for (let f = 0; f < 8; f++) {
      const a = ry + (f / 8) * Math.PI * 2 + rnd() * 0.3, droop = f % 2 ? 0.2 : 0.55 + rnd() * 0.25;
      const g = frond.clone().rotateZ(-Math.PI / 2 - droop).rotateY(a);
      add(g, mat.frond, top.x, top.y, top.z, 0, 0, 0, s);
    }
    for (let c = 0; c < 3; c++) {
      const a = c * 2.1;
      add(nut, mat.trunk, top.x + Math.cos(a) * 0.22 * s, top.y - 0.2 * s, top.z + Math.sin(a) * 0.22 * s, 0, 0, 0, s);
    }
  };

  const blob = [0, 1, 2].map((i) => facet(new THREE.IcosahedronGeometry(1, 0), 0.25 + i * 0.05));
  const leaf = () => M.leaf[Math.floor(rnd() * 3)];

  /* ---- islands ---- */
  const foams: { m: THREE.Mesh; x: number; z: number }[] = [];
  const rock = facet(new THREE.DodecahedronGeometry(1, 0), 0.3);
  const island = (x: number, z: number, r: number, h: number, np: number) => {
    add(facet(new THREE.CylinderGeometry(r * 0.78, r * 1.2, h + 2.5, 11, 2), r * 0.12), mat.sand, x, (h + 2.5) / 2 - 2.5, z, 0, rnd() * 6, 0);
    const cap = new THREE.IcosahedronGeometry(r * 0.8, 1);
    cap.scale(1, 0.32, 1);
    add(facet(cap, r * 0.08), mat.grass, x, h, z, 0, rnd() * 6, 0);
    const capY = (dd: number) => h + 0.256 * r * Math.sqrt(Math.max(0, 1 - (dd / (0.8 * r)) ** 2)) - 0.2;
    for (let p = 0; p < np; p++) {
      const a = rnd() * 6.28, dd = rnd() * r * 0.5;
      palm(x + Math.cos(a) * dd, capY(dd), z + Math.sin(a) * dd, 0.8 + rnd() * 0.45);
    }
    for (let b = 0; b < 2 + Math.round(r * 0.6); b++) {
      const a = rnd() * 6.28, dd = rnd() * r * 0.65, s = 0.5 + rnd() * 0.7;
      add(blob[b % 3], leaf(), x + Math.cos(a) * dd, capY(dd) + s * 0.2, z + Math.sin(a) * dd, rnd() * 3, rnd() * 3, 0, s);
    }
    for (let s = 0; s < 3; s++) {
      const a = rnd() * 6.28, sc = 0.3 + rnd() * 0.5;
      add(rock, M.stone2, x + Math.cos(a) * r * 1.15, sc * 0.2, z + Math.sin(a) * r * 1.15, rnd() * 3, rnd() * 3, rnd() * 3, sc);
    }
    const ring = new THREE.RingGeometry(r * 1.02, r * 1.28, 14);
    ring.rotateX(-Math.PI / 2);
    foams.push({ m: mesh(facet(ring, 0.06), mat.foam, scene, x, 0.1, z), x, z });
  };
  ([
    // x, z, radius, height, palms
    [20, -8, 4.5, 1.6, 3], [-20, -22, 5, 2.2, 4], [-24, 8, 6, 2.8, 5], [24, 14, 4, 1.4, 2],
    [34, -20, 3, 1.0, 2], [-6, -24, 3.5, 1.4, 3], [-30, 18, 7, 3, 5], [-40, -30, 7, 3, 6],
    [10, 40, 8, 3.5, 6], [-48, 34, 9, 4, 7], [55, 22, 6, 2.5, 4], [40, 60, 7, 3, 4],
    [-20, 55, 6, 2, 3], [70, -40, 8, 3, 5], [-75, -10, 10, 4, 6],
    [4, -22, 1.6, 0.6, 1], [-30, -22, 1.8, 0.7, 1], [30, 2, 1.5, 0.6, 1],
  ] as [number, number, number, number, number][]).forEach((i) => island(...i));

  /* ---- pier off the dock island ---- */
  const PZ = -11.2;
  add(facet(new THREE.BoxGeometry(9.5, 0.2, 1.5, 9, 1, 1), 0.03), mat.wood, 12.4, 1.15, PZ);
  const post = facet(new THREE.CylinderGeometry(0.14, 0.16, 3.4, 5), 0.03);
  for (let i = 0; i < 5; i++) for (const side of [-0.7, 0.7]) add(post, mat.wood, 8 + i * 1.9, -0.6, PZ + side, 0, 0, (rnd() - 0.5) * 0.08);
  add(facet(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 4)), M.solid, 9, 2.3, PZ + 0.6);
  add(facet(new THREE.BoxGeometry(0.22, 0.22, 0.22)), M.glyph, 9, 3.45, PZ + 0.6);
  flush(scene);

  /* ---- the wasteland on the horizon: a ring of mossed spires past the islands, wreckage in the
     swell between them (clear of the pier and the moorings), islands upside down overhead ---- */
  const W = createWaste(k, { debris: M.stone2, rust: mat.rust, seam: M.glyph });
  {
    const b = W.batch();
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2, r = W.between(82, 150);
      W.spire(b, Math.cos(a) * r, -2, Math.sin(a) * r, W.between(14, 62) * (r / 110), [M.stone, mat.glass2, mat.shard], true, { lean: 1.6 });
    }
    for (let i = 0; i < 30; i++) {
      const a = rnd() * Math.PI * 2, r = W.between(16, 60), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (x > 4 && x < 19 && z > -16 && z < -6) continue;
      W.junk(b, x, -0.3, z, W.between(0.4, 1.3));
    }
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2, r = W.between(70, 120);
      b.add(W.island(W.between(4, 9)), M.stone2, Math.cos(a) * r, W.between(32, 58), Math.sin(a) * r, 0, rnd() * 3, 0);
    }
    b.flush(scene);
  }
  const hang = W.hanging(scene, 14, [M.stone2, mat.shard, mat.rust], (s) => {
    const a = rnd() * Math.PI * 2, r = W.between(12, 36);
    return [Math.cos(a) * r, W.between(9, 22) + s, Math.sin(a) * r];
  });

  /* ---- King of Red Lions, moored alongside ---- */
  // After The Wind Waker: red hull with a cream gunwale, a banded neck curling up from the bow
  // into a lion's head (gold snout and horns, white curled mane), green mast, crest on the sail.
  const kc = {
    red: psx({ map: tex.tPlain, tint: "#e8603f", amb: "#7a6460" }),
    cream: psx({ map: tex.tPlain, tint: "#f2ead6", amb: "#7a8088" }),
    gold: psx({ map: tex.tPlain, tint: "#f0c75c", amb: "#7c6c50" }),
    mane: psx({ map: tex.tPlain, tint: "#f4efe2", amb: "#80878c" }),
    eye: psx({ map: tex.tPlain, tint: "#4f86d0", amb: "#3a5a8a" }),
    mast: psx({ map: tex.tPlain, tint: "#64a582", amb: "#4e6a66" }),
    boom: psx({ map: tex.tBark, tint: "#f0c890", uv: 1.5 }),
    sail: psx({ map: sailTex(), tint: "#ffffff", amb: "#7a8890", side: THREE.DoubleSide }),
  };
  const ship = new THREE.Group();
  // built at 1:1, then scaled down so the boat sits in proportion to the pier and the palms
  const SX = 12, SZ = -12.85;
  ship.position.set(SX, 0, SZ);
  ship.rotation.y = 0.04;
  ship.scale.setScalar(0.75);
  scene.add(ship);
  // Bow at -x: the hull narrows to a point and the sheer rises toward it; the stern keeps a narrow transom.
  const HL = 7;
  const hullShape = (g: THREE.BufferGeometry, widen: number) => {
    const hp = g.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i), f = (x + HL / 2) / HL;
      let wz = f < 0.4 ? Math.sqrt(f / 0.4) : 1 - Math.max(0, f - 0.8) * 1.5;
      wz = Math.max(wz, 0.04) * (y < 0 ? 0.5 : 1) * widen;
      hp.setXYZ(i, x, y + (y > 0 ? 0.55 * (1 - f) ** 3 : 0), z * wz);
    }
    return g;
  };
  add(facet(hullShape(new THREE.BoxGeometry(HL, 1.1, 2, 10, 2, 2), 1), 0.03), kc.red);
  add(facet(hullShape(new THREE.BoxGeometry(HL, 0.16, 2, 10, 1, 1).translate(0, 0.6, 0), 1.06)), kc.cream);
  add(facet(new THREE.BoxGeometry(4.6, 0.06, 1.5)), mat.wood, 0.6, 0.7, 0);
  // iron fittings: mast step and the tiller box at the stern
  add(facet(new THREE.BoxGeometry(0.7, 0.55, 0.8)), M.solid, -0.9, 0.95, 0);
  add(facet(new THREE.BoxGeometry(0.6, 0.4, 0.7)), M.solid, 2.7, 0.9, 0);
  add(facet(new THREE.BoxGeometry(0.1, 0.6, 0.1)), M.solid, 2.85, 1.35, 0);
  // neck: rises off the bow, leans back toward the deck, then the head juts forward
  const neck = [new THREE.Vector3(-3.1, 0.5, 0), new THREE.Vector3(-3.6, 1.5, 0), new THREE.Vector3(-3.5, 2.4, 0), new THREE.Vector3(-3.1, 3.1, 0), new THREE.Vector3(-3.15, 3.7, 0)];
  const flat = (g: THREE.BufferGeometry) => { g.scale(1, 1, 0.6); g.computeVertexNormals(); return g; };
  for (let i = 0; i < neck.length - 1; i++) add(flat(seg(neck[i], neck[i + 1], 0.55 - i * 0.05, 0.5 - i * 0.05, 6)), kc.red);
  for (const [i, f] of [[1, 0.3], [2, 0.2]] as const) {
    const a = neck[i].clone().lerp(neck[i + 1], f), b = neck[i].clone().lerp(neck[i + 1], f + 0.22);
    add(flat(seg(a, b, 0.53 - i * 0.05, 0.53 - i * 0.05, 6)), kc.cream);
  }
  // mast, with dark bands where the boom and the sail head are lashed
  const MX = -0.9, MH = 9.2;
  add(facet(new THREE.CylinderGeometry(0.11, 0.14, MH, 6)), kc.mast, MX, 0.7 + MH / 2, 0);
  for (const y of [2.15, 7.3]) add(facet(new THREE.CylinderGeometry(0.17, 0.17, 0.22, 6)), M.solid, MX, y, 0);
  flush(ship);

  // head: forward is -x; its own group so it can look around and nod
  const head = new THREE.Group();
  head.position.set(-3.45, 4.05, 0);
  head.scale.setScalar(1.35);
  ship.add(head);
  add(facet(new THREE.BoxGeometry(1, 0.75, 0.9), 0.06), kc.red);
  add(facet(new THREE.BoxGeometry(0.7, 0.42, 0.72), 0.04), kc.gold, -0.72, 0.06, 0);
  add(facet(new THREE.BoxGeometry(0.22, 0.2, 0.42)), kc.gold, -1.05, 0.22, 0);
  for (const s of [-1, 1]) {
    add(facet(new THREE.BoxGeometry(0.42, 0.12, 0.2)), kc.gold, -0.42, 0.38, s * 0.28, 0, 0, -0.25 * s * s);
    add(facet(new THREE.BoxGeometry(0.14, 0.12, 0.08)), kc.eye, -0.46, 0.25, s * 0.42);
    // whisker spikes swept back off the cheeks
    add(facet(new THREE.ConeGeometry(0.1, 0.7, 4).rotateZ(Math.PI / 2 + 0.4)), kc.gold, 0.1, -0.15, s * 0.5, 0, s * 0.35, 0);
    // horns: tall, flaring out, tips tipping forward
    const hp = [[0.15, 0.3, 0.22], [0.3, 0.9, 0.3], [0.25, 1.55, 0.38], [0.02, 2.0, 0.42]].map(([x, y, z]) => new THREE.Vector3(x, y, z * s));
    for (let i = 0; i < 3; i++) add(seg(hp[i], hp[i + 1], 0.16 - i * 0.04, 0.12 - i * 0.04, 5), kc.gold);
  }
  // mane: white curls ringing the back of the head
  const curl = facet(new THREE.TorusGeometry(0.2, 0.09, 4, 7), 0.02);
  const tuft = facet(new THREE.IcosahedronGeometry(0.32, 0), 0.06);
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.55 + (i / 8) * Math.PI * 1.1, r = 0.62;
    add(curl, kc.mane, 0.35, Math.sin(a) * r * 0.9 + 0.05, Math.cos(a) * r, 0, Math.PI / 2 + Math.cos(a) * 0.4, rnd() * 3);
    add(tuft, kc.mane, 0.55, Math.sin(a) * r * 0.75, Math.cos(a) * r * 0.85, rnd() * 3, rnd() * 3, 0, 0.8 + rnd() * 0.3);
  }
  add(tuft, kc.mane, 0.7, 0.1, 0, 0, 0, 0, 1.3);
  flush(head);
  const jaw = new THREE.Group();
  jaw.position.set(0.15, -0.3, 0);
  head.add(jaw);
  add(facet(new THREE.BoxGeometry(1.15, 0.2, 0.78), 0.03), kc.red, -0.55, -0.06, 0);
  add(facet(new THREE.BoxGeometry(0.2, 0.12, 0.6)), kc.cream, -1.05, 0.06, 0);
  flush(jaw);

  // sail and boom swing together about the mast
  const sail = new THREE.Group();
  sail.position.set(MX, 0, 0);
  ship.add(sail);
  const SY0 = 2.2, SH = 7.6, SW = 3.6;
  const sg = new THREE.PlaneGeometry(1, 1, 3, 5);
  const sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const v = sp.getX(i) + 0.5, u = sp.getY(i) + 0.5, w = Math.max(0.22, SW * (1 - u) ** 0.7);
    sp.setXYZ(i, v * w, SY0 + u * SH, -0.55 * Math.sin(Math.PI * v) * (1 - u * 0.6));
  }
  add(facet(sg), kc.sail);
  add(facet(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 5)), kc.sail, 0.12, SY0 + SH + 0.15, 0);
  add(facet(new THREE.CylinderGeometry(0.06, 0.06, SW + 0.3, 5).rotateZ(Math.PI / 2)), kc.boom, SW / 2, SY0 - 0.08, 0);
  add(facet(new THREE.BoxGeometry(0.2, 0.16, 0.16)), M.solid, SW + 0.25, SY0 - 0.08, 0);
  flush(sail);
  // mooring lines, re-strung every frame as the hull rides the swell
  const cleats = [new THREE.Vector3(-2.4, 0.75, 0.95), new THREE.Vector3(2.6, 0.75, 0.9)];
  const bollards = [new THREE.Vector3(8, 1.3, PZ - 0.7), new THREE.Vector3(15.6, 1.3, PZ - 0.7)];
  const lineGeo = new THREE.BufferGeometry().setFromPoints([...cleats, ...bollards]);
  lineGeo.setIndex([0, 2, 1, 3]);
  const lines = new THREE.LineSegments(lineGeo, M.lBoneDim);
  lines.frustumCulled = false;
  scene.add(lines);

  /* ---- twin suns on the horizon ---- */
  const sunA = k.sunDisc(scene, -126.3, 30, 64.9, 14, "#fff3d2", "#ffc874");
  const sunB = k.sunDisc(scene, -135.4, 13, 38.2, 9, "#ffd0ae", "#ff8a5c");

  // glitter on the swell along the line to the suns
  const NG = 160, gp = new Float32Array(NG * 3), gBase: number[] = [];
  for (let i = 0; i < NG; i++) {
    const [gdx, gdz] = i % 3 ? [-0.829, 0.559] : [-0.91, 0.415], s = 6 + Math.pow(rnd(), 0.6) * 110, w = (rnd() - 0.5) * (0.6 + s * 0.14);
    gBase.push(14.7 + gdx * s - gdz * w, -30 + gdz * s + gdx * w);
  }
  const glintGeo = new THREE.BufferGeometry();
  glintGeo.setAttribute("position", new THREE.BufferAttribute(gp, 3));
  const glints = new THREE.Points(glintGeo, new THREE.PointsMaterial({ color: "#ffe0a0", size: 1, sizeAttenuation: false }));
  glints.frustumCulled = false;
  scene.add(glints);

  // gulls
  const gullGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.6, 0.22, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.6, 0.22, 0),
  ]);
  const gulls = Array.from({ length: 7 }, (_, i) => {
    const l = new THREE.LineSegments(gullGeo, M.lBone);
    scene.add(l);
    return { l, r: 7 + rnd() * 10, y: 16 + rnd() * 9, sp: (0.12 + rnd() * 0.1) * (i % 3 ? 1 : -1), ph: rnd() * 6.28 };
  });

  // easter eggs: start times, negative = never fired
  let tTalk = -99, tSun = -99, tGull = -99;
  const tmpV = new THREE.Vector3();
  return {
    scene, cam, fog: [25, 120], fov: [64, 74], limits: { pitch: [-0.05, 0.7], zoom: [0.55, 1.5] },
    labels: [
      { name: "King of Red Lions", sub: "moored · talks back", at: (v) => { v.set(-0.9, 10.6, 0); ship.localToWorld(v); } },
      { name: "Twin suns", sub: "binary, setting", at: (v) => { v.copy(sunA.position).y += 16; } },
    ],
    eggs: [
      {
        id: "ocean-korl", r: 34,
        at: (v) => { head.getWorldPosition(v); },
        fire: (t) => { tTalk = t; },
      },
      {
        id: "ocean-suns", r: 40,
        at: (v) => { v.copy(sunA.position); },
        fire: (t) => { tSun = t; },
      },
      {
        id: "ocean-gull", r: 32,
        at: (v) => { v.copy(gulls[0].l.position); },
        fire: (t) => { tGull = t; },
      },
    ],
    update(t) {
      hang(t);
      for (let i = 0; i < wpos.count; i++) wpos.setY(i, wave(wx[i], wz[i], t));
      wpos.needsUpdate = true;
      water.computeVertexNormals();
      for (const f of foams) f.m.position.y = wave(f.x, f.z, t) + 0.08;

      ship.position.y = wave(SX, SZ, t) * 0.7 + 0.05;
      ship.rotation.x = Math.sin(t * 0.8) * 0.025;
      ship.rotation.z = (wave(SX - 3, SZ, t) - wave(SX + 3, SZ, t)) * 0.05;
      // idle: the head looks about; tapped, he talks, jaw flapping, nodding along
      const er = t - tTalk, talk = pulse(er, 2.8);
      head.rotation.y = Math.sin(t * 0.37) * 0.12 + Math.sin(t * 0.11) * 0.08;
      head.rotation.z = Math.sin(t * 0.6) * 0.03 + talk * 0.12 * Math.sin(er * 3.5);
      jaw.rotation.z = 0.03 + (er > 0 && er < 2.8 ? 0.38 * Math.abs(Math.sin(er * 9)) * talk : 0);
      sail.rotation.y = -0.18 + Math.sin(t * 0.9) * 0.04;
      ship.position.y += 0.1 * pulse(er, 1.2);
      ship.updateMatrixWorld();
      const lp = lineGeo.attributes.position;
      cleats.forEach((c, i) => { tmpV.copy(c); ship.localToWorld(tmpV); lp.setXYZ(i, tmpV.x, tmpV.y, tmpV.z); });
      lp.needsUpdate = true;

      for (let i = 0; i < NG; i++) {
        const x = gBase[i * 2], z = gBase[i * 2 + 1], on = Math.sin(t * 2.7 + i * 1.73) > 0.35;
        gp[i * 3] = x;
        gp[i * 3 + 1] = on ? wave(x, z, t) + 0.06 : -9;
        gp[i * 3 + 2] = z;
      }
      glintGeo.attributes.position.needsUpdate = true;

      const es = t - tSun;
      sunA.scale.setScalar(1 + 0.4 * pulse(es, 1.4));
      sunB.scale.setScalar(1 + 0.5 * pulse(es - 0.5, 1.4));

      for (const g of gulls) {
        const a = g.ph + t * g.sp;
        g.l.position.set(Math.cos(a) * g.r, g.y + Math.sin(t * 0.5 + g.ph) * 0.8, 6 + Math.sin(a) * g.r);
        g.l.rotation.y = -a + (g.sp > 0 ? 0 : Math.PI);
        g.l.scale.y = Math.sin(t * 6 + g.ph * 3);
      }
      const eg = Math.min(1, (t - tGull) / 1.3);
      gulls[0].l.rotation.z = eg > 0 && eg < 1 ? eg * eg * (3 - 2 * eg) * Math.PI * 2 : 0;

      const a = -1.09 + Math.sin(t * 0.035) * 0.18 + view.px * 0.12 + view.yaw, r = 34 + Math.sin(t * 0.05) * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      cam.position.set(x, 3.4 + wave(x, z, t) * 0.45 - view.py * 0.6, z);
      cam.lookAt(0, 6 - view.py * 1.2, 0);
      cam.rotateZ(Math.sin(t * 0.7) * 0.012);
      k.orbit(cam, PIVOT);
      sky.position.copy(cam.position);
      sunA.lookAt(cam.position);
      sunB.lookAt(cam.position);
    },
    readout() {
      const p = cam.position;
      return [
        ["Lat", k.dms(-8.9142 - p.z * 0.00009, "N", "S", 2)],
        ["Lon", k.dms(-140.1027 + p.x * 0.00013, "E", "W", 3)],
        ["Elev", `${p.y.toFixed(1)} m`],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
        ["Grid", k.gridRef(p.x, p.z, 40)],
      ];
    },
  };
}
