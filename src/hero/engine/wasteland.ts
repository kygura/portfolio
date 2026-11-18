/**
 * The wasteland vocabulary shared by the dream scenes: sharp, edged towers
 * (shards, splayed clusters, slant-cut blades, broken stacks, obelisks), the
 * debris at their feet (slabs, cubes, beams, rings, door frames, stairs to
 * nowhere, toppled columns), upside-down islands, flat cloud, and stone that
 * hangs in the air. Each scene brings its own materials and ground; this
 * only shapes and places.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PsxKit } from "./psx";

export interface WasteMats {
  debris: THREE.Material;
  rust: THREE.Material;
  /** Lit seams and bands; usually emissive in the accent. */
  seam: THREE.Material;
}

export function createWaste(kit: PsxKit, mats: WasteMats) {
  const { rnd, facet, wallUV } = kit;
  const between = (a: number, b: number) => a + rnd() * (b - a);

  /* ---- batching. With a floor, everything under it is pressed up onto it: a mirror
     sea needs that, or the flipped copy below would poke back up through the surface. ---- */
  const batch = (floor: number | null = null) => kit.batcher(floor);
  type Batch = ReturnType<typeof batch>;

  /* ---- shapes: towers stand on their local y = 0 ---- */
  const up = (g: THREE.BufferGeometry, h: number) => g.translate(0, h / 2, 0);
  const box = (w: number, h: number, d: number) => wallUV(facet(new THREE.BoxGeometry(w, h, d)), 1 / 3);
  const shard = (r: number, h: number, n = 4) => wallUV(facet(up(new THREE.ConeGeometry(r, h, n, 2), h), r * 0.1), 1 / 7).rotateY(rnd() * 3);
  // A thin slab with its top cut on a slant, so one corner runs up to a blade edge.
  const blade = (w: number, h: number, d: number, cut: number) => {
    const g = up(new THREE.BoxGeometry(w, h, d), h);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > h - 1e-3) p.setY(i, h + (p.getX(i) / (w / 2)) * cut);
    return wallUV(facet(g), 1 / 7);
  };
  // Jagged top hashed from position, so the faces that share an edge break the same way.
  const jag = (x: number, z: number) => {
    const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const broken = (w: number, h: number, d: number) => {
    const g = up(new THREE.BoxGeometry(w, h, d, 3, 1, 3), h);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > h - 1e-3) p.setY(i, h - jag(p.getX(i), p.getZ(i)) * h * 0.32);
    return wallUV(facet(g), 1 / 7);
  };
  const obelisk = (w: number, h: number) => {
    const top = w * 0.3;
    return mergeGeometries([
      wallUV(facet(up(new THREE.CylinderGeometry(top, w * 0.5, h, 4).rotateY(Math.PI / 4), h)), 1 / 7),
      facet(new THREE.ConeGeometry(top, w * 1.6, 4).rotateY(Math.PI / 4).translate(0, h + w * 0.8, 0)),
    ])!;
  };
  // An upside-down island: a stone cone hanging point down, a needle standing on its flat top.
  const island = (r: number) =>
    mergeGeometries([
      facet(new THREE.ConeGeometry(r, r * 2.6, 5, 2).rotateX(Math.PI), r * 0.12),
      facet(up(new THREE.ConeGeometry(r * 0.14, r * 1.5, 4), r * 1.5).translate(r * 0.2, r * 1.3, 0)),
    ])!;
  const cloud = (w: number) => facet(new THREE.IcosahedronGeometry(1, 0).scale(w, w * 0.11, w * 0.3), w * 0.04);

  /* ---- placement ---- */
  const cluster = (b: Batch, m: THREE.Material, x: number, y: number, z: number, h: number, r: number) => {
    const n = 3 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = i ? r * (0.7 + rnd()) : 0, hh = i ? h * (0.3 + rnd() * 0.45) : h;
      const tilt = i ? 0.18 + rnd() * 0.32 : rnd() * 0.06;
      b.add(shard(r * (0.3 + rnd() * 0.25) * (0.5 + hh / h), hh, 3 + Math.floor(rnd() * 3)), m, x + Math.cos(a) * d, y, z + Math.sin(a) * d, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
    }
  };
  /** One tower of a random kind at (x, y, z), `h` tall. `lean` scales the tilt; `sharp` keeps to shards, clusters and blades. */
  const spire = (b: Batch, x: number, y: number, z: number, h: number, body: THREE.Material[], seam: boolean, o: { lean?: number; sharp?: boolean } = {}) => {
    const m = body[Math.floor(rnd() * body.length)], k = rnd() * (o.sharp ? 0.72 : 1), ry = rnd() * 3;
    const L = o.lean ?? 1, lx = (rnd() - 0.5) * 0.16 * L, lz = (rnd() - 0.5) * 0.16 * L;
    if (k < 0.28) {
      b.add(shard(h * (0.07 + rnd() * 0.06), h, 3 + Math.floor(rnd() * 2)), m, x, y, z, lx, 0, lz);
    } else if (k < 0.5) {
      cluster(b, m, x, y, z, h, h * 0.09);
    } else if (k < 0.72) {
      const w = h * (0.12 + rnd() * 0.1), d = w * (0.3 + rnd() * 0.4);
      b.add(blade(w, h, d, Math.min(h * 0.5, w * (1 + rnd() * 1.5))), m, x, y, z, lx, ry, lz);
      if (seam && rnd() > 0.35) b.add(facet(new THREE.BoxGeometry(w * 0.09, h * 0.45, d * 1.08)).translate(w * 0.18, h * 0.42, 0), mats.seam, x, y, z, lx, ry, lz);
    } else if (k < 0.88) {
      const w = h * (0.13 + rnd() * 0.08), d = w * (0.7 + rnd() * 0.4);
      b.add(broken(w, h, d), m, x, y, z, lx * 0.5, ry, lz * 0.5);
      if (seam) for (let j = 0, nb = 1 + Math.floor(rnd() * 3); j < nb; j++) {
        b.add(facet(new THREE.BoxGeometry(w * 1.05, 0.18 + h * 0.008, d * 1.05)).translate(0, h * (0.2 + rnd() * 0.45), 0), mats.seam, x, y, z, lx * 0.5, ry, lz * 0.5);
      }
    } else {
      b.add(obelisk(h * 0.1, h), m, x, y, z, lx * 0.4, ry, lz * 0.4);
    }
  };
  /** A piece of debris of size `s` resting at ground height y: half sunk or half buried. */
  const junk = (b: Batch, x: number, y: number, z: number, s: number) => {
    const k = rnd(), m = rnd() > 0.7 ? mats.rust : mats.debris, ry = rnd() * 3;
    if (k < 0.22) b.add(box(s * 1.6, s * 2.2, s * 0.35), m, x, y + s * 0.5, z, (rnd() - 0.5) * 0.6, ry, (rnd() - 0.5) * 1.2);
    else if (k < 0.4) b.add(box(s, s, s), m, x, y + s * 0.15, z, rnd() * 3, ry, rnd() * 3);
    else if (k < 0.54) b.add(box(s * 0.25, s * 4, s * 0.25), m, x, y + s * 0.9, z, (rnd() - 0.5) * 0.8, ry, 0.5 + rnd() * 0.6);
    else if (k < 0.66) b.add(facet(new THREE.TorusGeometry(s * 1.6, s * 0.18, 4, 14)).translate(0, s, 0), mats.debris, x, y, z, 0, ry, (rnd() - 0.5) * 0.3);
    else if (k < 0.78) {
      const door = mergeGeometries([
        box(s * 0.3, s * 3, s * 0.3).translate(-s * 0.8, s * 1.5, 0),
        box(s * 0.3, s * 3, s * 0.3).translate(s * 0.8, s * 1.5, 0),
        box(s * 1.9, s * 0.3, s * 0.36).translate(0, s * 3.1, 0),
      ])!;
      b.add(door, m, x, y - s * 0.2, z, 0, ry, (rnd() - 0.5) * 0.25);
    } else if (k < 0.9) {
      const steps: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 5; i++) steps.push(box(s * 0.7, s * 0.36 * (i + 1), s * 1.4).translate(i * s * 0.7, s * 0.18 * (i + 1), 0));
      b.add(mergeGeometries(steps)!, mats.debris, x, y - s * 0.15, z, 0, ry, 0);
    } else {
      b.add(wallUV(facet(new THREE.CylinderGeometry(s * 0.45, s * 0.5, s * 3, 7)), 1 / 3), mats.debris, x, y + s * 0.4, z, (rnd() - 0.5) * 0.4, ry, 1.1 + rnd() * 0.3);
    }
  };

  /** Stone hanging in the air, each piece its own mesh, turning and bobbing. `place(s)` picks where a piece of size s hangs. */
  const hanging = (parent: THREE.Object3D, n: number, body: THREE.Material[], place: (s: number) => [number, number, number]) => {
    const geos = [
      box(1, 1, 1), box(1.6, 0.3, 1), facet(new THREE.TetrahedronGeometry(0.8)), facet(new THREE.OctahedronGeometry(0.7)),
      facet(up(new THREE.ConeGeometry(0.35, 2.4, 4), 2.4).translate(0, -1.2, 0)),
    ];
    const list = Array.from({ length: n }, (_, i) => {
      const s = between(0.5, 2.2), m = kit.mesh(geos[i % geos.length], i % 9 === 4 ? mats.seam : body[i % body.length], parent);
      m.scale.setScalar(s);
      const [x, y, z] = place(s);
      return { m, x, y, z, amp: between(0.2, 0.8), ph: rnd() * 6.28, w1: between(-0.25, 0.25), w2: between(-0.2, 0.2) };
    });
    return (t: number) => {
      for (const f of list) {
        f.m.position.set(f.x + Math.sin(t * 0.11 + f.ph) * 0.8, f.y + Math.sin(t * 0.5 + f.ph) * f.amp, f.z);
        f.m.rotation.set(f.ph + t * f.w1, t * f.w2, f.ph * 0.5);
      }
    };
  };

  return { between, batch, box, shard, blade, broken, obelisk, island, cloud, cluster, spire, junk, hanging };
}

export type Waste = ReturnType<typeof createWaste>;
export type WasteBatch = ReturnType<Waste["batch"]>;
